# ULW Research
Use when: a user asks for exhaustive research, cited investigation, or evidence gathering before a decision.
Required by: `ulw-research`
Side effects: none
Do not use when: the user has already chosen an implementation path; use `ulw-loop`.

`ulw-research` investigates claims until the answer is evidence-bound or explicitly blocked.

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
