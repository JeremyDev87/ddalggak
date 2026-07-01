---
name: ddalggak
description: "Use for ddalggak workflow subcommands."
---

# ddalggak - Codex App workflow

Ddalggak is a thin-router for Issue -> plan -> implementation -> review -> recovery -> retro.

## Subcommands

Supported subcommands are declared in the generated table below.

Standard cycle: `prompt` -> `tune` -> `forge` -> `spark` -> `plan` -> `start` -> `ship` -> `review` -> `retro`.

## Hot-Path Target Architecture

The hot path is routing, code permissions, guardrails, subcommand contracts, reference map, stop conditions, and verification checklist.


## Routing Invariant

Parse only the first whitespace-separated word from the invocation arguments.

1. If the first word exactly matches a supported subcommand, route to that subcommand.
2. If there are no arguments, route to `start`.
3. If the first word is an issue reference (GitHub issue/PR URL, `#<number>`, a bare issue number, or `owner/repo#<number>`), route to `start` and treat the full argument string as issue context. An issue reference is an argument, not a command word.
4. If the first word is a CLI-only command (`doctor`, `setup`, or any command handled by `bin/ddalggak.js`), do not route; reply that it is a terminal CLI command to run as `ddalggak <command>` in the shell, and stop.
5. Otherwise, when the first word is neither a supported subcommand, an issue reference, nor a CLI-only command (a typo or unrecognized word), do not fall through to `start` (fail-closed). Return `NEEDS_CLARIFICATION` with the supported subcommand list from the generated table below and ask for intent.
6. Once a route is selected, later arguments must never reroute the request, even if they look like an implementation request.
7. Immediately print exactly one route line before doing work: `-> <subcommand> 실행`.
8. The routed subcommand must stay inside the code modification permissions in the table below.
9. If arguments request changes to this skill, its routing rules, its subcommand definitions, or the skill artifact itself, stop with: `메타 요청 감지 - 이 작업은 ddalggak 서브커맨드 범위 밖입니다. /ddalggak 외부 일반 메시지로 다시 요청해 주세요.`

## Code Modification Invariant

Repository source edits are authorized only where the generated permission table below says `yes`; every `no` subcommand is read-only for source code and may only produce its listed artifacts.

<!-- ddalggak:generated:start code-permission-table -->
| Subcommand | May modify source files | Allowed artifacts |
| --- | --- | --- |
| `start` | yes | worker agents may edit only files named in their brief |
| `review` | yes | author agents may apply accepted Critical/High review fixes only |
| `status` | no | response output only |
| `plan` | no | response output only unless the user separately asks to write a plan document |
| `issue` | no | GitHub issues only |
| `clean` | no | local branch and worktree cleanup only after merge verification |
| `ship` | no | commit, push, and draft PR for existing changes only |
| `retro` | no | retrospective notes and memory update request artifacts only |
| `prompt` | no | brief artifacts after explicit confirmation |
| `tune` | no | goal-alignment brief artifacts only |
| `forge` | no | acceptance-criteria artifacts only |
| `spark` | no | runtime-goal sentence artifacts only |
| `check` | no | local review notes only; no repository edits |
| `getwiki` | no | delegate to dedicated `/getwiki` read-only retrieval |
| `setwiki` | no | delegate to dedicated `/setwiki` approval-gated write workflow |
| `ulw-loop` | yes | scoped source edits only; no GitHub writes |
| `ulw-plan` | no | plan output only |
| `ulw-research` | no | research output only |
| `gjc-plan` | no | coordinator plan delegation evidence only |
| `gjc-execute` | yes | scoped source edits only after explicit approval and coordinator mutation enablement; no GitHub writes |
| `gjc-team` | yes | scoped team work only after explicit approval and coordinator mutation enablement; no GitHub writes |
<!-- ddalggak:generated:end code-permission-table -->

If a non-writing subcommand would need a source edit to continue, report the need and stop.
<!-- ddalggak:generated:start subcommand-table -->
## Subcommand Contract Table

