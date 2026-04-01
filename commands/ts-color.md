---
description: 상태 표시줄 색상 테마 설정
---

# /ts-color [element] [color]

사용자가 이 명령어를 입력하면 다음 단계를 따라 설정을 업데이트하세요:

1. `~/.claude/claude-trans.json`의 `statusline_colors` 객체에서 색상을 관리합니다.

2. 설정 가능한 요소(`element`):
   - `tag` — [ts] 태그 색상 (기본값: bold_cyan)
   - `model` — 모델명 색상 (기본값: dim)
   - `user` — 사용자가 본/입력한 텍스트 색상 (기본값: yellow)
   - `claude` — Claude가 본/출력한 텍스트 색상 (기본값: cyan)
   - `arrow` — 화살표(→) 색상 (기본값: dim)

3. 사용 가능한 색상(`color`):
   - `black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`
   - `dim`, `bold`
   - `bold_cyan`, `bold_yellow`, `bold_green`, `bold_red`, `bold_magenta`
   - `none` (색상 없음)

4. 인자 없이 호출하면 현재 색상 설정을 보여주세요.

5. 사용 예시:
   - `/ts-color` — 현재 설정 전체 표시
   - `/ts-color user green` — 사용자 텍스트를 초록으로
   - `/ts-color tag bold_yellow` — [ts] 태그를 굵은 노랑으로
   - `/ts-color claude none` — Claude 텍스트 색상 제거

6. 업데이트 후 "statusline 색상이 변경되었습니다: [element] → [color]"라고 응답하세요.
