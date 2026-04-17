"use strict";

const { loadConfig, loadAuth } = require("../config.cjs");
const { formatContext } = require("../request-util.cjs");
const TRANSLATION_HEADER = "x-claude-ts-skip";

async function translate(text, direction, originalFetch, contextMessages) {
  const cfg = loadConfig();
  const auth = loadAuth();
  const apiKey = auth.apiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return text;

  const targetLang = cfg.language || "ko";
  const ctx = formatContext(contextMessages);

  let systemPrompt = direction === "toEn"
    ? "You are a professional translator. Translate the following user input into natural, concise English. Maintain any code blocks or technical terms exactly as they are. CRITICAL: Output ONLY the translated text. No analysis, no notes, no explanation, no thinking."
    : `You are a professional translator. Translate the following English text into natural, polite ${targetLang}. Maintain any code blocks, markdown links, or technical terms exactly as they are. CRITICAL: Output ONLY the translated text. No analysis, no notes, no explanation, no thinking.`;

  systemPrompt += ctx;

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
        model: cfg.model || "claude-haiku-4-5-20251001",
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

module.exports = { translate };
