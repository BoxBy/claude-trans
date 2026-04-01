---
description: Toggle Extended Thinking translation (on/off)
---

# /ts-thinking <on|off>

Set whether Claude's extended thinking content should be translated.

- **on**: Thinking content is translated to the configured target language. (May introduce slight delay.)
- **off**: Thinking content is passed through as-is in English. (Default.)

Update the `translate_thinking` field in `~/.claude/claude-trans.json` accordingly.
