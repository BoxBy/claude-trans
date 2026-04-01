---
description: Display translation debug info (Original ↔ Translated pairs)
---

# /ts-show

When the user invokes this command, show the current translation state:

1. Read `~/.claude/claude-trans-status.json` and display the last processed translation pair (Original ↔ Translated).
2. Read `~/.claude/claude-trans.json` and summarize the active backend, model, and target language.
3. If debug mode is enabled, show a summary of the last few lines from `~/.claude/claude-trans.log`.
