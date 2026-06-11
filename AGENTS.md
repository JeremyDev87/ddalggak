# AGENTS.md — ddalggak Instruction Projection Adapter

**Canonical owner**: This file is a thin cross-runtime pointer.
The authoritative workflow policy is in:

- [`README.md`](./README.md) — user-facing usage and verification commands
- [`.codex/skills/ddalggak/SKILL.md`](./.codex/skills/ddalggak/SKILL.md) — agent runtime contract for the Codex runtime
- [`ddalggak/SKILL.md`](./ddalggak/SKILL.md) — agent runtime contract for the Claude Code runtime

This file does not duplicate or extend those policies. If this file and the canonical sources conflict, treat the canonical sources as authoritative and report the divergence.

## Projection roots

`ddalggak/` (Claude Code) and `.codex/skills/ddalggak/` (Codex) are hand-maintained projections of the same skill; each root is canonical only for its own runtime. The per-file parity contract between them (`must-match` / `may-localize` / `root-specific`) is declared in the `parity_ledger` block of [`core/projections.yaml`](./core/projections.yaml) and enforced by `npm run verify` (`scripts/verify-projections.mjs`).

## Verification

```bash
npm run verify
```

## Side-effect boundary

- No merge / no auto-merge / no force-push
- No release, publish, tag, or npm registry action without explicit human approval
- No secrets, tokens, private session output, or internal workflow logs in instruction files or GitHub bodies
- Source verification required before any PR-ready claim
- UTF-8 body files required for all GitHub mutations

## Forbidden in this file

- Raw secrets, tokens, credentials, private workflow output, or session logs
- Expand merge / auto-merge / release / publish authority beyond the boundary stated in `README.md` and `.codex/skills/ddalggak/SKILL.md`
- Copy or duplicate long policy from `README.md` or `SKILL.md`
- Grant new side-effect permissions not already present in the canonical sources
