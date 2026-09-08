# start

## Start Workflow

Command contract: mode `source-edit`; source edits are limited to live issue-owned scope; start publishes the issue PR via the ship procedure (`references/ship.md`) and routes cross-review through the review gate; stop on stale base, missing issue body/comments, duplicate PR, or required files outside scope.

Full procedure: `references/start-workflow.md`; delegated-work만 `templates/worker-brief.md`를 로드한다.

Execution contract index:
- Source: issue body/comments, URL beats cwd, base freshness first.
- Gates: Router/Evidence는 base; 나머지는 activation map을 따른다.
- Scope: allowed, forbidden, inspect-only, Must not touch, and one issue PR by default; hard-conflict fallback only with reason.
- Output: `ISSUE_PR_READY` or `LANE_READY` with commit/push/PR/evidence/blocking gaps.

---

# review

## Cross-Review Loop

Command contract: mode `review-fix`; source edits are allowed only for accepted Critical/High blockers; top-level review comments are allowed; stop before APPROVE when current-head CI/checks are not terminal, blockers remain, or evidence/wiki preflight has blocking gaps.

Full procedure: `references/cross-review-loop.md`; public renderer: `references/review-output-contract.md` + `references/review-comment-style.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; delegated-review만 `templates/review-brief.md`를 로드한다.

Execution contract index:
- Re-read live PR state, diff/files/checks, linked issue, current head SHA, and wiki-context preflight.
- Gates: Router/Evidence는 base; 나머지는 activation evidence applies일 때만 로드한다.
- Findings must separate live evidence, wiki-strengthened rationale, non-wiki inference, and retrieval gaps.
- Run admission schema v3 and the finding signal gate first (`references/cross-review-loop.md`): only conductor-promoted admitted findings become inline comments in one `COMMENT`-event batch; each finding is rendered from its aggregate-member canonical candidate, filtered Low/nit notes stay internal, and the top-level body is the deterministic fixed summary. A zero-finding review with substantive validation evidence is valid.

---

# status

## Status

Full procedure: `references/status.md`.

Read-only snapshot: fetch/prune, status, branch/upstream, worktrees, open PRs, linked issues, checks, blockers, session state, and next action. No source edits.

---

# plan

## Issue-Ready Plan

Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Execution contract index:
- Identify Goal, Source Of Truth, Non-Goals, Context Recovery Anchors, Assumptions/Unknowns.
- Provide the Wiki Context Manifest, Router Output, and Evidence Contract; all other gates follow when activation evidence applies.
- Add Frontend/Vercel/Regression details only when applicable, plus React code quality details only when applicable, with skip or lightweight reason otherwise.
- Plan Issue-PR Strategy: one PR per issue by default, conflict fallback only with proof, Parallelization Decision, Must not touch, evidence, commit message.

---

# issue

## Plan to Issues

Full procedure: `references/plan-to-issues.md`; reusable prompts: `templates/issue-body.md`, `templates/epic-body.md`.

Each generated issue body must preserve Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, and Dependencies / blocked by. Use raw UTF-8 GitHub title/body payloads and verify no literal Unicode escapes persisted.

---

# clean

## Merge Cleanup

Full procedure: `references/merge-cleanup.md`.

Verify merge evidence first, then clean only matching branches/worktrees/artifacts. Never delete dirty or ambiguous worktrees. Never merge or enable auto-merge.

---

# ship

## Ship

Full procedure: `references/ship.md`.

Validate current changes, preserve What/Why in Korean commit and PR body, open draft PR, and never merge. Use `Closes #N` only for full completion; otherwise `Refs #N`.

---

# retro

## Retrospective

Full procedure: `references/retrospective.md`.

Separate durable reusable knowledge from incident records. Use `references/wiki-bridge.md` for setwiki admission: default review-only, explicit approval before wiki write. PR numbers, commit SHAs, and single-session completion logs are not durable reusable knowledge unless generalized into harness-engineering/*, principles/*, frontend/*, or llm-wiki/* patterns.

---

# prompt

## Prompt Optimizer

Full procedure: `references/prompt-optimizer.md`.

Prompt Safety / Brief Compiler compact index: Prompt Audit, `prompt grill-me`, Unsafe Prompt Gate.

Judgement labels: `READY_FOR_BRIEF | NEEDS_CLARIFICATION | BLOCKED_UNSAFE | DISCOVERY_ONLY`.

Preserve `source_edit_allowed: false`; compile brief/review/fix artifacts only, and end with `PROMPT_DONE`.

---

# tune

## Tune Goal Brief

Full procedure: `references/tune-goal.md`; source-grounded goal brief with scope, non-goals, assumptions, open questions, validation surfaces, and no source edits.

# forge

## Forge Acceptance Criteria

Full procedure: `references/forge-goal.md`; objective command/observation plus expected-result acceptance criteria, with no source edits.

# spark

## Spark Runtime Goal

Full procedure: `references/spark-goal.md`; copyable runtime goal sentence, validation checklist, non-goals, next instruction, and no source edits.

# check

## Local Diff Check

Full procedure: `references/local-diff-check.md`.

Read-only local diff review. No GitHub comments and no source edits. Report Critical/High/Medium/Low with concrete suggestions.

---

# getwiki

## GetWiki Bridge

Full procedure: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Delegate to dedicated `/getwiki` for read-only retrieval. Preserve source paths or retrieval gaps; do not mutate wiki files.

---

# setwiki

## SetWiki Bridge

Full procedure: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Delegate to dedicated `/setwiki` for approval-gated write workflow. Require explicit approval before wiki mutation; do not inline iCloud/QMD mechanics.

---

# ulw-loop

## ULW Loop

Full procedure: `references/ulw-loop.md`; `source_edit_allowed: true`; `github_write_allowed: false`; `ULW_LOOP_DONE`.

# ulw-plan

## ULW Plan

Full procedure: `references/ulw-plan.md`; `source_edit_allowed: false`; `ULW_PLAN_DONE`.

# ulw-research

## ULW Research

Full procedure: `references/ulw-research.md`; `source_edit_allowed: false`; `ULW_RESEARCH_DONE`.

# gjc-plan

## Gajae-Code Delegation

Full procedure: `references/gajae-code.md`; `gjc_delegate_plan`; `gjc_delegate_execute`; `gjc_delegate_team`; `allow_mutation: false`; explicit user approval; external GJC visible-session helpers; `GJC_PLAN_DONE`; `GJC_EXECUTE_DONE`; `GJC_TEAM_DONE`.

# gjc-execute

## Gajae-Code Delegation

Full procedure: `references/gajae-code.md`; `gjc_delegate_plan`; `gjc_delegate_execute`; `gjc_delegate_team`; `allow_mutation: false`; explicit user approval; external GJC visible-session helpers; `GJC_PLAN_DONE`; `GJC_EXECUTE_DONE`; `GJC_TEAM_DONE`.

# gjc-team

## Gajae-Code Delegation

Full procedure: `references/gajae-code.md`; `gjc_delegate_plan`; `gjc_delegate_execute`; `gjc_delegate_team`; `allow_mutation: false`; explicit user approval; external GJC visible-session helpers; `GJC_PLAN_DONE`; `GJC_EXECUTE_DONE`; `GJC_TEAM_DONE`.
