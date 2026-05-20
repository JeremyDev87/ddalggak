# Context 관리 — Compact 실행 포인트

Long-running ddalggak sessions must preserve recoverable state before context compaction or long waits.

## Required state before compact
- Save current phase, issue/PR/branch/worktree, changed files, validation evidence, blocking gaps, waiting-on state, and exact next command in `templates/conductor-state.md` shape.
- Prefer ignored `.ddalggak/session-state.json` or `.ddalggak/conductor-state.md`; do not commit session state.
- Re-read live GitHub/local state after resume before mutating files, labels, PRs, or reviews.

## Compact points
- After issue analysis and lane/PR strategy are established.
- Before long CI/review waits that may exceed cache windows.
- Before review/fix iteration handoff or phase transition.
- After ship/review/retro completes and the next issue will start fresh.
