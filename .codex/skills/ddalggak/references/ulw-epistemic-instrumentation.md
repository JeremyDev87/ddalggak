# ULW Epistemic Instrumentation
Use when: `ulw-research` needs auditable claim tracking, source/observation separation, or high-risk non-code claim verification.
Required by: `ulw-research`
Side effects: none
Do not use when: the answer is a simple live repo read with no material claim synthesis; still use `wiki-context-preflight.md`.

This reference absorbs lazycodex v4.16.0 `ulw-research` epistemic instrumentation into ddalggak's evidence-contract and wiki-context-preflight language.

## Required artifacts / ledgers

Use these as Markdown sections in the response, a conductor note, or explicit file artifacts when the research is large enough to need recovery. Workers may return candidates; the orchestrator owns the final ledgers.

| Artifact | Required fields | ddalggak integration point |
| --- | --- | --- |
| `intent-diff.md` | `intent_id`, expected truth, observed reality, diff, violated invariant, status. | Starts from user intent, issue/spec/docs, and Wiki Context Manifest; closes each expected truth as verified/refuted/unresolved. |
| `claim-graph.md` | `claim_id`, statement, type, risk tier, scope, linked intents, supporting observations, contradicting observations, independence, verdict. | Becomes the single store for final assertions; maps unresolved nodes to Evidence Contract `Blocking evidence gaps`. |
| `observation-manifest.md` | `observation_id`, source path/URL, evidence layer, observer/group, independence basis, observed_at, valid_at/claim_valid_at, contamination note. | Extends Wiki Context Manifest: wiki paths, repo paths, web sources, command outputs, and worker findings are observations with provenance. |
| `verification-economics.md` | claim, risk, error cost, proof cost/time, chosen path, verify/defer decision, outcome, residual risk. | Explains why a claim was proven directly, deferred, or downgraded; prevents over-verifying low-risk details while exposing high-risk gaps. |
| `cause-disappearance.md` | cause id, expected truth, previous observation, last_seen, disconfirming observation, replacement cause, status, resolved-by-absence? | Prevents stale-cause reporting when a suspected issue is no longer observable or was replaced by another cause. |

## When to use cause-disappearance

Not every research run needs `cause-disappearance.md`. Use it when a suspected cause is no longer observable or has been replaced:

- **Bug investigation:** the symptom was reproducible in an earlier session or commit, but the current HEAD no longer triggers it — record the last known observation, the disconfirming observation (for example `git bisect` result, passing test, or changed dependency), and whether a replacement cause is confirmed.
- **Stale wiki/SSOT claims:** a wiki page or authority doc previously stated a fact that the current source no longer supports — record the previous observation (cached page, git blame, archived version), the disconfirming observation (live source read), and whether the fact was corrected or removed.
- **Flaky or environment-dependent behavior:** a failure appeared under a specific runtime/config/dependency version and is no longer reproducible after an unrelated change — record the last environment where it was observed, the current environment, and whether the replacement cause (for example version bump or config change) is confirmed.
- **Regression investigation:** a behavior that was working broke and may have been fixed by an intervening change — record the working observation, the broken observation, and whether the fix was intentional or coincidental.

Skip `cause-disappearance.md` for straightforward research where every claim is either currently true or currently false with no temporal shift.

## Claim graph gate for high-risk non-code claims

Numeric, market/legal/dated/causal/financial, safety, or externally consequential claims clear as `verified` only when all applicable checks pass:

- At least two independent source domains corroborate the claim, unless a recorded primary-only exception is the correct authority model.
- At least two independent observation groups converge, or the graph explains why a single primary observation is authoritative.
- One counter-search or counter-observation actively looked for refutation.
- A primary source backs the claim when a primary source exists.
- Temporal validity is explicit: `observed_at` and `valid_at` / `claim_valid_at` prevent historical/current/runtime conflation.

Failures are not papered over: mark `Unresolved` for insufficient evidence and `Refuted` when counterevidence wins.

## Worker / delegation boundaries

- Spawn or use workers by independent axis when useful, but keep workers read-only unless the command scope explicitly allows edits.
- Worker outputs are candidates, not final proof. The orchestrator writes the claim graph, observation manifest, and final verdict.
- Broadcast/record leads as they arrive; do not wait until the end if a lead changes another axis.
- For ddalggak, use `delegate_task` or local tooling instead of lazycodex teammode; if no worker tool is used, state that the orchestrator did the axis directly.

## Output requirements

Every substantial `ulw-research` report should include:

```markdown
### Epistemic Instrumentation
- Intent diff coverage:
- Claim graph coverage:
- Observation manifest coverage:
- Verification economics summary:
- Cause-disappearance records:
- High-risk claim gate result:
- Unresolved / refuted annex:
```

Keep wiki-derived facts cited by path, live repo facts cited by file/line or command output, and non-wiki inference labeled as inference.
