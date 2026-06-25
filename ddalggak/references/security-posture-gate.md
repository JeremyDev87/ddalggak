# Security Posture Gate
Use when: a ddalggak maintenance issue touches repository security posture evidence, GitHub Actions workflow safety, release-adjacent security gates, or package verification reports.
Required by: `review`; maintainer verification and release/readiness reviews when workflow posture is part of the issue contract.
Side effects: none; the gate is read-only unless a separate issue explicitly owns remediation.
Do not use when: the task is only an application code change with no workflow, package, release, or repository-posture evidence requirement.

## Sub-gate map

This single reference contains four evidence lanes. Keep verdicts separate: one green lane does not approve another.

| Sub-gate | Activation | Verdict evidence |
|---|---|---|
| Repository posture inventory/admission | repository/workflow posture or package verification review | `verify:security-posture -- --admission` + reviewer judgement |
| Action pinning policy | action refs, pinning, or exception-ledger claims | `actionPinPolicy` evidence + ledger review |
| Workflow static lint | workflow YAML, reusable contracts, action I/O, or script-interpolation structure | `verify:workflow-lint` evidence + reviewer judgement |
| Release publish integrity chain | release workflow, tag/version, tarball checksum, or publish-context verification | release workflow diff/tests + no-publish boundary |

## Repository posture inventory/admission sub-gate

- Activation: inspect workflow permissions, reusable action refs, risky triggers, environment-file writes, or posture report/admission claims.
- Verdict: `PASS` only when admission has no unregistered findings and the issue-scope review has no blocking posture gap; `BLOCK` on admission failure or repository-settings/secrets evidence gaps; `N/A` outside workflow/package/release posture scope.
- Evidence: `verify:security-posture` report/admission output and changed-file review; repository settings, branch protection, environments, and secrets remain outside file-based proof.

### Purpose

The security posture gate records file-based evidence about the repository's GitHub Actions posture. It complements, but does not replace, release provenance and external repository settings review.

The gate must not overclaim safety. A green local report means only that the scanner completed and recorded its inventory, and a green admission run means the configured file-based admission checks found no unregistered deltas. It is not approval to run hooks, MCP servers, install scripts, repository settings changes, or credentialed operations.

### Evidence surfaces

- Workflow `permissions:` blocks at workflow and nested job scope.
- Reusable action references and whether they use a full SHA, version tag, major tag, floating branch, local action, or Docker action.
- Direct shell interpolation candidates from untrusted GitHub contexts such as `inputs.*` or `github.event.*` inside `run:` blocks.
- Presence or absence of official CodeQL, Dependency Review, and OpenSSF Scorecard workflow/action evidence.
- **Workflow command/environment-file channel writes**: line-level inventory of writes to `GITHUB_OUTPUT`, `GITHUB_STATE`, `GITHUB_ENV`, and `GITHUB_STEP_SUMMARY`. Each finding records `channel`, `line`, `sourceKind` (literal, repo-script-output, github-context, external-command-output, unknown), `encodingGuard`, and `riskNote` (non-null only when an untrusted context expression is interpolated directly into the channel write).

### Boundary

- Repository settings, branch protection, environment protection, and secret values are outside file-based proof.
- The `environment: release` gate in `.github/workflows/release.yml` depends on GitHub environment protection rules (required reviewers) configured in repository settings. The presence of `environment: release` in workflow YAML is not evidence that an approval gate is enforced; only the repository settings page can prove that.
- Missing official CodeQL, Dependency Review, or Scorecard evidence is reported as missing optional evidence, not as proof that the repository is safe.
- Release provenance/attestation is a separate release-time gate. Do not collapse release provenance and repository posture into one pass/fail claim.
- `workflowCommandWrites` is a static line-level inventory. Writing to `GITHUB_OUTPUT`, `GITHUB_ENV`, or similar channels is not prohibited. `sourceKind: literal` and `sourceKind: repo-script-output` findings are inventory only; they are not risk findings.
- Environment-file channel transition (using `>> "$GITHUB_OUTPUT"` instead of deprecated `::set-output::`) reduces the deprecated stdout command-injection class but does not eliminate downstream authority risks when untrusted values flow into later steps or release decisions. This gate records the evidence; it does not certify that any specific workflow is safe.
- The `workflowCommandWrites` detector operates on individual lines. Multi-line heredoc or brace-group blocks where the variable reference appears on a different line from `>>` may not be classified; treat `sourceKind: unknown` findings as requiring manual review if precision matters.

