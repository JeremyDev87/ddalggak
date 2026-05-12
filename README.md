# ddalggak

[![npm version](https://img.shields.io/npm/v/@jeremyfellaz/ddalggak)](https://www.npmjs.com/package/@jeremyfellaz/ddalggak)
[![license](https://img.shields.io/npm/l/@jeremyfellaz/ddalggak)](./LICENSE)
[![npm downloads](https://img.shields.io/npm/dm/@jeremyfellaz/ddalggak)](https://www.npmjs.com/package/@jeremyfellaz/ddalggak)

딸깍(ddalggak)은 Claude Code를 위한 워크플로우 스킬입니다. GitHub Issue 기반으로 계획 수립, 병렬 구현, 교차 리뷰, 자가 회복 사이클을 한 번의 명령으로 실행합니다. AI 에이전트 협업 방법론을 표준화하여 반복 가능하고 검증 가능한 개발 워크플로우를 제공합니다.

## 설치

ddalggak은 두 가지 진입점으로 사용할 수 있습니다.

### Claude Code Plugin 채널

```bash
claude mcp add @jeremyfellaz/ddalggak
```

Claude Code 플러그인 채널이 package spec 등록을 지원하는 환경에서는 이 명령으로 ddalggak을 등록합니다. 사용 중인 `claude mcp add`가 `<name> <commandOrUrl>` 형식만 받거나 위 명령을 거부하면, 아래 npx 직접 설치 경로를 사용하세요.

### npx 직접 설치

```bash
npx @jeremyfellaz/ddalggak setup
```

`setup`은 skill payload를 `~/.claude/skills/ddalggak/`에 설치합니다. 다른 Claude 홈을 쓰는 환경에서는 `CLAUDE_HOME` 또는 `--target`으로 설치 루트를 지정할 수 있습니다.

```bash
CLAUDE_HOME=/path/to/.claude npx @jeremyfellaz/ddalggak setup
npx @jeremyfellaz/ddalggak setup --target /path/to/.claude
```

## 사용

기본 형식은 다음과 같습니다.

```bash
npx @jeremyfellaz/ddalggak <subcmd> [args]
```

자주 쓰는 예시는 다음과 같습니다.

```bash
npx @jeremyfellaz/ddalggak prompt "결제 재시도 로직"
npx @jeremyfellaz/ddalggak plan "이슈를 구현 가능한 PR 단위로 쪼개줘"
npx @jeremyfellaz/ddalggak start 17
npx @jeremyfellaz/ddalggak status
```

지원하는 서브커맨드는 `start`, `review`, `status`, `plan`, `issue`, `clean`, `ship`, `retro`, `prompt`, `check`입니다. 각 서브커맨드는 Claude Code로 전달할 `/ddalggak <subcmd>` 슬래시 명령을 구성합니다.

`claude` CLI가 PATH에 없거나 현재 터미널이 비대화형이면, 실제 실행 대신 Claude Code에 붙여 넣을 슬래시 명령 문자열을 출력합니다. 항상 문자열만 확인하고 싶으면 `--print`를 사용하세요.

```bash
npx @jeremyfellaz/ddalggak plan --print "로그인 플로우 개선"
# /ddalggak plan "로그인 플로우 개선"
```

## 옵션

서브커맨드 공통 옵션:

- `--print`: Claude Code에 전달할 `/ddalggak <subcmd> ...` 문자열만 출력합니다.
- `--show-doc`: 해당 서브커맨드의 SKILL.md 섹션을 출력합니다.

`setup` 옵션:

- `--dry-run`: 파일시스템을 변경하지 않고 설치 대상과 수행할 작업만 출력합니다.
- `--force`: 설치된 버전 비교를 건너뛰고 기존 설치를 덮어씁니다.
- `--no-backup`: 기존 설치를 백업하지 않고 제거한 뒤 복사합니다.
- `--target <path>`: 설치 루트를 지정합니다. `$CLAUDE_HOME`과 `~/.claude`보다 우선합니다.

설치 경로 우선순위는 `--target <path>` → `$CLAUDE_HOME` → `~/.claude`입니다.

## 플랫폼 지원

macOS와 Linux를 기본 지원 대상으로 봅니다. Windows는 Node.js와 `claude` CLI 실행 환경이 맞는 범위에서 best-effort로 지원합니다.

## 메인테이너

패키지 배포는 메인테이너만 수행합니다. 실제 배포가 필요한 경우 릴리스 상태를 확인한 뒤 아래 명령을 사용합니다.

```bash
npm publish --access public
```

## 기여

기여 방법은 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고해 주세요.