| Subcommand | Mode | Show-doc heading | Purpose | Side effects | Stop condition | Required assets |
| --- | --- | --- | --- | --- | --- | --- |
| `start` | source-edit | Start Workflow | Issue implementation from live issue body/comments; one issue PR by default | Repo source edits in issue scope; start publishes the issue PR via the ship procedure (ship.md); cross-review comments come through the review gate. | Stop on stale base, missing issue body/comments, duplicate PR, or required files outside the issue-owned scope. | refs: `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/agent-runtime-contract.md`, `references/core-invariants.md`, `references/deep-interview-readiness-gate.md`, `references/start-workflow.md`; templates: `templates/worker-brief.md`, `templates/conductor-state.md`, `templates/lane-state.md`, `templates/artifact-manifest.md` |
| `review` | review-fix | Cross-Review Loop | Independent current-head review and accepted fix loop | Top-level review comment plus inline line-anchored review comments for every finding in one COMMENT-event batch; accepted Critical/High fixes may edit source and push to the reviewed PR branch. | Stop before APPROVE if current-head CI is not terminal green/skipped, blockers remain, or wiki/evidence preflight has blocking gaps. | refs: `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/regression-library.md`, `references/cross-review-loop.md`, `references/human-review-feedback-loop.md`, `references/ci-failure-triage-loop.md`, `references/security-posture-gate.md`; templates: `templates/review-brief.md`, `templates/fix-brief.md` |
| `status` | read-only | Status | Read-only live git/GitHub/session state snapshot | No source, GitHub, or local cleanup mutation; report live git/GitHub/session state only. | Stop after a live state snapshot and next-action recommendation. | refs: `references/status.md`, `references/pr-check-evidence-bundle.md`; templates: - |
| `plan` | plan-only | Issue-Ready Plan | Issue-ready implementation plan from issue/wiki/code evidence | No source edits; no GitHub writes unless the user separately requests issue creation. | Stop after an issue-ready plan with evidence/unknowns and PR topology. | refs: `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/wiki-bridge.md`, `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/deep-interview-readiness-gate.md`, `references/ralplan-critic-consensus.md`, `references/issue-ready-plan.md`; templates: - |
| `issue` | github-write | Plan to Issues | Create GitHub issues from an approved plan | Create/edit GitHub issues and comments only; no repository source edits. | Stop after live issue URLs/labels/assignees/body UTF-8 verification or on metadata permission failure. | refs: `references/plan-to-issues.md`; templates: `templates/issue-body.md`, `templates/epic-body.md` |
| `clean` | local-destructive | Merge Cleanup | Post-merge local cleanup after live merge evidence | Local branch/worktree cleanup only after live merge evidence; no GitHub mutation. | Stop on dirty, ambiguous, unmerged, or non-ancestor worktrees/branches. | refs: `references/merge-cleanup.md`; templates: - |
| `ship` | github-write | Ship | Commit/push/open draft PR for existing scoped changes | Commit, push, and draft PR for already-existing scoped changes; no new source edits. | Stop after PR creation/current-head publication evidence or on no-diff/scope/validation blocker. | refs: `references/ship.md`; templates: - |
| `retro` | repo-external-write | Retrospective | Extract reusable lessons after merge without transient memory | Repo-external writes only: the retrospective note under ~/workspace/retrospective/ (or the RETRO_DIR override) and memory files or memory-update request artifacts; skill/wiki changes stay proposal-only (wiki via the approval-gated setwiki bridge); no writes to any path inside the repository. | Stop after reusable lessons are separated from transient incident records. | refs: `references/retrospective.md`, `references/retrospective-workflow.md`, `references/wiki-growth-triage.md`; templates: - |
| `prompt` | plan-only | Prompt Optimizer | Compile safer prompt briefs without source edits | Brief/review/fix artifacts only after explicit confirmation; no canonical source edits. | Stop with READY_FOR_BRIEF, NEEDS_CLARIFICATION, BLOCKED_UNSAFE, or DISCOVERY_ONLY. | refs: `references/prompt-optimizer.md`, `references/prompt-skill-optimization-staging.md`; templates: - |
| `tune` | plan-only | Tune Goal Brief | Align rough intent into a source-grounded goal brief before implementation | Brief only; no source, GitHub, or git mutation. | Stop after a scoped brief or explicit blockers. | refs: `references/tune-goal.md`; templates: - |
| `forge` | plan-only | Forge Acceptance Criteria | Convert done conditions into objective acceptance checks | Criteria only; no source, GitHub, or git mutation. | Stop after verifiable criteria or explicit gaps. | refs: `references/forge-goal.md`; templates: - |
| `spark` | plan-only | Spark Runtime Goal | Draft a copyable runtime goal sentence with validation checklist | Goal text only; no source, GitHub, or git mutation. | Stop after goal text and validation checklist. | refs: `references/spark-goal.md`; templates: - |
| `check` | read-only | Local Diff Check | Read-only local diff review | Local diff review notes only; no GitHub comments and no repository edits. | Stop after findings and exact validation gaps are reported. | refs: `references/local-diff-check.md`; templates: - |
| `getwiki` | read-only | GetWiki Bridge | Wiki context retrieval bridge | Delegate to dedicated /getwiki retrieval; no wiki or repo mutation. | Stop after cited wiki sources or retrieval gaps are reported. | refs: `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; templates: - |
| `setwiki` | approval-gated-write | SetWiki Bridge | Wiki write workflow bridge | Delegate to dedicated /setwiki; wiki writes require explicit approval and verification. | Stop at review-only plan unless explicit approval is present; then stop after wiki write verification. | refs: `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/wiki-growth-triage.md`; templates: - |
| `ulw-loop` | source-edit | ULW Loop | Evidence-led bounded implementation loop | Scoped source edits; no GitHub writes. | Stop after evidence, validation, cleanup, and blockers. | refs: `references/ulw-loop.md`; templates: - |
| `ulw-plan` | plan-only | ULW Plan | Decision-complete plan before edits | Plan only; no source, GitHub, or git mutation. | Stop after scope, criteria, validation, non-goals, and blockers. | refs: `references/ulw-plan.md`; templates: - |
| `ulw-research` | read-only | ULW Research | Cited research with explicit gaps | Research output only; no source, GitHub, or git mutation. | Stop after claims are cited or tested and gaps are named. | refs: `references/ulw-research.md`; templates: - |
| `gjc-plan` | plan-only | Gajae-Code Delegation | Delegate planning to gajae-code coordinator MCP | Coordinator delegation only; no source, GitHub, git, or filesystem mutation unless explicitly approved. | Stop after coordinator turn evidence, plan artifact, or explicit blocker. | refs: `references/gajae-code.md`; templates: - |
| `gjc-execute` | source-edit | Gajae-Code Delegation | Delegate approved execution to gajae-code coordinator MCP | Scoped source edits only after explicit user approval and coordinator mutation enablement; no GitHub writes. | Stop after verified coordinator terminal state, artifacts, cleanup, and blockers. | refs: `references/gajae-code.md`; templates: - |
| `gjc-team` | source-edit | Gajae-Code Delegation | Delegate parallel team work to gajae-code coordinator MCP | Scoped team work only after explicit user approval and coordinator mutation enablement; no GitHub writes. | Stop after terminal team state, lane evidence, cleanup, and blockers. | refs: `references/gajae-code.md`; templates: - |
<!-- ddalggak:generated:end subcommand-table -->

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

Use Codex App native orchestration names in briefs and state records: `spawn_agent`, `send_input`, `wait_agent`, `.ddalggak/session-state.json`, and `request_user_input` when available. The state file is the source of truth for lane IDs, worktree paths, branch names, issue numbers, PR URL/evidence, validation commands, review verdicts, and blockers.

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
- **Wiki Context First**: `plan` and `review` must run `references/wiki-context-preflight.md`; cite wiki paths for wiki-derived claims or record retrieval gaps.
- **Wiki Bridge**: `getwiki` is read-only retrieval; `setwiki` is approval-gated write. ddalggak owns only the admission/approval boundary in `references/wiki-bridge.md` and delegates iCloud/QMD/wiki mechanics to the canonical wiki workflow.
- **Evidence Contract**: `references/evidence-contract.md` is mandatory before completion, readiness, approval, deploy, performance, UI, security, data, or API claims. Blocking evidence gaps block No evidence, no readiness or approval.
- **Simplicity / Deletability Gate**: `references/simplicity-deletability-gate.md` is mandatory for code-shape decisions. Start with small direct change first and ask why any proposed abstraction is necessary.
- **Core Invariants Reference**: `references/core-invariants.md` owns long-form guardrail rationale for Counterargument Pass, privacy, knowledge extraction, rendered evidence, component methodology gate, raw UTF-8, Self-created complexity is a defect, and no silent fallback.
- **Conditional gates stay conditional**: frontend design, Vercel agent skills, and regression-library references load only when applicable; React code quality references also load only when applicable, with explicit backend-only or lightweight skip reasons.

## Required Reference Map

<!-- ddalggak:generated:start required-reference-map -->
| Subcommand | Workflow reference | Gate references | Wiki/meta references | Required templates |
| --- | --- | --- | --- | --- |
| `start` | `references/agent-runtime-contract.md`, `references/start-workflow.md` | `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/deep-interview-readiness-gate.md` | `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | `templates/worker-brief.md`, `templates/conductor-state.md`, `templates/lane-state.md`, `templates/artifact-manifest.md` |
| `review` | `references/cross-review-loop.md`, `references/human-review-feedback-loop.md`, `references/ci-failure-triage-loop.md` | `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/regression-library.md`, `references/security-posture-gate.md` | `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | `templates/review-brief.md`, `templates/fix-brief.md` |
| `status` | `references/status.md`, `references/pr-check-evidence-bundle.md` | - | - | - |
| `plan` | `references/issue-ready-plan.md` | `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/deep-interview-readiness-gate.md`, `references/ralplan-critic-consensus.md` | `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/wiki-bridge.md` | - |
| `issue` | `references/plan-to-issues.md` | - | - | `templates/issue-body.md`, `templates/epic-body.md` |
| `clean` | `references/merge-cleanup.md` | - | - | - |
| `ship` | `references/ship.md` | - | - | - |
| `retro` | `references/retrospective.md`, `references/retrospective-workflow.md`, `references/wiki-growth-triage.md` | - | - | - |
| `prompt` | `references/prompt-optimizer.md`, `references/prompt-skill-optimization-staging.md` | - | - | - |
| `tune` | `references/tune-goal.md` | - | - | - |
| `forge` | `references/forge-goal.md` | - | - | - |
| `spark` | `references/spark-goal.md` | - | - | - |
| `check` | `references/local-diff-check.md` | - | - | - |
| `getwiki` | - | - | `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | - |
| `setwiki` | `references/wiki-growth-triage.md` | - | `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | - |
| `ulw-loop` | `references/ulw-loop.md` | - | - | - |
| `ulw-plan` | `references/ulw-plan.md` | - | - | - |
| `ulw-research` | `references/ulw-research.md` | - | - | - |
| `gjc-plan` | `references/gajae-code.md` | - | - | - |
| `gjc-execute` | `references/gajae-code.md` | - | - | - |
| `gjc-team` | `references/gajae-code.md` | - | - | - |
<!-- ddalggak:generated:end required-reference-map -->

## Shared Workflow Rules

- Inspect file ownership before parallelism.
- Parallel lanes must not share write surfaces, generated artifacts, branch mutation, or unpublished dependencies.
- Issue-PR Strategy with Conflict Fallback must state Parallelization Decision and Must not touch files. Independent issues create one PR. Conflicting scopes use one PR with separate commits only when the conflict is proven.
- Integration is not completion: independent issue lanes require commit, push, PR URL/evidence, validation, and review-ready signals.
- Protected default-branch pushes, release tags, package publication, and release-triggering workflows require explicit confirmation.

## `start` - Issue-Based Implementation

Command contract: mode `source-edit`; source edits are limited to live issue-owned scope; start publishes the issue PR via the ship procedure (`references/ship.md`) and routes cross-review through the review gate; stop on stale base, missing issue body/comments, duplicate PR, or required files outside scope.

Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.

Execution contract index: repo/base freshness, issue body+comments, Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate, allowed/forbidden/inspect-only/Must not touch, one issue PR by default, hard-conflict fallback only with reason, validation/PR evidence, blocking gaps.

## `review` - Cross-Review Loop

Command contract: mode `review-fix`; source edits are allowed only for accepted Critical/High blockers; top-level review comments are allowed; stop before APPROVE when current-head CI/checks are not terminal, blockers remain, or evidence/wiki preflight has blocking gaps.

Full procedure: `references/cross-review-loop.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; reusable prompt: `templates/review-brief.md`.

