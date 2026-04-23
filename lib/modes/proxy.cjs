"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { loadConfig, writeStatus } = require("../config.cjs");
const { translate } = require("../translator.cjs");
const { translateMessages } = require("../request-util.cjs");
const { processSSEFromStream } = require("../sse-handler.cjs");

const LOG_FILE = path.join(os.homedir(), ".claude", "claude-trans-proxy.log");

function log(msg) {
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + " " + msg + "\n"); } catch {}
}

function forwardRaw(req, body, targetUrl, clientRes) {
  const base = new URL(targetUrl);
  const basePath = base.pathname.replace(/\/$/, "");
  const mod = base.protocol === "http:" ? http : https;
  const outBody = typeof body === "string" ? body : body ? JSON.stringify(body) : null;
  const proxyReq = mod.request({
    hostname: base.hostname,
    port: base.port || (base.protocol === "http:" ? 80 : 443),
    path: basePath + req.url,
    method: req.method,
    headers: { ...req.headers, host: base.hostname, ...(outBody ? { "content-length": Buffer.byteLength(outBody) } : {}) },
  }, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });
  proxyReq.on("error", () => { if (!clientRes.headersSent) clientRes.writeHead(502); clientRes.end(); });
  if (outBody) proxyReq.write(outBody);
  proxyReq.end();
}

function createProxy(targetUrl) {
  const cfg = loadConfig();
  const { loadAuth } = require("../config.cjs");
  const auth = loadAuth();
  log(`Proxy created -> ${targetUrl}`);
  log(`Config: backend=${cfg.backend}, model=${cfg.model}`);
  log(`Auth: has_custom_apiKey=${!!auth.custom_apiKey}, has_apiKey=${!!auth.apiKey}`);

  // Clear old log
  try { fs.writeFileSync(LOG_FILE, ""); } catch {}

  return http.createServer(async (req, res) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        log(`>>> ${req.method} ${req.url} (body=${body.length} bytes)`);

        // Inject API key from request headers for translator
        const apiKey = req.headers["x-api-key"] || (req.headers["authorization"] || "").replace("Bearer ", "");
        if (apiKey && !process.env.ANTHROPIC_API_KEY) {
          process.env.ANTHROPIC_API_KEY = apiKey;
        }

        if (req.method !== "POST" || !body) {
          return forwardRaw(req, body, targetUrl, res);
        }
        let parsed;
        try { parsed = JSON.parse(body); } catch {
          return forwardRaw(req, body, targetUrl, res);
        }
        if (!parsed.messages) {
          return forwardRaw(req, body, targetUrl, res);
        }

        log(`Proxy intercepted: ${req.url} (${parsed.messages.length} messages)`);

        // Translate request
        const pairs = await translateMessages(parsed, fetch, null);
        log(`translateMessages returned ${pairs.length} pairs`);

        if (pairs.length > 0) {
          const last = pairs[pairs.length - 1];
          writeStatus({ input: { original: last.original, translated: last.translated } });
        }

        // Forward to upstream
        const outBody = JSON.stringify(parsed);
        // Preserve base path from targetUrl (e.g. /api/anthropic)
        const base = new URL(targetUrl);
        const basePath = base.pathname.replace(/\/$/, "");
        const upstreamPath = basePath + req.url;
        const mod = base.protocol === "http:" ? http : https;
        const proxyReq = mod.request({
          hostname: base.hostname, port: base.port || (base.protocol === "http:" ? 80 : 443),
          path: upstreamPath, method: "POST",
          headers: { ...req.headers, host: base.hostname, "content-type": "application/json", "content-length": Buffer.byteLength(outBody), "accept-encoding": "identity" },
        }, async (proxyRes) => {
          const ct = proxyRes.headers["content-type"] || "";
          if (ct.includes("text/event-stream")) {
            await processSSEFromStream(proxyRes, res, fetch, parsed.messages);
          } else if (ct.includes("application/json")) {
            let rb = ""; for await (const c of proxyRes) rb += c;
            try {
              const d = JSON.parse(rb);
              if (d.content) for (const b of d.content) {
                if (b.type === "text" && b.text) {
                  const t = await translate(b.text, "fromEn", fetch, parsed.messages);
                  writeStatus({ output: { original: b.text, translated: t } });
                  b.text = t;
                }
              }
              const h = { ...proxyRes.headers }; delete h["content-length"];
              res.writeHead(proxyRes.statusCode, h); res.end(JSON.stringify(d));
            } catch { res.writeHead(proxyRes.statusCode, proxyRes.headers); res.end(rb); }
          } else {
            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
          }
        });
        proxyReq.on("error", (e) => { log("UPSTREAM ERROR: " + e.message + " code=" + e.code); res.writeHead(502); res.end(); });
        proxyReq.write(outBody);
        proxyReq.end();
      } catch (err) {
        log("Proxy error: " + err.message);
        forwardRaw(req, body, targetUrl, res);
      }
    });
  });
}

module.exports = { createProxy };
