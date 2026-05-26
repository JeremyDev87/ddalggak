# Security Posture Gate

Use when: a ddalggak maintenance issue touches repository security posture evidence, GitHub Actions workflow safety, release-adjacent security gates, or package verification reports.
Required by: maintainer verification and release/readiness reviews when workflow posture is part of the issue contract.
Side effects: none; the gate is read-only unless a separate issue explicitly owns remediation.
Do not use when: the task is only an application code change with no workflow, package, release, or repository-posture evidence requirement.

## Purpose

The security posture gate records file-based evidence about the repository's GitHub Actions posture. It complements, but does not replace, release provenance and external repository settings review.

The gate must not overclaim safety. A green local report means only that the scanner completed and recorded its inventory. It is not approval to run hooks, MCP servers, install scripts, repository settings changes, or credentialed operations.

## Evidence surfaces

- Workflow `permissions:` blocks at workflow and nested job scope.
- Reusable action references and whether they use a full SHA, version tag, major tag, floating branch, local action, or Docker action.
- Direct shell interpolation candidates from untrusted GitHub contexts such as `inputs.*` or `github.event.*` inside `run:` blocks.
- Presence or absence of official CodeQL, Dependency Review, and OpenSSF Scorecard workflow/action evidence.
- **Workflow command/environment-file channel writes**: line-level inventory of writes to `GITHUB_OUTPUT`, `GITHUB_STATE`, `GITHUB_ENV`, and `GITHUB_STEP_SUMMARY`. Each finding records `channel`, `line`, `sourceKind` (literal, repo-script-output, github-context, external-command-output, unknown), `encodingGuard`, and `riskNote` (non-null only when an untrusted context expression is interpolated directly into the channel write).

## Boundary

- Repository settings, branch protection, environment protection, and secret values are outside file-based proof.
- Missing official CodeQL, Dependency Review, or Scorecard evidence is reported as missing optional evidence, not as proof that the repository is safe.
- Release provenance/attestation is a separate release-time gate. Do not collapse release provenance and repository posture into one pass/fail claim.
- `workflowCommandWrites` is a static line-level inventory. Writing to `GITHUB_OUTPUT`, `GITHUB_ENV`, or similar channels is not prohibited. `sourceKind: literal` and `sourceKind: repo-script-output` findings are inventory only; they are not risk findings.
- Environment-file channel transition (using `>> "$GITHUB_OUTPUT"` instead of deprecated `::set-output::`) reduces the deprecated stdout command-injection class but does not eliminate downstream authority risks when untrusted values flow into later steps or release decisions. This gate records the evidence; it does not certify that any specific workflow is safe.
- The `workflowCommandWrites` detector operates on individual lines. Multi-line heredoc or brace-group blocks where the variable reference appears on a different line from `>>` may not be classified; treat `sourceKind: unknown` findings as requiring manual review if precision matters.

## Commands

```bash
npm run verify:security-posture
npm run verify:security-posture -- --json
npm run test:security-posture
```

`npm run verify` includes this evidence gate so package verification records the current posture inventory.

## Action pinning policy

The gate tracks three distinct concerns for action references:

1. **Immutability evidence** — Is the ref SHA-pinned (full 40-hex commit SHA)?  SHA pinning means the resolved commit cannot be repointed after the pin. It is not a claim that the action code is safe.
2. **Provenance exception registration** — Is the action listed in the explicit exception ledger with an owner, rationale, and review cadence?
3. **Semantic safety** — Separate from pinning; outside the scope of this gate.

### Pin classes

| class | description |
|---|---|
| `sha-pinned` | Full 40-character hex commit SHA — immutability evidence |
| `version-tag` | `vX.Y.Z` or `vX.Y` — floating within patch/minor series |
| `major-tag` | `vX` only — floating within major series |
| `branch-or-floating` | Named branch ref — fully floating |
| `local-or-docker` | `./` relative or `docker://` — local action or Docker image |
| `missing-ref` | No `@ref` present — inventory gap |

### Policy: warning-first

The default policy is **warning-first**: tag refs (`version-tag`, `major-tag`) without an explicit exception are reported as `needs-review`, not as a fail-block. This avoids over-claiming that official GitHub-maintained actions (`actions/*`) are unsafe simply because they use major-tag refs.

To convert a finding from `needs-review` to `compliant`, register it in the `ACTION_PIN_EXCEPTION_LEDGER` in `scripts/security-posture-report.mjs` with:
- `action` — full `owner/repo` name
- `currentRef` — the specific ref value being registered
- `pinClass` — the resolved pin class
- `reason` — human-readable rationale
- `status` — `compliant` if intentionally accepted, or `pending-remediation` if tracked for future SHA-pinning

### Current exception ledger

| action | currentRef | pinClass | reason | status |
|---|---|---|---|---|
| `release-drafter/release-drafter` | `6db134d15f3909ccc9eefd369f02bd1e9cffdf97` | `sha-pinned` | Third-party; already SHA-pinned | compliant |

All other action refs in `.github/workflows/*.yml` use major-tag or version-tag refs for official GitHub-maintained actions. These are reported as `needs-review` and may be registered as explicit exceptions with update cadence notes in a future issue.

### SHA pinning caveat

SHA pinning provides **immutability evidence**, not semantic safety. A SHA-pinned action:
- Cannot have its commit repointed after the pin (immutability)
- May still contain unsafe code at that commit (semantic safety, out of scope here)
- Should be reviewed before pinning, not assumed safe after pinning

This gate does not claim that official GitHub-maintained actions (`actions/checkout`, `actions/setup-node`, etc.) are unsafe. Their tag refs are listed as `needs-review` because they lack registered explicit exceptions, not because they are known to be harmful.

### Separation from release provenance

Action pinning evidence (this section) is distinct from:
- **Release provenance/attestation** — recorded at release-time in the release posture gate
- **Workflow command channel writes** — recorded in the `workflowCommandWrites` section
- **Repository settings** — branch protection, environments, secrets — outside file-based proof

## Review checklist

- Does the report avoid printing secrets or credential values?
- Are official scan absences described as missing evidence rather than a pass?
- Are action pinning findings separated from remediation requirements?
- If a PR changes workflows, does it explain whether posture findings are in scope or intentionally deferred?
- Is `release-drafter/release-drafter@6db134d15f3909ccc9eefd369f02bd1e9cffdf97` still recognized as `sha-pinned` and `compliant`?
- Are `actions/checkout@v5` and similar official major-tag refs showing as `needs-review` (not fail-block)?
- Does the `actionPinPolicy.caveat` field distinguish immutability evidence from semantic safety?