Execution contract index: live PR/diff/files/checks/issue/head SHA, Wiki Context Preflight, Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate, conditional frontend/Vercel/regression gates, blocker triage, and top-level conclusion comment when formal approval is inappropriate.

## `status` - Current State Snapshot

Read `.ddalggak/session-state.json` if present, then inspect live git/GitHub state. Report phase, lane states, branches, PRs, blockers, base freshness, and next action. Do not edit files.

## `plan` - Issue-Ready Plan

Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Execution contract index: source/non-goals/unknowns, ownership, Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate, one issue PR by default, conflict fallback only with proof, Parallelization Decision, Must not touch, evidence/validation, commit message.

## `issue` - Plan To GitHub Issues

Convert a plan into GitHub issues without editing repository files. Preserve Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, and Dependencies / blocked by.

Issue titles/bodies must be raw UTF-8, not JSON-escaped text. Reject or decode literal Unicode escapes before GitHub mutation; verify live title/body after creation.

## `ship` - Publish Current Lane

Ship only existing changes. Confirm scope, re-read issue context, fetch, validate, locally review where feasible, stage intended files, commit with What and Why, push, open a draft PR, verify PR existence, and keep it draft until current-head checks and review evidence support ready for manual merge.

## `clean` - Post-Merge Cleanup

Verify live PR merge evidence first, fetch, inspect dirty state, then clean only safe local branches/worktrees/state artifacts. Stop on uncommitted work or contradictory live state.

