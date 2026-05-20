# Context Compaction Points

Before compacting or entering a long wait, write recoverable state to the ignored session/conductor state file.

Record phase, issue/PR, branch, worktree, changed files, validation evidence, blocking gaps, waiting-on state, and exact next command. After resume, re-read live git and GitHub state before acting.
