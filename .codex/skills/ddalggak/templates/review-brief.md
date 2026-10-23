# Review Brief Template

## Target and independent reviewer
- Original request / purpose / non-goals:
- Exact source / version or snapshot / section / scope:
- Applicable quality criteria:
- Fresh reviewer session/context identity (distinct from author):
- Actual independent result / evidence:
- Parent source recheck / counterevidence after result:
- Authority: read-only source; only authorized verified inline findings on the requested PR may publish.
- Forbidden side effects: source edits, commit/push, formal approval, top-level verdict, thread reply/resolve, CI rerun.
- Give original sources and criteria, not parent conclusions/canned findings. Missing independent result blocks completion.

## PR / Issue (PR targets only; never fabricate for non-PR review)
- PR number:
- Base SHA:
- Head SHA:
- checks Head SHA:
- Linked issue contract / acceptance criteria:
- Lifecycle:
- Lifecycle checked at / evidence: intake; after delegated or long-running work; immediately before each inline POST
- Merge stop sentinel: `state=MERGED` or non-null `mergedAt` → `REVIEW_STOPPED_PR_MERGED`; record `state`, `mergedAt`, `mergeCommit`, `headRefOid`; stop delegation/probes/edits/pushes/GitHub writes
- Authority boundary:
- Purpose / non-goals:

## Review Intake
- Risk tier: `low | medium | high | critical`
- Tier evidence: blast radius / code lifetime / future owners / sensitive boundaries
- Human owner for High/Critical:
- Review Quality sensor decision: `ready-for-review | needs-intent | needs-evidence | needs-split | blocked-human-owner`

## Review Scope
- Changed files and symbols:
- Callers / consumers:
- Validation evidence already provided:
- Current-head checks/CI state:
- Forbidden side effects:
- Triggered conditional references:
- Skipped gates and reasons:

## Gates
- Scope & ownership:
- Diff Footprint / Scope Expansion Review:
- Counterargument Pass:
- Simplicity & Deletability:
- Existing patterns:
- Failure semantics:
- Evidence Contract:
- Domain-specific gates if applicable:
- Human feedback / CI / security / regression conditional gates:
- Finding signal gate drops:

## Semantic coverage matrix
| criterion_id | changed_surface | caller_or_consumer | failure_mode | test_or_evidence | verdict |
| --- | --- | --- | --- | --- | --- |

## Concrete counterexample pass
- claim:
- Test diff reviewed first: yes / no / not-applicable
- probe:
- expected_result:
- actual_result:
- restoration_proof:
- status:
- High/Critical zero-finding challenger: used / not-triggered / blocked

## Quality sensor findings (internal)
For each observed quality finding record severity, claim, source/version/section or changed-line/file anchor, reproducible failing scenario, impact, minimal fix, confidence, and counterevidence checked. These are sensor inputs only. For PR targets before aggregation, the conductor must map a reproduced finding into the exact 21-field Admission schema v3 record in `references/cross-review-loop.md`; this section defines neither publication eligibility nor write authority.

## Candidate defaults (PR targets only, non-publication)
```yaml
authority: SUBREVIEW
disposition: CANDIDATE
publication_eligible: false
```
Worker output has no publication authority.

## Output
- Internal Review Quality sensor verdict: `approve | change request | comment | blocked`
- Chat: findings/impact/location, validation/gaps, publication status, target version and separate verdict.
- Non-PR completion: `REVIEW_DONE` with exact source/version and actual independent result plus parent recheck; no GitHub write.
- PR canonical lifecycle outcome and inline rendering: `references/cross-review-loop.md` plus `references/review-output-contract.md`

Open lifecycle completion: `REVIEW_DONE PR#<num>: <APPROVE|CHANGES_REQUESTED> critical=N high=N medium=N low=N head=<sha>`

Merged lifecycle hard stop: `REVIEW_STOPPED_PR_MERGED PR#<num>: state=MERGED mergedAt=<timestamp> mergeCommit=<sha|null> head=<sha> outcome=NO_FOLLOW_UP`

A zero-finding review is valid only with semantic coverage evidence. High/Critical zero-finding reviews additionally require the documented counterexample/challenger rule in `references/review-quality-contract.md`.
