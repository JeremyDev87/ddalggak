# Status Reference
Use when: `status` or a scheduled report needs a read-only snapshot of git, worktrees, issues, PRs, checks, blockers, and next action.
Required by: `status`; scheduled conductor reporting.
Side effects: none
Do not use when: the user asked to implement, ship, review, or mutate GitHub state rather than inspect current state.


Read-only state snapshot: fetch, status, worktrees, open PRs, issue linkage, CI/check state, lane/session state, blockers, and next action.

## Status report separation

Do not collapse CI success, independent review evidence, GitHub formal review, and branch protection into one "mergeable" claim. A top-level `Hermes Independent Review — APPROVE conclusion` comment is current-head review evidence, not GitHub formal approval.

Every automation/status report should separate:

- `자동화 판단`: what the automation did or intentionally did not do, including Dobby/issue/PR state transitions.
- `CI/check 상태`: current-head success/skipped, pending, failing, or verified no-CI state.
- `formal review/branch protection 상태`: GitHub `reviewDecision`, required review, `mergeStateStatus`, and branch protection, separate from top-level approval comments.
- `merge blocker`: pending/failing checks, required formal approval, conflicts, evidence gaps, missing human decisions, or manual merge boundary.
- `human action`: the exact next human action, if any.
