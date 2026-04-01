"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const CAP_PATH = path.join(CLAUDE_DIR, "claude-trans-capabilities.json");

let _caps = null;

function load() {
  if (_caps) return _caps;
  try {
    if (fs.existsSync(CAP_PATH)) {
      _caps = JSON.parse(fs.readFileSync(CAP_PATH, "utf8"));
    } else {
      _caps = {};
    }
  } catch {
    _caps = {};
  }
  return _caps;
}

function save() {
  if (!_caps) return;
  try {
    if (!fs.existsSync(CLAUDE_DIR)) fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(CAP_PATH, JSON.stringify(_caps, null, 2), "utf8");
  } catch (e) {
    console.error("[claude-trans] Failed to save capabilities:", e.message);
  }
}

/**
 * Check if the model supports specific capabilities.
 * @param {string} model 
 * @param {string} key e.g., 'supports_system_role'
 * @returns {boolean|null} Returns null if unknown.
 */
function getCapability(model, key) {
  const caps = load();
  if (caps[model] && caps[model][key] !== undefined) {
    return caps[model][key];
  }
  
  // Pre-configured defaults for known models
  if (model.toLowerCase().includes("gemma")) {
    if (key === "supports_system_role") return false;
  }
  
  return null;
}

/**
 * Mark a capability for a model (Learning).
 * @param {string} model 
 * @param {string} key 
 * @param {any} value 
 */
function setCapability(model, key, value) {
  const caps = load();
  if (!caps[model]) caps[model] = {};
  caps[model][key] = value;
  save();
}

/**
 * Check if we should merge the system prompt into the user message.
 */
function shouldMergeSystemPrompt(model) {
  const sup = getCapability(model, "supports_system_role");
  // If explicitly false, or if it's a known non-system model (null means unknown)
  return sup === false;
}

module.exports = {
  getCapability,
  setCapability,
  shouldMergeSystemPrompt
};
