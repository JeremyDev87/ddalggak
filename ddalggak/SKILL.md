---
name: ddalggak
description: "Use when 박정욱 invokes `/ddalggak` for the GitHub issue → plan → implementation → ship → review workflow, including plan, issue, start, ship, review, status, clean, retro, prompt, check, getwiki, and setwiki subcommands."
argument-hint: "[start|review|status|plan|issue|clean|ship|retro|prompt|check|getwiki|setwiki] — no arg = start from GitHub issue"
user-invocable: true
---

# ddalggak — 딸깍 워크플로우

딸깍은 GitHub Issue → 계획 → 병렬 구현 → 교차 리뷰 → 자가 회복 → 회고의 한 사이클이다. 이 `SKILL.md`는 항상 로드되는 thin router이며, 긴 절차·템플릿·예시는 references/templates/scripts 쪽으로 이동한다.

## 표준 워크플로우와 코드 수정 권한 (전역 invariant)

표준 사이클: `prompt` → `plan` → `start` → `ship` → `review` → `retro`. `status`, `issue`, `clean`, `check`, `getwiki`, `setwiki`는 보조 명령이다.

소스 코드(repo 내 파일, SKILL.md 포함)를 수정할 권한이 있는 서브커맨드는 `start`와 `review` 뿐이다. 다른 모든 서브커맨드는 자기 산출물 또는 GitHub 산출물만 작성한다.

<!-- ddalggak:generated:start code-permission-table -->
| 서브커맨드 | 소스 코드 수정 | 작성 가능한 산출물 |
|---|---|---|
| `start` | ✅ | worker agents may edit only files named in their brief |
| `review` | ✅ | author agents may apply accepted review fixes only |
| `status` | ❌ | response output only |
| `plan` | ❌ | response output only unless the user separately asks to write a plan document |
| `issue` | ❌ | GitHub issues only |
| `clean` | ❌ | local branch and worktree cleanup only after merge verification |
| `ship` | ❌ | commit, push, and draft PR for existing changes only |
| `retro` | ❌ | retrospective notes and memory update request artifacts only |
| `prompt` | ❌ | brief artifacts after explicit confirmation |
| `check` | ❌ | local review notes only; no repository edits |
| `getwiki` | ❌ | delegate to dedicated `/getwiki` read-only retrieval |
| `setwiki` | ❌ | delegate to dedicated `/setwiki` approval-gated write workflow |
<!-- ddalggak:generated:end code-permission-table -->

## Hot-Path Target Architecture

항상 로드되는 본문은 frontmatter, routing invariant, code modification invariant, global guardrails, subcommand dispatch table, required reference map, stop conditions, verification checklist만 담는다. 상세 절차는 reference/template/script/eval로 넘긴다.

#94 목표 예산: legacy `ddalggak/SKILL.md`는 700 lines 이하, 45,000 chars 이하를 목표로 한다. #95에서 BRIEF/REVIEW/FIX/issue 템플릿을 분리하면 더 낮춘다.

## Routing Invariant

첫 번째 whitespace-separated word만 라우팅에 사용한다.

1. 첫 단어가 지원 subcommand와 정확히 일치하면 해당 subcommand로 route한다.
2. 인수가 없으면 `start`로 route한다.
3. 첫 단어가 지원되지 않으면 `start`로 route하고 전체 인자를 start context로 취급한다.
4. Route가 결정된 뒤 후속 인자는 절대 route를 바꾸지 않는다.
5. 작업 전 정확히 한 줄 `-> <subcommand> 실행`을 출력한다.
6. 선택된 subcommand는 코드 수정 권한 표를 넘지 않는다.
7. skill/routing/subcommand/artifact 자체 변경 요청은 ddalggak subcommand 밖 일반 repo edit 요청으로 분리한다.

## 핵심 원칙

