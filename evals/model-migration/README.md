# Model migration behavioral eval

This directory defines provider-neutral, content-light cases for comparing model reasoning and harness variants. CI validates synthetic observations only; it does not call a model or mutate GitHub/wiki/external systems.

## Capture boundary

Persist normalized observations and `evidence/**/*.json` artifact references only. Artifact refs are traversal-free lowercase slug paths; evidence status is `pass` or `fail`, any `fail` blocks promotion, and mutation classes are unique canonical string arrays. Output sections, resume fields, loaded/skipped references, case IDs, and controlled comparisons are exact canonical sets. The scorer derives the eight-reference universe from the packaged `plan`/`start`/`review` command SSOT and rejects reduced or rewritten case contracts. Live promotion additionally requires immutable prompt/tool/runtime hashes and an `attested:sha256:<digest>` capture source; synthetic-like capture sources cannot promote. URLs, data URIs, arbitrary free text, user-home paths, raw prompts/outputs/messages/transcripts, credentials, tokens, and secret values are rejected in manifest and results.

## Matrix

The synthetic template contains baseline and candidate model roles, each in canonical `high/full`, `medium/full`, `high/lean`, `medium/lean` order. Model-axis comparisons keep harness and reasoning fixed; reasoning/harness comparisons stay within one model role. Replace provider/model placeholders and prompt/tool/runtime references with concrete identities plus immutable hashes, then set `captureMode` to `live` before live capture. Synthetic PASS is never promotion evidence: the report keeps promotion withheld until a live manifest passes. Live model execution and default-profile promotion remain separate approval gates.

## Commands

```bash
npm run test:model-migration-eval
npm run eval:model-migration -- evals/model-migration/cases.json path/to/content-light-results.json
```
