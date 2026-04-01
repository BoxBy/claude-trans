---
description: Show translation status and toggle preview visibility (on/off)
---

# /ts-show [on|off]

When the user invokes this command:

1. If argument is `on` → set `show_translation` to `true` in `~/.claude/claude-trans.json`. Respond with: "Translation preview enabled."
2. If argument is `off` → set `show_translation` to `false` in `~/.claude/claude-trans.json`. Respond with: "Translation preview disabled."
3. If no argument is given, display the current translation state:
   - Read `~/.claude/claude-trans-status.json` and show the last processed translation pair (Original ↔ Translated).
   - Read `~/.claude/claude-trans.json` and summarize the active backend, model, target language, and current `show_translation` status.
