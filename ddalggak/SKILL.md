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

현재 hot-path 목표는 line-count 자체가 아니라 subcommand별 Mode / Source edit / GitHub-write side effects / Required references / Stop condition을 한눈에 확인하게 하는 것이다. 상세 절차와 예시는 계속 references/templates/scripts에 둔다.

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
- React Code Quality Harness: React/Next.js 코드 품질, AI-generated React diff, component/hook/state/fallback/rendering boundary가 걸리면 Quality Lens Router에서 `react-code-quality-harness`를 적용하고 `references/react-code-quality-harness.md`의 packaged SSOT를 읽는다. Gate 조건은 hot path에 복사하지 않는다.
- Wiki Context First for plan/review: `references/wiki-context-preflight.md`를 실행하고 wiki-derived claim은 source path 또는 evidence gap을 남긴다. After Brain v0 migration/hardening, also apply `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`: broad `qmd://wiki` is discovery only; current-answer claims route through Brain P0/P1/domain/SSOT/control docs; raw/imported/hidden/index/log/redirect alias hits are evidence-only unless canonical/distilled.
- Wiki Bridge: `getwiki`는 read-only retrieval, `setwiki`는 approval-gated write다. ddalggak은 `references/wiki-bridge.md`에서 admission/approval boundary만 소유하고 iCloud/QMD/wiki 상세 절차는 canonical wiki workflow로 위임한다.
- Evidence Contract: `references/evidence-contract.md` 기준이며 Blocking evidence gaps가 있으면 PR ready/APPROVE 금지다.
- Simplicity / Deletability Gate: `references/simplicity-deletability-gate.md` 기준이며 small direct change first와 why is this abstraction necessary?를 우선한다.
- Core Invariants Reference: `references/core-invariants.md`가 Counterargument Pass, scope expansion, privacy, knowledge extraction, rendered evidence, component methodology gate, raw UTF-8 같은 장문 guardrail rationale를 소유한다.
- Conditional gates: frontend, React code quality, Vercel, regression-library는 해당 작업에만 관련 reference를 로드하고 backend-only/lightweight skip reason을 남긴다.

## 서브커맨드 분기

