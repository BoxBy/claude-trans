---
description: Change translation target language (ko, ja, zh, etc.)
---

# /ts-lang [langCode]

When the user invokes this command:

1. If no `langCode` argument is provided, show the currently configured language (`language` field in `~/.claude/claude-trans.json`).
2. Show available language examples:
   - `ko` (Korean)
   - `ja` (Japanese)
   - `zh` (Chinese)
   - `en` (English — equivalent to disabling translation)

3. When updating, change the `language` field in `~/.claude/claude-trans.json` to the given code.
4. After updating, respond with: "Translation language set to [langCode]."
