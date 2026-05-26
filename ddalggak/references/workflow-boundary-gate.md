# Workflow Trigger/Permission Boundary Gate

**Issue**: #183
**Adjacent gates (out of scope)**: #178 release provenance · #180 command channel · #181 action pinning · #182 static lint

## Purpose

This gate inventories the authority boundary of each `.github/workflows/*.yml` file:
- Which trigger events grant which code/ref access
- What GITHUB_TOKEN permissions are declared
- Whether secrets, OIDC, or cache surfaces are referenced (presence/kind only — never values)
- Whether concurrent runs cancel stale work or serialize
- Whether explicit timeouts bound job runtime

This gate does **not** own static lint, action pinning, command channel injection, or release provenance. It does **not** query GitHub API, repository settings, or live workflow state.

## Inventory Row Schema

| Field | Required behavior |
|---|---|
| `workflow_path` | `.github/workflows/*.yml` path |
| `trigger_events` | `push`, `pull_request`, `workflow_dispatch`, `release`, etc. |
| `trusted_ref_policy` | `push_to_branch_trusted` / `push_to_tag_trusted` / `release_event_tag_trusted` / `manual_dispatch_input_ref` / `pr_untrusted_head` / `mixed_trusted_and_untrusted` / `unknown` |
| `token_permissions` | `{ workflow_level, job_level_overrides }` — values only; no credential material |
| `write_escalation_reason` | `null` if no write; documented reason or `WARN:` if undocumented |
| `secret_or_oidc_surface` | Key names only (never values); `none_detected` or `{ KEY: "present" }`; `id-token: write (OIDC surface present)` |
| `cache_surface` | `actions/cache: present` or `none_detected` |
| `timeout_minutes` | Declared value or `none_declared_default_360` |
| `timeout_reason` | Reason for the bound (or default/unknown note) |
| `concurrency_group` | Group expression or `null` |
| `group_key_basis` | `ref`, `sha`, `workflow_input`, `ref_name`, `event_name`, `release_tag`, or `no_concurrency` |
| `cancel_in_progress` | `true` / `false` / `null` (not declared) |
| `duplicate_run_policy` | `cancel_stale_runs` / `serialize_runs` / `no_concurrency_declared_parallel_allowed` / `WARN:...` |
| `queue_or_hang_next_gate` | `cancel_stale_then_rerun` / `serialize_wait_for_prior_run` / `wait_for_prior_run` / `rerun` / `human_approval` |
| `environment_protection` | `present` / `absent` (job-level `environment:` key) |
| `next_gate` | `allow` / `warn` / `human-review` |

### next_gate rules

| Condition | next_gate |
|---|---|
| `write_escalation_reason` starts with `WARN:` | `warn` |
| `duplicate_run_policy` starts with `WARN:` | `warn` |
| job-level `id-token: write` (OIDC) present | `human-review` |
| workflow-level `id-token: write` present | `human-review` |
| all others | `allow` |

### unknown policy

- `unknown` fields are **not promoted to pass**
- `timeout_minutes: none_declared_default_360` is an observation, not a failure gate
- Repository settings, protected environments, and live queue state remain `unknown`

## Validation Command

```bash
# Markdown report (default)
npm run verify:workflow-boundary

# JSON report
node scripts/workflow-boundary-inventory.mjs --json

# Explicit root (for worktree or alternate checkout)
node scripts/workflow-boundary-inventory.mjs --root /path/to/repo
```

All three commands must complete without error and without printing secret values, token values, or private workflow logs.

## Current ddalggak Inventory (as of #183)

| workflow | triggers | write? | next_gate |
|---|---|---|---|
| `ci.yml` | push, pull_request, workflow_dispatch | no | allow |
| `manual-release-bump.yml` | workflow_dispatch | yes | allow |
| `release-candidate.yml` | push, workflow_dispatch | no | allow |
| `release-drafter.yml` | push, workflow_dispatch | yes | allow |
| `release-published-follow-up.yml` | release, workflow_dispatch | no | allow |
| `release.yml` | push, workflow_dispatch | yes | human-review |

`release.yml` is `human-review` because `publish_to_npm` job has `id-token: write` for OIDC-based npm provenance publishing, combined with a `release` environment protection gate.

## Caveats

- This gate parses local YAML only. Real-time GitHub settings (branch protection, protected environment rules, OIDC provider configuration, queue state) may differ and remain `unknown`.
- `timeout/concurrency green` is operational evidence only. It does **not** prove semantic correctness, supply-chain safety, or approval completeness.
- `cancel-in-progress: true` is appropriate for stale CI runs but potentially dangerous for release/publish lanes (see `release.yml` and `manual-release-bump.yml` where `cancel-in-progress: false` serializes runs).
- Secret key names are captured only. Secret values, OIDC tokens, and npm credentials are never printed.
