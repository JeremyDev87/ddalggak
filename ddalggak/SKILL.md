---
name: ddalggak
description: "Use when 박정욱 invokes `/ddalggak` for the GitHub issue → plan → implementation → ship → review workflow, including plan, issue, start, ship, review, status, clean, retro, prompt, and check subcommands."
argument-hint: "[start|review|status|plan|issue|clean|ship|retro|prompt|check] — no arg = start from GitHub issue"
user-invocable: true
---

# ddalggak — 딸깍 워크플로우

딸깍은 GitHub Issue → 계획 → 병렬 구현 → 교차 리뷰 → 자가 회복 → 회고의 한 사이클이다. 이 `SKILL.md`는 항상 로드되는 thin router이며, 긴 절차·템플릿·예시는 references/templates/scripts 쪽으로 이동한다.

## 표준 워크플로우와 코드 수정 권한 (전역 invariant)

표준 사이클: `prompt` → `plan` → `start` → `ship` → `review` → `retro`. `status`, `issue`, `clean`, `check`는 보조 명령이다.

소스 코드(repo 내 파일, SKILL.md 포함)를 수정할 권한이 있는 서브커맨드는 `start`와 `review` 뿐이다. 다른 모든 서브커맨드는 자기 산출물 또는 GitHub 산출물만 작성한다.

| 서브커맨드 | 소스 코드 수정 | 작성 가능한 산출물 |
|---|---|---|
| `start` | ✅ | worker가 brief에 명시된 파일만 수정 |
| `review` | ✅ | accepted Critical/High 리뷰 수정만 적용 |
| `prompt` | ❌ | brief/review/fix 산출물 |
| `plan` | ❌ | 응답 또는 별도 요청된 계획 문서 |
| `issue` | ❌ | GitHub issues |
| `status` | ❌ | 상태 보고 |
| `ship` | ❌ | 기존 변경의 commit/push/draft PR |
| `clean` | ❌ | merge 확인 후 local cleanup |
| `retro` | ❌ | 회고 산출물 |
| `check` | ❌ | read-only local review |

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
- Evidence Contract: `references/evidence-contract.md` 기준이며 Blocking evidence gaps가 있으면 PR ready/APPROVE 금지다.
- Simplicity / Deletability Gate: `references/simplicity-deletability-gate.md` 기준이며 small direct change first와 why is this abstraction necessary?를 우선한다.
- Core Invariants Reference: `references/core-invariants.md`가 Counterargument Pass, scope expansion, privacy, knowledge extraction, rendered evidence, component methodology gate, raw UTF-8 같은 장문 guardrail rationale를 소유한다.
- Conditional gates: frontend, Vercel, regression-library는 해당 작업에만 관련 reference를 로드하고 backend-only/lightweight skip reason을 남긴다.

## 서브커맨드 분기

| subcommand | show-doc heading | 목적 | 상세 reference rule |
|---|---|---|---|
| `start` | Start Workflow | 구현 시작 | Quality Lens Router, Evidence Contract, Simplicity / Deletability Gate, Agent Runtime Contract, conditional frontend/vercel/regression references |
| `review` | Cross-Review Loop | 독립 리뷰 | Wiki Context Preflight, Evidence Contract, Simplicity / Deletability Gate, regression-library, optional frontend/vercel gates |
| `status` | Status | 상태 점검 | live git/GitHub + .ddalggak/session-state.json |
| `plan` | Issue-Ready Plan | 구현 계획 | Wiki Context Preflight, Quality Lens Router, Evidence Contract, Simplicity / Deletability Gate; conditional design/deploy/regression references |
| `issue` | Plan to Issues | 이슈 생성 | plan body fields only |
| `clean` | Merge Cleanup | merge 후 정리 | live PR merge evidence |
| `ship` | Ship | 커밋/푸시/초안 PR | issue context + validation + local review |
| `check` | Local Diff Check | read-only diff review | references/local-diff-check.md |
| `retro` | Retrospective | 회고 | references/retrospective-workflow.md |
| `prompt` | Prompt Optimizer | brief 개선 | source edit 금지 |

## Required Reference Map

`plan`, `start`, `review`는 Quality Lens Router Output으로 적용 gate와 skipped gate를 먼저 기록한다. `plan`과 `review`는 `references/wiki-context-preflight.md`를 먼저 읽고 Wiki Context Manifest를 남긴다. Evidence Contract, Simplicity / Deletability Gate, Core Invariants Reference는 readiness, code-shape, scope, privacy, knowledge-growth 판단이 있으면 필수다. Frontend/Vercel/Regression references는 조건부로만 읽고 backend-only skip reason을 남긴다.

## Start Workflow

Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.

This `start` show-doc surface intentionally keeps the executable contract compact while the detailed BRIEF/template flow lives in references/templates. Required anchors remain visible for CLI dispatch and verifier parity.

### Quality Lens Router Output
- Applicable gate families: derive from issue body/comments and changed files.
- Skipped gates: record backend-only skip or other non-applicable domains.
- Required references: `references/quality-lens-router.md`, `references/evidence-contract.md`, `references/simplicity-deletability-gate.md`, `references/core-invariants.md`; add `references/frontend-design-gate.md`, `references/vercel-agent-skills-gates.md`, or `references/regression-library.md` only when applicable and 유용한 범위에서 class-level risk가 있다.

