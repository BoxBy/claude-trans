"use strict";

const { loadConfig, writeStatus } = require("../config.cjs");
const { translate, containsTargetLanguage, TRANSLATION_HEADER } = require("../translator.cjs");
const { processSSEResponse } = require("../sse-handler.cjs");
const { translateMessages } = require("../request-util.cjs");

const cache = {
  enToTarget: new Map(),
  targetToEn: new Map(),
};

function hasTargetLang(text) {
  if (!text || typeof text !== "string") return false;
  return containsTargetLanguage(text);
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === "text").map(b => b.text || "").join("\n");
  }
  return "";
}

function contentHasTargetLang(content) {
  return hasTargetLang(extractContentText(content));
}

function initialize() {
  if (global.fetch && global.fetch.__claudeTSInstrumented) return;

  const originalFetch = global.fetch;
  const cfg = loadConfig();
  const fs = require("fs");
  const path = require("path");
  const os = require("os");
  const logFile = path.join(os.homedir(), ".claude", "claude-trans.log");

  function debugLog(msg) {
    if (cfg.debug) {
      try { fs.appendFileSync(logFile, new Date().toISOString() + " " + msg + "\n"); } catch {}
    }
  }

  global.fetch = async function (input, init) {
    if (!init || !init.body || init.method !== "POST") {
      return originalFetch.call(global, input, init);
    }
    const isRequest = input && typeof input === "object" && input.constructor && input.constructor.name === "Request";

    // Auth bypass check
    const authHeaders = init.headers;
    if (authHeaders) {
      if (typeof authHeaders === "object" && !authHeaders[TRANSLATION_HEADER]) {
        if (authHeaders instanceof Headers && authHeaders.get(TRANSLATION_HEADER)) {
          return originalFetch.call(global, input, init);
        }
      } else if (authHeaders[TRANSLATION_HEADER]) {
        return originalFetch.call(global, input, init);
      }
    }

    let requestBodyStr = null;
    let newInit = init;

    if (isRequest) {
      try {
        const cloned = input.clone();
        requestBodyStr = await cloned.text();
      } catch {
        return originalFetch.call(global, input, init);
      }
    } else {
      requestBodyStr = init.body;
    }

    if (typeof requestBodyStr !== "string") {
      return originalFetch.call(global, input, init);
    }

    let requestBody;
    try {
      requestBody = JSON.parse(requestBodyStr);
    } catch {
      return originalFetch.call(global, input, init);
    }

    const firstMsgText = extractContentText(requestBody.messages?.[0]?.content);

    // --- /ts-thinking slash command ---
    if (firstMsgText && firstMsgText.startsWith("/ts-thinking")) {
      const val = firstMsgText.split(" ")[1]?.toLowerCase() || "";
      const cfgPath = path.join(os.homedir(), ".claude", "claude-trans.json");
      const currentCfg = loadConfig();

      if (val === "on") {
        currentCfg.translate_thinking = true;
        fs.writeFileSync(cfgPath, JSON.stringify(currentCfg, null, 2), "utf8");
        return new Response(JSON.stringify({
          type: "message", role: "assistant",
          content: [{ type: "text", text: "[claude-trans] Thinking translation enabled (may cause delay)." }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      } else if (val === "off") {
        currentCfg.translate_thinking = false;
        fs.writeFileSync(cfgPath, JSON.stringify(currentCfg, null, 2), "utf8");
        return new Response(JSON.stringify({
          type: "message", role: "assistant",
          content: [{ type: "text", text: "[claude-trans] Thinking translation disabled (raw English shown)." }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
    }

    let needsTranslation = false;
    if (requestBody.messages) {
      for (const msg of requestBody.messages) {
        if (contentHasTargetLang(msg.content)) {
          needsTranslation = true;
          break;
        }
      }
    }

    if (!needsTranslation) {
      return originalFetch.call(global, input, init);
    }

    try {
      const translatedBody = JSON.parse(requestBodyStr);
      const pairs = await translateMessages(translatedBody, originalFetch, cache);

      if (pairs.length > 0) {
        const last = pairs[pairs.length - 1];
        writeStatus({ input: { original: last.original, translated: last.translated } });
      }

      const overrideInit = { ...init, body: JSON.stringify(translatedBody) };
      if (!isRequest) newInit = overrideInit;
      const response = await originalFetch.call(global, input, newInit);

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        return processSSEResponse(response, originalFetch, cache, translatedBody.messages);
      } else if (contentType.includes("application/json")) {
        const data = await response.json();
        if (data.content && Array.isArray(data.content)) {
          for (const block of data.content) {
            if (block.type === "text" && block.text) {
              const translatedResult = await translate(block.text, "fromEn", originalFetch, translatedBody.messages);
              writeStatus({ output: { original: block.text, translated: translatedResult } });
              cache.enToTarget.set(block.text, translatedResult);
              cache.targetToEn.set(translatedResult, block.text);
              block.text = translatedResult;
            }
          }
        }
        return new Response(JSON.stringify(data), {
          status: response.status, statusText: response.statusText, headers: response.headers,
        });
      }
      return response;
    } catch (err) {
      debugLog("  -> ERROR in translation interceptor: " + err.message);
      return originalFetch.call(global, input, init);
    }
  };

  global.fetch.__claudeTSInstrumented = true;
  if (cfg.debug) {
    console.error("[claude-trans] Fetch interceptor installed. Language:", cfg.language);
  }
}

module.exports = { initialize };
