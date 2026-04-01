---
description: Set the translation model (e.g., gemma-3-27b-it)
---

# /ts-model [model]

When the user invokes this command:

1. If a `model` argument is provided, update the `model` and `custom_model` fields in `~/.claude/claude-trans.json` to the given model name.
2. If no argument is provided, show the list of recommended models:
   - `claude-3-5-haiku-20241022` (Claude Haiku)
   - `gemma-3-27b-it` (Google Gemini)
   - `gpt-4o-mini` (OpenAI)

3. After updating, respond with: "Translation model changed to [model]."
