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
templates/lane-state.md Event Record maps to one lanes[] entry
(recorded_at -> updated_at). `ddalggak status --local` validates
.ddalggak/session-state.json against the schema and judges staleness from
updated_at (x-ddalggak.staleAfterHours).
-->

## Phase

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
