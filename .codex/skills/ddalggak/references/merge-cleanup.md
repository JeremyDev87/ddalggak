# Merge Cleanup Reference
Use when: `clean` is requested after live GitHub evidence proves the relevant PR was merged.
Required by: `clean`; post-manual-merge local cleanup.
Side effects: none
Do not use when: merge evidence is missing, the target branch/PR is ambiguous, or local worktrees are dirty.


Use only after merge evidence is verified. Clean branches, worktrees, issue state, and temporary artifacts conservatively. Do not delete dirty or ambiguous worktrees.
