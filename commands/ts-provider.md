---
description: Configure translation provider and API key
---

# /ts-provider [url]

## If a URL argument is provided

Skip provider selection — go directly to custom setup with that URL.

## If no argument

Use AskUserQuestion with these options:
- "claude (Anthropic Haiku — default)"
- "custom (OpenAI / Google Gemini compatible)"

## For "claude"

1. Open `~/.claude/claude-trans-auth.json` in the editor so the user can add their `apiKey`.
2. Set `backend` to `"claude"` in `~/.claude/claude-trans.json`.
3. Respond ONLY: "Provider set to **claude**."

## For "custom"

1. If no URL argument was given, ask: "Enter the endpoint URL:" (e.g. `https://generativelanguage.googleapis.com`).
2. Open `~/.claude/claude-trans-auth.json` in the editor so the user can add their `custom_apiKey`.
3. After the user confirms, fetch models by running:
   ```bash
   node "$(npm root -g)/claude-trans/lib/fetch-models.cjs" "<endpoint_url>"
   ```
4. If models are listed, use AskUserQuestion with the model names as options. If fetching fails, ask the user to type the model name.
5. Save to `~/.claude/claude-trans.json`:
   - `backend`: `"custom"`
   - `custom_endpoint`: the URL
   - `model`: the selected model name
6. Respond ONLY: "Provider set to **custom** (model: <model_name>)."

## Rules
- Do NOT store endpoint or model in `~/.claude/claude-trans-auth.json`. That file stores API keys only.
- Do NOT ask extra questions.
- Do NOT show verbose output. One-line response only.