- URL beats cwd: GitHub URL 처리 기준은 owner/repo/number 파싱 후 cwd remote 검증이다. cwd remote가 URL repo와 다르면 mutation을 멈춘다.
- Issue comments matter: issue body와 comments는 모두 source-of-truth 후보이며 최신 명시 comment가 stale body보다 우선한다.
- Issue-PRs by default: 독립 이슈는 기본적으로 issue PR 하나를 만든다. hard conflict만 single PR + serial commit fallback이 가능하다.
- Manual merge only: 주인님 PR은 merge/auto-merge 금지. green + APPROVE도 ready for manual merge 보고까지만 허용한다.
- approval-comment policy: formal approval이 부적절하면 current head SHA, review scope, validation evidence, blocking finding count, conclusion을 포함한 top-level PR comment를 사용한다. Top-level APPROVE comment는 GitHub formal approval과 다르므로 `CI/check`, `formal review/branch protection`, `merge blocker`, `human action`을 분리한다.
- Runtime contract language: `references/agent-runtime-contract.md`가 Task Scope Contract, Context Assembly Manifest, Resume Snapshot, Control-flow ownership을 소유한다.
- Quality Lens Router Output: `references/quality-lens-router.md`가 Applicable gate families, Skipped gates, Required references, Repo/product conventions, backend-only skip을 소유한다. Domain gate is a lens, not a mandate.
- Wiki Context First for plan/review: `references/wiki-context-preflight.md`를 실행하고 wiki-derived claim은 source path 또는 evidence gap을 남긴다.
- Wiki Bridge: `getwiki`는 read-only retrieval, `setwiki`는 approval-gated write다. ddalggak은 `references/wiki-bridge.md`에서 admission/approval boundary만 소유하고 iCloud/QMD/wiki 상세 절차는 canonical wiki workflow로 위임한다.
- Evidence Contract: `references/evidence-contract.md` 기준이며 Blocking evidence gaps가 있으면 PR ready/APPROVE 금지다.
- Simplicity / Deletability Gate: `references/simplicity-deletability-gate.md` 기준이며 small direct change first와 why is this abstraction necessary?를 우선한다.
- Core Invariants Reference: `references/core-invariants.md`가 Counterargument Pass, scope expansion, privacy, knowledge extraction, rendered evidence, component methodology gate, raw UTF-8 같은 장문 guardrail rationale를 소유한다.
- Conditional gates: frontend, Vercel, regression-library는 해당 작업에만 관련 reference를 로드하고 backend-only/lightweight skip reason을 남긴다.

## 서브커맨드 분기

<!-- ddalggak:generated:start subcommand-table -->
| subcommand | show-doc heading | 목적 | 상세 reference rule |
|---|---|---|---|
| `start` | Start Workflow | Issue implementation from live issue body/comments; one issue PR by default | refs: `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/agent-runtime-contract.md`, `references/core-invariants.md`, `references/start-workflow.md`; templates: `templates/worker-brief.md`, `templates/conductor-state.md` |
| `review` | Cross-Review Loop | Independent current-head review and accepted fix loop | refs: `references/wiki-context-preflight.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/regression-library.md`, `references/cross-review-loop.md`; templates: `templates/review-brief.md`, `templates/fix-brief.md` |
| `status` | Status | Read-only live git/GitHub/session state snapshot | refs: `references/status.md`; templates: - |
| `plan` | Issue-Ready Plan | Issue-ready implementation plan from issue/wiki/code evidence | refs: `references/wiki-context-preflight.md`, `references/wiki-bridge.md`, `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/issue-ready-plan.md`; templates: - |
| `issue` | Plan to Issues | Create GitHub issues from an approved plan | refs: `references/plan-to-issues.md`; templates: `templates/issue-body.md`, `templates/epic-body.md` |
| `clean` | Merge Cleanup | Post-merge local cleanup after live merge evidence | refs: `references/merge-cleanup.md`; templates: - |
| `ship` | Ship | Commit/push/open draft PR for existing scoped changes | refs: `references/ship.md`; templates: - |
| `retro` | Retrospective | Extract reusable lessons after merge without transient memory | refs: `references/retrospective.md`, `references/retrospective-workflow.md`; templates: - |
| `prompt` | Prompt Optimizer | Compile safer prompt briefs without source edits | refs: `references/prompt-optimizer.md`; templates: - |
| `check` | Local Diff Check | Read-only local diff review | refs: `references/local-diff-check.md`; templates: - |
| `getwiki` | GetWiki Bridge | Wiki context retrieval bridge | refs: `references/wiki-bridge.md`; templates: - |
| `setwiki` | SetWiki Bridge | Wiki write workflow bridge | refs: `references/wiki-bridge.md`; templates: - |
<!-- ddalggak:generated:end subcommand-table -->

