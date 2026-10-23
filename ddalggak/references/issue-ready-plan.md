# Issue-Ready Plan 상세 절차
Use when: `plan` must turn an issue/user request into an implementation-ready plan grounded in issue comments, wiki context, repo files, and validation evidence.
Required by: `plan`; pre-implementation readiness planning.
Side effects: none
Do not use when: the workflow already has an approved plan and is executing `start`, or the request is only issue creation/triage.


> Source of truth for shared Claude Code and Hermes Agent ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Issue-Ready Plan

`plan`은 구현 가능한 계획만 만든다. 포함: Source of Truth, Non-Goals, Context Recovery Anchors, Assumptions/Unknowns, Work Inventory, Forbidden files, Inspect-only files, Issue-PR Strategy with Conflict Fallback, PR count: one PR per issue by default, Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it, Parallelization Decision, Must not touch, Evidence / validation, Commit message, Quality Lens Router Output, React Code Quality Harness(React/Next.js 표면일 때만), Evidence Contract, Counterargument Pass, Simplicity / Deletability Gate, why is this abstraction necessary?, Frontend Design Brief, Vercel Agent Skills Gate, Applicable upstream skill families, React/Next.js performance risks, Explicit anti-goals, Backend-only skip/lightweight reason, references/regression-library.md, 유용한 범위, Regression Library Candidate.

## Gajae-Code-inspired readiness gate

Before emitting `PLAN_DONE`, add a compact readiness block inspired by Gajae-Code `deep-interview`:

- `Readiness`: exactly one of `READY`, `NEEDS_QUESTION`, or `BLOCKED`.
- `Clarity dimensions`: scope, source authority, file ownership, validation path, side-effect authority, PR topology.
- `Weakest dimension`: name the single weakest dimension and one sentence of evidence.
- `Blocking question`: required only for `NEEDS_QUESTION`; ask the smallest user question that would unlock the plan.
- `Blocker`: required only for `BLOCKED`; name the external/system blocker and the safe stop condition.

Do not silently fill gaps with plausible assumptions. If the plan would require source edits, GitHub writes, deploys, releases, credential use, or cross-profile mutation beyond the current command contract, mark `NEEDS_QUESTION` or `BLOCKED` instead of widening scope.

## Ralplan-style critic consensus

After the first implementation strategy, apply the shared criteria in `references/quality-lens-router.md` and obtain the actual independent critic result required by `references/ralplan-critic-consensus.md` before `PLAN_DONE`. Include its reviewed version, identity/result, parent reconciliation, `ACCEPT | NARROW | REWORK`, change or evidence-backed no-change reason, and residual dissent. Planner/architect/critic viewpoints written by the author do not establish independence. Keep planned validation separate from executed evidence.

## Wiki Context Preflight

Before writing the plan, run `references/wiki-context-preflight.md`.

The plan must contain the canonical Wiki Context Manifest from
`references/wiki-context-preflight.md`; do not duplicate a shorter local field
set here.

Use wiki-derived constraints to shape the plan before Quality Lens Router Output, React Code Quality Harness(React/Next.js 표면일 때만), Evidence Contract, and Counterargument Pass. If no relevant wiki source is found, state that explicitly and continue from the issue/repo evidence.
