---
name: ddalggak
description: "Use for ddalggak workflow subcommands, ULW, and GJC."
---

# ddalggak - Codex App workflow

Ddalggak is a thin router. Keep procedure in `references/` and wording in `templates/`.

## Subcommands

Supported subcommands are declared in the generated table below.

Cycle: `prompt` -> `tune` -> `forge` -> `spark` -> `plan` -> `start` -> `ship` -> `review` -> `retro`; other commands support.

## Hot-Path Target Architecture

Hot path: routing, permissions, guardrails, contracts, references, stop conditions, and verification.

## Routing Invariant

Parse only the first whitespace-separated word from the invocation arguments.

1. If the first word exactly matches a supported subcommand, route to that subcommand.
2. If there are no arguments, route to `start`.
3. If the first word is an issue reference (GitHub issue/PR URL, `#<number>`, a bare issue number, or `owner/repo#<number>`), route to `start` and treat the full argument string as issue context. An issue reference is an argument, not a command word.
4. If the first word is a CLI-only command (`doctor`, `setup`, or any command handled by `bin/ddalggak.js`), do not route; reply that it is a terminal CLI command to run as `ddalggak <command>` in the shell, and stop.
5. Otherwise, when the first word is neither a supported subcommand, an issue reference, nor a CLI-only command (a typo or unrecognized word), do not fall through to `start` (fail-closed). Return `NEEDS_CLARIFICATION` with the supported subcommand list from the generated table below and ask for intent.
6. Once a route is selected, later arguments must never reroute the request, even if they look like an implementation request.
7. Immediately print exactly one route line before doing work: `-> <subcommand> 실행`.
8. The routed subcommand must stay inside the code modification permissions in the selected command contract.
9. If arguments request changes to this skill, its routing rules, its subcommand definitions, or the skill artifact itself, stop with: `메타 요청 감지 - 이 작업은 ddalggak 서브커맨드 범위 밖입니다. /ddalggak 외부 일반 메시지로 다시 요청해 주세요.`

## Code Modification Invariant

Source edits are allowed only when the selected command contract has `source_edit_allowed: true`, within its scope and `allowed_artifact`. A false permission prohibits source edits. Never inherit rights from another command.

If a non-writing subcommand would need a source edit to continue, report the need and stop.
<!-- ddalggak:generated:start command-index -->
| Command | Contract |
| --- | --- |
| `start` | `references/command-start.md` |
| `review` | `references/command-review.md` |
| `status` | `references/command-status.md` |
| `plan` | `references/command-plan.md` |
| `issue` | `references/command-issue.md` |
| `clean` | `references/command-clean.md` |
| `ship` | `references/command-ship.md` |
| `retro` | `references/command-retro.md` |
| `prompt` | `references/command-prompt.md` |
| `tune` | `references/command-tune.md` |
| `forge` | `references/command-forge.md` |
| `spark` | `references/command-spark.md` |
| `check` | `references/command-check.md` |
| `getwiki` | `references/command-getwiki.md` |
| `setwiki` | `references/command-setwiki.md` |
| `ulw-loop` | `references/command-ulw-loop.md` |
| `ulw-plan` | `references/command-ulw-plan.md` |
| `ulw-research` | `references/command-ulw-research.md` |
| `gjc-plan` | `references/command-gjc-plan.md` |
| `gjc-execute` | `references/command-gjc-execute.md` |
| `gjc-team` | `references/command-gjc-team.md` |
<!-- ddalggak:generated:end command-index -->

### Mode taxonomy

| Mode | Definition |
| --- | --- |
| `source-edit` | Edit repo source only inside issue-owned scope. |
| `review-fix` | Edit/push only accepted review fixes on the reviewed PR branch. |
| `plan-only` | Plan/brief artifacts only; no source, GitHub, or git mutation. |
| `read-only` | Report only; no source, GitHub, or git mutation. |
| `repo-external-write` | Repo unchanged; repo-external notes/memory artifacts allowed. |
| `local-destructive` | Repo/GitHub unchanged; merge-verified local cleanup only. |
| `github-write` | GitHub artifacts plus ship commit/push only; no source edits. |
| `approval-gated-write` | External wiki write only after explicit approval. |

## Codex App Primitives

Use Codex App orchestration names in briefs/state: `spawn_agent`, `send_input`, `wait_agent`, `.ddalggak/session-state.json`, and `request_user_input` when available. The state file owns lane IDs, worktrees, branches, issue/PR evidence, validation, review verdicts, and blockers.

## Global Guardrails

