# CI Failure Triage Loop
Use when: a PR check is pending/failing, a readiness report needs a failing-check next action, or `review` must decide whether a failing check authorizes source fixes, reruns, or a human-facing blocker.
Required by: `review` when current-head checks are not terminal green/skipped; status/readiness reports that include failed checks.
Side effects: source-edit
Do not use when: all current-head checks are terminal success/skipped, or the task only needs a content-light check summary without next-action authority.

## Rule

`pr-check-evidence-bundle.md` classifies check metadata; this loop decides action authority. Classification alone is never `approve` or ready evidence. Every action must name the current PR head SHA and use content-light check metadata unless safe log inspection is explicitly allowed.

## Failure class → action

| Class | Authority | Action |
| --- | --- | --- |
| `test-failure` | `review` fix authority only when live check evidence plus diff/issue evidence ties the failure to the PR | Apply the smallest in-scope fix, run focused validation + repo verifier, push, then re-read head/checks and re-review |
| `permission-auth-failure` | human/repo admin by default | Do not mask with source edits; report missing permission/secret/env/branch-protection evidence and block ready |
| `infra-failure` | rerun/report | At most one safe current-head rerun when allowed; otherwise report platform blocker with check URL/metadata |
| `unknown-failure` | evidence/report | Gather allowed metadata; never promote to code finding or approve without new evidence |
| pending/queued/in-progress | no completion authority | Wait boundedly or report pending names/head SHA; do not approve/ready |

## Rerun and fix boundaries

- Rerun only current-head checks/runs; repeated reruns require fresh human instruction or new conductor evidence.
- Do not rerun to hide deterministic test or permission failures.
- `review` may edit/push only for accepted in-scope code/test failures backed by check + diff/issue evidence.
- Permission, secret, environment, billing/spending-limit, runner, or branch-protection failures stay human/admin blockers unless the PR diff itself changed that config and live evidence proves causality.
- After any fix or rerun, prior verdicts are stale until metadata, diff/files, checks, and linked issue/comments are re-read.

## Completion rule

A PR can reach `approve` / ready only when every required current-head check is terminal success/skipped, or when a specific check is documented as not applicable with live repo evidence.
