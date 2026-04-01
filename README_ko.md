# claude-trans (cts)

Claude Code를 위한 투명 번역 레이어 — 사용자는 모국어로 대화하고, Claude는 영어로 추론합니다.

[English](README.md)

## 동기

Claude Code는 영어로 사고하고 추론할 때 가장 강력하고 정확하게 동작합니다. 다른 언어(예: 한국어)로 대화하면 추론 능력 대신 번역 쪽에 컨텍스트(토큰)를 소비하게 되어 불필요한 토큰이 낭비되고 결과 품질도 현저히 떨어집니다.

**claude-trans**는 Claude Code의 내부 `global.fetch`를 API 통신 단계에서 패치하여 이 문제를 원천적으로 해결합니다:
사용자의 입력(프롬프트)은 API로 전송되기 직전 영어로 번역되고, API에서 반환된 영어 응답은 다시 사용자의 언어로 번역되어 화면에 표시됩니다. Claude Code는 내부적으로 100% 영어를 기반으로 동작하게 되므로, 훨씬 뛰어난 추론 성능을 보이며 토큰을 절약합니다.

## 설치

```bash
# 저장소 클론
git clone https://github.com/BoxBy/claude-ts.git
cd claude-ts

# npm을 통해 전역 설치 (심볼릭 링크)
npm link
```

*필수: [Node.js](https://nodejs.org/) (v18+) 및 [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)*

## 사용법

번역 레이어가 적용된 Claude Code를 띄우려면 `claude-trans` 또는 축약형 명령어인 `cts`를 실행하면 됩니다.

```bash
# 번역 기능이 활성화된 상태로 Claude Code 실행
cts

# 다른 언어로 변경하여 실행
cts --lang ja

# 로컬의 Ollama 모델을 활용해 번역
cts --ollama gemma3:4b
```

## 번역 백엔드

번역 작업을 처리할 다양한 백엔드를 자유롭게 선택할 수 있으며, Claude Code 내에서 언제든 슬래시 명령어로 교체할 수 있습니다.

| 백엔드 | 설명 | API 키 |
|--------|------|--------|
| `claude` (기본) | Claude API (Haiku) 사용 | 설정 불필요 (보유중인 세션 키 자동 활용) |
| `ollama` | 로컬 PC의 Ollama 네트워크 사용 | 불필요 |
| `custom` | OpenAI / 구글 Gemini 등을 지원하는 범용 엔드포인트 | 엔드포인트별 API KEY 등록 필요 |

Claude Code 안에서 다음 슬래시 명령어를 쓰면 번역 제공자를 교체할 수 있습니다:
```bash
/ts-provider    # 번역 제공자 변경 및 커스텀 API 키 등록
/ts-model       # 번역 모델명 변경
```

### Custom 엔드포인트 활용 (예: 구글 Gemini / OpenAI 등)
Google Gemini API, OpenAI 등 OpenAI-compatible 엔드포인트라면 무엇이든 커스텀으로 설정 가능합니다.

```bash
/ts-provider
```
입력된 URL은 똑똑하게 자동 교정됩니다:
- `https://` 프로토콜이 누락된 경우 자동 보완
- **Google Gemini**: 시스템 프롬프트(개발자 지시문)를 미지원하는 모델(`gemma-3-27b-it` 등)의 경우 400 에러를 뱉지 않도록 시스템 프롬프트를 자동으로 User 프롬프트 내부로 병합 전송
- **OpenAI 호환 포맷**: `/v1/chat/completions` 경로 자동 처리

## 슬래시 명령어
플러그인 설치 시 다음 슬래시 명령어들이 Claude Code 내에 자동으로 주입됩니다:

| 명령어 | 설명 |
|--------|------|
| `/ts-show` | 자세한 번역 디버깅 정보 확인 (원문 ↔ 번역문) |
| `/ts-hide` | 번역 정보 숨기기 모드 |
| `/ts-provider` | 번역을 수행할 제공자(Provider)와 API KEY 재설정 |
| `/ts-model` | 번역할 모델(Model) 지정 교체 |
| `/ts-lang` | 타겟 번역 언어 변경 |

## 상태 표시줄 (Statusline) 지원
claude-trans는 호환되는 Statusline 출력 시스템을 도입하여 화면 하단에서 어떤 번역 모델이 사용 중인지와 실시간 번역 프리뷰를 우아하게 제공합니다:

```
[ts] gemma-3-27b-it | ↳ 안녕하세요? → Hello? 
```
기존 터미널 UI 프레임워크와 충돌 없이 깔끔하게 표시됩니다.

## 라이선스
MIT
