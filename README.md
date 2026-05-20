# ddalggak

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

ddalggak is a workflow skill for turning GitHub issues into planned, parallel, reviewed, and recoverable implementation work. This repository contains both the Codex App skill source and a legacy Claude Code CLI bridge.

> npm release status: this package is being prepared for publication, but this README does not claim a live npm package until registry visibility is proven by the release follow-up audit.

## Codex App

For Codex App, use the repository-local skill source at `.codex/skills/ddalggak/`.

The invocation name is exactly `ddalggak`.

Example invocations:

```text
[$ddalggak] plan "Split issue 22 into reviewable PR units"
[$ddalggak] start 22
[$ddalggak] status
```

The Codex skill supports these subcommands:

- `start`: run issue-based implementation lanes.
- `review`: run independent review as an AI code quality gate, checking not only correctness but also scope, existing patterns, failure semantics, simplicity, and human reviewability before accepted-fix loops.
- `status`: inspect current lane, worktree, and PR state.
- `plan`: create an issue-ready implementation plan.
- `issue`: convert a plan into GitHub issues.
- `clean`: clean local state after merge verification.
- `ship`: commit, push, and open a draft PR for existing lane changes.
- `retro`: write a retrospective for the completed workflow.
- `prompt`: improve lane or review briefs.
- `check`: run a local diff check.

Codex App usage should prefer `.codex/skills/ddalggak/` as the source of truth. The top-level `ddalggak/` directory is retained for the Claude Code legacy setup path described below.

## Review as Quality Gate

ddalggak treats review as the guardrail that keeps AI-generated implementation work aligned with the codebase. AI implementation productivity remains with the implementation lanes, while review protects codebase direction, maintainability, and long-term ownership. Reviewers should block not only broken code, but also unnecessary abstraction, silent fallback, scope creep, pattern drift, and changes that humans cannot easily understand, modify, or delete later. Self-created complexity is a defect: forced modularization, helper/provider/wrapper sprawl, client-side patches that bypass server/request/data boundaries, and mock-only proof for auth or redirect behavior should all trigger review scrutiny.

For guardrail coverage, the Codex skill also requires frontend rendered evidence gates, transitive fallback audits, missing-evidence severity classification, retrospective knowledge extraction categories, and analytics/privacy allowlist/denylist contracts. `npm run verify:codex-skill` checks stable anchors for these #44 guardrails so maintainer edits cannot silently remove them.

The Quality Lens Router chooses applicable gate families from request text, issue body/comments, PR files, and diff paths before plan, start, or review work. It records both applicable gates and skipped gates so backend-only work does not inherit frontend, deployment, or mobile review requirements by accident.

## Quality Defaults

- Branch names should describe the purpose of the change and must not include dates, timestamps, or generated time suffixes.
- Commit messages and PR descriptions must explain **What** changed and **Why** it changed. PR descriptions should also include **Validation**, **Risk**, and linked **Issues**.
- Issue-PRs by default: ddalggak should create one PR per independent issue. Use a single integration PR with issue-separated commits only when hard conflicts between issues make independent PRs unsafe.
- Runtime contract guardrails: ddalggak treats agent work as explicit runtime contracts rather than hidden autonomous loops.
  - Task Scope Contract: worker briefs and reviews must distinguish tool capability boundary from task scope contract, and treat out-of-scope diff as scope-expansion failure.
  - Context Assembly Manifest: plans, briefs, and reviews should name the issue/comments, repo conventions, loaded references, gates, assumptions, and blockers used as source context.
  - Resume Snapshot: paused, idle, CI, review/fix, and wave-transition states should record phase, issue/branch/PR, changed files, validation evidence, blocking gaps, next gate, and exact next command.
  - Control-flow ownership: approval, retry, side effects, force-push, production data touch, and verification completion remain conductor/reviewer-owned gates.
