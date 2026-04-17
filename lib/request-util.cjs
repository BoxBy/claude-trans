"use strict";

function containsTargetLanguage(text) {
  if (!text || typeof text !== "string") return false;
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text);
}

function hasTargetLang(text) {
  return containsTargetLanguage(text);
}

function extractContentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter(b => b.type === "text").map(b => b.text || "").join("\n");
  }
  return "";
}

function stripJsonReasoning(text) {
  if (!text) return text;
  return text
    // <thought>...</thought> tags
    .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    // ```json blocks with reasoning keys
    .replace(/```json\s*\n?\{[\s\S]*?"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}\s*\n?```/gi, "")
    // Bare JSON with reasoning keys
    .replace(/\{"(?:thought|title|reasoning|thinking)"\s*:[\s\S]*?\}/gi, "")
    .trim();
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

/**
 * Translate all messages in a request body from target language to English.
 * Uses lazy require to avoid circular dependency with translator.cjs.
 */
async function translateMessages(requestBody, fetchFn, cache) {
  const { translate } = require("./translator.cjs");
  const pairs = [];

  for (let i = 0; i < (requestBody.messages?.length || 0); i++) {
    const msg = requestBody.messages[i];
    const ctx = requestBody.messages.slice(Math.max(0, i - 4), i);

    if (typeof msg.content === "string" && hasTargetLang(msg.content)) {
      let en;
      if (cache?.targetToEn?.has(msg.content)) {
        en = cache.targetToEn.get(msg.content);
      } else {
        en = await translate(msg.content, "toEn", fetchFn, ctx);
        if (cache && en !== msg.content) {
          cache.targetToEn.set(msg.content, en);
          cache.enToTarget.set(en, msg.content);
        }
      }
      if (en !== msg.content) {
        pairs.push({ original: msg.content, translated: en });
        msg.content = en;
      }
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text" && block.text && hasTargetLang(block.text)) {
          let en;
          if (cache?.targetToEn?.has(block.text)) {
            en = cache.targetToEn.get(block.text);
          } else {
            en = await translate(block.text, "toEn", fetchFn, ctx);
            if (cache && en !== block.text) {
              cache.targetToEn.set(block.text, en);
              cache.enToTarget.set(en, block.text);
            }
          }
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

module.exports = { containsTargetLanguage, hasTargetLang, extractContentText, stripJsonReasoning, formatContext, translateMessages };
