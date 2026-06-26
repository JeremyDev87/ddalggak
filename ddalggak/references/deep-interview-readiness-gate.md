# Deep-Interview Readiness Gate
Use when: plan/start must turn an issue or user request into implementation scope.
Required by: plan, start
Side effects: none
Do not use when: the command is status/check/clean or an already-approved execution brief has no blocking unknowns.

Before implementation or `PLAN_DONE`, inventory ambiguity instead of guessing.

## plan

Before `PLAN_DONE`, include the `Deep-Interview Readiness` block below.

## start

Re-check live evidence. If not `READY`, do not mutate; ask the smallest unlocking question or report the blocker.

## review

Not required as standalone `review`; cite only to audit unresolved readiness gaps.

Required output block:

```md
## Deep-Interview Readiness
- Readiness Verdict: READY | NEEDS_INTERVIEW | BLOCKED
- Answered by Source: <issue/wiki/code/comment evidence>
- Needs Human Answer: <smallest questions, or none>
- Assumptions Allowed: <bounded assumptions with evidence, or none>
- Blocking Unknowns: <unknowns that stop mutation, or none>
- Weakest Dimension: scope | source authority | file ownership | validation path | side-effect authority | PR topology
```

Verdict rules:

- `READY`: source authority, scope, file ownership, validation path, side-effect authority, and PR topology are all evidence-backed.
- `NEEDS_INTERVIEW`: a small user answer would safely unlock the plan or lane; ask that question and do not widen scope.
- `BLOCKED`: an external/system/source gap prevents safe planning or mutation.

If source edits, GitHub writes, deploys, releases, credential use, or cross-profile mutation would exceed the current command contract, use `NEEDS_INTERVIEW` or `BLOCKED` instead of assuming approval.