# ULW Research
Use when: a user asks for exhaustive research, cited investigation, or evidence gathering before a decision.
Required by: `ulw-research`
Side effects: none
Do not use when: the user has already chosen an implementation path; use `ulw-loop`.

`ulw-research` investigates claims until the answer is evidence-bound or explicitly blocked.

## Executable clean-room runtime

`ddalggak ulw-research init|accept-format|wave|claim|record-evidence|finalize|status` maintains an isolated session under `.omo/ulw-research/<session-id>/`. This ddalggak-native implementation was written from observable requirements and does not copy SUL-licensed prose.

`init` records at least three orthogonal axes and a proposed deliverable/template; `accept-format` is mandatory before any worker return can be journaled. Every EXPAND return carries an explicit expansion tail, the first wave covers every axis, leads are deduplicated and closed explicitly, and convergence requires two EXPAND waves with no open leads. High-risk non-code claims require two source domains, two observer groups, temporal validity, primary backing, and counter-search evidence. Finalization binds the accepted format, non-empty artifact/assets, and an independent rendered-page plus proofread QA receipt to exact SHA-256 digests. Self-reports, stale digests, symlinks, missing expansion tails, premature convergence, and mismatched QA receipts fail closed.

## OMO origin and parity boundary

The behavioral reference is oh-my-openagent `v3.8.3` at `84e103c41f9863ea32533b9532b013a796053587`, especially its Librarian and search/analyze surfaces. That release has no named `ulw-research` command: this is a clean-room ddalggak translation, not an exact command or prompt-text copy. The CLI journals and validates worker returns; the surrounding Hermes skill procedure still owns source retrieval, parallel worker dispatch, synthesis, and citations. See `core/ulw-research/SOURCE.json` for the pinned source map and non-claims.

## Procedure

1. Split the question into independent research axes.
2. Prefer primary sources, official docs, repo evidence, and executable checks.
3. Track follow-up leads until answered, duplicate, dead, or out of scope.
4. Cite every material claim and separate inference from direct evidence.
5. Name gaps that remain.
6. End with `ULW_RESEARCH_DONE`.

## Epistemic instrumentation

See `references/ulw-epistemic-instrumentation.md` for the ddalggak translation of lazycodex v4.16.0 `ulw-research` claim tracking.

For substantial research, maintain or report:

- `intent-diff.md`: expected truth vs observed reality.
- `claim-graph.md`: final assertion store with support, contradiction, risk, scope, and verdict.
- `observation-manifest.md`: source path/URL, evidence layer, independence basis, observed_at, temporal validity, contamination notes.
- `verification-economics.md`: proof-cost / error-cost rationale and residual risk.
- `cause-disappearance.md`: suspected cause no-longer-observed or replacement-cause tracking.

High-risk non-code claims require the claim graph gate: two independent source domains, two independent observation groups or primary-only exception, one counter-search, primary source when available, and explicit temporal validity. Anything short of that is `Unresolved` or `Refuted`, not silently promoted.

## Image generation / visual research

For image generation, visual references, persona likeness, styling, scene/camera gates, provider history, or prompts:

1. Run `wiki-context-preflight.md` before web/provider speculation or candidate prompts.
2. Query exact persona/product/scene/provider terms plus aliases: appearance, face/body/hair/outfit, phone/camera/space, product maps, accepted/rejected image support, and provider history.
3. Prefer Brain P0/P1/domain/SSOT/control canon; raw ledgers, contact sheets, artifacts, index/log, and imported notes are evidence-only unless promoted.
4. Separate wiki canon from visual inference/prompt guesses; report authority conflicts and missing canon in the Wiki Context Manifest.

## Output addendum

For substantial runs, add:

```markdown
### Epistemic Instrumentation
- Intent diff coverage:
- Claim graph coverage:
- Observation manifest coverage:
- Verification economics summary:
- Cause-disappearance records:
- High-risk claim gate result:
```