- `plan`, `issue`, and `start` should prove lane independence before claiming parallelism. The issue-PR / conflict-fallback matrix must include owned files, must-not-touch files, why each lane is independent, lane-specific evidence/validation, and the integration gate. Shared files, shared contracts, or runtime flips become serial commits in the same fallback PR; otherwise lanes remain independent issue PRs.
- Worker briefs should bias toward single-responsibility changes, pure functions where practical, TDD or unit-test coverage for core behavior, and the repository's naming plus companion-file conventions such as `ABC.styles.tsx`, `ABC.constants.tsx`, `ABC.types.tsx`, and `ABC.parts.tsx` when that pattern fits the codebase.
- Review should cite CI status as evidence, then focus on behavior intent, scope, code quality, architecture/domain boundaries, maintainability, and deletability.
- For no-argument `start`, `status:unlocked` issues are preferred candidates. If none exist, ddalggak falls back to open issues without mutating labels; `status:locked` issues are excluded without changing the label. Labels are selection hints, not workflow-outcome triggers.

## Progressive Disclosure Budget

The always-loaded skill body should remain a thin router. Keep `SKILL.md` focused on routing invariants, code-modification permissions, global guardrails, subcommand dispatch, required reference maps, stop conditions, and verification checklists. Move long procedures to `references/`, reusable prompt/body shapes to `templates/`, and mechanical regression checks to `scripts/` or future `fixtures/` / `evals/`.

Maintainer target after the #94 thin-router pass:

- `.codex/skills/ddalggak/SKILL.md`: <= 450 lines and <= 35k chars.
- `ddalggak/SKILL.md`: <= 700 lines and <= 45k chars.

These are budget targets, not permission to delete guardrails. Routing, source-edit permissions, manual merge policy, issue-PR topology, Evidence Contract, Simplicity / Deletability, and URL target resolution must remain discoverable from the hot path.

## Claude Code Legacy

The legacy CLI bridge builds `/ddalggak <subcommand>` slash commands for Claude Code. From a source checkout, run the CLI directly with Node.js:

```bash
node bin/ddalggak.js <subcommand> [args]
```

Examples:

```bash
node bin/ddalggak.js prompt "Improve retry handling"
node bin/ddalggak.js plan --print "Split issue 22 into reviewable PR units"
node bin/ddalggak.js start 22
node bin/ddalggak.js status
```

When the `claude` CLI is not on `PATH`, or when the current terminal is non-interactive, the CLI prints the slash command to paste into Claude Code instead of spawning Claude Code.

### Legacy Setup

`setup` installs the legacy Claude Code skill payload into `~/.claude/skills/ddalggak/`:

```bash
node bin/ddalggak.js setup
```

Use `CLAUDE_HOME` or `--target` to choose a different Claude Code home:

```bash
CLAUDE_HOME=/path/to/.claude node bin/ddalggak.js setup
node bin/ddalggak.js setup --target /path/to/.claude
```

Package distribution, if any, is handled separately by maintainers. This usage guide does not claim that a release has been published.

## CLI Options

Common subcommand options:

- `--print`: print only the `/ddalggak <subcommand> ...` slash command.
- `--show-doc`: print the matching `SKILL.md` section for the subcommand.

`setup` options:

- `--dry-run`: print planned actions without changing the filesystem.
- `--force`: skip the installed-version comparison and overwrite the existing installation.
- `--no-backup`: remove the existing installation before copying without creating a backup.
- `--target <path>`: choose the install root. This takes priority over `$CLAUDE_HOME` and `~/.claude`.

Install path priority is `--target <path>`, then `$CLAUDE_HOME`, then `~/.claude`.

## Release Helper Scripts

Maintainers can use the release helper scripts to prepare future npm release workflows without publishing anything from local development:

```bash
node scripts/release-plan.mjs v0.1.1
node scripts/release-plan.mjs v0.2.0-alpha.1
node scripts/bump-release-version.mjs v0.1.1
```

`release-plan.mjs` accepts strict `v`-prefixed semver tags only and emits GitHub Actions-style `key=value` lines for `tag`, `version`, `isPrerelease`, `npmDistTag`, and `githubReleaseType`. Stable tags use the `latest` npm dist-tag; prerelease tags use `next`.

