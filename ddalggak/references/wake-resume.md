# Wake/Resume 프로토콜
Use when: a ddalggak task resumes after sleep, compaction, another session, or a long wait.
Required by: plan, start, review, ship, status after any resume boundary.
Side effects: may read ignored session/conductor state and live git/GitHub state.
Do not use when: the task has not crossed a resume/compaction/wait boundary.

Resume must rebuild context from durable state plus live repository facts, not from stale conversation memory.

## Steps
1. Read `.ddalggak/session-state.json` or `.ddalggak/conductor-state.md` when present.
2. Run `git fetch --prune`, inspect branch, upstream ahead/behind, dirty files, and worktrees.
3. Re-read live GitHub issue/PR/check/review state for the recorded issue or PR.
4. Compare live head SHA and branch names with the saved state. If they differ, treat old validation and review evidence as stale.
5. Continue only from the saved next gate after validating prerequisites; otherwise report the blocker and stop.

## Invariants
- URL beats cwd.
- No approval/ready transition from stale head SHA evidence.
- No source edits from non-writing subcommands during resume.
