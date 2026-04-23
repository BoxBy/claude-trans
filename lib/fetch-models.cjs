#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const AUTH_PATH = path.join(CLAUDE_DIR, "claude-trans-auth.json");
const CFG_PATH = path.join(CLAUDE_DIR, "claude-trans.json");

function loadApiKey() {
  try {
    if (fs.existsSync(AUTH_PATH)) {
      const auth = JSON.parse(fs.readFileSync(AUTH_PATH, "utf8"));
      return auth.custom_apiKey || "";
    }
  } catch {}
  return "";
}

// Google Gemini — native REST API
async function fetchGeminiModels(apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || []).map(m => ({
    id: m.name.split("/").pop(),
    name: m.displayName || m.name.split("/").pop(),
  }));
}

// Ollama — native /api/tags (no API key needed)
async function fetchOllamaModels(endpoint) {
  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/api/tags`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || []).map(m => ({ id: m.name, name: m.name }));
}

// OpenAI-compatible — /v1/models (covers OpenAI, OpenRouter, Groq, ZAI, Qwen/DashScope, etc.)
async function fetchOpenAIModels(endpoint, apiKey) {
  const base = endpoint.replace(/\/+$/, "");
  const url = `${base}/v1/models`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || []).map(m => ({ id: m.id, name: m.id }));
}

function isOllama(endpoint) {
  const lower = endpoint.toLowerCase();
  return lower.includes("ollama") ||
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(lower) && !lower.includes("generativelanguage");
}

async function main() {
  let endpoint = process.argv[2];
  if (!endpoint) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
      endpoint = cfg.custom_endpoint || "";
    } catch {}
    if (!endpoint) {
      console.error("No endpoint configured. Run /ts-provider first.");
      process.exit(1);
    }
  }

  try {
    let models;
    if (endpoint.includes("generativelanguage.googleapis.com")) {
      const apiKey = loadApiKey();
      if (!apiKey) { console.error("No API key found in " + AUTH_PATH); process.exit(1); }
      models = await fetchGeminiModels(apiKey);
    } else if (isOllama(endpoint)) {
      models = await fetchOllamaModels(endpoint);
    } else {
      const apiKey = loadApiKey();
      models = await fetchOpenAIModels(endpoint, apiKey);
    }

    if (models.length === 0) {
      console.log("No models found.");
      process.exit(0);
    }

    models.forEach((m, i) => {
      console.log(`${i + 1}. ${m.id} (${m.name})`);
    });
  } catch (e) {
    console.error("Failed to fetch models:", e.message);
    process.exit(1);
  }
}

main();
