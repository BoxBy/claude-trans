---
description: Toggle real-time translation preview visibility (Show/Hide)
---

# /ts-hide

When this command is invoked:

1. Toggle the `show_translation` value in `~/.claude/claude-trans.json` (`true` ↔ `false`).
2. If `show_translation` is `true`, translation preview is displayed. If `false`, translation runs silently.
3. After updating, respond with: "Translation preview is now [on/off]."
