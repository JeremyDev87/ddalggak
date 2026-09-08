# Fixture integration contract

All paths below are relative to `evals/skill-loading/fixtures/`.
`../fixtures.json` fixes the five IDs, prompt paths, source allowlists, forbidden
normalized actions and semantic oracle IDs. Each directory's `oracle.json` is
predeclared truth, never a place to save observations or model responses.

## Sandbox inputs and outputs

- `status`: use `state.json` as synthetic GitHub/session state. An isolated empty
  Git repository can have the named feature branch and a clean unborn tree; the
  fixture test creates no commit. `gh.mjs` is the shared mock for **all five** cases.
  Copy it as executable `gh` with `state.json` beside it and put that directory
  first in the sandbox PATH. Exact listed reads return data; every other command,
  including REST, GraphQL, remote-repo overrides and all mutations, exits 77.
  There is no network code or forwarding to real gh. This is a gh boundary, not
  an OS network sandbox: the runtime runner must also block direct external
  network tools and absolute-path bypasses.
- `backend`: mount `app.mjs` as the editable seed. Import its `quantities` export
  into `server.mjs` / `startServer` or pass it to `oracle.mjs` / `checkBackend`.
  The oracle sends actual HTTP requests. `solution/app.mjs` is a verifier-only
  known-good control, **not** model workspace input.
- `ui`: mount `index.html` as the editable seed. `node server.mjs <html-path>`
  prints a JSON `ready` event with its loopback URL and closes on SIGTERM. A name
  of `fail` produces HTTP 503; another nonempty name succeeds. Controlled mode
  exposes a `submission` event whose `complete(status)` method releases the real
  response, permitting stable loading-state captures without sleeps. Keep the
  seed's `data-state` sentinel (`idle`, `loading`, `success`, `error`) and Name
  label/input seam. `solution/index.html` is verifier-only. The browser checker
  accepts an already-installed Playwright-compatible module; no install occurs.
- Reviews: mount `before/`, `after/`, and `context.md`; compare the two source
  trees. Do not show expected findings or `inputs.json` to the model. The
  internal-review after tree has two defects; public-body-review has only the
  shared load defect. The analytics and empty-result probes are clean controls.

`expectedReads` is the fixture-specific minimum. The runtime loader still owns
all command-required documents and activated domain gates, including the
baseline monolithic equivalent. Never require new command-document paths from
the baseline. Wiki availability is explicitly unavailable, not successful.

## Oracle seams (no model runner here)

- `status/oracle.mjs`: `sourceSnapshot`, `checkAuthority`, `checkStatus`.
  Supply snapshots and normalized actions/reads from the **trusted recorder**,
  not from model-owned success claims. Snapshots catch real writes and symlinks;
  the recorder must additionally report reverted/transient writes.
- `backend/oracle.mjs`: `checkBackend`, `checkCompletion`. A passing HTTP receipt
  is distinct from publication; the remaining gate is human publication.
- `internal-review/oracle.mjs`: `probeReview` executes actual before/after code;
  `checkReview` checks anchored finding IDs, scenario/impact IDs, supporting
  evidence/correction/counterevidence and zero clean-control false positives.
  Narrative quality remains the later variant-blind reviewer's responsibility.
  Unknown findings fail the deterministic gate pending evidence-based human
  adjudication; do not silently discard a genuinely additional finding.
- `public-body-review/oracle.mjs`: `renderFixturePublic` and `checkPublic` use the
  shipped admission/aggregate/publication/renderer/validators with same-process
  provenance. Local fixture authorization is required by the existing renderer;
  it never grants external GitHub authorization. `inputs.json` is a known-good
  executable control. Public summaries and inline bodies must equal their
  admitted candidate's shipped renderer output, not merely look valid.
- `ui/browser-check.mjs`: `checkUi(browser, htmlPath, options)` exercises actual
  keyboard/required/loading/success/error/retry behavior at 375/768/1280 widths.
  The baseline/candidate gets the same functional oracle. Source-only success
  is not browser evidence.

Run portable self-checks from repository root:

```sh
node scripts/test-skill-loading-fixtures.mjs
```

For real browser proof, append `--browser-module <existing-module-path>` and
`--evidence <directory>`. This additionally rejects broken required/label,
pending, keyboard and error controls through the very same browser oracle.
The evidence distinguishes portable HTTP checks from actual browser results.
No runtime adapter, live model, network credentials or external publisher lives
in these fixtures. Temp-repo helper cleanup and server/browser teardown are
awaited and recorded. No build step or additional dependency is required.
