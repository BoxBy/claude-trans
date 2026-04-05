"use strict";

const { loadConfig, loadAuth } = require("./config.cjs");
const { shouldMergeSystemPrompt, setCapability } = require("./capabilities.cjs");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TRANSLATION_HEADER = "x-claude-ts-skip";
const LOG_FILE = path.join(os.homedir(), ".claude", "claude-trans-proxy.log");

function tlog(msg) {
  try { fs.appendFileSync(LOG_FILE, new Date().toISOString() + " [translator] " + msg + "\n"); } catch {}
}

function containsTargetLanguage(text) {
  if (!text || typeof text !== "string") return false;
  // Detect any CJK (Chinese, Japanese, Korean) characters
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

function formatContext(contextMessages) {
  if (!contextMessages || !Array.isArray(contextMessages) || contextMessages.length === 0) return "";
  const recent = contextMessages.slice(-5);
  const lines = recent.map(m => {
      let content = "";
      if (typeof m.content === "string") content = m.content;
      else if (Array.isArray(m.content)) content = m.content.map(c => c.text || "").join("\n");
      return `${m.role.toUpperCase()}: ${content}`;
  });
  return "\n<conversation_context>\n" + lines.join("\n---\n") + "\n</conversation_context>\n* NOTE: Read the above context to resolve pronouns, domains, and maintaining style. however, ONLY output the translation of the current explicitly requested text.";
}

async function translate(text, direction, originalFetch, contextMessages = []) {
  const cfg = loadConfig();
  if (direction === "toEn" && !containsTargetLanguage(text)) return text;
  if (direction === "fromEn" && containsTargetLanguage(text)) return text;
  
  if (cfg.backend === "custom" && cfg.custom_endpoint) {
    return await translateWithCustom(text, direction, originalFetch, contextMessages);
  } else if (cfg.backend === "claude-cli") {
    // Falls back to CLI if needed, but for now we focus on API
    return text;
  } else {
    // Default: translate with Claude API
    return await translateWithClaude(text, direction, originalFetch, contextMessages);
  }
}

async function translateWithClaude(text, direction, originalFetch, contextMessages) {
  const cfg = loadConfig();
  const auth = loadAuth();
  const apiKey = auth.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) return text;

  const targetLang = cfg.language || "ko";
  let systemPrompt = direction === "toEn" 
    ? "You are a professional translator. Translate the following user input into natural, concise English. Maintain any code blocks or technical terms exactly as they are. Output ONLY the translated text."
    : `You are a professional translator. Translate the following English text into natural, polite ${targetLang}. Maintain any code blocks, markdown links, or technical terms exactly as they are. Output ONLY the translated text.`;

  systemPrompt += formatContext(contextMessages);

  try {
    const response = await originalFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        [TRANSLATION_HEADER]: "true"
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: text }]
      })
    });

    if (!response.ok) return text;
    const data = await response.json();
    return data.content?.[0]?.text || text;
  } catch {
    return text;
  }
}

async function translateWithCustom(text, direction, originalFetch, contextMessages) {
  const cfg = loadConfig();
  const auth = loadAuth();

  let endpoint = cfg.custom_endpoint;
  tlog(`translateWithCustom: direction=${direction}, endpoint=${endpoint}, model=${cfg.custom_model || cfg.model}`);
  tlog(`  has custom_apiKey=${!!auth.custom_apiKey}, text="${text.slice(0, 50)}..."`);
  if (!endpoint.startsWith("http")) endpoint = "https://" + endpoint;
  
  // Auto-fix for Google Gemini or OpenAI endpoints
  if (endpoint.includes("generativelanguage.googleapis.com")) {
    if (!endpoint.includes("/v1beta/openai")) {
        endpoint = endpoint.split("/v1beta")[0] + "/v1beta/openai/chat/completions";
    }
  } else if (!endpoint.endsWith("/chat/completions")) {
    endpoint = endpoint.replace(/\/+$/, "") + "/v1/chat/completions";
  }

  const model = cfg.custom_model || cfg.model;
  const apiKey = auth.custom_apiKey || "";
  
  const targetLang = cfg.language || "ko";
  let systemPrompt = direction === "toEn" 
    ? "You are a professional translator. Translate the following user input into natural English. Maintain code blocks. Output ONLY translated text."
    : `You are a professional translator. Translate the following English text into natural ${targetLang}. Maintain code blocks and markdown links. Output ONLY translated text.`;

  systemPrompt += formatContext(contextMessages);

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

    // Smart Fallback: If 400 error occurs and we suspect it's due to 'system' role
    if (response.status === 400 && !shouldMergeSystemPrompt(model)) {
      const errData = await response.clone().json().catch(() => ({}));
      const errMsg = JSON.stringify(errData).toLowerCase();
      
      // If error message mentions "system" or "role"
      if (errMsg.includes("system") || errMsg.includes("role") || errMsg.includes("invalid_request_error")) {
        console.error(`[claude-trans] Model '${model}' doesn't seem to support system role. Dynamic fallback applied.`);
        setCapability(model, "supports_system_role", false);
        
        // Immediate Retry with merged prompt
        response = await originalFetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            [TRANSLATION_HEADER]: "true"
          },
          body: getChatBody(true) // Force merge for retry
        });
      }
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error(`[claude-trans] Custom translate error: ${response.status} ${errBody.slice(0, 200)}`);
      tlog(`Custom translate error: ${response.status} ${errBody.slice(0, 200)}`);
      return text;
    }
    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() || text;
    console.error(`[claude-trans] Custom translate result: "${result.slice(0, 60)}..."`);
    tlog(`Custom translate result: "${result.slice(0, 60)}..."`);
    return result;
  } catch (e) {
    console.error(`[claude-trans] Custom translate exception: ${e.message}`);
    tlog(`Custom translate exception: ${e.message}`);
    return text;
  }
}

module.exports = {
  translate,
  containsTargetLanguage,
  TRANSLATION_HEADER
};
