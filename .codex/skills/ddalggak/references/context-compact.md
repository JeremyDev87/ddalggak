# Context Compaction Points
Use when: ddalggak must preserve resume state before compaction or a long wait.
Required by: plan, start, review, ship, status across compaction/wait boundaries.
Side effects: may write ignored local session/conductor state.
Do not use when: the command can finish now with no resume state.

Before compacting or entering a long wait, write recoverable state to the ignored session/conductor state file.

Record phase, issue/PR, branch, worktree, changed files, validation evidence, blocking gaps, waiting-on state, and exact next command. After resume, re-read live git and GitHub state before acting.
