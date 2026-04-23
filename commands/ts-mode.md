---
description: Set or show the translation mode (fetch or proxy)
---

# /ts-mode [fetch|proxy]

When the user invokes this command:

1. If argument is `proxy` → set `mode` to `"proxy"` in `~/.claude/claude-trans.json`. Respond with: "Mode set to Proxy. Restart cts to apply."
2. If argument is `fetch` → set `mode` to `"fetch"`. Respond with: "Mode set to Fetch. Restart cts to apply."
3. If no argument is given, display the current mode and usage instructions.

- **fetch** mode (default): Uses `NODE_OPTIONS --require` to patch fetch. Requires npm-installed Claude Code.
- **proxy** mode: Starts a local HTTP proxy. Works with any Claude Code install (npm or native).
