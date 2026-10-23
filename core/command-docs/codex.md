# start

## `start` - Issue-Based Implementation

Command contract: mode `source-edit`; source edits are limited to live issue-owned scope; start publishes the issue PR via the ship procedure (`references/ship.md`) and routes cross-review through the review gate; stop on stale base, missing issue body/comments, duplicate PR, or required files outside scope.

Full procedure: `references/start-workflow.md`; delegated work only loads `templates/worker-brief.md`.

Execution contract index: target repo/base freshness, issue body+comments, base Router/Evidence, activation-bound optional gates, allowed/forbidden/inspect-only/Must not touch, one issue PR by default, hard-conflict fallback only with reason, validation/PR evidence, and blocking gaps.

# review

## `review` - Cross-Review Loop

Command contract: `github-write`, `source_edit_allowed: false`; local review results and authorized verified inline comments on the requested PR only. Compatibility change: automatic accepted-fix loops and top-level verdict/summary publication are removed; `review-fix` and summary renderer APIs remain inspect-only compatibility.

Full procedure: `references/cross-review-loop.md`; public renderer: `references/review-output-contract.md` + `references/review-comment-style.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; mandatory independent review brief: `templates/review-brief.md`.

Execution contract index:
- Resolve explicit PR/file/document/context scope and exact source/version/section; never fabricate Git/PR metadata for non-PR review.
- Require a fresh independent reviewer result and parent source/counterevidence recheck. Missing result blocks completion.
- PR only: live lifecycle/head/diff/files/checks/requirements and v3 admission/aggregate/provenance remain required. Merged emits `REVIEW_STOPPED_PR_MERGED`; uncertain lifecycle is `BLOCKED`.
- Run Wiki Context Preflight and Router/Evidence; optional gates remain activation-bound. Findings separate live evidence, wiki rationale, inference, and retrieval gaps.
- Publish only Korean two-sentence inline findings with exact anchor and body/location/URL readback; zero findings/read-only/non-PR means no writes. Keep summary/verdict in chat. No source fix, commit/push, formal approval, top-level verdict, thread reply/resolve, or CI rerun.

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

Follow `references/merge-cleanup.md`: first verify default-branch synchronization, then remove only verified merged-task local branches/worktrees and exact disposable paths. Preserve unsafe requested targets and withhold `CLEAN_DONE` while any requested target remains unresolved. Never merge pull requests, enable auto-merge, or mutate remote branches.

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
