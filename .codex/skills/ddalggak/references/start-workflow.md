# Start Workflow Reference
Use when: a `start` run needs full issue implementation detail beyond the hot path, including target resolution, task scope, worker brief, validation, and PR-ready evidence.
Required by: `start`; implementation gate families selected by Quality Lens Router.
Side effects: source-edit
Do not use when: the user asked only for `plan`, `status`, `check`, `prompt`, or another read-only subcommand.


Use this when `start` needs full issue implementation detail beyond the hot path.

## Required flow
1. Resolve any GitHub URL target before trusting cwd.
2. Run base freshness checks: `git fetch --prune`, status, branch, upstream ahead/behind, and worktree list.
3. Read issue body and comments together. Latest explicit human comment can refine or override body scope.
4. Build Issue-PR Strategy with Conflict Fallback. Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it.
5. For each lane, write a task scope contract: Goal, Authorized files, Forbidden files/actions, Allowed side effects, Escalation-required actions, Validation commands, Completion evidence.
6. Use isolated worktrees. Independent issue lanes must create their own issue PR; hard-conflict fallback lanes hand off patch/commit evidence to one fallback PR.
7. Completion is not test pass. Require commit, push, PR URL/evidence, validation evidence, and review gate state.

## Required gates
- Quality Lens Router Output
- Evidence Contract
- Simplicity / Deletability Gate with small direct change first
- Frontend Design Gate only for UI/frontend work
- Vercel Agent Skills Gate only for React/Vercel/mobile/motion work
- Continuous Regression Library only for known/repeated Medium/High risks