`bump-release-version.mjs` updates only `package.json` and rejects non-upgrade targets. The npm lookup/publish classifier scripts are intended for CI workflows to distinguish idempotent 404/already-published states from unknown failures.

These helpers do not create tags, GitHub releases, or npm publications.

## Release Drafter

Merged PRs on `master` refresh a draft GitHub release through Release Drafter. The draft tag and name are derived from the current package version:

- tag: `draft-v<package.version>`
- name: `Draft v<package.version>`

Manual dry-runs can inspect another ref without updating the draft:

```bash
# GitHub Actions → Release Drafter → Run workflow
# target_ref: your branch or SHA
# dry_run: true
```

Non-dry-run manual draft updates are intentionally guarded to `master` only. Release Drafter only updates draft release notes; it does not create final release tags and does not publish to npm.

## Manual Release Bump

Maintainers can run the `Manual Release Bump` workflow to prepare a version bump PR without mutating `master` directly:

- `tag`: target release tag or version, such as `v0.2.0` or `0.2.0-alpha.1`
- `base_ref`: defaults to `master`
- `dry_run`: defaults to `false`

Dry-runs apply the bump in the ephemeral Actions checkout, verify that only `package.json` changed, run `npm run verify`, and write a summary without pushing a branch or opening a PR.

Non-dry-run executions create or reuse a deterministic draft PR branch for the same `tag` and `base_ref`, label the PR with `skip-changelog` and `release`, and describe the required order: candidate verification, tag creation, then publish approval. The workflow does not create tags, finalize GitHub releases, or publish to npm.

## Release Candidate Verification

The `Release Candidate Verification` workflow verifies a version bump merge commit before any final release tag is created:

- push trigger: runs on `master` when `package.json` changes
- manual trigger: requires an exact 40-character `target_sha`

The workflow checks out the exact SHA, confirms `HEAD` matches the requested commit, compares the previous `package.json` version with the candidate version, and writes a skip summary when `package.json` changed without a version bump.

For real release candidates, it fails if `v<package.version>` already exists, runs `npm run verify`, packs the package with `npm pack --json`, installs the packed tarball in a temporary project, and exercises `npx ddalggak --help` plus `npx ddalggak plan --show-doc`. The summary records the verified SHA, version, next tag, and packed tarball name. This workflow only verifies the candidate; it does not create tags, finalize GitHub releases, or publish to npm.

## Maintainer Verification

Before changing the CLI bridge, Codex skill source, release helpers, or package artifact boundaries, maintainers should run the relevant local checks:

```bash
npm run verify
```

`npm run verify` runs the CLI smoke suite, Codex skill verifier, ddalggak readiness eval fixtures, release helper tests, release drafter tests, manual release bump tests, release candidate tests, and npm package artifact inspection. For focused diagnostics, maintainers can still run each underlying check directly:

```bash
npm test
npm run verify:codex-skill
npm run eval:ddalggak-readiness
npm run test:release-helpers
npm run test:release-drafter
npm run test:manual-release-bump
npm run test:release-candidate
env npm_config_cache=/tmp/ddalggak-npm-cache npm pack --dry-run --ignore-scripts --loglevel=silent
```

Use `npm test` for CLI setup and dispatch behavior, including setup safety/idempotency, dispatch quoting edge cases, and every subcommand `--show-doc` surface. Use `npm run verify:codex-skill` for Codex skill source, metadata, Quality Lens Router anchors, subcommand routing changes, progressive-disclosure budgets, required reference/template maps, legacy/Codex payload parity, detail-template regression guards, and npm package artifact inclusion. Use `npm run eval:ddalggak-readiness` for mock JSON replay checks covering no-work mutation suppression, duplicate PR/comment suppression, evidence-gap readiness blocking, URL-beats-cwd mutation blocking, and hard-conflict fallback classification. Use the pack dry-run as an explicit maintainer-facing package artifact inspection as well.

## Platform Support

macOS and Linux are the primary supported platforms. Windows support is best-effort when Node.js and the `claude` CLI environment are compatible.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
