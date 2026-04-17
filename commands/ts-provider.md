---
description: Configure translation provider and API key
---

# /ts-provider [url]

Follow these steps EXACTLY. Do not skip or modify any step.

## Step 0: Check for URL argument

**IMPORTANT**: Look at the user's message. If `/ts-provider` is followed by a URL (contains `http://` or `https://` or a domain like `generativelanguage.googleapis.com`), that URL IS the endpoint. Skip directly to Step 2B-2 with that URL.

## Step 1: Ask the user to choose a provider

Use AskUserQuestion with these options:
- "claude (Anthropic Haiku — default)"
- "custom (OpenAI / Google Gemini compatible endpoint)"

## Step 2A: If the user chose "claude"

1. Open `~/.claude/claude-trans-auth.json` in the editor so the user can add their `apiKey`.
2. Set `backend` to `"claude"` in `~/.claude/claude-trans.json`.
3. Respond ONLY: "Provider set to **claude**."

## Step 2B: If the user chose "custom" OR a URL was provided

### Step 2B-1: Get endpoint URL

ONLY ask if no URL was provided in Step 0. Ask: "Enter the endpoint URL:" (e.g. `https://generativelanguage.googleapis.com`).

### Step 2B-2: Get API key

1. Open `~/.claude/claude-trans-auth.json` in the editor so the user can add their `custom_apiKey`.

### Step 2B-3: Fetch available models

After the user confirms, fetch models by running:
```bash
node "$(npm root -g)/claude-trans/lib/fetch-models.cjs" "<endpoint_url>"
```

If models are listed, use AskUserQuestion with the model names as options. If fetching fails, ask the user to type the model name manually.

### Step 2B-4: Save configuration

Save to `~/.claude/claude-trans.json`:
- `backend`: `"custom"`
- `custom_endpoint`: the URL
- `model`: the selected model name

Respond ONLY: "Provider set to **custom** (model: <model_name>)."

## Rules
- Do NOT store endpoint or model in `~/.claude/claude-trans-auth.json`. That file stores API keys only.
- Do NOT ask extra questions.
- Do NOT show verbose output. One-line response only.
