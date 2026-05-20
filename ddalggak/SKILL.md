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
- Issue-PRs by default: 독립 이슈는 기본적으로 issue PR 하나를 만든다. hard conflict만 single PR + serial commit fallback이 가능하다.
- Manual merge only: 주인님 PR은 merge/auto-merge 금지. green + APPROVE도 ready for manual merge 보고까지만 허용한다.
- Task Scope Contract: tool capability boundary와 task scope contract를 분리한다. out-of-scope diff는 scope-expansion failure다.
- Context Assembly Manifest, Resume Snapshot, Control-flow ownership은 conductor/reviewer-owned 경계다.
- Quality Lens Router Output은 Applicable gate families, Skipped gates, Required references, Repo/product conventions, backend-only skip을 기록한다. Domain gate is a lens, not a mandate.
- Evidence Contract는 references/evidence-contract.md 기준이며 Blocking evidence gaps가 있으면 PR ready/APPROVE 금지다.
- Counterargument Pass는 약한 가정, readiness를 반증할 evidence, 더 작은 직접 변경 대안을 먼저 찾는다.
- Simplicity / Deletability Gate는 references/simplicity-deletability-gate.md 기준이다. small direct change first, why is this abstraction necessary?, one-off abstraction, human readability/deletability, SOLID 우선순위를 명시한다.
- Frontend Design Gate와 Vercel Agent Skills Gate는 조건부다. frontend-design, backend-only, references/frontend-design-gate.md, Frontend Design Brief, Frontend Design Review Gate, references/vercel-agent-skills-gates.md, react-best-practices, composition-patterns, react-view-transitions, web-design-guidelines, deploy-to-vercel, vercel-cli-with-tokens, react-native-skills, server/client boundary, unnecessary client component avoidance, hydration/bundle regression avoidance, token source without printing secrets, preview-first, Vercel deploy safety, component API quality, animation meaning, React Native/Expo constraints를 해당 작업에만 적용한다.
- Component methodology gate: main component only assembles, ComponentName.parts.tsx, ComponentName.utils.ts, satisfies Record<...>, public visual-contract classes, no silent fallback, empty companion files 금지.
- Continuous Regression Library: references/regression-library.md, Regression Library Candidate, class-level failure, transient incident 분리를 지킨다.
- Self-created complexity is a defect: forced modularization, client-side patch, mock-only tests는 High 후보가 될 수 있다.
- Rendered evidence gate: route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, contract graph evidence, not-applicable 분류를 사용한다.
- Transitive rendered fallback audit: list/detail surface, shared card/media primitive, missing media, empty DB/data, nullable field, mapper default를 본다.
- Analytics/privacy allowlist·denylist: raw search terms, prompt titles/bodies, full query strings, arbitrary text, email/name/profile identifiers 금지 기본값.
- GitHub issue/PR title/body는 한글을 raw UTF-8로 전달한다. literal `\uXXXX`/`\uD558`/`\ud558` escape가 있으면 생성·수정 전에 중단하고 decode하며, Python/JSON payload는 `json.dumps(..., ensure_ascii=False)` + `gh api --input`을 사용하고 live title/body를 재조회한다.
- 지식 축적은 harness-engineering/*, principles/*, frontend/*, llm-wiki/* 같은 reusable categories로만 한다. PR numbers, commit SHAs, single-session completion logs, incident records는 durable reusable knowledge가 아니다.

## myWiki-derived 운영 Guardrails

Wiki-derived 지식은 바로 hot path에 붙이지 말고 `references/wiki-growth-triage.md` 기준으로 immediate guardrail, reference/template only, verifier/script candidate, GitHub issue candidate, defer/reject 중 하나로 분류한다.

## 서브커맨드 분기

| subcommand | show-doc heading | 목적 | 상세 reference rule |
|---|---|---|---|
| `start` | Start Workflow | 구현 시작 | Quality Lens Router, Evidence Contract, Simplicity / Deletability Gate, Agent Runtime Contract, conditional frontend/vercel/regression references |
| `review` | Cross-Review Loop | 독립 리뷰 | Evidence Contract, Simplicity / Deletability Gate, regression-library, optional frontend/vercel gates |
| `status` | Status | 상태 점검 | live git/GitHub + .ddalggak/session-state.json |
| `plan` | Issue-Ready Plan | 구현 계획 | Quality Lens Router, Evidence Contract, Simplicity / Deletability Gate; conditional design/deploy/regression references |
| `issue` | Plan to Issues | 이슈 생성 | plan body fields only |
| `clean` | Merge Cleanup | merge 후 정리 | live PR merge evidence |
| `ship` | Ship | 커밋/푸시/초안 PR | issue context + validation + local review |
| `check` | Local Diff Check | read-only diff review | references/local-diff-check.md |
| `retro` | Retrospective | 회고 | references/retrospective-workflow.md |
| `prompt` | Prompt Optimizer | brief 개선 | source edit 금지 |

## Required Reference Map

`plan`, `start`, `review`는 Quality Lens Router Output으로 적용 gate와 skipped gate를 먼저 기록한다. Evidence Contract와 Simplicity / Deletability Gate는 readiness 또는 code-shape 판단이 있으면 필수다. Frontend/Vercel/Regression references는 조건부로만 읽고 backend-only skip reason을 남긴다.

## Start Workflow

`start`는 이슈 기반 구현만 수행한다. 먼저 repo URL/issue URL을 해석하고 `git fetch --prune`, branch, ahead/behind, worktree 상태를 확인한다. issue body와 comments를 모두 읽고, Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate, Frontend Design Gate, Vercel Agent Skills Gate, Task Scope Contract를 brief에 넣는다. Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it. Issue-PR Strategy with Conflict Fallback, Parallelization Decision, Integration commit, PR CREATE — 독립 이슈는 기본 생성, small direct change first, aesthetic direction, screenshot/viewport/manual evidence, server/client boundary, token source without printing secrets, preview-first, references/regression-library.md, 유용한 범위, class-level risk를 필요한 만큼 명시한다.

## Interface Contract Draft

Low-context worker handoff는 Goal, Authorized files, Forbidden files/actions, Allowed side effects, Escalation-required actions, Validation commands, Completion evidence, Evidence provided, Evidence not applicable, Blocking evidence gaps를 포함한다.

## Cross-Review Loop

`review`는 AI code quality gate다. PR diff/files/checks, issue contract, Quality Lens Router Output, Evidence Contract, Diff Footprint / Scope Expansion Review, Counterargument Pass, Simplicity / Deletability Gate, Frontend Design Review Gate, Vercel Agent Skills Gate, Continuous Regression Library를 사용한다. one-off abstraction, human readability, generic AI/template, screenshot/manual verification, Vercel deploy safety, component API quality, animation meaning, React Native/Expo, Regression Library Candidate, references/regression-library.md를 확인한다.

## Status

`status`는 `.ddalggak/session-state.json`, git status, branch, upstream ahead/behind, worktree, open PR/issue 상태를 read-only로 보고한다.

## Issue-Ready Plan

`plan`은 구현 가능한 계획만 만든다. 포함: Source of Truth, Non-Goals, Context Recovery Anchors, Assumptions/Unknowns, Work Inventory, Forbidden files, Inspect-only files, Issue-PR Strategy with Conflict Fallback, PR count: one PR per issue by default, Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it, Parallelization Decision, Must not touch, Evidence / validation, Commit message, Quality Lens Router Output, Evidence Contract, Counterargument Pass, Simplicity / Deletability Gate, why is this abstraction necessary?, Frontend Design Brief, Vercel Agent Skills Gate, Applicable upstream skill families, React/Next.js performance risks, Explicit anti-goals, Backend-only skip/lightweight reason, references/regression-library.md, 유용한 범위, Regression Library Candidate.

## Plan to Issues

`issue`는 계획을 GitHub issue로 변환한다. 각 child issue는 Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, Dependencies / blocked by를 포함한다. 이슈 생성/수정은 사용자의 명시 요청이 있을 때만 수행하며, title/body는 raw UTF-8로 만들고 literal Unicode escape(`\uXXXX`)가 live title/body에 남지 않았는지 `gh issue view --json title,body,url`로 확인한다.

## Merge Cleanup

`clean`은 PR merge evidence를 live GitHub에서 확인한 뒤 local branch/worktree/session-state cleanup만 수행한다. dirty state면 중단한다.

## Ship

`ship`은 이미 존재하는 변경만 commit/push/draft PR로 게시한다. issue body/comments 재확인, scope 확인, validation, local adversarial review, intended files만 stage, What/Why commit, draft PR body의 What/Why/Validation/Risk/Issues를 포함한다. merge/auto-merge 금지.

## Local Diff Check

`check`는 read-only diff review다. base freshness, git status, diff stat/diff, ignored/local-only/generated/repo-external path, findings만 보고한다.

## Retrospective

`retro`는 merge 이후 회고와 reusable lesson 후보를 분리한다. references/retrospective-workflow.md를 사용한다.

## Prompt Optimizer

`prompt`는 brief/review/fix artifact만 개선한다. skill behavior 변경은 normal repo edit으로 분리한다.

## Conductor State File

`.ddalggak/session-state.json`은 phase, base branch, issue, branch, worktree, PR URL/evidence, validation, review verdict, blocker, next command를 담는다.

## 공통 규칙

Markdown surgery discipline: frontmatter, routing, code permission, fenced block, heading, numbering을 보존한다. 새 dependency는 증명 전 금지. ignored/local-only/repo-external 파일은 PR에 넣지 않는다.

## 실패 모드 예방

Stale repo, issue comment 누락, dependency hallucination, unsafe force-push, test pass와 completion 혼동, review isolation 위반, forced modularization, silent fallback, analytics privacy 누락을 차단한다.

## Verification Checklist

- Base freshness, branch, ahead/behind 확인.
- issue body/comments 확인.
- allowed/forbidden/inspect-only/Must not touch 파일 명시.
- Quality Lens Router Output, Evidence Contract, Simplicity / Deletability Gate 적용/스킵 사유 기록.
- validation evidence와 PR URL/evidence 확인.
- Critical/High 리뷰 finding 0개.
- Markdown frontmatter, headings, routing, code permissions, fenced blocks 유지.

## 명명 규칙

Branch names describe purpose and do not include generated date/time suffixes. Commit/PR descriptions include What, Why, Validation, Risk, and issue reference.

## Stop Conditions

다음 경우 중단하고 보고한다: route된 subcommand 권한 밖 source edit 필요, allowed file 밖 변경 필요, hard blocker가 허용되지 않은 topology를 강제함, validation이 checkout을 예기치 않게 mutation함, release/publish automation에 명시 확인이 없음, session state와 live git/GitHub 상태가 모순됨, base freshness 확인 실패, issue가 fundamentally thin함, ignored/local-only/repo-external path를 PR workflow로 안전 표현할 수 없음.

## Reference Contract Summary

아래 항목은 detailed procedure를 references/templates/scripts로 옮기더라도 hot path에서 잃으면 안 되는 운영 계약이다. 단순 keyword dump가 아니라 route, evidence, review, privacy, retrospective 판단에 쓰이는 compact contract로 유지한다:

- URL beats cwd
- GitHub URL 처리 기준
- owner/repo/number
- cwd remote가 URL repo와 다르면
- Task Scope Contract
- Context Assembly Manifest
- Resume Snapshot
- Control-flow ownership
- Runtime contract language
- Small focused workers, explicit orchestration
- tool capability boundary
- task scope contract
- out-of-scope diff
- scope-expansion failure
- Diff Footprint / Scope Expansion Review
- Rendered evidence gate
- route evidence
- viewport evidence
- rendered DOM evidence
- screenshot evidence
- fallback evidence
- contract graph evidence
- Transitive rendered fallback audit
- list/detail surface
- shared card/media primitive
- Analytics/privacy allowlist·denylist
- raw search terms
- prompt titles/bodies
- full query strings
- raw UTF-8
- literal Unicode escape
- json.dumps(..., ensure_ascii=False)
- gh api --input
- gh issue view --json title,body,url
- harness-engineering/*
- principles/*
- frontend/*
- llm-wiki/*
- PR numbers
- commit SHAs
- single-session completion logs
- incident records
- durable reusable knowledge
- Self-created complexity is a defect
- forced modularization
- client-side patch
- mock-only tests
- Quality Lens Router
- Quality Lens Router Output
- Applicable gate families
- Skipped gates
- Required references
- Domain gate is a lens, not a mandate
- backend-only skip
- Repo/product conventions
- frontend-design
- backend-only
- Evidence Contract
- references/evidence-contract.md
- Blocking evidence gaps
- PR ready/APPROVE
- Counterargument Pass
- 약한 가정
- readiness를 반증할 evidence
- 더 작은 직접 변경 대안
- Simplicity / Deletability Gate
- references/simplicity-deletability-gate.md
- Frontend Design Gate
- references/frontend-design-gate.md
- Frontend Design Brief
- Frontend Design Review Gate
- Vercel Agent Skills Gate
- references/vercel-agent-skills-gates.md
- react-best-practices
- composition-patterns
- react-view-transitions
- web-design-guidelines
- deploy-to-vercel
- vercel-cli-with-tokens
- react-native-skills
- server/client boundary
- unnecessary client component avoidance
- hydration/bundle regression avoidance
- token source without printing secrets
- preview-first
- Vercel deploy safety
- component API quality
- animation meaning
- React Native/Expo constraints
- small direct change first
- why is this abstraction necessary?
- one-off abstraction
- human readability/deletability
- SOLID
- Continuous Regression Library
- references/regression-library.md
- Regression Library Candidate
- class-level failure
- transient incident
- Manual merge only
- auto-merge
- ready for manual merge
- approval-comment policy
- top-level PR comment
- head SHA
- review scope
- validation evidence
- blocking finding count
- Issue-PRs by default
- ISSUE_PR_READY
- PR URL/evidence
- 독립 이슈는 commit/push/issue PR/PR URL/evidence까지
- Issue-PR Strategy with Conflict Fallback
- Parallelization Decision
- Must not touch
- PR count: one PR per issue by default
- serial commit
- Component methodology gate
- main component only assembles
- ComponentName.parts.tsx
- ComponentName.utils.ts
- satisfies Record<...>
- public visual-contract classes
- no silent fallback
- empty companion files