- **Base freshness first**: run `git fetch --prune`; know branch and ahead/behind state before validation, review, ship, or cleanup.
- **URL beats cwd**: parse GitHub owner/repo/number from issue, PR, or repo URL before mutation. If cwd remote does not match, stop and switch/clone the matching checkout.
- **Issue comments matter**: issue body and comments are both source-of-truth candidates; latest explicit comment wins over stale body text.
- **Manual merge only**: never merge or enable auto-merge unless explicitly asked in the current turn. Green checks plus review only mean ready for manual merge.
- **Approval-comment policy**: top-level APPROVE comments are evidence, not GitHub formal approval; report `CI/check`, `reviewDecision`, `mergeStateStatus`, branch protection, and human action separately.
- **Issue-PRs by default**: one issue PR per independent issue; only proven hard conflicts may use one PR with separate commits.
- **Runtime contract language**: `references/agent-runtime-contract.md` owns Task Scope Contract, Context Assembly Manifest, Resume Snapshot, Control-flow ownership, tool capability boundary, task scope contract, out-of-scope diff, and scope-expansion failure.
- **Quality Lens Router**: `references/quality-lens-router.md` owns Applicable gate families, Skipped gates, Required references, lightweight/limited gates, backend-only skip, and Repo/product conventions. Domain gate is a lens, not a mandate.
- **React Code Quality Harness**: when React/Next.js code quality, AI-generated React diffs, component/hook/state/fallback/rendering boundaries are in scope, route `react-code-quality-harness` and read `references/react-code-quality-harness.md`; do not copy gate conditions into the hot path.
- **Wiki Context First**: every subcommand must run `references/wiki-context-preflight.md`; cite wiki paths for wiki-derived claims or record retrieval gaps.
- **Wiki Bridge**: `getwiki` is read-only retrieval; `setwiki` is approval-gated write. ddalggak owns only the admission/approval boundary in `references/wiki-bridge.md` and delegates iCloud/QMD/wiki mechanics to the canonical wiki workflow.
- **Evidence Contract**: `references/evidence-contract.md` is mandatory before completion, readiness, approval, deploy, performance, UI, security, data, or API claims. Blocking evidence gaps block No evidence, no readiness or approval.
- **Simplicity / Deletability Gate**: `references/simplicity-deletability-gate.md` is mandatory for code-shape decisions. Start with small direct change first and ask why any proposed abstraction is necessary.
- **Core Invariants Reference**: `references/core-invariants.md` owns long-form guardrail rationale for Counterargument Pass, privacy, knowledge extraction, rendered evidence, component methodology gate, raw UTF-8, Self-created complexity is a defect, and no silent fallback.
- **Conditional gates stay conditional**: frontend design, Vercel agent skills, and regression-library references load only when applicable; React code quality references also load only when applicable, with explicit backend-only or lightweight skip reasons.
- **Review policy layers**: every review candidate passes Admission schema v3 before candidate disposition, lifecycle aggregate outcome, and publication authority are evaluated separately. Aggregates and public renderers require same-process provenance; canonical two-sentence findings use the deterministic validator in `references/review-output-contract.md`.

## Selected Command Context

Read the selected command document linked in the command index before acting: its full metadata owns permissions, allowed artifacts, side effects, required/conditional assets, stop conditions, and completion signals. Missing or malformed selected contracts are blockers; never infer permission from sibling commands or a corpus search.

The selected contract and required assets are minimum required context, not a reading allowlist. Read required assets before action, including wiki preflight for every command. Load conditional assets when activation evidence applies; record activation and skip reasons. Unknown conditions require investigation or stopping the affected action, never unknown=false. Additional reads and re-reads are allowed with a reason when new evidence warrants them. Load each later phase's command contract and applicable assets on transition, without inheriting permissions. Read public-body assets before preparing public-ready summaries/findings, including previews and zero-finding summaries; reading never grants publication rights.

## Shared Workflow Rules

- Inspect file ownership before parallelism.
- Parallel lanes must not share write surfaces, generated artifacts, branch mutation, or unpublished dependencies.
- Issue-PR Strategy with Conflict Fallback must state Parallelization Decision and Must not touch files. Independent issues create one PR. Conflicting scopes use one PR with separate commits only when the conflict is proven.
- Integration is not completion: independent issue lanes require commit, push, PR URL/evidence, validation, and review-ready signals.
- Protected default-branch pushes, release tags, package publication, and release-triggering workflows require explicit confirmation.

## Review Gate Contract

Normal finish pipeline: local validation, publish evidence when requested, fresh adversarial review, triage, accepted Critical/High fixes, revalidation, and top-level review comment when formal approval is inappropriate. Return gate_result, blocking_summary, next_action, and lane_completion_state.

## Common Pitfalls

Pitfalls: stale repo, missing comments, hallucinated deps, force-push loops, test-pass completion, review in implementation worktree, local-only staging, over-fixing Medium findings, Markdown routing/fence loss, unrendered frontend approval, analytics without privacy lists.

## Verification Checklist