<!-- ddalggak:generated:start subcommand-table -->
| subcommand | mode | show-doc heading | 목적 | side effects | stop condition | 상세 reference rule |
|---|---|---|---|---|---|---|
| `start` | source-edit | Start Workflow | Issue implementation from live issue body/comments; one issue PR by default | Repo source edits in issue scope; PR/comment side effects only through ship/review gates. | Stop on stale base, missing issue body/comments, duplicate PR, or required files outside the issue-owned scope. | refs: `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/agent-runtime-contract.md`, `references/core-invariants.md`, `references/start-workflow.md`; templates: `templates/worker-brief.md`, `templates/conductor-state.md`, `templates/lane-state.md` |
| `review` | review-fix | Cross-Review Loop | Independent current-head review and accepted fix loop | Top-level review comment; accepted Critical/High fixes may edit source and push to the reviewed PR branch. | Stop before APPROVE if current-head CI is not terminal green/skipped, blockers remain, or wiki/evidence preflight has blocking gaps. | refs: `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/regression-library.md`, `references/cross-review-loop.md`, `references/security-posture-gate.md`; templates: `templates/review-brief.md`, `templates/fix-brief.md` |
| `status` | read-only | Status | Read-only live git/GitHub/session state snapshot | No source, GitHub, or local cleanup mutation; report live git/GitHub/session state only. | Stop after a live state snapshot and next-action recommendation. | refs: `references/status.md`; templates: - |
| `plan` | plan-only | Issue-Ready Plan | Issue-ready implementation plan from issue/wiki/code evidence | No source edits; no GitHub writes unless the user separately requests issue creation. | Stop after an issue-ready plan with evidence/unknowns and PR topology. | refs: `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/wiki-bridge.md`, `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/issue-ready-plan.md`; templates: - |
| `issue` | github-write | Plan to Issues | Create GitHub issues from an approved plan | Create/edit GitHub issues and comments only; no repository source edits. | Stop after live issue URLs/labels/assignees/body UTF-8 verification or on metadata permission failure. | refs: `references/plan-to-issues.md`; templates: `templates/issue-body.md`, `templates/epic-body.md` |
| `clean` | local-destructive | Merge Cleanup | Post-merge local cleanup after live merge evidence | Local branch/worktree cleanup only after live merge evidence; no GitHub mutation. | Stop on dirty, ambiguous, unmerged, or non-ancestor worktrees/branches. | refs: `references/merge-cleanup.md`; templates: - |
| `ship` | github-write | Ship | Commit/push/open draft PR for existing scoped changes | Commit, push, and draft PR for already-existing scoped changes; no new source edits. | Stop after PR creation/current-head publication evidence or on no-diff/scope/validation blocker. | refs: `references/ship.md`; templates: - |
| `retro` | read-only | Retrospective | Extract reusable lessons after merge without transient memory | Repo-external writes only: the retrospective note under ~/workspace/retrospective/ (or the RETRO_DIR override) and memory files or memory-update request artifacts; skill/wiki changes stay proposal-only (wiki via the approval-gated setwiki bridge); no writes to any path inside the repository. | Stop after reusable lessons are separated from transient incident records. | refs: `references/retrospective.md`, `references/retrospective-workflow.md`, `references/wiki-growth-triage.md`; templates: - |
| `prompt` | plan-only | Prompt Optimizer | Compile safer prompt briefs without source edits | Brief/review/fix artifacts only after explicit confirmation; no canonical source edits. | Stop with READY_FOR_BRIEF, NEEDS_CLARIFICATION, BLOCKED_UNSAFE, or DISCOVERY_ONLY. | refs: `references/prompt-optimizer.md`, `references/prompt-skill-optimization-staging.md`; templates: - |
| `check` | read-only | Local Diff Check | Read-only local diff review | Local diff review notes only; no GitHub comments and no repository edits. | Stop after findings and exact validation gaps are reported. | refs: `references/local-diff-check.md`; templates: - |
| `getwiki` | read-only | GetWiki Bridge | Wiki context retrieval bridge | Delegate to dedicated /getwiki retrieval; no wiki or repo mutation. | Stop after cited wiki sources or retrieval gaps are reported. | refs: `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; templates: - |
| `setwiki` | approval-gated-write | SetWiki Bridge | Wiki write workflow bridge | Delegate to dedicated /setwiki; wiki writes require explicit approval and verification. | Stop at review-only plan unless explicit approval is present; then stop after wiki write verification. | refs: `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/wiki-growth-triage.md`; templates: - |
<!-- ddalggak:generated:end subcommand-table -->

### mode 분류 정의

| mode | 정의 |
|---|---|
| `source-edit` | issue scope 안에서 repo 소스 수정 가능. |
| `review-fix` | 수용된 리뷰 수정에 한해 소스 수정과 리뷰 대상 PR 브랜치 push 가능. |
| `plan-only` | 계획/브리프 산출물만 생성. 소스·GitHub·로컬 git 상태 무변경. |
| `read-only` | 보고만 한다. 소스·GitHub·로컬 git 상태 무변경. |
| `local-destructive` | repo 소스/GitHub 무변경. 단, 로컬 git 상태(merge 검증된 브랜치/worktree)를 삭제할 수 있다. |
| `github-write` | GitHub artifact(issue/PR/comment) 생성·수정. repo 소스 무변경. |
| `approval-gated-write` | 명시적 승인 후에만 외부(wiki) write. 승인 전에는 review-only. |

## Required Reference Map

`plan`, `start`, `review`는 Quality Lens Router Output으로 적용 gate와 skipped gate를 먼저 기록한다. `plan`과 `review`는 `references/wiki-context-preflight.md`를 먼저 읽고 Wiki Context Manifest를 남긴다. Wiki lookup/write admission은 `references/wiki-bridge.md`를 따른다. Evidence Contract, Simplicity / Deletability Gate, Core Invariants Reference는 readiness, code-shape, scope, privacy, knowledge-growth 판단이 있으면 필수다. Frontend/Vercel/Regression references는 조건부로만 읽고 backend-only skip reason을 남긴다.
<!-- ddalggak:generated:start required-reference-map -->
| Subcommand | Workflow reference | Gate references | Wiki/meta references | Required templates |
| --- | --- | --- | --- | --- |
| `start` | `references/agent-runtime-contract.md`, `references/start-workflow.md` | `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md` | `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | `templates/worker-brief.md`, `templates/conductor-state.md`, `templates/lane-state.md` |
| `review` | `references/cross-review-loop.md`, `references/security-posture-gate.md` | `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`, `references/regression-library.md` | `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | `templates/review-brief.md`, `templates/fix-brief.md` |
| `status` | `references/status.md` | - | - | - |
| `plan` | `references/issue-ready-plan.md` | `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md` | `references/wiki-context-preflight.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`, `references/wiki-bridge.md` | - |
| `issue` | `references/plan-to-issues.md` | - | - | `templates/issue-body.md`, `templates/epic-body.md` |
| `clean` | `references/merge-cleanup.md` | - | - | - |
| `ship` | `references/ship.md` | - | - | - |
| `retro` | `references/retrospective.md`, `references/retrospective-workflow.md`, `references/wiki-growth-triage.md` | - | - | - |
| `prompt` | `references/prompt-optimizer.md`, `references/prompt-skill-optimization-staging.md` | - | - | - |
| `check` | `references/local-diff-check.md` | - | - | - |
| `getwiki` | - | - | `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | - |
| `setwiki` | `references/wiki-growth-triage.md` | - | `references/wiki-bridge.md`, `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md` | - |
<!-- ddalggak:generated:end required-reference-map -->