### Commands

```bash
npm run verify:security-posture
npm run verify:security-posture -- --json
npm run verify:security-posture -- --admission
npm run test:security-posture
```

`npm run verify` includes this gate in admission/fail mode so package verification fails on unregistered action refs, unreported write permissions, or risky triggers.

### Admission/fail policy

Normal report mode remains an evidence report. Admission mode (`--admission`, also accepted as `--fail` or `--fail-on-findings`) exits non-zero when any of these are present:

- A reusable action ref that is not explicitly registered in `ACTION_PIN_EXCEPTION_LEDGER` by exact `action` + `currentRef`.
- A `write` permission entry that is not explicitly registered in `WRITE_PERMISSION_EXCEPTION_LEDGER`.
- A risky trigger such as `pull_request_target` that is not explicitly registered in `RISKY_TRIGGER_EXCEPTION_LEDGER`.

Current workflows are the baseline and must stay green without changing `.github/workflows/*.yml`. If a workflow change intentionally introduces one of these findings, the same change must add the narrow ledger registration with a rationale and review/update expectation. Otherwise admission mode must fail.

## Action pinning policy

- Activation: workflow action references, pinning/provenance exception claims, or exception-ledger entries change or are reviewed.
- Verdict: `PASS` when refs are SHA-pinned or narrowly registered and no text equates immutability with semantic safety; `BLOCK` on unregistered refs, broad/stale ledger entries, or semantic-safety overclaims; `N/A` when no action-ref/pinning surface is in scope.
- Evidence: `actionPinPolicy` report section, `ACTION_PIN_EXCEPTION_LEDGER`, and workflow diff; this lane does not approve release provenance or repository settings.

The gate tracks three distinct concerns for action references:

1. **Immutability evidence** — Is the ref SHA-pinned (full 40-hex commit SHA)?  SHA pinning means the resolved commit cannot be repointed after the pin. It is not a claim that the action code is safe.
2. **Provenance exception registration** — Is the action listed in the explicit exception ledger with an owner, rationale, and review cadence?
3. **Semantic safety** — Separate from pinning; outside the scope of this gate.

### Pin classes

Classes: `sha-pinned` (full 40-hex immutable ref), `version-tag`, `major-tag`, `branch-or-floating`, `local-or-docker`, and `missing-ref`.

### Policy: admission-fail for unregistered refs

The default policy is **advisory report with admission fail**: normal report mode still labels unregistered tag refs (`version-tag`, `major-tag`) as `needs-review`, but admission mode fails on any action ref that is not registered by exact action/ref. This avoids over-claiming that official GitHub-maintained actions (`actions/*`) are unsafe while still preventing silent workflow authority expansion.

To convert a finding from `needs-review` to `compliant`, register it in the `ACTION_PIN_EXCEPTION_LEDGER` in `scripts/security-posture-report.mjs` with:
- `action` — full `owner/repo` name
- `currentRef` — the specific ref value being registered
- `pinClass` — the resolved pin class
- `reason` — human-readable rationale
- `status` — `compliant` if intentionally accepted, or `pending-remediation` if tracked for future SHA-pinning

### Current exception ledger

The source-of-truth ledger lives in `scripts/security-posture-report.mjs`; the generated `actionPinPolicy` report is the review evidence. Unregistered action refs in `.github/workflows/*.yml` are admission failures. Register current or intentional exceptions with narrow rationale; do not weaken the fail mode.

### SHA pinning caveat

SHA pinning provides **immutability evidence**, not semantic safety. A SHA-pinned action:
- Cannot have its commit repointed after the pin (immutability)
- May still contain unsafe code at that commit (semantic safety, out of scope here)
- Should be reviewed before pinning, not assumed safe after pinning

This gate does not claim that official GitHub-maintained actions (`actions/checkout`, `actions/setup-node`, etc.) are unsafe. Current baseline tag refs are explicit `compliant` admission exceptions in the ledger above; new unregistered tag refs remain review/admission findings until they are registered with narrow rationale.

