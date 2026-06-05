# Start Workflow 상세 절차
Use when: a `start` run needs full issue implementation detail beyond the hot path, including target resolution, task scope, worker brief, validation, and PR-ready evidence.
Required by: `start`; implementation gate families selected by Quality Lens Router.
Side effects: source-edit
Do not use when: the user asked only for `plan`, `status`, `check`, `prompt`, or another read-only subcommand.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Start Workflow

`start`는 이슈 기반 구현만 수행한다. 먼저 repo URL/issue URL을 해석하고 `git fetch --prune`, branch, ahead/behind, worktree 상태를 확인한다. issue body와 comments를 모두 읽고, Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate, Frontend Design Gate, React Code Quality Harness(React/Next.js 표면일 때만), Vercel Agent Skills Gate, Task Scope Contract를 brief에 넣는다. Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it. Issue-PR Strategy with Conflict Fallback, Parallelization Decision, Integration commit, PR CREATE — 독립 이슈는 기본 생성, small direct change first, aesthetic direction, screenshot/viewport/manual evidence, server/client boundary, token source without printing secrets, preview-first, references/regression-library.md, 유용한 범위, class-level risk를 필요한 만큼 명시한다.
