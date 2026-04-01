---
description: 번역 표시 및 캐시 등 디버깅 정보 확인
---

# /ts-show

사용자가 이 명령어를 호출하면 다음 단계를 수행하여 현재 번역 상태를 보여주세요:

1. `~/.claude/claude-trans-status.json` 파일을 읽어서 현재 마지막으로 처리된 번역 페어(Original ↔ Translated)를 표시합니다.
2. `~/.claude/claude-trans.json` 파일을 읽어서 현재 활성화된 백엔드, 모델, 타겟 언어 정보를 요약해서 보여줍니다.
3. 만약 디버그 모드가 켜져 있다면 `~/.claude/claude-trans.log`의 마지막 몇 줄을 요약해서 보여주세요.
