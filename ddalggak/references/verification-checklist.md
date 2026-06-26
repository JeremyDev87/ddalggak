# Verification Checklist 상세 절차
Use when: ddalggak needs a final or pre-ship validation checklist for base freshness, issue evidence, file scope, side effects, and test proof.
Required by: ship, review, status; plan/start before declaring readiness when validation scope is non-trivial.
Side effects: none.
Do not use when: the command is an early discovery-only no-op with no validation or readiness claim.

> Source of truth for Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Verification Checklist

- Base freshness, branch, ahead/behind 확인.
- issue body/comments 확인.
- allowed/forbidden/inspect-only/Must not touch 파일 명시.
- Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate 적용/스킵 사유 기록.
- validation evidence와 PR URL/evidence 확인.
- Critical/High 리뷰 finding 0개.
- Markdown frontmatter, headings, routing, code permissions, fenced blocks 유지.
