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

**`claude`의 모든 CLI 플래그와 인자가 그대로 전달**되므로, `cts`는 `claude`의 완전한 대체제로 사용할 수 있습니다:

```bash
# 번역 기능이 활성화된 상태로 Claude Code 실행
cts

# 특정 모델 지정
cts --model sonnet

# 출력 모드 (비대화형)
cts -p "이 함수를 설명해줘"

# 권한 승인 생략 (위험 모드)
cts --dangerously-skip-permissions

# 이전 대화 이어서
cts --continue

# claude의 다른 플래그도 그대로 사용 가능
cts --allowedTools "Edit,Write,Bash" --model opus
```

### 설정

번역 관련 설정은 Claude Code 내에서 슬래시 명령어로 대화형으로 변경합니다:

```bash
/ts-lang         # 타겟 번역 언어 변경 (ko, ja, zh, ...)
/ts-provider     # 번역 제공자 변경 및 API 키 등록
/ts-model        # 번역 모델 변경
```

## 번역 백엔드

| 백엔드 | 설명 | API 키 |
|--------|------|--------|
| `claude` (기본) | Claude API (Haiku) 사용 | 설정 불필요 (세션 키 자동 활용) |
| `ollama` | 로컬 PC의 Ollama 사용 | 불필요 |
| `custom` | OpenAI / 구글 Gemini 등 OpenAI 호환 엔드포인트 | 엔드포인트별 API KEY 필요 |

### Custom 엔드포인트 활용 (예: 구글 Gemini / OpenAI)

Claude Code 안에서 `/ts-provider`를 실행하여 설정합니다. 입력된 URL은 자동으로 교정됩니다:

- `https://` 프로토콜이 누락된 경우 자동 보완
- **Google Gemini**: 시스템 프롬프트를 지원하지 않는 모델(`gemma-3-27b-it` 등)의 경우 시스템 프롬프트를 User 프롬프트로 자동 병합하여 400 에러 방지
- **OpenAI 호환**: `/v1/chat/completions` 경로 자동 처리

## 슬래시 명령어

세션 시작 시 다음 명령어들이 Claude Code에 자동으로 설치됩니다:

| 명령어 | 설명 |
|--------|------|
| `/ts-show` | 자세한 번역 디버깅 정보 확인 (원문 ↔ 번역문) |
| `/ts-hide` | 번역 정보 숨기기 모드 |
| `/ts-provider` | 번역 제공자(Provider)와 API KEY 재설정 |
| `/ts-model` | 번역할 모델(Model) 지정 교체 |
| `/ts-lang` | 타겟 번역 언어 변경 |
| `/ts-thinking` | 확장 사고(Extended Thinking) 번역 토글 (`on`/`off`, 기본값: `off`) |
| `/ts-color` | 상태 표시줄 색상 테마 변경 |

## 상태 표시줄 (Statusline) 지원

claude-trans는 Claude Code의 기본 상태 표시줄에 후킹하여 실시간 번역 프리뷰를 표시합니다. 기존에 사용 중이던 상태 표시줄(예: OMC)은 자동으로 백업되어 아래에 함께 표시됩니다.

```
[ts] gemma-3-27b-it 안녕하세요? → Hello?
↳ The function calculates → 이 함수는 계산합니다
```

상태 표시줄에 표시되는 정보:
- **태그 & 모델**: `[ts]` 뒤에 현재 사용 중인 번역 모델명
- **입력 라인**: 사용자가 입력한 원문 → Claude에게 전달되는 영어 번역
- **출력 라인** (`↳`): Claude의 영어 응답 → 사용자 언어로 재번역된 결과

사용자 입력은 노란색, Claude 응답은 시안색, 화살표는 흐리게 표시되며, 긴 텍스트는 자동으로 축약됩니다. 색상 테마는 `/ts-color`로 변경할 수 있습니다.

## 종료 시 자동 정리

`cts`를 정상적으로 종료하면, 세션 중에 주입된 모든 아티팩트가 자동으로 정리됩니다:

- **상태 표시줄 브릿지 스크립트** — `~/.claude/`에서 삭제
- **원래 상태 표시줄 설정** — 백업에서 복원
- **슬래시 명령어** (`ts-*.md`) — `~/.claude/commands/`에서 삭제
- **상태 파일** — `~/.claude/`에서 삭제

어떤 잔여물도 남지 않으며, Claude Code 환경이 원래 상태로 복원됩니다.

## 라이선스

MIT
