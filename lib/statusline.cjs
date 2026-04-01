"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

// ── ANSI color helpers ──────────────────────────────────────────────────────

const COLOR_MAP = {
  black: "30", red: "31", green: "32", yellow: "33",
  blue: "34", magenta: "35", cyan: "36", white: "37",
  dim: "2", bold: "1", bold_cyan: "1;36", bold_yellow: "1;33",
  bold_green: "1;32", bold_red: "1;31", bold_magenta: "1;35",
  none: "",
};

function c(name) {
  const code = COLOR_MAP[name] || "";
  return code ? `\x1b[${code}m` : "";
}

const R = "\x1b[0m";

// Default colors: tag=cyan, model=dim, user=yellow, claude=cyan, arrow=dim
const DEFAULT_COLORS = {
  tag: "bold_cyan",
  model: "dim",
  user: "yellow",
  claude: "cyan",
  arrow: "dim",
};

function loadColors() {
  try {
    const cfgPath = path.join(CLAUDE_DIR, "claude-trans.json");
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      if (cfg.statusline_colors) return { ...DEFAULT_COLORS, ...cfg.statusline_colors };
    }
  } catch {}
  return { ...DEFAULT_COLORS };
}

function getStatusline() {
  const parts = [];

  // 1. claude-trans translation info (displayed FIRST, before OMC)
  try {
    const stPath = path.join(CLAUDE_DIR, "claude-trans-status.json");
    const cfgPath = path.join(CLAUDE_DIR, "claude-trans.json");

    let model = "claude";
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      model = cfg.custom_model || cfg.model || cfg.translate_model || cfg.backend || "claude";
    }

      const colors = loadColors();
      const tag = `${c(colors.tag)}[ts]${R} ${c(colors.model)}${model}${R}`;
      const formatted = [];
      const status = fs.existsSync(stPath) ? JSON.parse(fs.readFileSync(stPath, "utf8")) : {};
      
      if (status.input) {
          const orig = status.input.original.length > 40 ? status.input.original.slice(0, 40) + "\u2026" : status.input.original;
          const trans = status.input.translated.length > 40 ? status.input.translated.slice(0, 40) + "\u2026" : status.input.translated;
          formatted.push(`${tag} ${c(colors.user)}${orig}${R} ${c(colors.arrow)}\u2192${R} ${c(colors.claude)}${trans}${R}`);
      } else if (!status.output) {
          // If absolutely nothing is yet translated, show model info with a standby message
          formatted.push(`${tag} ${c("dim")}(Ready...)${R}`);
      }
      
      if (status.output) {
          const orig = status.output.original.length > 40 ? status.output.original.slice(0, 40) + "\u2026" : status.output.original;
          const trans = status.output.translated.length > 40 ? status.output.translated.slice(0, 40) + "\u2026" : status.output.translated;
          // Use branch arrow for output
          const prefix = status.input ? "\u21B3 " : `${tag} `;
          formatted.push(`${prefix}${c(colors.claude)}${orig}${R} ${c(colors.arrow)}\u2192${R} ${c(colors.user)}${trans}${R}`);
      }
      
      if (formatted.length > 0) {
        parts.push(formatted.join("\n"));
      }
    } catch {}

  // 2. Original statusline (Execute original command like OMC)
  try {
    const backupPath = path.join(CLAUDE_DIR, "claude-trans-orig-statusline.json");
    if (fs.existsSync(backupPath)) {
      const data = JSON.parse(fs.readFileSync(backupPath, "utf8"));
      if (data.command) {
        const { spawnSync } = require("child_process");
        const parts_cmd = data.command.split(" ");
        // use timeout and inherit stdin (0) to ensure OMC gets the JSON it needs
        const res = spawnSync(parts_cmd[0], parts_cmd.slice(1), { 
          encoding: "utf8", 
          shell: true, 
          stdio: ["inherit", "pipe", "pipe"],
          timeout: 1500 
        });
        if (res.stdout && res.stdout.trim()) {
           parts.push(res.stdout.trim());
        } else if (res.error || res.status !== 0) {
           // If it fails, we could potentially log to a file or just ignore
        }
      } else if (data.content) {
        parts.push(data.content);
      }
    }
  } catch {}

  // Clear line before output to prevent residual text from previous renders
  // \r = cursor to start, \x1b[K = clear to end of line
  const output = parts.join("\n");
  process.stdout.write("\r\x1b[K" + output + "\n");
}

if (require.main === module) {
  getStatusline();
}
