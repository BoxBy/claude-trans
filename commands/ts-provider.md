---
description: Configure translation provider (claude, ollama, custom) and API key
---

# /ts-provider [provider]

When this command is invoked:

1. If no `provider` argument is given, help the user choose from:
   - `claude` (default, uses Haiku)
   - `ollama` (local Ollama server)
   - `custom` (OpenAI / Google Gemini compatible endpoint)

2. If the user selects `custom`:
   - Ask for the endpoint URL (e.g., `https://generativelanguage.googleapis.com`).
   - Ask for the API key.
   - Allow the user to specify a model name, or show a list (e.g., `gemma-3-27b-it`) for selection.

3. Update the `backend`, `custom_endpoint`, and `custom_model` fields in `~/.claude/claude-trans.json`.
4. Store the API key securely in the `custom_apiKey` field of `~/.claude/claude-trans-auth.json`.
5. After configuration is complete, respond with: "Translation provider changed to [provider]."
