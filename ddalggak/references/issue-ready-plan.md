# Issue-Ready Plan 상세 절차
Use when: `plan` must turn an issue/user request into an implementation-ready plan grounded in issue comments, wiki context, repo files, and validation evidence.
Required by: `plan`; pre-implementation readiness planning.
Side effects: none
Do not use when: the workflow already has an approved plan and is executing `start`, or the request is only issue creation/triage.


> Source of truth for Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Issue-Ready Plan

`plan`은 구현 가능한 계획만 만든다. 포함: Source of Truth, Non-Goals, Context Recovery Anchors, Assumptions/Unknowns, Work Inventory, Forbidden files, Inspect-only files, Issue-PR Strategy with Conflict Fallback, PR count: one PR per issue by default, Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it, Parallelization Decision, Must not touch, Evidence / validation, Commit message, Quality Lens Router Output, React Code Quality Harness(React/Next.js 표면일 때만), Evidence Contract, Counterargument Pass, Simplicity / Deletability Gate, why is this abstraction necessary?, Frontend Design Brief, Vercel Agent Skills Gate, Applicable upstream skill families, React/Next.js performance risks, Explicit anti-goals, Backend-only skip/lightweight reason, references/regression-library.md, 유용한 범위, Regression Library Candidate.


## Wiki Context Preflight

Before writing the plan, run `references/wiki-context-preflight.md`.

The plan must include the canonical Wiki Context Manifest from
`references/wiki-context-preflight.md`; do not duplicate a shorter local field
set here.

Use wiki-derived constraints to shape the plan before Quality Lens Router Output, React Code Quality Harness(React/Next.js 표면일 때만), Evidence Contract, and Counterargument Pass. If no relevant wiki source is found, state that explicitly and continue from the issue/repo evidence.
