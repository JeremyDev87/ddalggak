# Evidence Contract
Use when: a plan, implementation, review, PR body, or readiness report claims work is complete, safe, validated, approved, or ready for manual merge.
Required by: `plan`, `start`, `review`; PR/readiness conclusions.
Side effects: none
Do not use when: the report is only a discovery failure/no-op status with no readiness or completion claim.


Use this reference when `ddalggak plan`, `start`, or `review` claims that work is complete, ready for PR, ready for approval, or safe to ship.

The Evidence Contract turns readiness claims into inspectable proof. Test success is useful evidence, but it is not a substitute for evidence that matches the user-visible or operational behavior being changed.

## Contract Output

Every plan, worker brief, review packet, and PR/readiness conclusion must carry this stable section when work claims completion:

```markdown
## Evidence Contract
- Required evidence:
  - <evidence item>: <why this proves the changed behavior>
- Evidence templates applied:
  - <template name>: <required proof>
- Evidence not applicable:
  - <evidence item>: not-applicable: <reason>
- Blocking evidence gaps:
  - <gap or none>
```

## Evidence Templates

| Work type | Required evidence |
| --- | --- |
| UI/design/frontend | Route or screen path, desktop/mobile viewport matrix, rendered DOM or accessibility state, screenshot or visual artifact, fallback/empty/loading/error state evidence, and contract graph for shared component/data dependencies. |
| Deploy/release/env | Preview or live URL, deployment state, environment/project context, version or commit deployed, and any rollback or token-safety check that applies. |
| Performance | Before/after measurement, focused benchmark or profiling result, tested dataset/fixture size, threshold or budget, and note about noise or repeatability. |
| Bugfix/regression | Reproduction or failing regression test first, fix evidence, passing regression log, and adjacent edge/error case coverage. |
| Security/auth/privacy | Adversarial cases, authorization/authentication boundary tests, privacy allowlist/denylist evidence, denied cases, and confirmation that secrets or sensitive user input are not exposed. |
| Data/API/backend | Actual request/response, query result, schema/contract sample, error response evidence, migration or compatibility evidence, and fixture/source used. |

## Missing Evidence Severity

Classify every unavailable evidence item:

- `not-applicable: <reason>` only when the evidence surface is truly out of scope and the reason is specific.
- Medium when evidence is useful but not required to prove the explicit acceptance criteria or critical path.
- High when evidence covers an explicit acceptance criterion, a user-visible critical path, deploy/readiness, performance claim, security/privacy/auth behavior, data/API contract, or fallback that could hide broken data.

## plan

Subcommand Responsibilities — `plan`: define required evidence, templates, commands, and artifacts.

## start

Subcommand Responsibilities — `start`: include Evidence Contract in briefs, final output, and PR body.

## review

Subcommand Responsibilities — `review`: missing required evidence is High and blocks APPROVE/ready claims.

## Approval Rule

Without required evidence, do not conclude `APPROVE`, `ready`, `ready for review`, `ship`, or `merge ready`. The correct outcome is blocked/request changes until evidence is supplied or the item is explicitly reclassified as `not-applicable: <reason>`.