### Separation from release provenance

Action pinning evidence (this section) is distinct from:
- **Release provenance/attestation** — recorded at release-time in the release posture gate
- **Workflow command channel writes** — recorded in the `workflowCommandWrites` section
- **Repository settings** — branch protection, environments, secrets — outside file-based proof

---

## Workflow Static Lint Gate (Issue #182)

- Activation: workflow YAML, reusable workflow contracts, action I/O references, script interpolation, or workflow lint verifier/report changes are in scope.
- Verdict: `PASS` when lint is zero-warning and the static report covers the changed surface; `BLOCK` on lint failure, unsuppressed warning, contract mismatch, or semantic/secret-safety overclaim; `N/A` outside workflow lint/YAML structure scope.
- Evidence: `verify:workflow-lint`, `test:workflow-lint`, and changed workflow/verifier files; static lint green records structural evidence only.

`scripts/verify-workflow-lint.mjs` is a separate, independent admission evidence lane.

### Scope

Checks `.github/workflows/*.yml` files for:

- Workflow YAML/expression structure (`syntax_result`, `expression_result`)
- Action `with:` input / `steps.<id>.outputs` reference mismatch (`action_io_result`)
- Reusable workflow `on: workflow_call` inputs/outputs contract structure (`reusable_workflow_result`)
- Direct interpolation of untrusted context (`github.head_ref`, `inputs.*`, `github.event.*`, etc.) inside `run:` blocks (`script_injection_result`)
- Hard-coded credential patterns in workflow YAML (`credential_pattern`)

### Non-scope (boundary)

| Concern | Owner |
|---|---|
| Workflow command channel injection patterns | Issue #180 |
| Action pinning / SHA reproducibility | Issue #181 |
| Release provenance / attestation | Issue #178 |
| Repository settings, branch protection, secrets | Outside file-based evidence |
| Semantic safety (workflow does what it claims) | Not in scope for any static lint |

### Commands

```bash
npm run verify:workflow-lint
npm run verify:workflow-lint -- --json
npm run test:workflow-lint
```

`npm run verify` includes this lane after the security posture evidence report.

### Evidence fields

The report records lint tool/version, checked workflows, category summary, content-light findings, allowed warnings or zero-warning policy, and a non-overclaiming caveat.

### Allowed warnings / false-positive policy

Current policy: **zero-warning**. No exceptions have been registered. All findings require review or explicit suppression via the `allowedWarnings` ledger in the script.

### Caveat

Static lint green does **not** imply semantic safety, secret safety, or provenance safety. It records structural evidence only.

---

## Release publish integrity chain (Issue #219)

- Activation: release workflow, tag/version checks, tarball packing, checksum handoff, or publish-context re-verification changes are in scope.
- Verdict: `PASS` when tag verification, tarball checksum handoff, and publish-context re-verify remain intact; `BLOCK` if an unverified checkout/tarball can publish, checksum evidence can be empty/mismatched, or YAML is claimed to prove environment protection; `N/A` outside release/publish integrity scope.
- Evidence: release workflow diff plus relevant release verifier tests; this lane never authorizes release, tag, npm publish, or registry mutation.

`.github/workflows/release.yml` separates verification (`verify_tagged_ref`) from publication (`publish_to_npm`). Because `npm publish <tarball>` does not run the package `prepublishOnly` hook, `verify_tagged_ref` verifies the tag/version, runs `npm run verify`, packs the tarball, and records sha256 + verified SHA; `publish_to_npm` re-checks out that SHA, re-runs verification in the publish context, and compares the downloaded tarball sha256 before publish.

### Boundary

- Checksum handoff relies on GitHub Actions job-output/artifact integrity and does not defend against a compromised Actions backend.
- `environment: release` approval is repository-settings evidence; workflow YAML cannot prove required reviewers.
- Registry-side transformations, account compromise, provenance/attestation, and post-publish audit are adjacent gates.

## Review checklist

- Never print secrets or credential values; describe official scan absences as missing evidence, not pass.
- Keep action pinning findings separate from remediation requirements and semantic-safety claims.
- For workflow/release changes, state which sub-gates are in scope and preserve checksum + publish-context re-verify.
- Confirm `actionPinPolicy.caveat` still separates immutability evidence from semantic safety.
