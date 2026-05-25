# Merge Cleanup 상세 절차
Use when: `clean` is requested after live GitHub evidence proves the relevant PR was merged.
Required by: `clean`; post-manual-merge local cleanup.
Side effects: none
Do not use when: merge evidence is missing, the target branch/PR is ambiguous, or local worktrees are dirty.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Merge Cleanup

`clean`은 PR merge evidence를 live GitHub에서 확인한 뒤 local branch/worktree/session-state cleanup만 수행한다. dirty state면 중단한다.
