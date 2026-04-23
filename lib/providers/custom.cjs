"use strict";

const { loadConfig, loadAuth } = require("../config.cjs");
const { shouldMergeSystemPrompt, setCapability } = require("../capabilities.cjs");
const { formatContext, stripJsonReasoning } = require("../request-util.cjs");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TRANSLATION_HEADER = "x-claude-ts-skip";
const LOG_FILE = path.join(os.homedir(), ".claude", "claude-trans-proxy.log");

function tlog(msg) {
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + " [custom-provider] " + msg + "\n"); } catch {}
}

/**
 * Post-process translation output: strip reasoning, extract clean translated text.
 */
function cleanOutput(text) {
  if (!text) return text;
  const cleaned = stripJsonReasoning(text)
    .replace(/<(?:thought|thinking)>[\s\S]*?<\/(?:thought|thinking)>/gi, "");
  const lines = cleaned.split("\n").filter(l => l.trim());
  return lines.length > 0 ? lines[lines.length - 1].trim() : text;
}

async function translate(text, direction, originalFetch, contextMessages) {
  const cfg = loadConfig();
  const auth = loadAuth();

  let endpoint = cfg.custom_endpoint;
  tlog(`direction=${direction}, endpoint=${endpoint}, model=${cfg.model}`);
  tlog(`has custom_apiKey=${!!auth.custom_apiKey}, text="${text.slice(0, 50)}..."`);
  if (!endpoint.startsWith("http")) endpoint = "https://" + endpoint;

  // Auto-fix for Google Gemini or OpenAI endpoints
  if (endpoint.includes("generativelanguage.googleapis.com")) {
    if (!endpoint.includes("/v1beta/openai")) {
      endpoint = endpoint.split("/v1beta")[0] + "/v1beta/openai/chat/completions";
    }
  } else if (!endpoint.endsWith("/chat/completions")) {
    endpoint = endpoint.replace(/\/+$/, "") + "/v1/chat/completions";
  }

  const model = cfg.model;
  const apiKey = auth.custom_apiKey || "";

  const targetLang = cfg.language || "ko";
  const ctx = formatContext(contextMessages);

  let systemPrompt = direction === "toEn"
    ? "You are a professional translator. Translate the following user input into natural English. Maintain code blocks. CRITICAL: Output ONLY the translated text. No analysis, no notes, no explanation."
    : `You are a professional translator. Translate the following English text into natural ${targetLang}. Maintain code blocks and markdown links. CRITICAL: Output ONLY the translated text. No analysis, no notes, no explanation.`;

  systemPrompt += ctx;

  const getChatBody = (forceMerge = false) => {
    let messages = [];
    if (forceMerge || shouldMergeSystemPrompt(model)) {
      messages = [{ role: "user", content: systemPrompt + "\n\nText to translate:\n" + text }];
    } else {
      messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ];
    }
    return JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0,
      max_tokens: 1024
    });
  };

  try {
    let response = await originalFetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        [TRANSLATION_HEADER]: "true"
      },
      body: getChatBody()
    });

    // Smart Fallback: If 400 error and we suspect 'system' role issue
    if (response.status === 400 && !shouldMergeSystemPrompt(model)) {
      const errData = await response.clone().json().catch(() => ({}));
      const errMsg = JSON.stringify(errData).toLowerCase();

      if (errMsg.includes("system") || errMsg.includes("role") || errMsg.includes("invalid_request_error")) {
        console.error(`[claude-trans] Model '${model}' doesn't support system role. Fallback applied.`);
        setCapability(model, "supports_system_role", false);

        response = await originalFetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            [TRANSLATION_HEADER]: "true"
          },
          body: getChatBody(true)
        });
      }
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[claude-trans] Custom translate error: ${response.status} ${errBody.slice(0, 200)}`);
      tlog(`Error: ${response.status} ${errBody.slice(0, 200)}`);
      return text;
    }
    const data = await response.json();
    let result = data.choices?.[0]?.message?.content?.trim() || text;
    result = cleanOutput(result);
    tlog(`Result: "${result.slice(0, 60)}..."`);
    return result;
  } catch (e) {
    console.error(`[claude-trans] Custom translate exception: ${e.message}`);
    tlog(`Exception: ${e.message}`);
    return text;
  }
}

module.exports = { translate };
