# Merge Cleanup 상세 절차
Use when: `clean` is requested after live GitHub evidence proves the relevant PR was merged.
Required by: `clean`; post-manual-merge local cleanup.
Side effects: local-destructive — deletes merge-verified local branches/worktrees; no repo source or GitHub mutation
Do not use when: merge evidence is missing, the target branch/PR is ambiguous, or local worktrees are dirty.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Merge Cleanup

`clean`은 PR merge evidence를 live GitHub에서 확인한 뒤 local branch/worktree/session-state cleanup만 수행한다. dirty state면 중단한다.

mode는 `local-destructive`다: repo 소스와 GitHub은 변경하지 않지만, merge 검증을 통과한 로컬 git 상태(브랜치/worktree)를 삭제한다. read-only가 아니다.