## `retro` - Retrospective

After merge, summarize the cycle and extract reusable lessons without storing transient PR numbers or commit SHAs as memory. Use `references/wiki-bridge.md` for setwiki admission: default review-only, explicit approval before wiki write. Use references/retrospective-workflow.md for low-frequency details.

## `prompt` - Prompt Optimizer

Prompt Safety / Brief Compiler compact index: Prompt Audit, `prompt grill-me`, Unsafe Prompt Gate.

Judgement labels: `READY_FOR_BRIEF | NEEDS_CLARIFICATION | BLOCKED_UNSAFE | DISCOVERY_ONLY`.

Preserve `source_edit_allowed: false`; compile brief/review/fix artifacts only, and end with `PROMPT_DONE`.

## `tune` - Tune Goal Brief

Full procedure: `references/tune-goal.md`; source-grounded goal brief with scope, non-goals, assumptions, open questions, validation surfaces, and no source edits.

## `forge` - Forge Acceptance Criteria

Full procedure: `references/forge-goal.md`; objective command/observation plus expected-result acceptance criteria, with no source edits.

## `spark` - Spark Runtime Goal

Full procedure: `references/spark-goal.md`; copyable runtime goal sentence, validation checklist, non-goals, next instruction, and no source edits.

## `ulw-loop` - ULW Loop

