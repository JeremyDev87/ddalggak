---
name: ddalggak
description: "Use for `/ddalggak` repo workflow subcommands, ULW, and GJC."
argument-hint: "[subcommand] — no arg = start from GitHub issue"
user-invocable: true
---

# ddalggak — 딸깍 워크플로우

딸깍은 GitHub Issue → 계획 → 구현 → 리뷰 → 회고 thin router다. 긴 절차·템플릿은 references, templates, scripts 디렉터리에 둔다.

## 표준 워크플로우와 코드 수정 권한 (전역 invariant)

사이클: `prompt` → `tune` → `forge` → `spark` → `plan` → `start` → `ship` → `review` → `retro`; 나머지는 보조 명령이다.

소스 수정은 선택 command contract의 `source_edit_allowed: true`일 때만 해당 scope와 `allowed_artifact` 안에서 가능하다. false이면 소스 수정 금지다. 다른 명령의 권한을 상속하지 않는다. 필요한 수정이 권한 밖이면 보고하고 멈춘다.

## Hot-Path Target Architecture

항상 로드되는 본문은 routing, 권한, guardrails, dispatch/reference map, stop/verify만 담고 상세 절차는 references, templates, scripts, eval 디렉터리로 넘긴다.

## Routing Invariant

첫 번째 whitespace-separated word만 라우팅에 사용한다.

1. 첫 단어가 지원 subcommand와 정확히 일치하면 해당 subcommand로 route한다.
2. 인수가 없으면 `start`로 route한다.
3. 첫 단어가 issue 참조(GitHub issue/PR URL, `#<번호>`, 베어 issue 번호, `owner/repo#<번호>`)이면 `start`로 route하고 전체 인자를 issue context로 취급한다. issue 참조는 명령어가 아니라 인자다.
4. 첫 단어가 CLI 전용 명령(`doctor`, `setup` 등 `bin/ddalggak.js`가 처리하는 명령)이면 route하지 않고 "터미널 CLI 명령입니다 — 셸에서 `ddalggak <명령>`을 실행하세요"로 안내한 뒤 멈춘다.
5. 첫 단어가 지원 subcommand도, issue 참조도, CLI 전용 명령도 아니면(오타·미인식 단어) `start`로 자동 진입하지 않는다(fail-closed). `NEEDS_CLARIFICATION`으로 아래 생성 테이블의 지원 subcommand 목록을 제시하고 의도를 되묻는다.
6. Route가 결정된 뒤 후속 인자는 절대 route를 바꾸지 않는다.
7. Chat: after the request summary, before work, print exactly `-> <subcommand> 실행` once per invocation; never repeat in progress/final replies. Repeat only for a new invocation. Exact-output exceptions take precedence.
8. 선택된 subcommand는 선택 command contract의 코드 수정 권한을 넘지 않는다.
9. skill/routing/subcommand/artifact 자체 변경 요청은 ddalggak subcommand 밖 일반 repo edit 요청으로 분리한다.

## 핵심 원칙

- GitHub mutation은 raw UTF-8 title/body 파일을 사용하고 live payload를 재조회해 literal Unicode escape가 저장되지 않았는지 검증한다.

- URL beats cwd: GitHub URL 처리 기준은 owner/repo/number 파싱 후 cwd remote 검증이다. cwd remote가 URL repo와 다르면 mutation을 멈춘다.
- Issue comments matter (issue/PR targets only): issue body와 comments는 모두 source-of-truth 후보이며 최신 명시 comment가 stale body보다 우선한다.
- Issue-PRs by default (implementation lanes only): 독립 이슈는 기본적으로 issue PR 하나를 만든다. hard conflict만 single PR + serial commit fallback이 가능하다.
- Manual merge only: 주인님 PR은 merge/auto-merge 금지. green + APPROVE도 ready for manual merge 보고까지만 허용한다.
- approval-comment policy: `review`의 요약/verdict는 채팅에만 둔다. `CI/check`, `formal review/branch protection`, `merge blocker`, `human action`은 별도 상태로 보고하며 top-level verdict와 formal approval을 게시하지 않는다.
- Runtime contract language: `references/agent-runtime-contract.md` owns Task Scope Contract, Context Assembly Manifest, Resume Snapshot, Control-flow ownership, tool capability boundary, task scope contract, out-of-scope diff, scope-expansion failure.
- Quality Lens Router Output: `references/quality-lens-router.md` owns Applicable gate families, Skipped gates, Required references, Repo/product conventions, backend-only skip. Domain gate is a lens, not a mandate.
- React Code Quality Harness: React/Next.js, AI-generated React diff, component/hook/state/fallback/rendering boundary면 `react-code-quality-harness`와 `references/react-code-quality-harness.md`; hot path에 gate 복사 금지.
- Wiki Context First for all subcommands: `references/wiki-context-preflight.md`; wiki-derived claim은 source path/evidence gap. `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`: broad `qmd://wiki` is discovery only; current-answer claims route through Brain P0/P1/domain/SSOT/control docs; raw/imported/hidden/index/log/redirect alias hits are evidence-only unless canonical/distilled.
- Wiki Bridge: `getwiki` read-only retrieval, `setwiki` approval-gated write; `references/wiki-bridge.md` owns admission/approval boundary.
- Evidence Contract: `references/evidence-contract.md` 기준이며 Blocking evidence gaps가 있으면 PR ready/APPROVE 금지다.
- Conditional gate loading: 선택 command contract의 required assets를 모두 로드한다. conditional assets만 activation evidence에 따라 로드하고 skip/lightweight reason을 남긴다. Code-shape: small direct change first; why is this abstraction necessary?
- Review policy layers: PR 후보만 Admission schema v3 → candidate disposition → lifecycle aggregate → publication authority를 거친다. Aggregate와 inline renderer는 same-process provenance와 `references/review-output-contract.md`를 유지한다. 비PR은 원문/버전/section과 sensor verdict로 검토하며 PR/SHA를 꾸미지 않는다.

