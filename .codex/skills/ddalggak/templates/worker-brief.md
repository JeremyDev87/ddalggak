# Worker Brief Template

## Task
- Issue:
- Goal:
- Expected outcome:

## Context Assembly Manifest
- Issue body/comments:
- Repo conventions:
- Required references:
- Assumptions / known blockers:

## Artifact Path Manifest
- Worktree:
- Branch:
- Plan artifact:
- Lane state artifact:
- Evidence directory:
- Review brief:
- Handoff / compact note:
- User-question queue (`pending_user_input.md` or issue/PR comment URL):

## Task Scope Contract
- Tool capability boundary:
- Authorized files:
- Forbidden files/actions:
- Allowed side effects:
- Escalation-required actions:
- Validation commands:
- Completion evidence:

## Quality Lens Router Output
- Applicable gate families:
- Skipped gates:
- Required references:
- Lightweight or limited gates:
- Repo/product conventions that outrank generic rules:

## Evidence Contract
- Required evidence:
- Evidence templates applied:
- Evidence not applicable (`not-applicable: <reason>`):
- Blocking evidence gaps:

## Completion Signal
Independent issue PR: `ISSUE_PR_READY: #<issue> <PR URL> <commit> <validation>`
Conflict fallback: `LANE_READY: <lane> <patch-or-commit> <validation>`

Before completion, every non-empty artifact path above must either exist/be linked or be explicitly marked `not-applicable: <reason>`. Do not report `ISSUE_PR_READY` from memory only; cite validation and artifact evidence.