Full procedure: `references/ulw-loop.md`.

Execution contract index: `source_edit_allowed: true`; `github_write_allowed: false`; failing-first proof when feasible; targeted validation plus real-surface evidence; `ULW_LOOP_DONE`.

## `ulw-plan` - ULW Plan

Full procedure: `references/ulw-plan.md`.

Execution contract index: `source_edit_allowed: false`; decision-complete plan, owned files, non-goals, validation surfaces, blockers; `ULW_PLAN_DONE`.

## `ulw-research` - ULW Research

Full procedure: `references/ulw-research.md`.

Execution contract index: `source_edit_allowed: false`; cited claims, investigated leads, executable evidence where applicable, explicit gaps; `ULW_RESEARCH_DONE`.

## `gjc-plan` / `gjc-execute` / `gjc-team` - Gajae-Code Delegation

Full procedure: `references/gajae-code.md`.

Execution contract index: delegate via `gjc_delegate_plan`, `gjc_delegate_execute`, or `gjc_delegate_team`; pass current project cwd and task; keep `allow_mutation: false` unless explicit user approval and coordinator mutation enablement are both present; use external GJC visible-session helpers only when installed; end with `GJC_PLAN_DONE`, `GJC_EXECUTE_DONE`, or `GJC_TEAM_DONE`.

## `check` - Local Diff Check

Run a read-only local diff review. Capture base freshness, status, diff stat, ignored/local-only/generated paths, and findings. Use references/local-diff-check.md for details.

## GetWiki Bridge

Full procedure: `references/wiki-bridge.md`. Delegate to dedicated `/getwiki` for read-only retrieval. Preserve source paths or retrieval gaps; do not mutate wiki files.

