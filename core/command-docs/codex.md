# start

## `start` - Issue-Based Implementation

Command contract: mode `source-edit`; source edits are limited to live issue-owned scope; start publishes the issue PR via the ship procedure (`references/ship.md`) and routes cross-review through the review gate; stop on stale base, missing issue body/comments, duplicate PR, or required files outside scope.

Full procedure: `references/start-workflow.md`; delegated work only loads `templates/worker-brief.md`.

Execution contract index: target repo/base freshness, issue body+comments, base Router/Evidence, activation-bound optional gates, allowed/forbidden/inspect-only/Must not touch, one issue PR by default, hard-conflict fallback only with reason, validation/PR evidence, and blocking gaps.

# review

## `review` - Cross-Review Loop

Command contract: mode `review-fix`; source edits are allowed only for accepted Critical/High blockers; top-level review comments are allowed; stop before APPROVE when current-head CI/checks are not terminal, blockers remain, or evidence/wiki preflight has blocking gaps.

Full procedure: `references/cross-review-loop.md`; public renderer: `references/review-output-contract.md` + `references/review-comment-style.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; delegated review only loads `templates/review-brief.md`.

Execution contract index: live PR/diff/files/checks/issue/head SHA, Wiki Context Preflight, base Router/Evidence, activation-bound optional gates, Admission schema v3, candidate disposition, lifecycle aggregate, publication authority, canonical-candidate-bound two-sentence findings, deterministic fixed summary, zero-finding substantive validation, and a top-level conclusion comment when formal approval is inappropriate.

# status

## `status` - Current State Snapshot

Read `.ddalggak/session-state.json` if present, then inspect live git/GitHub state. Report phase, lane states, branches, PRs, blockers, base freshness, and next action. Do not edit files.

# plan

## `plan` - Issue-Ready Plan

Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Execution contract index: source of truth, non-goals, context anchors, assumptions/unknowns, work inventory, ownership, forbidden/inspect-only files, base Router/Evidence, activation-bound optional gates, one issue PR by default, conflict fallback only with proof, Parallelization Decision, Must not touch, evidence/validation, and commit message.

# issue

## `issue` - Plan To GitHub Issues

Convert a plan into GitHub issues without editing repository files. Preserve Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, and Dependencies / blocked by.

Issue titles and bodies must be submitted as raw UTF-8, not JSON-escaped text. Before any `gh issue create` or `gh issue edit`, reject or decode titles/bodies containing literal Unicode escapes such as `\\uD558` / `\\ud558`; do not persist those escape sequences to GitHub. Prefer `--body-file` for Markdown bodies, and for non-ASCII titles prefer a UTF-8 REST payload written with `json.dumps(..., ensure_ascii=False)` via `gh api --input`. After creation, re-read `gh issue view --json title,body,url` and verify the live title contains Korean characters, not literal `\\uXXXX` sequences.

# clean

## `clean` - Post-Merge Cleanup

Verify live PR merge evidence first, fetch, inspect dirty state, then clean only safe local branches/worktrees/state artifacts. Stop on uncommitted work or contradictory live state.

# ship

## `ship` - Publish Current Lane

Ship only existing changes. Confirm scope, re-read issue context, fetch, validate, locally review where feasible, stage intended files, commit with What and Why, push, open a draft PR, verify PR existence, and keep it draft until current-head checks and review evidence support ready for manual merge.

# retro

## `retro` - Retrospective

After merge, summarize the cycle and extract reusable lessons without storing transient PR numbers or commit SHAs as memory. Use `references/wiki-bridge.md` for setwiki admission: default review-only, explicit approval before wiki write. Use references/retrospective-workflow.md for low-frequency details.

# prompt

## `prompt` - Prompt Optimizer

Prompt Safety / Brief Compiler compact index: Prompt Audit, `prompt grill-me`, Unsafe Prompt Gate.

Judgement labels: `READY_FOR_BRIEF | NEEDS_CLARIFICATION | BLOCKED_UNSAFE | DISCOVERY_ONLY`.

Preserve `source_edit_allowed: false`; compile brief/review/fix artifacts only, and end with `PROMPT_DONE`.

# tune

## `tune` - Tune Goal Brief

Full procedure: `references/tune-goal.md`; source-grounded goal brief with scope, non-goals, assumptions, open questions, validation surfaces, and no source edits.

# forge

## `forge` - Forge Acceptance Criteria

Full procedure: `references/forge-goal.md`; objective command/observation plus expected-result acceptance criteria, with no source edits.

# spark

## `spark` - Spark Runtime Goal

Full procedure: `references/spark-goal.md`; copyable runtime goal sentence, validation checklist, non-goals, next instruction, and no source edits.

# check

## `check` - Local Diff Check

Run a read-only local diff review. Capture base freshness, status, diff stat, ignored/local-only/generated paths, and findings. Use references/local-diff-check.md for details.

# getwiki

## GetWiki Bridge

Full procedure: `references/wiki-bridge.md`. Delegate to dedicated `/getwiki` for read-only retrieval. Preserve source paths or retrieval gaps; do not mutate wiki files.

# setwiki

## SetWiki Bridge

Full procedure: `references/wiki-bridge.md`. Delegate to dedicated `/setwiki` for approval-gated write workflow. Require explicit approval before wiki mutation; do not inline iCloud/QMD mechanics.

# ulw-loop

## `ulw-loop` - ULW Loop

Full procedure: `references/ulw-loop.md`; `source_edit_allowed: true`; `github_write_allowed: false`; `ULW_LOOP_DONE`.

# ulw-plan

## `ulw-plan` - ULW Plan

Full procedure: `references/ulw-plan.md`; `source_edit_allowed: false`; `ULW_PLAN_DONE`.

# ulw-research

## `ulw-research` - ULW Research

Full procedure: `references/ulw-research.md`; `source_edit_allowed: false`; `ULW_RESEARCH_DONE`.

# gjc-plan

## `gjc-plan` / `gjc-execute` / `gjc-team` - Gajae-Code Delegation

Full procedure: `references/gajae-code.md`; `gjc_delegate_plan`; `gjc_delegate_execute`; `gjc_delegate_team`; `allow_mutation: false`; explicit user approval; external GJC visible-session helpers; `GJC_PLAN_DONE`; `GJC_EXECUTE_DONE`; `GJC_TEAM_DONE`.

# gjc-execute

## `gjc-plan` / `gjc-execute` / `gjc-team` - Gajae-Code Delegation

Full procedure: `references/gajae-code.md`; `gjc_delegate_plan`; `gjc_delegate_execute`; `gjc_delegate_team`; `allow_mutation: false`; explicit user approval; external GJC visible-session helpers; `GJC_PLAN_DONE`; `GJC_EXECUTE_DONE`; `GJC_TEAM_DONE`.

# gjc-team

## `gjc-plan` / `gjc-execute` / `gjc-team` - Gajae-Code Delegation

Full procedure: `references/gajae-code.md`; `gjc_delegate_plan`; `gjc_delegate_execute`; `gjc_delegate_team`; `allow_mutation: false`; explicit user approval; external GJC visible-session helpers; `GJC_PLAN_DONE`; `GJC_EXECUTE_DONE`; `GJC_TEAM_DONE`.
