# Local Diff Check 상세 절차
Use when: `check` needs a read-only local diff review without GitHub comments, branch creation, source edits, or PR state changes.
Required by: `check`; local pre-commit/pre-ship inspection.
Side effects: none
Do not use when: the task requires GitHub PR review comments, implementation fixes, or shipping changes.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Local Diff Check

`check`는 read-only diff review다. base freshness, git status, diff stat/diff, ignored/local-only/generated/repo-external path, findings만 보고한다.