## Required Reference Map

`plan`, `start`, `review`는 Quality Lens Router Output으로 적용 gate와 skipped gate를 먼저 기록한다. `plan`과 `review`는 `references/wiki-context-preflight.md`를 먼저 읽고 Wiki Context Manifest를 남긴다. Wiki lookup/write admission은 `references/wiki-bridge.md`를 따른다. Evidence Contract, Simplicity / Deletability Gate, Core Invariants Reference는 readiness, code-shape, scope, privacy, knowledge-growth 판단이 있으면 필수다. Frontend/Vercel/Regression references는 조건부로만 읽고 backend-only skip reason을 남긴다.
<!-- ddalggak:generated:start required-reference-map -->
| Subcommand | Required references | Required templates |
| --- | --- | --- |
| `start` | `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/agent-runtime-contract.md`, `references/core-invariants.md`, `references/start-workflow.md` | `templates/worker-brief.md`, `templates/conductor-state.md` |
| `review` | `references/wiki-context-preflight.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/regression-library.md`, `references/cross-review-loop.md` | `templates/review-brief.md`, `templates/fix-brief.md` |
| `status` | `references/status.md` | - |
| `plan` | `references/wiki-context-preflight.md`, `references/wiki-bridge.md`, `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/issue-ready-plan.md` | - |
| `issue` | `references/plan-to-issues.md` | `templates/issue-body.md`, `templates/epic-body.md` |
| `clean` | `references/merge-cleanup.md` | - |
| `ship` | `references/ship.md` | - |
| `retro` | `references/retrospective.md`, `references/retrospective-workflow.md` | - |
| `prompt` | `references/prompt-optimizer.md` | - |
| `check` | `references/local-diff-check.md` | - |
| `getwiki` | `references/wiki-bridge.md` | - |
| `setwiki` | `references/wiki-bridge.md` | - |
<!-- ddalggak:generated:end required-reference-map -->

## Start Workflow

Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.

Execution contract index:
- Source: issue body/comments, URL beats cwd, base freshness first.
- Gates: Quality Lens Router, Evidence Contract, Simplicity / Deletability, Core Invariants; frontend/vercel/regression only when applicable.
- Scope: allowed, forbidden, inspect-only, Must not touch, and one issue PR by default; hard-conflict fallback only with reason.
- Output: `ISSUE_PR_READY` or `LANE_READY` with commit/push/PR/evidence/blocking gaps.

---

## Cross-Review Loop

Full procedure: `references/cross-review-loop.md`; reusable prompt: `templates/review-brief.md`.

Execution contract index:
- Re-read live PR state, diff/files/checks, linked issue, current head SHA, and wiki-context preflight.
- Apply Quality Lens Router, Evidence Contract, Simplicity / Deletability, Core Invariants, and conditional frontend/vercel/regression gates.
- Findings must separate live evidence, wiki-strengthened rationale, non-wiki inference, and retrieval gaps.
- If formal approval is inappropriate, use a top-level comment with SHA, scope, validation, blocker count, and conclusion.

---

## Status

Full procedure: `references/status.md`.

Read-only snapshot: fetch/prune, status, branch/upstream, worktrees, open PRs, linked issues, checks, blockers, session state, and next action. No source edits.

---

