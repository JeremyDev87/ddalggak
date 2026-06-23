# Issue-Ready Plan Reference
Use when: `plan` must turn an issue/user request into an implementation-ready plan grounded in issue comments, wiki context, repo files, and validation evidence.
Required by: `plan`; pre-implementation readiness planning.
Side effects: none
Do not use when: the workflow already has an approved plan and is executing `start`, or the request is only issue creation/triage.


Use this when `plan` needs full planning detail beyond the hot path.

## Required output
- Goal, Source of Truth, Non-Goals / Constraints, Context Recovery Anchors, Assumptions And Unknowns.
- Quality Lens Router Output and React Code Quality Harness when React/Next.js code-quality surfaces are in scope.
- Evidence Contract with blocking evidence gaps.
- Counterargument Pass.
- Simplicity / Deletability Gate including the question: why is this abstraction necessary?
- Frontend Design Brief and Vercel Agent Skills Gate only when applicable.
- Work Inventory And File Ownership.
- Implementation Units.
- Conflict Matrix.
- Issue-PR Strategy with Conflict Fallback including PR count: one PR per issue by default; Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it; Parallelization Decision; Must not touch; Evidence / validation; Commit message.
- Plan-to-Issues Readiness.

## Gajae-Code-inspired readiness gate

Before emitting `PLAN_DONE`, include a compact readiness block inspired by Gajae-Code `deep-interview`:

- `Readiness`: exactly one of `READY`, `NEEDS_QUESTION`, or `BLOCKED`.
- `Clarity dimensions`: scope, source authority, file ownership, validation path, side-effect authority, PR topology.
- `Weakest dimension`: name the single weakest dimension and one sentence of evidence.
- `Blocking question`: required only for `NEEDS_QUESTION`; ask the smallest user question that would unlock the plan.
- `Blocker`: required only for `BLOCKED`; name the external/system blocker and the safe stop condition.

Do not silently fill gaps with plausible assumptions. If the plan would require source edits, GitHub writes, deploys, releases, credential use, or cross-profile mutation beyond the current command contract, mark `NEEDS_QUESTION` or `BLOCKED` instead of widening scope.

## Ralplan-style critic consensus

After the first implementation strategy, run a lightweight critic pass before finalizing:

1. `Planner view` — smallest deployable units and expected validation evidence.
2. `Architect view` — coupling, ownership boundaries, migration/rollback risk.
3. `Critic view` — simplest deletion/subtraction alternative, missing evidence, and most likely failure mode.

The final plan must include `Consensus decision` with either `ACCEPT`, `NARROW`, or `REWORK`, plus the one change made after the critic pass. If no change was needed, state the evidence-backed reason.


## Wiki Context Preflight

Before writing the plan, run `references/wiki-context-preflight.md`.

The plan must include the canonical Wiki Context Manifest from
`references/wiki-context-preflight.md`; do not duplicate a shorter local field
set here.

Use wiki-derived constraints to shape the plan before Quality Lens Router Output, Evidence Contract, and Counterargument Pass. If no relevant wiki source is found, state that explicitly and continue from the issue/repo evidence.