### Evidence Contract
- Required evidence: issue acceptance criteria, validation commands, PR URL/evidence, and any UI/API/security evidence that applies.
- Blocking evidence gaps: no required evidence means no PR ready/APPROVE.

### Simplicity / Deletability Gate
- Default: small direct change first.
- Any helper/module/provider/wrapper/fallback must answer why is this abstraction necessary? and prove boundary/reuse value.

### Frontend Design Gate
- For UI/frontend work only: aesthetic direction, screenshot/viewport/manual evidence, generic AI UI avoided, one-off abstraction avoided.

### Vercel Agent Skills Gate
- For React/Vercel/mobile/motion work only: server/client boundary, token source without printing secrets, preview-first, component API quality, animation meaning.

### Issue-PR Strategy with Conflict Fallback
- Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it.
- Parallelization Decision must classify independent issue PRs, conflict fallback serial commits, and blocked lanes.
- Integration commit evidence is required for fallback lanes.
- PR CREATE — 독립 이슈는 기본 생성; hard-conflict fallback만 lane patch/commit handoff를 사용한다.

### Completion
- 독립 이슈는 commit/push/issue PR/PR URL/evidence까지 확인한다.
- Required completion signal: `ISSUE_PR_READY` for independent issue PRs or `LANE_READY` only for hard-conflict fallback.

---

## Cross-Review Loop

Full procedure: `references/cross-review-loop.md`; reusable prompt: `templates/review-brief.md`.

Review is an adversarial AI code quality gate, not a praise pass. Re-read PR state, diff, files, checks, linked issue, and current head SHA before judgment.

### Wiki Review Context Preflight
- Run `references/wiki-context-preflight.md` using the PR title/body, linked issue, changed files, public API/UX surfaces, validation evidence, and recurring failure patterns.
- Review output must distinguish live PR/repo evidence, wiki-strengthened rationale, non-wiki inference, and wiki search failures or gaps.

### Quality Lens Router Output
- Applicable gate families, Skipped gates, Required references, Lightweight or limited gates, Repo/product conventions.

### Evidence Contract
- Compare PR body and validation evidence to required evidence. Blocking evidence gaps prevent APPROVE.

### Simplicity / Deletability Gate
- one-off abstraction, forced modularization, silent fallback, type escape, and human readability risks are review findings; human readability/deletability outranks SOLID.

### Frontend Design Review Gate
- For UI work, verify product fit, typography, hierarchy, responsive behavior, generic AI/template avoidance, screenshot/manual verification, and no one-off wrapper/provider.

### Vercel Agent Skills Gate
- For applicable work, check Vercel deploy safety, component API quality, animation meaning, React Native/Expo constraints, and file/line/screenshot/viewport evidence.

### Continuous Regression Library
- Read `references/regression-library.md` when repeated Medium/High patterns appear and propose a Regression Library Candidate for missing generalized classes.

### Approval-comment policy
- If formal approval is inappropriate, post a top-level PR comment with head SHA, review scope, validation evidence, blocking finding count, and APPROVE or CHANGES_REQUESTED conclusion.

---

## Status

Full procedure: `references/status.md`.

Read-only snapshot: fetch/prune, status, branch/upstream, worktrees, open PRs, linked issues, checks, blockers, session state, and next action. No source edits.

---

## Issue-Ready Plan

Full procedure: `references/issue-ready-plan.md`.

### Goal / Context
Plan must identify Goal, Source Of Truth, Non-Goals / Constraints, Context Recovery Anchors, Assumptions And Unknowns.

### Wiki Context Manifest
- Include: Queries attempted, Wiki sources read, Relevant wiki facts, Constraints / prior decisions, Unknowns not found in wiki, Non-wiki inference.

### Quality Lens Router Output
- Applicable gate families:
- Skipped gates:
- Required references:
- Lightweight or limited gates:
- Repo/product conventions that outrank generic rules:

### Evidence Contract
- Required evidence:
- Evidence templates applied:
- Evidence not applicable (`not-applicable: <reason>`):
- Blocking evidence gaps:

### Counterargument Pass
- 약한 가정 / weak assumptions:
- 기존 repo convention conflicts:
- readiness를 반증할 evidence:
- 더 작은 직접 변경 대안 / smaller or more direct change:

### Simplicity / Deletability Gate
- why is this abstraction necessary?
- Small direct change first; human readability/deletability outranks SOLID.

### Frontend Design Brief
- Product/user context, Aesthetic direction, Explicit anti-goals, screenshot evidence when applicable.

### Vercel Agent Skills Gate
- Applicable upstream skill families
- React/Next.js performance risks
- Explicit anti-goals
- Backend-only skip/lightweight reason

### Continuous Regression Library
- Mention `references/regression-library.md` only where useful / 유용한 범위.
- If needed, propose Regression Library Candidate.

### Issue-PR Strategy with Conflict Fallback
- PR count: one PR per issue by default.
- Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it.
- Parallelization Decision:
- Must not touch:
- Evidence / validation:
- Commit message:

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

Separate durable reusable knowledge from incident records. PR numbers, commit SHAs, and single-session completion logs are not durable reusable knowledge unless generalized into harness-engineering/*, principles/*, frontend/*, or llm-wiki/* patterns.

---

## Prompt Optimizer

Full procedure: `references/prompt-optimizer.md`.

Audit prompts for single goal, Why, validation, restatement, and question path. Do not edit SKILL.md or source code from this subcommand.

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
