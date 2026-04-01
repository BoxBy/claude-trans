---
description: Set statusline color theme
---

# /ts-color [element] [color]

When the user invokes this command, update the settings as follows:

1. Manage colors in the `statusline_colors` object of `~/.claude/claude-trans.json`.

2. Configurable elements:
   - `tag` — [ts] tag color (default: bold_cyan)
   - `model` — model name color (default: dim)
   - `user` — user input/original text color (default: yellow)
   - `claude` — Claude output text color (default: cyan)
   - `arrow` — arrow (→) color (default: dim)

3. Available colors:
   - `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
   - `dim`, `bold`
   - `bold_cyan`, `bold_yellow`, `bold_green`, `bold_red`, `bold_magenta`
   - `none` (no color)

4. If called without arguments, show the current color settings.

5. Usage examples:
   - `/ts-color` — show current settings
   - `/ts-color user green` — set user text to green
   - `/ts-color tag bold_yellow` — set [ts] tag to bold yellow
   - `/ts-color claude none` — remove color from Claude text

6. After updating, respond with: "Statusline color changed: [element] → [color]"
