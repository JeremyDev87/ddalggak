# Status 상세 절차
Use when: `status` or a scheduled report needs a read-only snapshot of git, worktrees, issues, PRs, checks, blockers, and next action.
Required by: `status`; scheduled conductor reporting.
Side effects: none
Do not use when: the user asked to implement, ship, review, or mutate GitHub state rather than inspect current state.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Status

`status`는 `.ddalggak/session-state.json`, git status, branch, upstream ahead/behind, worktree, open PR/issue 상태를 read-only로 보고한다.

## 상태 보고 분리 원칙

자동화 상태 보고는 CI 통과, 독립 리뷰 evidence, GitHub formal review, branch protection을 하나의 "merge 가능" 주장으로 합치지 않는다. 특히 top-level `Hermes Independent Review — APPROVE conclusion` comment는 current-head review evidence이지 GitHub formal approval 자체가 아니다.

보고서에는 최소한 다음 항목을 분리해 적는다.

- `자동화 판단`: 이번 tick/명령이 수행한 일, 의도적으로 멈춘 이유, Dobby/issue/PR 상태 전이.
- `CI/check 상태`: current head SHA 기준 terminal success/skipped, pending, failing, no-CI verified를 구분한다.
- `formal review/branch protection 상태`: GitHub `reviewDecision`, required review, `mergeStateStatus`, branch protection을 top-level approval comment와 별도로 적는다.
- `merge blocker`: pending/failing checks, required formal approval, conflicts, evidence gap, missing human decision, manual merge boundary를 구체적으로 나열한다.
- `human action`: 주인님이 해야 할 다음 행동이 있으면 명시하고, 없으면 수동 merge 대기/정보 대기 등 현재 경계를 말한다.
