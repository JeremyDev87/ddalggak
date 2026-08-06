# Conductor State Template

<!--
schema: core/state/session-state.schema.json (ddalggak-session-state/v1)
This template is a markdown projection of the session-state schema; the JSON
schema is the single source of truth. Section -> schema field mapping:
  Phase                   -> phase
  Issues / PRs / Branches -> lanes[] (Issue -> lanes[].issue,
                             Branch -> lanes[].branch.name,
                             Worktree -> lanes[].branch.worktree,
                             PR -> lanes[].pull_request.url,
                             State -> lanes[].state)
  Validation Evidence     -> validation_evidence[] (per lane: lanes[].validation)
  Blocking Gaps           -> blocking_gaps[] (per lane: lanes[].validation.blocking_gaps)
  Next Gate               -> next_gate (per lane: lanes[].next_gate)
  Artifact Manifest       -> lanes[].artifact_manifest
  Phase Ledger            -> phase_ledger (phases[] canonical; current/next ids checked projections)
templates/lane-state.md Event Record maps to one lanes[] entry
(recorded_at -> updated_at). `ddalggak status --local` validates
.ddalggak/session-state.json against the schema and judges staleness from
updated_at (x-ddalggak.staleAfterHours).
-->

## Phase

For new ULW loops, `phase_ledger.phases[]` is canonical. The top-level
`phase` and the ledger's `current_phase_id` are projections and must match the
single `in_progress` or resumable `blocked` phase. `revision` and
`last_transition` are maintained by `ddalggak state` for optimistic
concurrency and exact idempotent replay. The plan artifact path is
`lanes[].artifacts.plan`; `plan_hash` is the SHA-256 of its LF-normalized
UTF-8 bytes.

```json
{
  "schema": "ddalggak-session-state/v1",
  "updated_at": "<ISO-8601>",
  "revision": 0,
  "last_transition": null,
  "phase": "phase-1",
  "lanes": [],
  "phase_ledger": {
    "mode": "multi",
    "plan_id": "<stable-plan-id>",
    "plan_hash": "sha256:<64 lowercase hex>",
    "current_phase_id": "phase-1",
    "next_phase_id": "phase-2",
    "phases": [
      {
        "id": "phase-1",
        "status": "in_progress",
        "attempt_count": 1,
        "goal": "<bounded goal>",
        "exit_condition": "<observable signal>",
        "next_phase_id": "phase-2",
        "evidence": [],
        "blocker": ""
      },
      {
        "id": "phase-2",
        "status": "planned",
        "attempt_count": 0,
        "goal": "<next bounded goal>",
        "exit_condition": "<observable signal>",
        "next_phase_id": null,
        "evidence": []
      }
    ]
  }
}
```

Before a phase transition, write completed or skipped-phase audit evidence and
update the next gate atomically. The terminal form is valid when all phases are
completed or skipped with non-empty evidence, ledger `next_phase_id` is `null`,
and projections point to the unique graph terminal whose own `next_phase_id` is
`null`; array order is not authoritative. Dead-owner locks and malformed lock
artifacts older than 30 seconds are reclaimable, while a live owner remains
exclusive.
If this file is missing, malformed, stale, or inconsistent, resume is
`NEEDS_RECONCILIATION`; do not infer progress from chat history.

## Issues / PRs / Branches
| Issue | Branch | Worktree | PR | State | Artifact Manifest |
|---|---|---|---|---|---|

## Validation Evidence

## Blocking Gaps

## Artifact Manifests

## Next Gate

- `owner`: `conductor` / `worker` / `reviewer` / `human` 중 현재 게이트 책임자.
- `action`: 짧고 안정적인 진행 게이트 어휘. 예: `create_pr`, `wait_for_checks`, `run_review`, `fix_blockers`, `request_human_decision`, `merge_manual_only`.
- `command`: 실행할 정확한 명령이 있으면 기록하고, 사람/수동 gate이면 비워 둔다.
- `exit_condition`: 이 gate를 벗어났다고 볼 수 있는 관측 가능한 신호. 예: PR URL readback, current-head checks terminal success/skipped, APPROVE evidence at current head, human answer posted, manual merge verified.
