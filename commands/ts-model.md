---
description: Set the translation model
---

# /ts-model [model]

1. If a `model` argument is provided, set `model` to that value in `~/.claude/claude-trans.json`. Respond ONLY: "Model set to **{model}**."
2. If no argument:
   - Read `~/.claude/claude-trans.json` and check `backend`.
   - If `backend` is `"custom"` and `custom_endpoint` exists, fetch models:
     ```bash
     node "$(npm root -g)/claude-trans/lib/fetch-models.cjs"
     ```
     Show results as AskUserQuestion options.
   - Otherwise (claude backend), ask the user to type a model name. Recommended: `claude-haiku-4-5-20251001`.
3. After updating, respond ONLY: "Model set to **{model}**."
