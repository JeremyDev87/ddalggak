# Issue-Ready Plan 상세 절차

> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Issue-Ready Plan

`plan`은 구현 가능한 계획만 만든다. 포함: Source of Truth, Non-Goals, Context Recovery Anchors, Assumptions/Unknowns, Work Inventory, Forbidden files, Inspect-only files, Issue-PR Strategy with Conflict Fallback, PR count: one PR per issue by default, Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it, Parallelization Decision, Must not touch, Evidence / validation, Commit message, Quality Lens Router Output, Evidence Contract, Counterargument Pass, Simplicity / Deletability Gate, why is this abstraction necessary?, Frontend Design Brief, Vercel Agent Skills Gate, Applicable upstream skill families, React/Next.js performance risks, Explicit anti-goals, Backend-only skip/lightweight reason, references/regression-library.md, 유용한 범위, Regression Library Candidate.


## Wiki Context Preflight

Before writing the plan, run `references/wiki-context-preflight.md`.

The plan must include:

```markdown
### Wiki Context Manifest
- Queries attempted:
- Wiki sources read:
- Relevant wiki facts:
- Constraints / prior decisions:
- Unknowns not found in wiki:
- Non-wiki inference:
```

Use wiki-derived constraints to shape the plan before Quality Lens Router Output, Evidence Contract, and Counterargument Pass. If no relevant wiki source is found, state that explicitly and continue from the issue/repo evidence.