## Issue-Ready Plan

Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`.

Execution contract index:
- Identify Goal, Source Of Truth, Non-Goals, Context Recovery Anchors, Assumptions/Unknowns.
- Include Wiki Context Manifest, Quality Lens Router Output, Evidence Contract, Counterargument Pass, and Simplicity / Deletability Gate.
- Add Frontend/Vercel/Regression details only when applicable, with skip or lightweight reason otherwise.
- Plan Issue-PR Strategy: one PR per issue by default, conflict fallback only with proof, Parallelization Decision, Must not touch, evidence, commit message.

---

## Plan to Issues

Full procedure: `references/plan-to-issues.md`; reusable prompts: `templates/issue-body.md`, `templates/epic-body.md`.

Each generated issue body must preserve Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, and Dependencies / blocked by. Use raw UTF-8 GitHub title/body payloads and verify no literal Unicode escapes persisted.

---

## Merge Cleanup

Full procedure: `references/merge-cleanup.md`.

Verify merge evidence first, then clean only matching branches/worktrees/artifacts. Never delete dirty or ambiguous worktrees. Never merge or enable auto-merge.

---

## Ship

Full procedure: `references/ship.md`.

Validate current changes, preserve What/Why in Korean commit and PR body, open draft PR, and never merge. Use `Closes #N` only for full completion; otherwise `Refs #N`.

---

## Local Diff Check

Full procedure: `references/local-diff-check.md`.

Read-only local diff review. No GitHub comments and no source edits. Report Critical/High/Medium/Low with concrete suggestions.

---

## Retrospective

Full procedure: `references/retrospective.md`.

Separate durable reusable knowledge from incident records. Use `references/wiki-bridge.md` for setwiki admission: default review-only, explicit approval before wiki write. PR numbers, commit SHAs, and single-session completion logs are not durable reusable knowledge unless generalized into harness-engineering/*, principles/*, frontend/*, or llm-wiki/* patterns.

---

## Prompt Optimizer

Full procedure: `references/prompt-optimizer.md`.

Prompt Safety / Brief Compiler compact index: Prompt Audit, `prompt grill-me`, Unsafe Prompt Gate.

Judgement labels: `READY_FOR_BRIEF | NEEDS_CLARIFICATION | BLOCKED_UNSAFE | DISCOVERY_ONLY`.

Preserve `source_edit_allowed: false`; compile brief/review/fix artifacts only, and end with `PROMPT_DONE`.

---

## GetWiki Bridge

Full procedure: `references/wiki-bridge.md`.

Delegate to dedicated `/getwiki` for read-only retrieval. Preserve source paths or retrieval gaps; do not mutate wiki files.

---

## SetWiki Bridge

Full procedure: `references/wiki-bridge.md`.

Delegate to dedicated `/setwiki` for approval-gated write workflow. Require explicit approval before wiki mutation; do not inline iCloud/QMD mechanics.

---

## Conductor State File

Template: `templates/conductor-state.md`. Store phase, issue/PR/branch/worktree, validation evidence, blocking gaps, waiting-on state, and next gate before idle waits or compact boundaries.

## Context 관리 — Compact 실행 포인트

Full procedure: `references/context-compact.md`. Save state before compact or long waits.

## Wake/Resume 프로토콜

Full procedure: `references/wake-resume.md`. Resume from state, then re-read live GitHub/local state before acting.

## 공통 규칙

Full procedure: `references/common-rules.md`. Korean by default, no AI trailer, no secrets, no auto-merge, no unsafe force push, exact validation evidence.

## 실패 모드 예방

Full procedure: `references/failure-prevention.md`. Prevent stale repo judgments, external dependency hallucination, ignored/local-only PR inclusion, missing handoff evidence, duplicate PRs, and Markdown surgery regressions.

## Verification Checklist

Full procedure: `references/verification-checklist.md`. Verify base freshness, issue body+comments, file tracking/local-only status, validation evidence, reviewer isolation, and Markdown fence integrity.

## 명명 규칙

Full procedure: `references/naming-rules.md`. Branches are purpose-centered; completion signals distinguish ISSUE_PR_READY, LANE_READY, REVIEW DONE, FIX DONE, and REBASE DONE.
