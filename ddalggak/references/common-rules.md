# 공통 규칙 상세 절차

> Source of truth for Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## 공통 규칙

Markdown surgery discipline: frontmatter, routing, code permission, fenced block, heading, numbering을 보존한다. 새 dependency는 증명 전 금지. ignored/local-only/repo-external 파일은 PR에 넣지 않는다.

## Approval comment와 formal approval 경계

Formal approval이 부적절하거나 불가능한 자동화 리뷰에서는 top-level PR comment로 `Hermes Independent Review — APPROVE conclusion` 또는 `CHANGES_REQUESTED` 결론을 남길 수 있다. 이 comment에는 current head SHA, review scope, validation evidence, blocking finding count, conclusion을 포함해야 한다.

하지만 이 comment는 GitHub의 formal review approval이 아니다. 최종 상태 보고와 PR body evidence에서는 `CI/check 상태`, `reviewDecision`, `mergeStateStatus`, branch protection, manual merge boundary를 분리한다. CI success와 top-level APPROVE comment만으로 "merge 가능"을 암시하지 않는다.
