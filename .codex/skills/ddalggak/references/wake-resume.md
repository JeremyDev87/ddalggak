# Wake / Resume Protocol

Resume from durable state plus live facts, not stale conversation context.

1. Read the ignored session/conductor state file.
2. Run `git fetch --prune`; inspect branch, upstream, dirty files, and worktrees.
3. Re-read live GitHub issue/PR/check/review state.
4. Treat old validation/review evidence as stale if the head SHA changed.
5. Continue only from the verified next gate, otherwise stop and report the blocker.
