"use strict";

const { loadConfig } = require("./config.cjs");
const { containsTargetLanguage } = require("./request-util.cjs");

const TRANSLATION_HEADER = "x-claude-ts-skip";

// Providers
const providers = {
  claude: require("./providers/claude.cjs"),
  custom: require("./providers/custom.cjs"),
};

async function translate(text, direction, originalFetch, contextMessages = []) {
  const cfg = loadConfig();

  if (direction === "toEn" && !containsTargetLanguage(text)) return text;
  if (direction === "fromEn" && containsTargetLanguage(text)) return text;

  // Dispatch to provider
  if (cfg.backend === "custom" && cfg.custom_endpoint) {
    return providers.custom.translate(text, direction, originalFetch, contextMessages);
  }
  return providers.claude.translate(text, direction, originalFetch, contextMessages);
}

module.exports = { translate, containsTargetLanguage, TRANSLATION_HEADER };