## Start Workflow

Command contract: mode `source-edit`; source edits are limited to live issue-owned scope; GitHub side effects happen only through ship/review gates; stop on stale base, missing issue body/comments, duplicate PR, or required files outside scope.

Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.

Execution contract index:
- Source: issue body/comments, URL beats cwd, base freshness first.
- Gates: Quality Lens Router, Evidence Contract, Simplicity / Deletability, Core Invariants; frontend/vercel/regression only when applicable; React code quality only when applicable.
- Scope: allowed, forbidden, inspect-only, Must not touch, and one issue PR by default; hard-conflict fallback only with reason.
- Output: `ISSUE_PR_READY` or `LANE_READY` with commit/push/PR/evidence/blocking gaps.

---

## Cross-Review Loop

Command contract: mode `review-fix`; source edits are allowed only for accepted Critical/High blockers; top-level review comments are allowed; stop before APPROVE when current-head CI/checks are not terminal, blockers remain, or evidence/wiki preflight has blocking gaps.

Full procedure: `references/cross-review-loop.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; reusable prompt: `templates/review-brief.md`.

Execution contract index:
- Re-read live PR state, diff/files/checks, linked issue, current head SHA, and wiki-context preflight.
- Apply Quality Lens Router, Evidence Contract, Simplicity / Deletability, Core Invariants, and conditional frontend/vercel/regression gates, and React code quality gates when applicable.
- Findings must separate live evidence, wiki-strengthened rationale, non-wiki inference, and retrieval gaps.
- If formal approval is inappropriate, use a top-level comment with SHA, scope, validation, blocker count, and conclusion.

---

## Status

Full procedure: `references/status.md`.

Read-only snapshot: fetch/prune, status, branch/upstream, worktrees, open PRs, linked issues, checks, blockers, session state, and next action. No source edits.

---

## Issue-Ready Plan

Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Execution contract index:
- Identify Goal, Source Of Truth, Non-Goals, Context Recovery Anchors, Assumptions/Unknowns.
- Include Wiki Context Manifest, Quality Lens Router Output, Evidence Contract, Counterargument Pass, and Simplicity / Deletability Gate.
- Add Frontend/Vercel/Regression details only when applicable, plus React code quality details only when applicable, with skip or lightweight reason otherwise.
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

Full procedure: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Delegate to dedicated `/getwiki` for read-only retrieval. Preserve source paths or retrieval gaps; do not mutate wiki files.

---

## SetWiki Bridge

Full procedure: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

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
