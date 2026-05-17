# ddalggak

[![license](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

ddalggak is a workflow skill for turning GitHub issues into planned, parallel, reviewed, and recoverable implementation work. This repository contains both the Codex App skill source and a legacy Claude Code CLI bridge.

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

## Quality Defaults

- Branch names should describe the purpose of the change and must not include dates, timestamps, or generated time suffixes.
- Commit messages and PR descriptions must explain **What** changed and **Why** it changed. PR descriptions should also include **Validation**, **Risk**, and linked **Issues**.
- Worker briefs should bias toward single-responsibility changes, pure functions where practical, TDD or unit-test coverage for core behavior, and the repository's naming plus companion-file conventions such as `ABC.styles.tsx`, `ABC.constants.tsx`, `ABC.types.tsx`, and `ABC.parts.tsx` when that pattern fits the codebase.
- Review should cite CI status as evidence, then focus on behavior intent, scope, code quality, architecture/domain boundaries, maintainability, and deletability.
- For no-argument `start`, `status:unlocked` issues are preferred candidates. If none exist, ddalggak falls back to open issues without mutating labels; `status:locked` issues are excluded without changing the label. Labels are selection hints, not workflow-outcome triggers.

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

## Maintainer Verification

Before changing the CLI bridge, Codex skill source, or package artifact boundaries, maintainers should run the relevant local checks:

```bash
npm test
npm run verify:codex-skill
env npm_config_cache=/tmp/ddalggak-npm-cache npm pack --dry-run --ignore-scripts --loglevel=silent
```

Use `npm test` for CLI setup and dispatch behavior, `npm run verify:codex-skill` for Codex skill source or metadata changes, and the pack dry-run to inspect the package artifact list.

## Platform Support

macOS and Linux are the primary supported platforms. Windows support is best-effort when Node.js and the `claude` CLI environment are compatible.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
