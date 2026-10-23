# 공통 규칙 상세 절차
Use when: any ddalggak command needs shared safety, GitHub, Markdown, review-boundary, or validation rules not duplicated in SKILL.md.
Required by: all ddalggak commands.
Side effects: none.
Do not use when: the task is outside ddalggak workflow execution and does not need ddalggak shared rules.

> Source of truth for shared Claude Code and Hermes Agent ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## 공통 규칙

Markdown surgery discipline: frontmatter, routing, code permission, fenced block, heading, numbering을 보존한다. 새 dependency는 증명 전 금지. ignored/local-only/repo-external 파일은 PR에 넣지 않는다.

## Approval comment와 formal approval 경계

`review`는 formal approval이나 top-level verdict를 게시하지 않는다. 요청된 PR의 검증된 inline finding만 권한 범위에서 게시하고, current head SHA 또는 원문 버전, review scope, validation evidence, blocking finding count와 conclusion은 채팅에 남긴다.

기존 top-level comment는 GitHub의 formal review approval이 아니다. 최종 상태 보고와 PR body evidence에서는 `CI/check 상태`, `reviewDecision`, `mergeStateStatus`, branch protection, manual merge boundary를 분리한다. CI success와 top-level APPROVE comment만으로 "merge 가능"을 암시하지 않는다.
