# claude-trans (cts)

Transparent translation layer for Claude Code — interact in your language, while Claude reasons in English.

[한국어](README_ko.md)

## Motivation

Claude Code performs best when thinking and reasoning in English. When you converse in other languages, it wastes tokens and the overall result quality drops significantly because Claude spends its context on translation rather than reasoning and coding.

**claude-trans** solves this by patching `global.fetch` inside Claude Code at the API level:
Your input gets translated to English before reaching the API, and the response gets translated back to your language. Claude Code always works in English natively internally, meaning it reasons better and uses fewer tokens. The Claude Code UI is unchanged — the translation is completely transparent.

## Installation

```bash
# Clone the repository
git clone https://github.com/BoxBy/claude-ts.git
cd claude-ts

# Install globally via npm
npm link
```

*Requirements: [Node.js](https://nodejs.org/) (v18+) and [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)*

## Usage

You can launch Claude Code with the translation layer using either `claude-trans` or the shorter alias `cts`.

```bash
# Launch Claude Code with translation enabled
cts

# Change target language
cts --lang ja

# Translate using local Ollama model
cts --ollama gemma3:4b
```

## Translation Backends

A variety of backends are supported for the actual translation. Switching backends happens within Claude Code via slash commands.

| Backend | Description | API Key |
|--------|------|--------|
| `claude` (default) | Uses Claude API (Haiku) | Reuses Claude Code session key automatically |
| `ollama` | Local Ollama instance | Not required |
| `custom` | OpenAI / Google Gemini compatible endpoints | Native depending on endpoint |

You can interactively change your backend using slash commands inside Claude Code:
```bash
/ts-provider    # Configure translation provider and API keys
/ts-model       # Change translation model
```

### Using Custom Endpoints (e.g., Google Gemini / OpenAI)
You can use any OpenAI-compatible endpoint, including Google Gemini and local LLM servers.

```bash
/ts-provider
```
The endpoint URLs are automatically corrected and parsed:
- `https://` is prepended if the scheme is missing.
- **Google Gemini**: Automatically routes properly avoiding system prompt issues (e.g., `gemma-3-27b-it` missing developer instructions).
- **OpenAI Compatible**: `/v1/chat/completions` paths are automatically handled.

## Slash Commands
The following commands are automatically installed and available within Claude Code:

| Command | Description |
|--------|------|
| `/ts-show` | Display translation debug info (Original ↔ Translated pairs) |
| `/ts-hide` | Hide translation info (quiet mode) |
| `/ts-provider` | Configure translation provider and set custom API keys |
| `/ts-model` | Change translation model |
| `/ts-lang` | Change translation target language |

## Statusline Integration
claude-trans cleanly integrates into Claude Code's native statusline:

```
[ts] gemma-3-27b-it | ↳ 안녕하세요? → Hello? 
```
It displays properly formatted text and doesn't interfere with the main UI.

## License
MIT
