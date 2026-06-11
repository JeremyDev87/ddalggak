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
- The `environment: release` gate in `.github/workflows/release.yml` depends on GitHub environment protection rules (required reviewers) configured in repository settings. The presence of `environment: release` in workflow YAML is not evidence that an approval gate is enforced; only the repository settings page can prove that.
- Missing official CodeQL, Dependency Review, or Scorecard evidence is reported as missing optional evidence, not as proof that the repository is safe.
- Release provenance/attestation is a separate release-time gate. Do not collapse release provenance and repository posture into one pass/fail claim.

## Commands

```bash
npm run verify:security-posture
npm run verify:security-posture -- --json
npm run test:security-posture
```

`npm run verify` includes this evidence gate so package verification records the current posture inventory.

## Release publish integrity chain (Issue #219)

`.github/workflows/release.yml` separates verification (`verify_tagged_ref`) from publication (`publish_to_npm`). Publishing a tarball with `npm publish <tarball>` does not run the package's `prepublishOnly` hook, so the publish context gets no verification for free. The workflow closes that gap with an explicit chain:

1. `verify_tagged_ref` checks out the tag, verifies tag/version consistency, runs `npm run verify`, packs the tarball, and records its sha256 as a job output alongside the verified commit SHA.
2. `publish_to_npm` re-checks out the verified SHA, re-asserts SHA and package version, and re-runs `npm run verify` in the publish context (against the approved checkout, not the extracted tarball — the tarball omits `.github/workflows`, which would let the workflow lint and posture lanes pass vacuously).
3. Before `npm publish`, the downloaded artifact's sha256 is compared against the `verify_tagged_ref` job output. An empty or mismatched checksum fails the job.

### Boundary

- The checksum handoff relies on the integrity of GitHub Actions job outputs and artifact storage. It defends against artifact substitution between jobs; it does not defend against a compromised Actions backend, which could alter outputs and artifacts consistently.
- The `environment: release` approval gate is enforced by GitHub environment protection rules (required reviewers) in repository settings. Workflow YAML cannot enforce or prove that configuration; treat it as outside file-based evidence.
- The chain covers source-to-tarball integrity up to `npm publish`. Registry-side transformations, account compromise, and provenance/attestation are owned by the release provenance gate and the post-publish follow-up audit, not this chain.

## Review checklist

- Does the report avoid printing secrets or credential values?
- Are official scan absences described as missing evidence rather than a pass?
- Are action pinning findings separated from remediation requirements?
- If a PR changes workflows, does it explain whether posture findings are in scope or intentionally deferred?
- If a PR changes the release workflow, do the tarball checksum chain (pack-time sha256 output → publish-time comparison) and the publish-context re-verify step remain intact?
