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

**All Claude CLI flags and arguments are passed through**, so you can use `cts` as a drop-in replacement for `claude`:

```bash
# Launch Claude Code with translation enabled
cts

# Use a specific model
cts --model sonnet

# Print mode (non-interactive)
cts -p "Explain this function"

# Skip permissions (dangerous mode)
cts --dangerously-skip-permissions

# Continue last conversation
cts --continue

# Any other claude flags work as-is
cts --allowedTools "Edit,Write,Bash" --model opus
```

### Configuration

Translation settings are configured interactively via slash commands inside Claude Code:

```bash
/ts-lang         # Change target language (ko, ja, zh, ...)
/ts-provider     # Configure translation provider and API keys
/ts-model        # Change translation model
```

## Translation Backends

| Backend | Description | API Key |
|--------|------|--------|
| `claude` (default) | Uses Claude API (Haiku) | Reuses Claude Code session key automatically |
| `ollama` | Local Ollama instance | Not required |
| `custom` | OpenAI / Google Gemini compatible endpoints | Depends on endpoint |

### Using Custom Endpoints (e.g., Google Gemini / OpenAI)

Run `/ts-provider` inside Claude Code to configure. The endpoint URLs are automatically corrected:

- `https://` is prepended if the scheme is missing.
- **Google Gemini**: Automatically routes properly, avoiding system prompt issues (e.g., `gemma-3-27b-it` missing developer instructions).
- **OpenAI Compatible**: `/v1/chat/completions` paths are automatically handled.

## Slash Commands

The following commands are automatically installed on session start and available within Claude Code:

| Command | Description |
|--------|------|
| `/ts-show` | Display translation debug info (Original ↔ Translated pairs) |
| `/ts-hide` | Hide translation info (quiet mode) |
| `/ts-provider` | Configure translation provider and set custom API keys |
| `/ts-model` | Change translation model |
| `/ts-lang` | Change translation target language |
| `/ts-thinking` | Toggle extended thinking translation (`on`/`off`, default: `off`) |
| `/ts-color` | Change statusline color theme |

## Statusline Integration

claude-trans hooks into Claude Code's native statusline and displays real-time translation preview. Your existing statusline (e.g., OMC) is automatically backed up and displayed below.

```
[ts] gemma-3-27b-it 안녕하세요? → Hello?
↳ The function calculates → 이 함수는 계산합니다
```

The statusline shows:
- **Tag & model**: `[ts]` followed by the active translation model name
- **Input line**: Your original text → English translation (sent to Claude)
- **Output line** (`↳`): Claude's English response → translated back to your language

Text is color-coded — user input in yellow, Claude's text in cyan, arrows in dim — and long text is automatically truncated. Colors can be customized via `/ts-color`.

## Clean Exit

When you exit `cts` normally, all injected artifacts are automatically cleaned up:

- **Statusline bridge script** removed from `~/.claude/`
- **Original statusline settings** restored from backup
- **Slash commands** (`ts-*.md`) removed from `~/.claude/commands/`
- **Status file** removed from `~/.claude/`

No residue is left behind — your Claude Code environment returns to its original state.

## License

MIT