## SetWiki Bridge

Full procedure: `references/wiki-bridge.md`. Delegate to dedicated `/setwiki` for approval-gated write workflow. Require explicit approval before wiki mutation; do not inline iCloud/QMD mechanics.

## Review Gate Contract

Normal finish pipeline: local validation, publish evidence when requested, fresh adversarial review, triage, accepted Critical/High fixes, revalidation, and top-level review comment when formal approval is inappropriate. Return gate_result, blocking_summary, next_action, and lane_completion_state.

## Common Pitfalls

Stale repo state; missing issue comments; hallucinated dependencies; unsafe force-push loops; equating test pass with completion; reviewing inside an implementation worktree; staging ignored/local-only files; over-fixing Medium findings; Markdown surgery that loses fenced blocks or routing; frontend approval without rendered evidence; analytics without privacy allowlist/denylist.

## Verification Checklist

Full procedure: `references/verification-checklist.md`. Verify base freshness, issue body+comments, file tracking/local-only status, validation evidence, reviewer isolation, and Markdown fence integrity.

## Completion Signals

Per-subcommand completion signals come from each command contract's `output_contract.completion_signal` and are listed below so the installed skill payload carries them without `core/`. Multi-agent handoff signals LANE_READY, REVIEW_DONE, and FIX_DONE are defined in `templates/worker-brief.md`, `templates/review-brief.md`, and `templates/fix-brief.md`.

<!-- ddalggak:generated:start completion-signal-table -->
| Subcommand | Completion signal |
| --- | --- |
| `start` | `ISSUE_PR_READY` |
| `review` | `REVIEW_DONE` |
| `status` | `STATUS_DONE` |
| `plan` | `PLAN_DONE` |
| `issue` | `ISSUE_DONE` |
| `clean` | `CLEAN_DONE` |
| `ship` | `SHIP_DONE` |
| `retro` | `RETRO_DONE` |
| `prompt` | `PROMPT_DONE` |
| `tune` | `TUNE_DONE` |
| `forge` | `FORGE_DONE` |
| `spark` | `SPARK_DONE` |
| `check` | `CHECK_DONE` |
| `getwiki` | `GETWIKI_DONE` |
| `setwiki` | `SETWIKI_DONE` |
| `ulw-loop` | `ULW_LOOP_DONE` |
| `ulw-plan` | `ULW_PLAN_DONE` |
| `ulw-research` | `ULW_RESEARCH_DONE` |
| `gjc-plan` | `GJC_PLAN_DONE` |
| `gjc-execute` | `GJC_EXECUTE_DONE` |
| `gjc-team` | `GJC_TEAM_DONE` |
<!-- ddalggak:generated:end completion-signal-table -->

## Stop Conditions

Stop when source edits fall outside the routed subcommand, a lane needs files outside its allowed list, a hard blocker would force an unauthorized topology, validation mutates unexpectedly, release/publish automation lacks explicit confirmation, state contradicts live git/GitHub, base freshness cannot be established, the issue is fundamentally thin, or the target is ignored/local-only/repo-external and cannot be represented safely in PR workflow.

## Reference Contract Summary

- URL beats cwd; owner/repo/number; cwd remote does not match; Issue comments matter.
- Manual merge only: merge actions stay outside this workflow.
- Approval-comment policy; Issue-PRs by default.
- Runtime contract language in `references/agent-runtime-contract.md`: Task Scope Contract, Context Assembly Manifest, Resume Snapshot, Control-flow ownership, tool capability boundary, task scope contract, out-of-scope diff, scope-expansion failure.
- Quality Lens Router keeps Required references; Domain gate is a lens, not a mandate.
- Wiki Context First uses `references/wiki-context-preflight.md`; Wiki Bridge uses `references/wiki-bridge.md`: `getwiki` read-only retrieval, `setwiki` approval-gated write.
- Evidence Contract in `references/evidence-contract.md`: Blocking evidence gaps, No evidence, no readiness or approval.
- Simplicity / Deletability Gate in `references/simplicity-deletability-gate.md`: small direct change first, why any proposed abstraction is necessary.
- Core Invariants Reference in `references/core-invariants.md`: Counterargument Pass, Self-created complexity is a defect, no silent fallback, raw UTF-8.
