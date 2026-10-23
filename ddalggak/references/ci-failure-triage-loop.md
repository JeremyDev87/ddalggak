# CI Failure Triage Loop
Use when: a PR check is pending/failing, a readiness report needs a failing-check next action, or `review` must decide how to classify a failing check and report a human-facing blocker.
Required by: `review` when current-head checks are not terminal green/skipped; status/readiness reports that include failed checks.
Side effects: none; read, classify, and report only.
Do not use when: all current-head checks are terminal success/skipped, or the task only needs a content-light check summary without next-action authority.

## Rule

`pr-check-evidence-bundle.md` classifies check metadata; this loop reports next actions without granting mutation authority. Classification alone is never `approve` or ready evidence. Every action must name the current PR head SHA and use content-light check metadata unless safe log inspection is explicitly allowed.

## Failure class → action

| Class | Authority | Action |
| --- | --- | --- |
| `test-failure` | read/classify/report | Verify check + diff/issue causality; report the smallest correction and required validation for separate implementation |
| `permission-auth-failure` | human/repo admin by default | Do not mask with source edits; report missing permission/secret/env/branch-protection evidence and block ready |
| `infra-failure` | report only | Report platform blocker and check URL/metadata; suggest a human rerun only if evidence supports it |
| `unknown-failure` | evidence/report | Gather allowed metadata; never promote to code finding or approve without new evidence |
| pending/queued/in-progress | no completion authority | Wait boundedly or report pending names/head SHA; do not approve/ready |

## Rerun and fix boundaries

- No classification authorizes source edits, commit/push, or CI rerun within `review`.
- Permission, secret, environment, billing/spending-limit, runner, and branch-protection failures stay human/admin blockers unless live evidence establishes PR causality; causality still grants no mutation authority.
- When the head/checks change externally, prior verdicts remain stale until metadata, diff/files, checks, and linked issue/comments are re-read.

## Completion rule

A PR can reach `approve` / ready only when every required current-head check is terminal success/skipped, or when a specific check is documented as not applicable with live repo evidence.
