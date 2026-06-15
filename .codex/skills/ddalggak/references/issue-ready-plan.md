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


## Wiki Context Preflight

Before writing the plan, run `references/wiki-context-preflight.md`.

The plan must include the canonical Wiki Context Manifest from
`references/wiki-context-preflight.md`; do not duplicate a shorter local field
set here.

Use wiki-derived constraints to shape the plan before Quality Lens Router Output, Evidence Contract, and Counterargument Pass. If no relevant wiki source is found, state that explicitly and continue from the issue/repo evidence.
