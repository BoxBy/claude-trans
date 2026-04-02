#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const loaderPath = path.join(__dirname, "..", "lib", "loader.cjs").replace(/\\/g, "/");
const claudeDir = path.join(os.homedir(), ".claude");

// ── Auto-sync slash commands (.md) ────────────────────────────────────────────
function syncCommands() {
    try {
        const srcDir = path.join(__dirname, "..", "commands");
        const dstDir = path.join(claudeDir, "commands");
        if (!fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true });
        
        if (fs.existsSync(srcDir)) {
            const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".md"));
            for (const file of files) {
                fs.copyFileSync(path.join(srcDir, file), path.join(dstDir, file));
            }
        }
    } catch (e) {
        console.error("[claude-trans] Failed to sync slash commands:", e.message);
    }
}

// ── Ensure settings.json points to our bridge (Carefully) ──────────────────────
function ensureSettings() {
    try {
        const settingsPath = path.join(claudeDir, "settings.json");
        const bridgePath = path.join(claudeDir, "claude-trans-statusline.cjs");
        const origPath = path.join(claudeDir, "claude-trans-orig-statusline.json");
        const targetCmd = `node ${bridgePath.replace(/\\/g, "/")}`;

        // Ensure the bridge script exists and has the latest code
        const srcStatusline = path.join(__dirname, "..", "lib", "statusline.cjs");
        const bridgeContent = fs.readFileSync(srcStatusline, "utf8");
        fs.writeFileSync(bridgePath, bridgeContent, "utf8");

        if (fs.existsSync(settingsPath)) {
            const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
            const currentCmd = settings.statusLine ? settings.statusLine.command : null;

            if (currentCmd && currentCmd !== targetCmd) {
                // If there's an existing command that isn't ours, BACK IT UP FIRST
                const backup = { type: "command", command: currentCmd };
                fs.writeFileSync(origPath, JSON.stringify(backup, null, 2), "utf8");
                console.error("[claude-trans] Backed up existing statusline to orig-statusline.json");
                
                // Now it's safe to set our bridge
                settings.statusLine = { type: "command", command: targetCmd };
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
                console.error("[claude-trans] Installed statusline bridge in settings.json");
            } else if (!currentCmd) {
                // No statusline at all, just set ours
                settings.statusLine = { type: "command", command: targetCmd };
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
            }
        }
    } catch (e) {
        console.error("[claude-trans] Failed to ensure settings:", e.message);
    }
}

// ── Check if Claude Code is installed via npm ──────────────────────────────────
function checkClaudeInstall() {
    try {
        const { execSync } = require("child_process");
        let claudePath;
        if (process.platform === "win32") {
            const result = execSync("where claude 2>nul", { encoding: "utf8" }).trim();
            // Prefer .cmd file (npm) over .exe (native)
            const lines = result.split("\n").map(l => l.trim()).filter(Boolean);
            claudePath = lines.find(l => l.endsWith(".cmd") || l.endsWith(".ps1")) || lines[0];
        } else {
            claudePath = execSync("which claude 2>/dev/null", { encoding: "utf8" }).trim();
        }
        if (claudePath) {
            const content = fs.readFileSync(claudePath, "utf8").slice(0, 100);
            if (!content.startsWith("#!") && !content.startsWith("@") && !content.startsWith("::")) {
                console.error("[claude-trans] WARNING: Claude Code appears to be a native binary.");
                console.error("[claude-trans] claude-trans requires the npm version. Install with:");
                console.error("[claude-trans]   npm install -g @anthropic-ai/claude-code");
            }
        }
    } catch {}
}

// ── Check for npm updates ──────────────────────────────────────────────────────
function checkUpdate() {
    try {
        const https = require("https");
        const pkg = require(path.join(__dirname, "..", "package.json"));
        const req = https.get(`https://registry.npmjs.org/${pkg.name}/latest`, { timeout: 3000 }, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    const latest = JSON.parse(data).version;
                    if (latest !== pkg.version) {
                        console.error(`[claude-trans] Update available: ${pkg.version} → ${latest}`);
                        console.error(`[claude-trans] Run: npm update -g ${pkg.name}`);
                    }
                } catch {}
            });
        });
        req.on("error", () => {});
        req.on("timeout", () => req.destroy());
    } catch {}
}

syncCommands();
ensureSettings();
checkClaudeInstall();
checkUpdate();

// ── Clean up stale status from previous (crashed/force-closed) session ──────
try {
  const stPath = path.join(claudeDir, "claude-trans-status.json");
  if (fs.existsSync(stPath)) fs.unlinkSync(stPath);
} catch {}

// ── Restore settings.json on exit ──────────────────────────────────────────────
function restoreSettings() {
    try {
        const settingsPath = path.join(claudeDir, "settings.json");
        const origPath = path.join(claudeDir, "claude-trans-orig-statusline.json");
        const bridgePath = path.join(claudeDir, "claude-trans-statusline.cjs");
        const targetCmd = `node ${bridgePath.replace(/\\/g, "/")}`;

        if (fs.existsSync(origPath) && fs.existsSync(settingsPath)) {
            const backup = JSON.parse(fs.readFileSync(origPath, "utf8"));
            const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));

            // Only restore if settings are still pointing to our bridge
            if (settings.statusLine && settings.statusLine.command === targetCmd) {
                settings.statusLine = backup;
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
                console.error("[claude-trans] Restored original statusline in settings.json");
            }
        } else if (!fs.existsSync(origPath) && fs.existsSync(settingsPath)) {
            // If there was no backup, it means there was no original statusLine. Remove ours.
            const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
            if (settings.statusLine && settings.statusLine.command === targetCmd) {
                delete settings.statusLine;
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf8");
                console.error("[claude-trans] Removed statusline bridge from settings.json");
            }
        }
    } catch (e) {
        console.error("[claude-trans] Failed to restore settings:", e.message);
    }
}

// ── Environment setup for Claude Code ─────────────────────────────────────────
const env = { 
  ...process.env, 
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --require "${loaderPath}"` 
};

const args = process.argv.slice(2);

const child = spawn("claude", args, {
  stdio: "inherit",
  shell: true,
  env: env
});

// Pass through signals gracefully
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(sig => {
    process.on(sig, () => {
        child.kill(sig);
    });
});

child.on("exit", (code) => {
  restoreSettings();
  // Remove all claude-trans artifacts
  try {
    // Status file
    const stPath = path.join(claudeDir, "claude-trans-status.json");
    if (fs.existsSync(stPath)) fs.unlinkSync(stPath);
    // Slash commands
    const cmdDir = path.join(claudeDir, "commands");
    if (fs.existsSync(cmdDir)) {
      fs.readdirSync(cmdDir).filter(f => f.startsWith("ts-") && f.endsWith(".md")).forEach(f => {
        fs.unlinkSync(path.join(cmdDir, f));
      });
    }
    // Bridge script
    const bridge = path.join(claudeDir, "claude-trans-statusline.cjs");
    if (fs.existsSync(bridge)) fs.unlinkSync(bridge);
  } catch {}
  process.exit(code || 0);
});