## 서브커맨드 분기

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

### mode 분류 정의

| mode | 정의 |
|---|---|
| `source-edit` | issue scope 안에서만 repo 소스 수정 가능. |
| `review-fix` | 호환용 정의: 수용된 리뷰 수정만 PR 브랜치에 edit/push 가능. 현재 `review`는 이 mode를 사용하지 않는다. |
| `plan-only` | 계획/브리프만; source/GitHub/git 무변경. |
| `read-only` | 보고만; source/GitHub/git 무변경. |
| `repo-external-write` | repo 무변경; 외부 note/memory artifact만 허용. |
| `local-destructive` | 직접 소스 편집/GitHub 쓰기 금지; 계약으로 검증된 Git 동기화와 merged-task local cleanup만 허용. |
| `github-write` | GitHub artifact와 ship commit/push만; source edit 없음. |
| `approval-gated-write` | 명시 승인 후 외부 wiki write만. |

## Selected Command Context

Read the selected command document linked in the command index before acting: its full metadata owns permissions, allowed artifacts, side effects, required/conditional assets, stop conditions, and completion signals. Missing or malformed selected contracts are blockers; never infer permission from sibling commands or a corpus search.

The selected contract and required assets are minimum required context, not a reading allowlist. Read required assets before action, including wiki preflight for every command. Load conditional assets when activation evidence applies; record activation and skip reasons. Unknown conditions require investigation or stopping the affected action, never unknown=false. Additional reads and re-reads are allowed with a reason when new evidence warrants them. Load each later phase's command contract and applicable assets on transition, without inheriting permissions. Read public-body assets before preparing public-ready findings or previews; reading never grants publication rights. `review` publishes no summary, and zero findings make no GitHub write.

### Global reference obligations

`plan`/`start`/`review`: record applicable/skipped gates first via Quality Lens Router Output. Every subcommand: read `references/wiki-context-preflight.md` first; record Wiki Context Manifest. Wiki lookup/write admission: `references/wiki-bridge.md`. Evidence Contract, Simplicity / Deletability Gate and Core Invariants Reference are required for readiness/code-shape/scope/privacy/knowledge-growth judgments. Frontend/Vercel/Regression: conditional; record backend-only skip reasons.

## Conductor State File

Template: `templates/conductor-state.md`. Store phase, issue/PR/branch/worktree, validation evidence, blocking gaps, waiting-on state, and next gate before idle waits or compact boundaries.

## Context 관리 — Compact 실행 포인트

Full procedure: `references/context-compact.md`. Save state before compact or long waits.

## Wake/Resume 프로토콜

Full procedure: `references/wake-resume.md`. Resume from state, then re-read live GitHub/local state before acting.

## 공통 규칙

Full procedure: `references/common-rules.md`. No AI trailer, secrets, auto-merge or unsafe force push; exact validation evidence. `review` is source read-only: only verified inline on the requested PR and local results; no ship rights, automatic fixes, formal approval, top-level verdict, thread reply/resolve or CI rerun.

Chat replies (progress/questions/final): start `**요청 요약:**` with current goal/target/key constraints (one sentence; two if complex), then answer/status; do not repeat the summary. Omitted constraints still bind. Corrections/resume retain goal + latest changes; drop cancelled/replaced goals. Never substitute other tasks, agent plans or guesses. Summaries confer no approval/authority or execution/verification evidence; do authorized work without reapproval; retain permission gates.

Explicit language/opt-out/exact-output requests win. JSON-only/code-only replies: no prose/fences/extra fields. Format-bound artifacts: allowed chat stays outside; preserve JSON/code, quotations, protocol tokens, PR inline bodies and completion markers.

All user-facing prose/artifacts default to Korean unless the user explicitly requests otherwise; never infer from input/source language. Carry this choice through delegation/resume. Korean prose: familiar consistent terms, separate actions, prerequisites first. Preserve conditions, negation, values, units, comparisons, identifiers, uncertainty and simultaneity. STE-inspired, not ASD-STE100 compliance/certification.

## 실패 모드 예방

Full procedure: `references/failure-prevention.md`. Prevent stale repo judgments, external dependency hallucination, ignored/local-only PR inclusion, missing handoff evidence, duplicate PRs, and Markdown surgery regressions.

## Verification Checklist

Full procedure: `references/verification-checklist.md`. Only Git/PR targets need base freshness and issue body/comments. Check validation evidence/reviewer isolation/Markdown fences. Explicit context/local-only review proceeds with source/version despite absent Git/PR or impossible PR representation. Keep `clean` scoped no-prune/disposable exceptions and other commands' stops.

## 명명 규칙

Branches are purpose-centered with no generated date/time suffixes; commit/PR description requirements live in `references/ship.md`. Completion-signal SSOT: per-subcommand completion signals live in each selected command document's `output_contract.completion_signal`, available in the installed payload without `core/`; multi-agent handoff signals LANE_READY, REVIEW_DONE, and FIX_DONE are defined in `templates/worker-brief.md`, `templates/review-brief.md`, and `templates/fix-brief.md`. `ddalggak doctor` signal-registry flags signals named here without a definition.

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
- `references/pr-status-evidence-bundle.md`
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
