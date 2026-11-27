# 공통 규칙 상세 절차
Use when: any ddalggak command needs shared safety, GitHub, Markdown, review-boundary, or validation rules not duplicated in SKILL.md.
Required by: all ddalggak commands.
Side effects: none.
Do not use when: the task is outside ddalggak workflow execution and does not need ddalggak shared rules.

> Shared Claude Code/Hermes details. Router/invariants stay in SKILL.md.

## 공통 규칙

Response language: follow SKILL.md.

Preserve Markdown frontmatter/routing/code permissions/fences/headings/numbering. No unproven dependencies or ignored/local-only/repo-external PR files.

Use active voice only for known actors; never turn explanations into commands. Do not mechanically apply English grammar, dictionaries or word limits to Korean.

## Approval comment와 formal approval 경계

`review` publishes only authorized verified inline findings on requested PR, no formal approval/top-level verdict. Head SHA/source version, scope, evidence, blocking count and conclusion stay in chat.

기존 top-level comment는 GitHub의 formal review approval이 아니다. 최종 상태 보고와 PR body evidence에서는 `CI/check 상태`, `reviewDecision`, `mergeStateStatus`, branch protection, manual merge boundary를 분리한다. CI success와 top-level APPROVE comment만으로 "merge 가능"을 암시하지 않는다.
