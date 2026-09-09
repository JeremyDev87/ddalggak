# Selective-loading verification

`core/commands/*.yaml` is the metadata SSOT. The two generated roots contain 42 localized command documents (21 commands per root). The selected command contract and its required references/templates are mandatory context and must be read before acting; additional reads are allowed when new evidence justifies them. Only the installation inventory is not an unconditional reading list.

`npm run verify` runs the portable Unit A checks, including the quality-report test and `npm run test:skill-loading-runtime:portable`. The latter executes the real capture protocol on Node >=20: Chat/Responses counts, sentinels, serialized read-result hashes/bytes, hook/wire mutation rejection, and unsupported layouts. It needs no installed SDK, sandbox, server, browser, or provider. The runtime test requires an explicit mode; it never defaults to SDK integration.

Full installed runtime integration remains `--mode offline`, requiring Node >=24, Darwin `sandbox-exec`, and explicit runtime/plugin/output paths. Runtime integration, sandbox checks, browser checks, and live model A/B are never hidden in the default pipeline:

```bash
node scripts/test-skill-loading-runtime.mjs --mode portable
node scripts/test-skill-loading-runtime.mjs --runtime-dist DIST --plugin-path PLUGIN_DIRECTORY --mode offline --output EVIDENCE/runtime
node scripts/eval-skill-loading.mjs --mode offline --config CONFIG --output EVIDENCE/offline
node scripts/eval-skill-loading.mjs --mode live --config CONFIG --output EVIDENCE/live --auth-path EXISTING_AUTH_JSON --browser-module EXISTING_BROWSER_MODULE
node scripts/skill-loading/quality-report.mjs --input EVIDENCE/live --output EVIDENCE/quality.json
```

Accounting JSON distinguishes declared totals from base totals and conditional extra reads; `est_tokens` is declared base plus the conditional union, with fractional sums rounded once and the delta reported as rounded declared minus base. SDK-normalized usage is labeled separately; raw provider usage may be explicitly unavailable. Adoption is quality-first across correctness, completeness, evidence, and usability; fewer tokens alone never qualifies. Synthetic offline reports cannot promote a candidate.

Live checks require verified Node 24, Darwin `sandbox-exec` for advanced integration/live, the existing Chrome/Playwright module, an installed runtime distribution and plugin directory, and fixed model/reasoning/SSE settings. Exactly ten attempted slots are allowed: no retries, fallback, title/grader/subagent calls, or extra paid runs. Live CLI requires an existing JSON connection through `--auth-path` and an explicit `--browser-module`; no secrets or private paths belong in examples.

### Run configuration

Each run config must contain exactly these 12 fields: `runId`, `baselineSource`, `candidateSource`, `baselineSha`, `candidateTree`, `runtimeDist`, `pluginPath`, `modelId`, `reasoning`, `fixtureHash`, `sessionLimit`, and `mode`. Use absolute immutable source, runtime, and plugin paths; the approved immutable baseline SHA; `candidateTree` as the Git TREE hash (not a commit); and `fixtureHash` as `directoryHash(fixtureRoot)`. Set an explicit provider/model and the same reasoning value for both variants, `sessionLimit` to `10`, and `mode` to match the CLI. Do not use fake defaults, secrets, personal paths, or extra fields.
