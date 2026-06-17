# Prompt Optimizer 상세 절차
Use when: a `prompt` run audits a draft instruction and compiles it into a safer brief/review/fix artifact with an explicit judgement label.
Required by: `prompt`; the Prompt Safety / Brief Compiler and `prompt grill-me` flows.
Side effects: none
Do not use when: the request is to change skill behavior or canonical skill/reference files; those follow the normal issue/branch/PR/review path.

> Source of truth for Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Prompt Optimizer

`prompt`는 brief/review/fix artifact만 개선한다. skill behavior 변경은 normal repo edit으로 분리한다.
`prompt`는 실행 전 작업 지시를 더 안전한 brief로 컴파일하는 **Prompt Safety / Brief Compiler** 역할까지 포함하지만, 소스 코드나 canonical skill/reference를 직접 수정할 권한은 갖지 않는다. canonical skill/reference 변경은 별도 issue/branch/PR/review 경로로만 수행한다.

## Prompt Safety / Brief Compiler

`prompt`의 목표는 사용자가 준 초안을 그대로 실행하지 않고, 작업 전에 다음을 분리해 안전한 실행 brief로 만드는 것이다.

- 실행 목표와 non-goal
- source of truth와 evidence gap
- scope boundary와 tool authority boundary
- validation path와 stop condition
- 질문이 필요한 부분과 바로 진행 가능한 부분
- 위험 신호와 fail-closed 판단

출력은 brief/review/fix artifact여야 하며, 마지막에는 `PROMPT_DONE` 완료 신호를 포함한다.

## Prompt Audit

`prompt`는 먼저 입력 초안을 아래 항목으로 진단한다.

| 항목            | 확인할 질문                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Goal clarity    | 단일 목표가 명확한가? 여러 목표가 섞였으면 분리했는가?                                         |
| Source of truth | issue/comment/wiki/file/사용자 발화 중 무엇이 기준인지 명시됐는가?                             |
| Scope boundary  | allowed / forbidden / inspect-only / must-not-touch가 구분됐는가?                              |
| Validation path | 완료를 증명할 명령, 리뷰, 수동 확인, evidence artifact가 있는가?                               |
| Question need   | 누락 정보를 추측하지 않고 질문하거나 discovery-only로 낮췄는가?                                |
| Risk level      | GitHub mutation, secrets, auth, release, deploy, data mutation, source edit 위험을 표시했는가? |

Audit 결과는 다음 judgement label 중 하나로 끝낸다.

- `READY_FOR_BRIEF`: 실행 brief로 컴파일해도 안전하다.
- `NEEDS_CLARIFICATION`: 질문 답변 없이는 실행 brief로 만들면 안 된다.
- `BLOCKED_UNSAFE`: 현재 프롬프트는 위험하거나 권한 범위를 넘어서 실행을 막아야 한다.
- `DISCOVERY_ONLY`: 구현/수정 대신 read-only 조사 brief로 낮춰야 한다.

## `prompt grill-me`

`prompt grill-me`는 질문 먼저 모드다. 사용자가 작업 초안을 던졌지만 실행 전 구멍이 크면 바로 구현 brief를 만들지 말고 3~7개의 질문을 낸다.

질문 규칙:

1. 이미 제공된 정보를 다시 묻지 않는다.
2. 질문은 답변 후 바로 brief field로 들어갈 수 있어야 한다.
3. 질문은 scope, source of truth, validation, authority, rollback/stop condition을 우선한다.
4. 질문이 너무 많아지면 필수 질문과 optional hardening 질문을 분리한다.
5. 질문 답변 전에는 `READY_FOR_BRIEF`를 내지 않는다.

권장 출력 형태:

```markdown
## Prompt Audit

- Goal clarity: ...
- Source of truth: ...
- Scope boundary: ...
- Validation path: ...
- Question need: ...
- Risk level: ...

## Grill-me questions

1. ...
2. ...
3. ...

Judgement: NEEDS_CLARIFICATION
PROMPT_DONE
```

## Unsafe Prompt Gate

다음 신호가 있으면 프롬프트를 그대로 실행 brief로 승격하지 않는다.

- scope가 “전부 고쳐”, “알아서 해”, “관련된 거 다”처럼 무제한이다.
- issue/PR/CI/외부 사실을 live verification 없이 채우라고 한다.
- secret, token, private session/log, credential 값을 출력하거나 저장하려 한다.
- GitHub issue/PR 생성, push, release, deploy, DB mutation 같은 side effect가 있는데 승인 범위가 불명확하다.
- `prompt` subcommand가 source edit, skill edit, canonical reference edit을 직접 수행하려 한다.
- validation path가 없는데 완료/성공/APPROVE를 요구한다.
- 사용자 correction을 새 정책처럼 오해하거나, 폐기해야 할 잘못된 주장을 재사용하려 한다.

Gate 처리:

- 안전한 read-only 조사로 낮출 수 있으면 `DISCOVERY_ONLY`.
- 질문으로 풀 수 있으면 `NEEDS_CLARIFICATION`.
- 권한 밖이거나 위험하면 `BLOCKED_UNSAFE`.
- 안전 조건과 검증 경로가 모두 닫혔을 때만 `READY_FOR_BRIEF`.

## Integrated flow

1. 입력 초안을 있는 그대로 복사하지 말고 Prompt Audit을 수행한다.
2. source of truth와 scope boundary를 명시한다.
3. 필요한 경우 `prompt grill-me` 질문을 먼저 낸다.
4. 위험 신호가 있으면 Unsafe Prompt Gate로 fail-closed한다.
5. 통과한 경우에만 실행 가능한 brief/review/fix artifact로 컴파일한다.
6. 출력 끝에 judgement label과 `PROMPT_DONE`을 포함한다.
