# Wake / Resume Protocol
Use when: a ddalggak task resumes after sleep, compaction, another session, or a long wait.
Required by: plan, start, review, ship, status after any resume boundary.
Side effects: may read ignored session/conductor state and live git/GitHub state.
Do not use when: the task has not crossed a resume/compaction/wait boundary.

Resume from durable state plus live facts, not stale conversation context.

1. Read the ignored session/conductor state file.
2. Run `git fetch --prune`; inspect branch, upstream, dirty files, and worktrees.
3. Re-read live GitHub issue/PR/check/review state.
4. Treat old validation/review evidence as stale if the head SHA changed.
5. Continue only from the verified next gate, otherwise stop and report the blocker.
