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

---

## Workflow Static Lint Gate (Issue #182)

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

| Field | Description |
|---|---|
| `lintTool` | `actionlint` (preferred) or `javascript-native` (fallback) |
| `toolVersion` | Tool version string |
| `checkedWorkflows` | List of `.github/workflows/*.yml` relative paths |
| `categorySummary` | Per-category pass/finding-count status |
| `findings` | Content-light list: workflow path, category, line, bounded summary, severity |
| `allowedWarnings` | Explicit false-positive ledger (empty = zero-warning policy) |
| `warningPolicy` | Zero-warning policy statement when allowedWarnings is empty |
| `caveat` | Non-overclaiming statement (always present) |

### Allowed warnings / false-positive policy

Current policy: **zero-warning**. No exceptions have been registered. All findings require review or explicit suppression via the `allowedWarnings` ledger in the script.

### Caveat

Static lint green does **not** imply semantic safety, secret safety, or provenance safety. It records structural evidence only.

## Review checklist

- Does the report avoid printing secrets or credential values?
- Are official scan absences described as missing evidence rather than a pass?
- Are action pinning findings separated from remediation requirements?
- If a PR changes workflows, does it explain whether posture findings are in scope or intentionally deferred?