- Base freshness and ahead/behind state known.
- Issue body and comments inspected.
- Allowed, forbidden, inspect-only, and Must not touch files explicit.
- New dependencies avoided or proven.
- Subagent side effects rechecked with git/GitHub.
- Tests distinguished from commit, push, PR, and review completion.
- Markdown edits preserve frontmatter, routing, code permissions, headings, fences, and numbering.
- Evidence Contract, Simplicity / Deletability Gate, and relevant conditional references applied or skipped with reasons.

## Completion Signals

Per-subcommand completion signals live in the selected command document's `output_contract.completion_signal`, available in the installed payload without `core/`. Multi-agent handoff signals LANE_READY, REVIEW_DONE, and FIX_DONE are defined in `templates/worker-brief.md`, `templates/review-brief.md`, and `templates/fix-brief.md`.

## Stop Conditions

Stop when source edits fall outside the routed subcommand, a lane needs files outside its allowed list, a hard blocker would force an unauthorized topology, validation mutates unexpectedly, release/publish automation lacks explicit confirmation, state contradicts live git/GitHub, base freshness cannot be established, the issue is fundamentally thin, or the target is ignored/local-only/repo-external and cannot be represented safely in PR workflow.

## Installation Inventory

Installation inventory only, NOT an unconditional reading list. These deterministic direct paths keep the installed payload self-contained; select reading by the command contract and evidence above.

<!-- ddalggak:generated:start installation-inventory -->
- `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`
- `references/agent-runtime-contract.md`
- `references/ci-failure-triage-loop.md`
- `references/command-check.md`
- `references/command-clean.md`
- `references/command-forge.md`
- `references/command-getwiki.md`
- `references/command-gjc-execute.md`
- `references/command-gjc-plan.md`
- `references/command-gjc-team.md`
- `references/command-issue.md`
- `references/command-plan.md`
- `references/command-prompt.md`
- `references/command-retro.md`
- `references/command-review.md`
- `references/command-setwiki.md`
- `references/command-ship.md`
- `references/command-spark.md`
- `references/command-start.md`
- `references/command-status.md`
- `references/command-tune.md`
- `references/command-ulw-loop.md`
- `references/command-ulw-plan.md`
- `references/command-ulw-research.md`
- `references/common-rules.md`
- `references/context-compact.md`
- `references/core-invariants.md`
- `references/cross-review-loop.md`
- `references/deep-interview-readiness-gate.md`
- `references/evidence-contract.md`
- `references/failure-prevention.md`
- `references/forge-goal.md`
- `references/frontend-design-gate.md`
- `references/gajae-code.md`
- `references/gate-verdict-vocabulary.md`
- `references/human-review-feedback-loop.md`
- `references/issue-ready-plan.md`
- `references/knowledge-freshness-contract.md`
- `references/local-diff-check.md`
- `references/merge-cleanup.md`
- `references/plan-to-issues.md`
- `references/pr-check-evidence-bundle.md`
- `references/prompt-optimizer.md`
- `references/prompt-skill-optimization-staging.md`
- `references/quality-lens-router.md`
- `references/ralplan-critic-consensus.md`
- `references/react-code-quality-harness.md`
- `references/regression-library.md`
- `references/retrospective-workflow.md`
- `references/retrospective.md`
- `references/review-admission-fixtures.json`
- `references/review-comment-style.md`
- `references/review-output-contract.md`
- `references/review-quality-contract.md`
- `references/security-posture-gate.md`
- `references/ship.md`
- `references/simplicity-deletability-gate.md`
- `references/spark-goal.md`
- `references/start-workflow.md`
- `references/status.md`
- `references/tune-goal.md`
- `references/ulw-epistemic-instrumentation.md`
- `references/ulw-intent-routing.md`
- `references/ulw-loop.md`
- `references/ulw-plan.md`
- `references/ulw-research.md`
- `references/ulw-tier-triage.md`
- `references/vercel-agent-skills-gates.md`
- `references/verification-checklist.md`
- `references/wake-resume.md`
- `references/wiki-bridge.md`
- `references/wiki-context-preflight.md`
- `references/wiki-growth-triage.md`
- `scripts/review-contract-policy.mjs`
- `scripts/test-review-contract-exhaustive.mjs`
- `scripts/test-review-contract-verifier.mjs`
- `scripts/test-review-finding-two-sentence.mjs`
- `scripts/test-review-policy-layers.mjs`
- `scripts/verify-review-contract.mjs`
- `templates/artifact-manifest.md`
- `templates/conductor-state.md`
- `templates/epic-body.md`
- `templates/fix-brief.md`
- `templates/issue-body.md`
- `templates/lane-state.md`
- `templates/review-brief.md`
- `templates/worker-brief.md`
<!-- ddalggak:generated:end installation-inventory -->
