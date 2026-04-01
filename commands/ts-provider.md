---
description: 번역 제공자(claude, ollama, custom) 및 API 키 설정
---

# /ts-provider [provider]

이 명령어가 입력되면 다음 가이드라인에 따라 설정을 진행하세요:

1. 만약 `provider` 인자가 없다면 사용자에게 다음 중 하나를 선택하도록 지원하세요:
   - `claude` (기본, Haiku 사용)
   - `ollama` (로컬 Ollama 서버)
   - `custom` (OpenAI/Google Gemini 호환 엔드포인트)

2. 만약 사용자가 `custom`을 선택한 경우:
   - 엔드포인트 URL (예: https://generativelanguage.googleapis.com)을 물어보세요.
   - API 키를 물어보세요.
   - 사용자가 모델 이름을 지정할 수 있도록 모델 목록(예: gemma-3-27b-it)을 보여주거나 직접 입력받으세요.

3. 설정을 `~/.claude/claude-trans.json` 파일의 `backend`, `custom_endpoint`, `custom_model` 필드에 각각 업데이트합니다.
4. 민감한 API 키 정보는 `~/.claude/claude-trans-auth.json`의 `custom_apiKey` 필드에 안전하게 저장합니다.
5. 설정이 완료되면 "번역 제공자가 [provider](으)로 변경되었습니다."라고 응답하세요.
