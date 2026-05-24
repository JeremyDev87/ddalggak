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

## Boundary

- Repository settings, branch protection, environment protection, and secret values are outside file-based proof.
- Missing official CodeQL, Dependency Review, or Scorecard evidence is reported as missing optional evidence, not as proof that the repository is safe.
- Release provenance/attestation is a separate release-time gate. Do not collapse release provenance and repository posture into one pass/fail claim.

## Commands

```bash
npm run verify:security-posture
npm run verify:security-posture -- --json
npm run test:security-posture
```

`npm run verify` includes this evidence gate so package verification records the current posture inventory.

## Review checklist

- Does the report avoid printing secrets or credential values?
- Are official scan absences described as missing evidence rather than a pass?
- Are action pinning findings separated from remediation requirements?
- If a PR changes workflows, does it explain whether posture findings are in scope or intentionally deferred?
