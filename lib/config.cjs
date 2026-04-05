"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

function loadConfig() {
  const cfgPath = path.join(CLAUDE_DIR, "claude-trans.json");
  const defaultCfg = {
    language: "ko",
    backend: "claude",
    model: "claude-3-5-haiku-20241022",
    custom_endpoint: "",
    custom_model: "",
    show_translation: true,
    translate_thinking: false,
    debug: false,
  };
  try {
    if (fs.existsSync(cfgPath)) {
      const userCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      // Migration from old name
      if (userCfg.claude_ts) {
        Object.assign(userCfg, userCfg.claude_ts);
      }
      // Migrate old translation keys
      if (userCfg.translate_backend) userCfg.backend = userCfg.translate_backend;
      if (userCfg.translate_endpoint) userCfg.custom_endpoint = userCfg.translate_endpoint;
      if (userCfg.translate_model) userCfg.custom_model = userCfg.translate_model;
      
      // If translate_api_key is stuck here, move it to auth
      if (userCfg.translate_api_key) {
        const authPath = path.join(CLAUDE_DIR, "claude-trans-auth.json");
        let auth = {};
        try { if (fs.existsSync(authPath)) auth = JSON.parse(fs.readFileSync(authPath, "utf8")); } catch {}
        if (!auth.custom_apiKey) {
           auth.custom_apiKey = userCfg.translate_api_key;
           fs.writeFileSync(authPath, JSON.stringify(auth, null, 2), "utf8");
        }
      }
      return { ...defaultCfg, ...userCfg };
    }
  } catch (e) { /* ignore config parse errors to avoid breaking TUI */ }
  return defaultCfg;
}

function loadAuth() {
  const authPath = path.join(CLAUDE_DIR, "claude-trans-auth.json");
  let auth = {};
  try {
    if (fs.existsSync(authPath)) {
      auth = JSON.parse(fs.readFileSync(authPath, "utf8"));
    }
  } catch {}
  
  // Also check old location just in case it wasn't migrated
  try {
      const cfgPath = path.join(CLAUDE_DIR, "claude-trans.json");
      if (fs.existsSync(cfgPath)) {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
          if (cfg.translate_api_key && !auth.custom_apiKey) {
              auth.custom_apiKey = cfg.translate_api_key;
          }
      }
  } catch {}
  
  return auth;
}

function loadLanguage(langCode) {
  // Built-in basic languages
  const langs = {
    ko: { name: "한국어", name_en: "Korean" },
    ja: { name: "日本語", name_en: "Japanese" },
    zh: { name: "中文", name_en: "Chinese" },
  };
  return langs[langCode] || { name: langCode, name_en: langCode };
}

// ── TTY output (bypasses Ink rendering) ────────────────────────────────────────

function ttyWrite(msg) {
  // Disabled as writing to console corrupts Claude Code's Ink UI renderer
  // We rely on statusline for now.
}

// ── Status file (for statusline display) ──────────────────────────────────────

function getStatusPath() {
  return path.join(os.homedir(), ".claude", "claude-trans-status.json");
}

function writeStatus(data) {
  try {
    const p = getStatusPath();
    let current = {};
    if (fs.existsSync(p)) {
      try { current = JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
    }
    const merged = { ...current, ...data };
    fs.writeFileSync(p, JSON.stringify(merged, null, 2), "utf8");
  } catch {}
}

function getClaudeSettingsPath() {
  return path.join(os.homedir(), ".claude", "settings.json");
}

function loadClaudeSettings() {
  const p = getClaudeSettingsPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

module.exports = {
  loadConfig,
  loadAuth,
  loadLanguage,
  ttyWrite,
  writeStatus,
  loadClaudeSettings,
  CLAUDE_DIR,
};
