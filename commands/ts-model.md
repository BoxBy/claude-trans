---
description: 번역할 모델(예: gemma-3-27b-it) 설정
---

# /ts-model [model]

사용자가 이 명령어를 입력하면 다음 단계를 따라 설정을 업데이트하세요:

1. `model` 인자가 주어지면 `~/.claude/claude-trans.json`의 `model` 및 `custom_model` 필드를 해당 모델명으로 업데이트합니다.
2. 만약 인자가 없다면 현재 사용 가능한 추천 모델 목록을 보여주세요:
   - `claude-3-5-haiku-20241022` (Haiku)
   - `gemma-3-27b-it` (Google Gemini)
   - `gpt-4o-mini` (OpenAI)

3. 업데이트가 완료되면 "번역 모델이 [model](으)로 변경되었습니다."라고 응답하세요.
