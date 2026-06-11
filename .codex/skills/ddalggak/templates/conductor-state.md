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
templates/lane-state.md Event Record maps to one lanes[] entry
(recorded_at -> updated_at). `ddalggak status --local` validates
.ddalggak/session-state.json against the schema and judges staleness from
updated_at (x-ddalggak.staleAfterHours).
-->

## Phase

## Issues / PRs / Branches
| Issue | Branch | Worktree | PR | State |
|---|---|---|---|---|

## Validation Evidence

## Blocking Gaps

## Next Gate
