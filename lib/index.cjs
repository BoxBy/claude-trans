"use strict";

const { loadConfig, loadLanguage, ttyWrite, writeStatus } = require("./config.cjs");
const { translate, containsTargetLanguage, TRANSLATION_HEADER } = require("./translator.cjs");
const { processSSEResponse } = require("./sse-handler.cjs");

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
    return content.filter((b) => b.type === "text").map((b) => b.text || "").join("\n");
  }
  return "";
}

function contentHasTargetLang(content) {
  return hasTargetLang(extractContentText(content));
}

async function translateRequest(requestBody, originalFetch) {
  const pairs = [];
  const translated = { ...requestBody };

  if (translated.messages && Array.isArray(translated.messages)) {
    for (let i = 0; i < translated.messages.length; i++) {
      const msg = translated.messages[i];
      // Gather up to 4 previous messages as context
      const contextMessages = translated.messages.slice(Math.max(0, i - 4), i);
      if (typeof msg.content === "string") {
        if (hasTargetLang(msg.content)) {
          const key = msg.content;
          let en;
          if (cache.targetToEn.has(key)) {
            en = cache.targetToEn.get(key);
          } else {
            en = await translate(key, "toEn", originalFetch, contextMessages);
            if (en !== key) {
              cache.targetToEn.set(key, en);
              cache.enToTarget.set(en, key);
            }
          }
          if (en !== key) pairs.push({ original: key, translated: en });
          msg.content = en;
        }
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "text" && block.text && hasTargetLang(block.text)) {
            const key = block.text;
            let en;
            if (cache.targetToEn.has(key)) {
              en = cache.targetToEn.get(key);
            } else {
              en = await translate(key, "toEn", originalFetch, contextMessages);
              if (en !== key) {
                cache.targetToEn.set(key, en);
                cache.enToTarget.set(en, key);
              }
            }
            if (en !== key) pairs.push({ original: key, translated: en });
            block.text = en;
          }
        }
      }
    }
  }
  return { body: translated, pairs };
}

function initialize() {
  if (global.fetch && global.fetch.__claudeTSInstrumented) return;

  const originalFetch = global.fetch;
  const cfg = loadConfig();
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const logFile = path.join(os.homedir(), '.claude', 'claude-trans.log');
  
  function debugLog(msg) {
    if (cfg.debug) {
      try { fs.appendFileSync(logFile, new Date().toISOString() + ' ' + msg + '\n'); } catch (e) {}
    }
  }

  global.fetch = async function (input, init) {
    if (!init || !init.body || init.method !== "POST") {
      return originalFetch.call(global, input, init);
    }
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    if (!urlStr || (!urlStr.includes("api.anthropic.com") && !urlStr.includes("api.z.ai"))) {
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
      } catch (err) {
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

    const model = requestBody.model || "";
    const firstMsgText = extractContentText(requestBody.messages?.[0]?.content);

    // --- Special Slash Command Interceptor ---
    if (firstMsgText && firstMsgText.startsWith("/ts-thinking")) {
      const parts = firstMsgText.split(" ");
      const val = parts[1] ? parts[1].toLowerCase() : "";
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const cfgPath = path.join(os.homedir(), ".claude", "claude-trans.json");
      const currentCfg = loadConfig();
      
      if (val === "on") {
        currentCfg.translate_thinking = true;
        fs.writeFileSync(cfgPath, JSON.stringify(currentCfg, null, 2), "utf8");
        return new Response(JSON.stringify({
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "✅ Claude의 생각 과정(Thinking) 번역이 활성화되었습니다. (지연 발생 가능)" }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      } else if (val === "off") {
        currentCfg.translate_thinking = false;
        fs.writeFileSync(cfgPath, JSON.stringify(currentCfg, null, 2), "utf8");
        return new Response(JSON.stringify({
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "✅ Claude의 생각 과정(Thinking) 번역이 비활성화되었습니다. (영어 원문 실시간 표시)" }]
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
      if (cfg.show_translation) {
        const lastUserMsg = requestBody.messages?.filter(m => m.role === "user").pop();
        const originalText = extractContentText(lastUserMsg?.content);
        if (originalText && hasTargetLang(originalText)) {
          const contextMessages = requestBody.messages ? requestBody.messages.slice(-5, -1) : [];
          const enText = cache.targetToEn.get(originalText) || await translate(originalText, "toEn", originalFetch, contextMessages);
          if (enText && enText !== originalText) {
            const origPreview = originalText.length > 50 ? originalText.slice(0, 50) + "..." : originalText;
            const enPreview = enText.length > 50 ? enText.slice(0, 50) + "..." : enText;
            ttyWrite("\x1b[2m[claude-trans]\x1b[0m " + origPreview + " \x1b[2m→\x1b[0m " + enPreview + "\x1b[m\n");
          }
        }
      }

      const { body: translatedBody, pairs } = await translateRequest(requestBody, originalFetch);

      if (pairs.length > 0) {
        const last = pairs[pairs.length - 1];
        writeStatus({ input: { original: last.original, translated: last.translated } });
      }

      // Issue 7: Inject System Prompt to force English response
      const enEnforcement = "\n[claude-trans] You MUST respond exclusively in English. Thinking processes and answers must be 100% in English.";
      if (translatedBody.system) {
        if (typeof translatedBody.system === "string") {
          translatedBody.system += enEnforcement;
        } else if (Array.isArray(translatedBody.system)) {
          translatedBody.system.push({ type: "text", text: enEnforcement });
        }
      } else {
        translatedBody.system = enEnforcement;
      }

      const overrideInit = { ...init, body: JSON.stringify(translatedBody) };
      if (!isRequest) {
        newInit = overrideInit;
      }
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
              cache.enToTarget.set(block.text, translatedResult);
              cache.targetToEn.set(translatedResult, block.text);
              block.text = translatedResult;
            }
          }
        }
        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return response;
    } catch(err) {
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
