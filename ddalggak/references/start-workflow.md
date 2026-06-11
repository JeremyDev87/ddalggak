# Start Workflow 상세 절차
Use when: a `start` run needs full issue implementation detail beyond the hot path, including target resolution, task scope, worker brief, validation, and PR-ready evidence.
Required by: `start`; implementation gate families selected by Quality Lens Router.
Side effects: source-edit
Do not use when: the user asked only for `plan`, `status`, `check`, `prompt`, or another read-only subcommand.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Start Workflow

`start`는 이슈 기반 구현만 수행한다. 먼저 repo URL/issue URL을 해석하고 `git fetch --prune`, branch, ahead/behind, worktree 상태를 확인한다. issue body와 comments를 모두 읽고, Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate, Frontend Design Gate, React Code Quality Harness(React/Next.js 표면일 때만), Vercel Agent Skills Gate, Task Scope Contract를 brief에 넣는다. Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it. Issue-PR Strategy with Conflict Fallback, Parallelization Decision, Integration commit, PR CREATE — 독립 이슈는 기본 생성, small direct change first, aesthetic direction, screenshot/viewport/manual evidence, server/client boundary, token source without printing secrets, preview-first, references/regression-library.md, 유용한 범위, class-level risk를 필요한 만큼 명시한다.

## Issue Body → Worker Brief 필드 매핑

issue body(`templates/issue-body.md`, GitHub issue form id 기준)를 worker brief(`templates/worker-brief.md`)로 변환할 때 아래 표를 따른다. 표 밖의 임의 재해석은 금지한다.

| issue body 섹션 (form id) | worker brief 필드 | 누락 시 기본값 |
|---|---|---|
| 목적 / 문제 (`goal`) | Task → Goal, Expected outcome | required — 변환을 중단하고 conductor에 확인 |
| 원본 근거 / Source of Truth (`source_of_truth`) | Context Assembly Manifest → Issue body/comments, Required references | required — 변환을 중단하고 conductor에 확인 |
| 범위 / Non-Goals (`scope`) | Task → Goal의 범위 한정; Non-Goals는 Task Scope Contract → Forbidden files/actions | required — 변환을 중단하고 conductor에 확인 |
| 파일 소유권 / Must-not-touch (`owned_files`) | Task Scope Contract → Authorized files(변경 표), Forbidden files/actions(Must-not-touch) | `미지정 — conductor가 보강` 표기 |
| 완료 기준 / 검증 · Evidence (`validation`) | Task Scope Contract → Validation commands, Completion evidence; Evidence Contract → Required evidence | `미지정 — conductor가 보강` 표기 후 Evidence Contract → Blocking evidence gaps에 기록 |
| Blockers / Unknowns (`blockers`) | Context Assembly Manifest → Assumptions / known blockers | `미지정 — 없음으로 단정하지 않음` 표기 |

매핑 불가/누락 필드 규칙:
- required 필드(`goal`/`source_of_truth`/`scope`) 누락 시 start가 임의로 보완하지 않는다. 변환을 중단하고 conductor 또는 사용자에게 확인한다.
- optional 필드 누락 시 표의 기본값 문구를 worker brief 해당 필드에 그대로 표기한다. 빈칸·생략으로 두지 않는다(암묵적 "없음" 해석 차단).
- 표에 없는 worker brief 필드(Quality Lens Router Output, Evidence Contract의 나머지 항목, Completion Signal)는 issue body 입력이 아니라 start 자체 게이트 산출물이다.
- 비-form 섹션: issue body의 Wiki Context Manifest는 Context Assembly Manifest → Required references의 보조 입력이다. 병렬 실행 메모의 Owned files/Must not touch는 `owned_files` 표의 보조 신호이며, 충돌 시 `owned_files` 표가 우선한다.
