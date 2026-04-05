"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { loadConfig, writeStatus } = require("./config.cjs");
const { translate, containsTargetLanguage } = require("./translator.cjs");

const LOG_FILE = path.join(os.homedir(), ".claude", "claude-trans-proxy.log");

function log(msg) {
  const line = new Date().toISOString() + " " + msg;
  console.error("[claude-trans] " + msg);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

function stripJsonReasoning(text) {
  if (!text) return text;
  return text
    .replace(/^```json\s*\n\{[\s\S]*?"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}\s*\n```\s*/gi, "")
    .replace(/^```json\s*\n\{[\s\S]*?"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}\s*\n\n/gi, "")
    .replace(/^\s*\{"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}\s*/gi, "")
    .trim();
}

function hasTargetLang(text) {
  return text && typeof text === "string" && containsTargetLanguage(text);
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === "text").map(b => b.text || "").join("\n");
  }
  return "";
}

async function translateMessages(requestBody) {
  const pairs = [];
  if (!requestBody.messages) return pairs;
  log(`translateMessages: ${requestBody.messages.length} messages, backend=${loadConfig().backend}`);

  for (let i = 0; i < requestBody.messages.length; i++) {
    const msg = requestBody.messages[i];
    const ctx = requestBody.messages.slice(Math.max(0, i - 4), i);

    if (typeof msg.content === "string" && hasTargetLang(msg.content)) {
      log(`Translating msg[${i}]: "${msg.content.slice(0, 40)}..."`);
      const en = await translate(msg.content, "toEn", fetch, ctx);
      log(`Result: "${en.slice(0, 40)}..." (changed=${en !== msg.content})`);
      if (en !== msg.content) {
        pairs.push({ original: msg.content, translated: en });
        msg.content = en;
      }
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text" && block.text && hasTargetLang(block.text)) {
          const en = await translate(block.text, "toEn", fetch, ctx);
          if (en !== block.text) {
            pairs.push({ original: block.text, translated: en });
            block.text = en;
          }
        }
      }
    }
  }

  // Force English response
  const enforce = "\n[claude-trans] You MUST respond exclusively in English. Thinking processes and answers must be 100% in English.";
  if (requestBody.system) {
    if (typeof requestBody.system === "string") requestBody.system += enforce;
    else if (Array.isArray(requestBody.system)) requestBody.system.push({ type: "text", text: enforce });
  } else {
    requestBody.system = enforce;
  }

  return pairs;
}

function forwardRaw(req, body, targetUrl, clientRes) {
  const url = new URL(req.url, targetUrl);
  const mod = url.protocol === "http:" ? http : https;
  const proxyReq = mod.request({
    hostname: url.hostname,
    port: url.port || (url.protocol === "http:" ? 80 : 443),
    path: url.pathname + url.search,
    method: req.method,
    headers: { ...req.headers, host: url.hostname },
  }, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });
  proxyReq.on("error", () => { clientRes.writeHead(502); clientRes.end(); });
  if (body) proxyReq.write(typeof body === "string" ? body : JSON.stringify(body));
  proxyReq.end();
}

async function handleSSE(proxyRes, clientRes, contextMessages) {
  const cfg = loadConfig();
  const headers = { ...proxyRes.headers };
  delete headers["content-length"];
  clientRes.writeHead(proxyRes.statusCode, headers);

  let buffer = "";
  let accText = "";
  let accThinking = "";
  let isThinking = false;
  let blockIdx = 0;

  for await (const chunk of proxyRes) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith("data: ")) {
        clientRes.write(line + "\n");
        continue;
      }

      const raw = line.slice(6).trim();
      if (raw === "[DONE]") { clientRes.write("data: [DONE]\n\n"); continue; }

      let data;
      try { data = JSON.parse(raw); } catch { clientRes.write(line + "\n\n"); continue; }

      // ── Anthropic SSE ──
      if (data.type === "content_block_start") {
        blockIdx = data.index;
        if (data.content_block?.type === "text") { accText = ""; isThinking = false; clientRes.write("data: " + JSON.stringify(data) + "\n\n"); }
        else if (data.content_block?.type === "thinking") { accThinking = ""; isThinking = true; if (!cfg.translate_thinking) clientRes.write("data: " + JSON.stringify(data) + "\n\n"); }
        else clientRes.write("data: " + JSON.stringify(data) + "\n\n");
        continue;
      }

      if (data.type === "content_block_delta") {
        if (data.delta?.type === "text_delta") { accText += data.delta.text; }
        else if (data.delta?.type === "thinking_delta") { if (cfg.translate_thinking) accThinking += data.delta.thinking; else clientRes.write("data: " + JSON.stringify(data) + "\n\n"); }
        else clientRes.write("data: " + JSON.stringify(data) + "\n\n");
        continue;
      }

      if (data.type === "content_block_stop") {
        if (isThinking && cfg.translate_thinking && accThinking) {
          const t = await translate(accThinking, "fromEn", fetch, contextMessages);
          clientRes.write("data: " + JSON.stringify({ type: "content_block_start", index: blockIdx, content_block: { type: "thinking", thinking: "" } }) + "\n\n");
          clientRes.write("data: " + JSON.stringify({ type: "content_block_delta", index: blockIdx, delta: { type: "thinking_delta", thinking: t } }) + "\n\n");
          accThinking = "";
        }
        if (!isThinking && accText) {
          const clean = stripJsonReasoning(accText);
          if (clean) {
            const t = await translate(clean, "fromEn", fetch, contextMessages);
            writeStatus({ output: { original: clean, translated: t } });
            clientRes.write("data: " + JSON.stringify({ type: "content_block_delta", index: blockIdx, delta: { type: "text_delta", text: t } }) + "\n\n");
          }
          accText = "";
        }
        clientRes.write("data: " + JSON.stringify(data) + "\n\n");
        isThinking = false;
        continue;
      }

      // ── OpenAI SSE ──
      if (data.choices?.[0]) {
        const delta = data.choices[0].delta;
        if (delta?.reasoning_content || delta?.thought) {
          if (cfg.translate_thinking) accThinking += (delta.reasoning_content || delta.thought);
          else clientRes.write("data: " + JSON.stringify(data) + "\n\n");
          continue;
        }
        if (delta?.content) accText += delta.content;
        if (data.choices[0].finish_reason) {
          if (cfg.translate_thinking && accThinking) {
            const t = await translate(accThinking, "fromEn", fetch, contextMessages);
            const fd = { ...data }; fd.choices[0] = { ...fd.choices[0], delta: { reasoning_content: t }, finish_reason: null };
            clientRes.write("data: " + JSON.stringify(fd) + "\n\n");
            accThinking = "";
          }
          if (accText) {
            const clean = stripJsonReasoning(accText);
            if (clean) {
              const t = await translate(clean, "fromEn", fetch, contextMessages);
              writeStatus({ output: { original: clean, translated: t } });
              const fd = { ...data }; fd.choices[0] = { ...fd.choices[0], delta: { content: t }, finish_reason: null };
              clientRes.write("data: " + JSON.stringify(fd) + "\n\n");
            }
            accText = "";
          }
          clientRes.write("data: " + JSON.stringify(data) + "\n\n");
        }
        continue;
      }

      clientRes.write("data: " + JSON.stringify(data) + "\n\n");
    }
  }
  clientRes.end();
}

function createProxy(targetUrl) {
  // Startup diagnostic
  const cfg = loadConfig();
  const { loadAuth } = require("./config.cjs");
  const auth = loadAuth();
  log(`Proxy created → ${targetUrl}`);
  log(`Config: backend=${cfg.backend}, custom_endpoint=${cfg.custom_endpoint}, custom_model=${cfg.custom_model}`);
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
          log(`Forwarding raw: method=${req.method}, hasBody=${!!body}`);
          return forwardRaw(req, body, targetUrl, res);
        }
        let parsed;
        try { parsed = JSON.parse(body); } catch {
          log(`Forwarding raw: JSON parse failed`);
          return forwardRaw(req, body, targetUrl, res);
        }
        if (!parsed.messages) {
          log(`Forwarding raw: no messages field (keys=${Object.keys(parsed).join(",")})`);
          return forwardRaw(req, body, targetUrl, res);
        }

        log(`Proxy intercepted: ${req.url} (${parsed.messages.length} messages)`);

        // Translate request
        const pairs = await translateMessages(parsed);
        log(`translateMessages returned ${pairs.length} pairs`);
        if (pairs.length > 0) {
          const last = pairs[pairs.length - 1];
          writeStatus({ input: { original: last.original, translated: last.translated } });
        }

        // Forward
        const url = new URL(req.url, targetUrl);
        const mod = url.protocol === "http:" ? http : https;
        const proxyReq = mod.request({
          hostname: url.hostname, port: url.port || (url.protocol === "http:" ? 80 : 443),
          path: url.pathname + url.search, method: "POST",
          headers: { ...req.headers, host: url.hostname, "content-type": "application/json" },
        }, async (proxyRes) => {
          const ct = proxyRes.headers["content-type"] || "";
          if (ct.includes("text/event-stream")) {
            await handleSSE(proxyRes, res, parsed.messages);
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
        proxyReq.on("error", () => { res.writeHead(502); res.end(); });
        proxyReq.write(JSON.stringify(parsed));
        proxyReq.end();
      } catch (err) {
        log("Proxy error: " + err.message);
        forwardRaw(req, body, targetUrl, res);
      }
    });
  });
}

module.exports = { createProxy };
