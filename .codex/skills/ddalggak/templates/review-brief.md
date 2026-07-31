# Review Brief Template

## PR / Issue
- PR number:
- Base SHA:
- Head SHA:
- checks Head SHA:
- Linked issue contract:
- Lifecycle:
- Authority boundary:

## Review Scope
- Files:
- Validation evidence already provided:
- Checks/CI state:
- Forbidden side effects:

## Gates
- Scope & ownership:
- Diff Footprint / Scope Expansion Review:
- Counterargument Pass:
- Simplicity & Deletability:
- Existing patterns:
- Failure semantics:
- Evidence Contract:
- Domain-specific gates if applicable:
- Finding signal gate (3문 트리아지; 통과분만 inline, 걸러진 후보는 비차단 메모 또는 drop 로그):

## Semantic coverage matrix
- criterion_id / changed_surface / caller_or_consumer / failure_mode / test_or_evidence / verdict:

## Concrete counterexample pass
- claim / probe / expected_result / actual_result / restoration_proof / status:

## Candidate defaults (non-publication)
```yaml
authority: SUBREVIEW
disposition: CANDIDATE
publication_eligible: false
```
Worker output has no publication authority.

## Output
`REVIEW_DONE PR#<num>: <APPROVE|CHANGES_REQUESTED> critical=N high=N medium=N low=N head=<sha>`

finding 0건 리뷰도 유효한 완료다 (finding signal gate 참조).
