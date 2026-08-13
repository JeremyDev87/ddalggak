# Review Quality Contract v2
Use when: a `review` run must classify risk, connect issue intent to changed behavior, search for false passes, and produce actionable findings.
Required by: `review`
Side effects: none
Do not use when: only reporting CI/status or running the local read-only `check` command.

This contract makes AI review a measured sensor. The conductor owns the final verdict from live PR/repo evidence, current-head state, human authority, and applicable deterministic gates.

## Review Intake

Classify before line-by-line review. Intake is not approval.

- Risk tier: `low | medium | high | critical`.
- Tier evidence: blast radius, expected code lifetime, future owner count, and sensitive boundaries.
- Required inputs: purpose/non-goals, linked acceptance criteria, current head SHA, reviewable diff scope, execution evidence, and accountable human owner for High/Critical changes.
- Intake decision: `ready-for-review | needs-intent | needs-evidence | needs-split | blocked-human-owner`.

Use `needs-split` when mixed or oversized scope prevents reliable semantic tracing. Auth, money, PII, migrations, permissions, credentials, security boundaries, or on-call blast radius are Critical unless live evidence justifies a narrower tier. Author identity and whether AI wrote the code never lower the tier.

Only `ready-for-review` enters semantic review. Every other intake decision yields final verdict `blocked`; do not manufacture line findings to compensate for missing intake evidence.

## Semantic Coverage

Trace every acceptance criterion through the changed system. A filename list or green CI is not coverage.

| Field | Required evidence |
| --- | --- |
| Acceptance criterion | Exact issue/body/comment requirement or explicit non-goal |
| Changed surface | Changed symbol, schema, workflow, template, test, or configuration anchor |
| Caller/consumer impact | Direct caller, downstream consumer, generated artifact, or runtime boundary |
| Failure mode | Concrete counterexample if the implementation or test is wrong |
| Test/evidence | Test, static proof, manual evidence, or a named blocking gap |
| Coverage verdict | `covered | gap | not-applicable` with rationale |

An uncovered in-scope criterion or unexplained changed surface blocks `approve`. `not-applicable` requires live evidence; it is not an escape hatch.

## Counterexample Pass

Review test diffs before implementation diffs when assertions, fixtures, thresholds, skipped checks, or guards changed. Search for at least the riskiest false-pass scenario:

1. State the claim the change or guard is meant to enforce.
2. Construct the smallest semantic violation that should fail.
3. For guard/test/harness/generator changes, run it in a disposable copy or detached worktree; never leave the mutation in the source worktree.
4. Record the mutation/probe command, expected failure, actual result, and restoration proof.
5. If the violation still passes, emit a blocking finding even when CI is green.

For High/Critical reviews with zero findings, require a documented counterexample pass. Add one heterogeneous challenger only when blast radius is large and the first pass still has zero findings; repeated copies of the same reviewer are not independent evidence.

## Finding Contract

A quality-sensor finding must include all fields:

- `severity`: `critical | high | medium | low`;
- `claim`: the broken invariant or incorrect behavior;
- `anchor`: changed `path:line` or an explicit file-level anchor;
- `failing scenario`: reproducible inputs/state and observed wrong outcome;
- `impact`: affected user, data, security, compatibility, operation, or maintainer cost;
- `minimal fix`: smallest in-scope correction, not a broad redesign;
- `confidence`: `high | medium | low` with uncertainty stated;
- `counterevidence checked`: evidence that could have disproved the claim.

These fields are deterministic Review Quality sensor inputs, not the canonical finding admission or public renderer schema. Before aggregation or publication, the conductor must independently reproduce the observation and map it into the exact 21-field Admission schema v3 record in `references/cross-review-loop.md`; sensor acceptance grants no publication eligibility or write authority.

Missing fields, hypothetical concerns without a reproducible scenario, restated PR text, and style preferences without repo/product evidence do not pass the finding signal gate. Evidence gaps stay in the top-level gap list unless they map to a changed-line defect.

## Stable Verdict Vocabulary

The internal Review Quality sensor verdict is exactly one of:

- `approve`: intake ready, current head fresh, all in-scope semantic rows covered, deterministic checks terminal, no Critical/High blockers, and required human ownership present;
- `change request`: one or more actionable code findings require changes;
- `comment`: substantive review completed with non-blocking observations only, but formal approval is not being asserted;
- `blocked`: intent, evidence, scope, current-head, checks, human ownership, or publication authority prevents a reliable verdict.

Within `review.final_verdict`, do not substitute `APPROVE`, `CHANGES_REQUESTED`, `LGTM`, or model-specific labels. This restriction does not redefine the separate v3 lifecycle outcome, deterministic public renderer, `REVIEW_DONE` completion marker, or GitHub formal-review conclusion. A GitHub request-changes state is not a proven merge blocker unless live branch protection says so.

Persist this four-value result in session state as `review.final_verdict`. Keep `review.latest_conclusion` as the separate GitHub formal-review axis (`none | pending | approve | changes_requested`); never treat the API conclusion as the Review v2 verdict or vice versa.

## Risk-Adaptive References

The base review path keeps this contract plus current-head, wiki, quality, evidence, and cross-review procedure. Load these extra references only when triggered:

- code-shape risk: `references/simplicity-deletability-gate.md`;
- scope or privacy risk: `references/core-invariants.md`;
- live human comments/threads: `references/human-review-feedback-loop.md`;
- current-head checks pending/failing: `references/ci-failure-triage-loop.md`;
- auth/money/PII/migration/permissions/credentials/security risk: `references/security-posture-gate.md`;
- repeated Medium/High failure pattern or a generalized regression class: `references/regression-library.md`.

Record triggered and skipped gates with reasons. Conditional loading must not weaken their stop conditions.

## Review Quality Evidence Boundary

Deterministic fixture scoring proves schema, fail-closed behavior, seeded-defect accounting, and clean-control accounting. It does not prove a model can discover defects. Actual reviewer quality requires a separately approved, same-fixture shadow comparison that holds model, reasoning, tools, task, and runtime revision constant. Do not lower quality thresholds or publish comments merely because a synthetic scorer passes.
