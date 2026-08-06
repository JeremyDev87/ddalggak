# Model migration behavioral eval

This directory defines provider-neutral, content-light cases for four separate experiment families: nominal model baseline, prompt ablation, orchestration admission, and optimized-stack comparison. CI validates synthetic observations only; it does not call a model or mutate GitHub/wiki/external systems.

## Capture boundary

Persist normalized observations and `evidence/**/*.json` artifact references only. Artifact refs are traversal-free lowercase slug paths; evidence status is `pass` or `fail`, any `fail` blocks promotion, and mutation classes are unique canonical string arrays. Output sections, resume fields, loaded/skipped references, case IDs, and controlled comparisons are exact canonical sets. The scorer derives the conditional-reference universe from the packaged `plan`/`start`/`review` command SSOT and rejects reduced or rewritten case contracts.

Every variant records `provider + model + apiSurface + transport + capabilityRef`, reasoning/effort, prompt/tool/runtime references, workflow mode, capture source, and a bounded observation window. Live promotion requires concrete runtime identifiers, immutable capability/prompt/tool/runtime hashes, a non-expired evidence window, and an `attested:sha256:<digest>` capture source. Synthetic-like, stale, mixed pass/fail, raw/private, credential-bearing, or path-unsafe evidence cannot promote.

## Matrix

The version-2 manifest keeps four comparisons distinct instead of treating them as one combinatorial model score:

- `model-baseline`: baseline and candidate models under the same kernel, tools, runtime, and single-task workflow.
- `prompt-ablation`: `zero`, `kernel`, and `addback` on one model/runtime; add-back is evidence-driven, not default prompt growth.
- `orchestration`: `single`, `goal`, and `workflow` on one model/kernel/toolset.
- `stack-optimization`: the same model under baseline and optimized provider/runtime/scaffold envelopes; this result must not be reported as a nominal model comparison.

Replace placeholders with concrete identities and immutable references, then set `captureMode` to `live` before scoring externally captured observations. Synthetic PASS is never promotion evidence. Live model execution, paid capture, and default-profile promotion remain separate approval gates.

## Commands

```bash
npm run test:model-migration-eval
npm run eval:model-migration -- evals/model-migration/cases.json path/to/content-light-results.json
```
