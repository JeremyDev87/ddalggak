---
name: ddalggak
description: Use when the user wants to execute a full "GitHub issue → parallel implementation → cross-review → self-healing" workflow, or plan/create GitHub issues, or clean up after a merge. Subcommands — start: issue-based parallel implementation; review: cross-review loop; status: current state snapshot; plan: write an issue-ready implementation plan; issue: convert a plan into GitHub issues; clean: post-merge branch/worktree/issue cleanup; ship: validate, commit, push, and open a draft PR for current changes; retro: write a retrospective after merge and save lessons to memory; prompt: audit and improve BRIEF/REVIEW_BRIEF prompts using Opus 4.7 principles; check: one-shot local diff review — fresh reviewer teammate analyzes uncommitted/worktree changes and reports suggestions directly to user (no GitHub comments).
argument-hint: [start|review|status|plan|issue|clean|ship|retro|prompt|check] — no arg = start from GitHub issue
user-invocable: true
---

# ddalggak — 딸깍 워크플로우

"딸깍"은 **GitHub Issue → 계획 → 병렬 구현 → 교차 리뷰 → 자가 회복** 의 한 사이클이다. Phase 단위로 반복한다.

이 skill은 **claude team teammate** 위에 얹힌 방법론 레이어다. teammate가 독립 worktree에서 구현·리뷰를 수행하고, ddalggak은 그 위에서 "무엇을, 누구에게, 어떤 순서로 시킬지"를 결정한다.

## 표준 워크플로우와 코드 수정 권한 (전역 invariant)

표준 사이클: `prompt` → `plan` → `start` → `ship` → `review` → `retro`.
`status`, `issue`, `clean`, `check`는 필요 시 보조로 사용.

**소스 코드(repo 내 파일, SKILL.md 포함)를 수정할 권한이 있는 서브커맨드는 `start`와 `review` 뿐이다.**
다른 모든 서브커맨드는 자기 산출물 파일(BRIEF.md, CHECK_BRIEF.md, retrospective .md, 메모리 파일, GitHub 이슈/PR description)만 작성·수정한다.

| 서브커맨드 | 소스 코드 수정 | 작성 가능한 산출물 |
|------------|----------------|---------------------|
| `start` | ✅ | worker teammate가 BRIEF에 지정된 파일 수정 |
| `review` | ✅ | author teammate가 리뷰 지적사항 반영 |
| `prompt` | ❌ | BRIEF.md / REVIEW_BRIEF*.md / FIX_BRIEF*.md (Step 4 확인 후) |
| `plan` | ❌ | 출력만 (파일 미작성) |
| `issue` | ❌ | GitHub 이슈 |
| `status` | ❌ | 출력만 |
| `check` | ❌ | CHECK_BRIEF.md (임시, 작업 후 삭제) |
| `ship` | ❌ | 기존 변경을 commit·push, 신규 파일 작성 없음 |
| `clean` | ❌ | 로컬 브랜치/worktree 정리 |
| `retro` | ❌ | ~/workspace/retrospective/*.md, 메모리 |

`start`·`review` 외 서브커맨드에서 소스 코드 수정을 시도하는 어떤 경로도 — 사용자가 "진행"·"yes"·조건부 승인을 주더라도, AskUserQuestion 옵션·후속 확인 절차로 우회를 만들더라도 — invariant 위반이다. 의도가 모호하면 검토 결과만 출력하고 종료한다.

## 핵심 원칙

- **Phase는 순차, Worker는 병렬**. 한 Phase 안의 워커 N명은 서로 다른 파일을 건드린다.
- **Issue-PRs by default**. 박정욱/default ddalggak 워크플로우의 기본 publish 단위는 이슈 하나당 PR 하나다. 서로 다른 이슈가 파일·contract·runtime flip을 공유하지 않으면 병렬 worker가 각자 독립 브랜치와 PR을 만든다.
- **Single-PR conflict fallback**. 예외적으로 이슈 간 hard conflict(같은 파일/생성물/공유 contract/미게시 코드 의존성)가 있어 독립 PR이 unsafe하면, 그때만 단일 integration PR 안에서 이슈별 commit으로 나눈다. 단일 PR은 기본값이 아니라 conflict fallback이다.
- **Runtime contract language**. worker 자율성을 늘리는 대신 task scope contract, context assembly manifest, resume snapshot, control-flow ownership을 명시해 conductor/reviewer가 실행 경계를 소유한다.
- **Task Scope Contract**. worker BRIEF와 review packet은 tool capability boundary(도구상 가능한 범위)와 task scope contract(이번 task에서 승인된 범위)를 분리한다. Goal, Authorized files, Forbidden files/actions, Allowed side effects, Escalation-required actions, Validation commands, Completion evidence를 명시하고, out-of-scope diff는 capability failure가 아니라 authorization / scope-expansion failure로 다룬다.
- **Small focused workers, explicit orchestration**. small focused agents는 병렬성 축소가 아니라 worker 책임과 context를 작게 유지한다는 뜻이다. issue 분해·branch/PR 상태·review/fix gate·wave 전환은 conductor가 명시적으로 소유한다.
- **Conductor(이 Claude)는 지시만 한다**. 커밋/push/PR은 워커가 직접 한다. Conductor가 대신하면 안 된다.
- **파일 기반 BRIEF**. 짧은 인라인 프롬프트가 아니라 `BRIEF.md`/`REVIEW_BRIEF.md`/`FIX_BRIEF_N.md`를 worktree에 쓰고 워커가 읽게 한다.
- **탈출 조건 명시**. "Critical+High = 0"처럼 기계적으로 측정 가능한 기준으로만 반복을 멈춘다.
- **Reversibility 고려**. fix loop의 기본은 새 fix commit + 일반 push다. `commit --amend` / force-push는 사용자가 명시 승인하고 branch protection·SafetyGuard 영향을 확인한 경우에만 사용한다.
- **Base freshness first**. start/review/status/ship/clean/check 세션은 stale repo 오진을 막기 위해 먼저 `git fetch --prune`, base branch 및 upstream ahead/behind를 확인한다. base branch에서 직접 검증·ship할 때 dirty 변경이 없으면 `git pull --ff-only` 후 진행한다.
- **Manual merge only**. 박정욱/default workflow에서는 사용자가 현재 턴에서 정확한 merge action을 명시적으로 요청하지 않는 한 PR을 merge하거나 auto-merge를 enable하지 않는다. green CI와 `APPROVE` 결론은 `ready for manual merge` 보고까지만 허용하며, merge 권한으로 해석하지 않는다.
- **approval-comment policy**. reviewer 독립성이 충분하지 않거나 formal GitHub approval이 부적절하면 approval review를 제출하지 않는다. 대신 top-level PR comment에 head SHA, review scope, validation evidence, blocking finding count, `APPROVE` 또는 `CHANGES_REQUESTED` conclusion을 남긴다.
- **이슈 코멘트도 source-of-truth 후보**. GitHub issue body만 보지 말고 `comments`를 함께 읽는다. 최신 comment가 body와 충돌하면 comment를 우선하되 충돌 사실과 판단 근거를 BRIEF/REVIEW_BRIEF에 명시한다.
- **암묵적 의존성 금지**. BRIEF에 "PyYAML 또는 텍스트 파싱"처럼 선택지를 열어두지 않는다. 기존 의존성 확인 전 새 라이브러리 import 금지. 불확실하면 stdlib 또는 repo의 기존 패턴을 명시한다.
- **전략과 전술 분리**. AI worker는 코드 변경 전술을 수행하고, Conductor/reviewer는 시스템 경계·검증·삭제 가능성·장기 유지보수성을 지킨다. "동작함"보다 "6개월 뒤 이해·수정·삭제 가능함"을 우선한다.
- **Self-created complexity is a defect**. 새 helper/module/provider/wrapper/fallback을 추가하기 전에 삭제·직접화·경계 명확화를 우선한다. forced modularization은 실제 반복 코드를 줄이거나 경계를 명확히 한다는 근거가 있어야 하며, AI 패치를 정돈돼 보이게 하려는 목적이면 결함이다. client-side patch로 server/request/auth/data boundary 문제를 덮지 말고, auth/redirect/data-boundary 동작은 mock-only tests만으로 완료 처리하지 않는다.
- **결과 기준 우선**. BRIEF는 장황한 절차보다 성공 기준, 허용 파일, 금지 조건, 정확한 검증 명령, 완료 신호를 명확히 한다. 단, 안전/스코프/완료 신호는 절대 규칙이다.
- **반복 교훈 흡수**. stale repo, 외부 의존성 환각, gitignored/local-only 파일, force-push fix loop, worker commit/push/PR 누락은 모든 start/review/fix/ship의 기본 guardrail로 적용한다. PR numbers, commit SHAs, single-session completion logs 같은 일회성 산출물은 incident records이며, 일반화된 cross-session rule로 정리되기 전까지 durable reusable knowledge로 저장하지 않는다.

## myWiki-derived 운영 Guardrails

이 섹션은 myWiki 회고에서 반복 확인된 실패 패턴을 전역 운영 규칙으로 승격한 것이다. 아래 규칙은 각 서브커맨드의 세부 절차보다 우선하며, 기존 라우팅/코드 수정 권한 invariant를 완화하지 않는다.

1. **Base freshness first**: GitHub/로컬 상태 판단 전에 `git fetch --prune`, 현재 브랜치, upstream ahead/behind, worktree dirty 여부를 확인한다. stale base에서 CI 실패·충돌·이미 merge된 변경을 오진하지 않는다.
2. **Issue body + comments 동시 확인**: body는 최초 계약, comments는 최신 설계 결정·범위 변경 후보로 본다. 충돌 시 최신 comment 우선이 기본이지만, 충돌을 숨기지 말고 BRIEF/보고서에 적는다.
3. **No implicit dependencies**: 새 dependency/import는 package manifest나 repo 검색으로 존재를 증명하기 전까지 금지한다. 선택지를 열어두는 문장 대신 사용할 경로·라이브러리·stdlib 대안을 확정한다.
4. **No force-push fix loop by default**: review fix는 새 커밋 + 일반 push가 기본이다. amend/force-push는 명시 승인, branch protection/SafetyGuard 확인, stacked PR 영향 고지 후에만 허용한다.
5. **Reviewer isolation**: reviewer는 구현자 conversation과 worktree checkout 상태에 오염되지 않아야 한다. 기본은 `gh pr view`/`gh pr diff`; 로컬 실행이 필요하면 별도 review checkout을 만든다.
6. **Issue-PRs by default**: 동시에 진행 가능한 독립 이슈는 이슈 하나당 PR 하나가 기본이다. 같은 파일/contract/미게시 의존성이 없는 한 단일 통합 PR로 묶지 않는다.
7. **Task Scope Contract**: 모든 plan/start/review/fix 산출물은 tool capability boundary와 task scope contract를 분리하고, Goal / Authorized files / Forbidden files/actions / Allowed side effects / Escalation-required actions / Validation commands / Completion evidence를 명시한다. 허용 파일 밖 수정, unrelated cleanup/refactor, 요청되지 않은 config 변경, credential/secret/token 파일 변경, destructive action, migration 변경, 외부 API write, production data touch, force-push 또는 branch mutation은 out-of-scope diff이며 scope-expansion failure High/Critical 후보로 리뷰한다.
8. **Context Assembly Manifest**: `start`, `review`, `plan`에서 worker/reviewer가 사용할 context source를 BRIEF/REVIEW_BRIEF에 명시한다. source issue/body/comments, repo conventions, loaded skills/references, wiki-derived guardrails, applicable gates, skipped gates and reasons, assumptions, known blockers를 기록해 context window ownership을 conductor가 소유한다.
9. **Resume Snapshot**: worker idle, CI wait, review/fix loop, wave transition, handoff rescue 전후에는 current phase, issue/branch/PR, changed files, validation evidence, blocking gaps, waiting-on state, next gate, exact next command를 남긴다. “이어 하기”는 대화 기억이 아니라 snapshot과 GitHub/local state 검증으로 수행한다.
10. **Control-flow ownership**: approval gates, retries, destructive actions, external side effects, force-push, production data touch, verification completion은 worker의 autonomous loop 안에 숨기지 않는다. conductor/reviewer-owned deterministic gate로 명시하고, worker에게는 실행 가능한 다음 명령 또는 차단 사유를 제공한다.
11. **Conflict fallback evidence**: 각 lane은 `Owned files`, `Must not touch`, `Independent because`, `Evidence / validation`, `Commit message`를 가져야 한다. 이 항목을 증명하지 못하거나 hard conflict가 확인되면 병렬 issue PR이 아니라 단일 conflict-fallback PR의 serial commit 또는 blocked로 분류한다.
12. **Completion is not test pass**: test pass는 중간 증거일 뿐이다. 독립 이슈 lane 완료는 commit/push/issue PR/PR URL/validation evidence까지 검증된 상태다. hard conflict fallback lane 완료는 patch/local commit/validation evidence/integration handoff까지 검증된 상태이며, fallback publish 완료는 단일 integration PR에서 판단한다.
13. **PR 품질 기본값**: 브랜치 이름은 목적 중심이어야 하며 날짜·타임스탬프를 넣지 않는다. commit/PR 본문에는 What/Why가 필수이고 PR에는 Validation/Risk도 포함한다. green CI와 `APPROVE`는 `ready for manual merge` 보고까지만 허용하며, 사용자가 현재 턴에서 명시적으로 요청하지 않는 한 merge 또는 auto-merge enable로 이어지지 않는다. formal GitHub approval이 부적절하면 top-level PR comment에 head SHA, review scope, validation evidence, blocking finding count, conclusion을 남긴다.
14. **Exact handoff rescue**: worker가 구현 후 evidence/handoff 없이 idle이면 "BRIEF를 다시 읽으라"가 아니라 Conductor가 확인한 validation, patch export, integration handoff 명령을 정확히 제공한다. 독립 이슈라면 누락된 issue PR 생성까지 rescue하고, 이슈 간 conflict fallback으로 묶은 경우에만 lane-specific PR 생성으로 rescue하지 않는다.
15. **Gitignored/local-only handling**: `.claude/settings.local.json`, permission cache, repo 밖 파일, ignored 파일은 `git check-ignore -v <path>`로 확인한다. PR workflow가 불가능하면 직접 수정 + `MODIFIED:` 신호 + 수동 이슈 처리로 분리한다.
16. **Medium fix restraint**: Medium은 기본 non-blocking이다. 미머지 PR 출력값·공유 계약 전환에 의존하는 Medium/Low는 과잉 수정하지 말고 TODO/follow-up으로 제한한다.
17. **Markdown surgery discipline**: SKILL.md/문서 블록 교체 시 기존 동작 보존 체크, heading anchor 보존, 번호 재정렬, fenced code block 균형 확인을 즉시 수행한다.
18. **Rendered evidence gate**: frontend 작업은 CI/typecheck만으로 완료 증거가 아니다. route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, contract graph evidence를 요구하고, 누락 증거는 `not-applicable: <reason>`, Medium, High 중 하나로 분류한다.
19. **Transitive rendered fallback audit**: 리뷰는 list/detail surface, shared card/media primitive, missing media, empty DB/data, nullable fields, mapper defaults까지 전이적으로 본다. shared primitive 수정이 범위 밖이면 callsite mitigation 또는 follow-up/blocker를 남긴다.
20. **Analytics/privacy allowlist·denylist**: analytics/privacy 작업은 명시적 계약을 둔다. raw search terms, prompt titles/bodies, arbitrary user-entered text, email/name/profile identifiers, full query strings는 기본 denylist이고, stable IDs, categories, buckets, booleans, GTM-managed transformations를 선호한다.
21. **Quality Lens Router**: `plan`, `start`, `review`는 세부 gate 적용 전에 `references/quality-lens-router.md`를 읽고 request text, issue body/comments, PR files, diff paths, repo/product convention을 기준으로 `frontend-design` 등 applicable gate families, skipped gates, required references, lightweight limits를 기록한다. Domain gate is a lens, not a mandate: backend-only 작업에는 rendered user-facing contract, deploy surface, auth/security boundary, data privacy contract, performance claim에 직접 영향이 없으면 frontend/UI/domain gates를 적용하지 않고 backend-only skip 사유를 남긴다. gate 충돌은 정확히 1 explicit user request, 2 repo/product convention, 3 safety/security/correctness, 4 human readability/deletability, 5 evidence-backed performance/accessibility, 6 generic upstream best practice, 7 named principles/patterns such as SOLID 순서로 해결한다.
22. **Evidence Contract**: `plan`, `start`, `review`는 완료·PR readiness·APPROVE·deploy/performance/UI/security/data/API 동작을 주장하기 전에 `references/evidence-contract.md`를 읽고 `Evidence Contract` 섹션을 포함한다. required evidence, 적용된 UI/deploy/performance/bugfix/security/data/API template, `not-applicable: <reason>`, blocking evidence gaps를 기록한다. 필수 증거가 없으면 PR ready/APPROVE/merge-ready 결론을 남기지 않고 High/blocking으로 분류한다.
23. **Simplicity / Deletability Gate**: `plan`, `start`, `review`는 `references/simplicity-deletability-gate.md`를 읽고 새 abstraction/helper/provider/wrapper/component/module/fallback/pattern이 필요한지 검증한다. 기본 방향은 **small direct change first**이며, 새 추상화는 "why is this abstraction necessary?"에 답하고 실제 reuse 또는 boundary clarification을 증명해야 한다. SOLID는 유용하지만 human readability/deletability보다 우선하지 않는다.
24. **Counterargument Pass**: `plan`과 `review`는 PR ready/APPROVE 또는 구현 착수 결론 전에 약한 가정, 기존 repo convention과 충돌할 수 있는 지점, readiness를 반증할 evidence, 이슈를 만족하는 더 작은 직접 변경 대안을 먼저 확인한다. 이 pass는 Quality Lens Router, Evidence Contract, Simplicity / Deletability Gate를 보완하는 반확증 렌즈이며, 단순 찬성·요약으로 대체할 수 없다.
25. **Frontend Design Gate**: `plan`, `start`, `review`는 UI/frontend/design/page/component/layout/polish/responsive/dashboard/card/CTA/typography/animation/screenshot, `.tsx`/`.jsx`/CSS/Tailwind/design token/Storybook/route/page/component/shared frontend primitive, Bokbuk/orbit-dashboard 같은 product context가 걸리면 `references/frontend-design-gate.md`를 읽는다. backend/API-only, test-only, narrow functional bugfix는 skip 또는 lightweight로 기록한다. product-specific constraints outrank novelty이며, one-off UI 변경을 위한 forced abstraction은 막는다.
26. **Component methodology gate**: `frontend-design` 또는 `composition-api`가 UI/component 작업에 적용되면 외부 repo worker brief/review lens로만 사용하고, ddalggak 자체를 React/UI 앱처럼 리팩터링하라는 규칙으로 쓰지 않는다. main component only assembles, large conditional UI fragments → `ComponentName.parts.tsx`, calculation/format/parse → `ComponentName.utils.ts`, variant/size/style maps use `satisfies Record<...>`, tests prioritize user behavior and public visual-contract classes, no silent fallback을 확인한다. 권장 구조는 `ComponentName/ComponentName.tsx`, `ComponentName.types.ts`, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `ComponentName.spec.tsx`, `ComponentName.stories.tsx`, `index.ts`이지만 실제 역할/크기/검증 필요가 있을 때만 만들고 empty companion files는 강제하지 않는다.
27. **Vercel Agent Skills Gate**: `plan`, `start`, `review`는 React/Next component/page/data-fetching/performance, component library/API/refactor/composition, view transitions/page/shared element/list reorder/enter-exit animation, UI/a11y/UX/screenshot/viewport acceptance, Vercel deploy/preview URL/production deploy/env vars/project linking/token CLI, React Native/Expo/mobile performance/native/platform API가 걸리면 `references/vercel-agent-skills-gates.md`를 읽는다. backend-only 작업은 frontend/deploy/mobile surface에 영향이 없으면 skip 또는 lightweight 사유를 기록한다. product/repo constraints, Simplicity/Deletability, Frontend Design Gate가 generic upstream pattern보다 우선한다.
28. **Continuous Regression Library**: `review`는 반복되는 Medium/High AI code-quality pattern이 보이거나 기존 회귀 class와 닮은 finding이 있으면 `references/regression-library.md`를 읽는다. `plan`과 `start`는 알려진 반복 리스크가 있을 때만 regression-library reference를 유용한 범위에서 언급한다. transient failures, PR numbers, commit SHAs, single-session completion logs, incident records는 memory에 넣지 않는다. durable pattern은 detection signal, blocking review rule, minimal fixture/evidence idea를 갖춘 class-level failure로 일반화한 뒤 skill/reference 또는 follow-up issue로 승격한다.

## 서브커맨드 분기

**파싱 규칙** — Arguments의 **첫 번째 단어만** 서브커맨드로 판정한다:

1. 첫 단어가 아래 표의 서브커맨드와 **정확히 일치**하면 해당 서브커맨드로 라우팅. 나머지 인수는 해당 서브커맨드에 전달한다.
2. 첫 단어가 목록에 없거나 인수 전체가 없으면 → Start Workflow.
3. 서브커맨드로 판정된 이후에는 나머지 인수가 "구현 요청처럼 보여도" Start로 폴백하지 않는다. 절대 예외 없음.
4. 라우팅 결정 직후 **반드시 한 줄 출력**: `→ [서브커맨드] 실행` (복명복창). 이후 해당 섹션으로 이동.
5. 라우팅된 서브커맨드는 아래 표의 "코드 변경" 컬럼이 정의하는 범위를 절대 벗어나지 않는다. ❌ 표시 서브커맨드(`status`, `plan`, `issue`, `check`)는 어떤 파일도 직접 수정하지 않는다.
6. **메타 요청 절대 차단**: 인수에 SKILL.md 자체, 서브커맨드 정의, 파싱 규칙, ddalggak skill 동작 변경(예: "스킬 본문 영어로", "서브커맨드 추가/삭제", "라우팅 규칙 변경") 같은 의도가 보이면 라우팅을 중단하고 한 줄로 안내한 뒤 **즉시 종료한다** — "메타 요청 감지 — 이 작업은 ddalggak 서브커맨드 범위 밖입니다. /ddalggak 외부 일반 메시지로 다시 요청해 주세요." 이후 AskUserQuestion·후속 질문·확인 절차·"진행"·"yes"·조건부 승인 등 어떤 사용자 응답이 와도 ddalggak 서브커맨드 내에서 SKILL.md / ddalggak skill 정의 파일을 Edit·Write로 수정하지 않는다. 자기-우회 경로(AskUserQuestion에 "진행 — SKILL.md 변경" 같은 옵션을 띄워 권한을 만드는 행위) 금지. SKILL.md 변경이 필요하면 사용자가 /ddalggak 외부 일반 메시지로 직접 지시해야 한다.
7. 인수 파싱은 **공백 기준 첫 단어**만 본다. 따옴표·이스케이프·복합 표현은 무시한다. 첫 단어가 서브커맨드 목록에 있으면 라우팅이 끝나고, 이후 어떤 의미적 해석도 라우팅을 바꿀 수 없다.

서브커맨드 목록:

| 서브커맨드 | 라우팅 대상 | 코드 변경 |
|------------|-------------|-----------|
| `start` (또는 인수 없음) | [Start Workflow](#start-workflow) | ✅ worker teammate가 구현 |
| `review` | [Cross-Review Loop](#cross-review-loop) | ✅ author teammate가 수정 |
| `status` | [Status](#status) | ❌ read-only |
| `plan` | [Issue-Ready Plan](#issue-ready-plan) | ❌ read-only (계획 문서만 출력) |
| `issue` | [Plan to Issues](#plan-to-issues) | ❌ 로컬 코드 변경 없음 (GitHub 이슈만 생성) |
| `clean` | [Merge Cleanup](#merge-cleanup) | ⚠️ 로컬 브랜치·worktree 정리만 |
| `ship` | [Ship](#ship) | ❌ 기존 변경을 commit·push·PR 생성 (신규 파일 작성 없음) |
| `check` | [Local Diff Check](#local-diff-check) | ❌ read-only (리뷰 결과만 출력) |
| `retro` | [Retrospective](#retrospective) | ⚠️ 회고 파일·메모리만 작성 |
| `prompt` | [Prompt Optimizer](#prompt-optimizer) | ⚠️ Step 4 확인 후 **대상 프롬프트 파일만**. SKILL.md/소스코드 수정 금지 |

---

## Start Workflow

### Step -1. Prerequisite Discovery — base freshness first

이슈/문서 수집보다 먼저 repo와 base 상태를 확인한다. stale repo에서 commit-lane·리뷰·ship 판단을 시작하지 않는다.

```bash
gh repo view --json nameWithOwner,url,defaultBranchRef
git fetch --prune
git status -sb
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true
git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
git worktree list --porcelain
```

현재 브랜치가 default/base branch이고 dirty 변경이 없으면 `git pull --ff-only` 후 진행한다. dirty 변경, upstream divergence, rebase/merge 중 상태가 있으면 commit-lane 구성 전에 블로커로 보고한다.

---

### Step 0. 계획 타당성 검토 게이트

이슈/문서/프롬프트 수집 직후, commit-lane 구성 전에 실행한다.

**제공된 구현 계획이 있는 경우** (이슈 body, 첨부 문서, 사용자 프롬프트에 구현 방향·설계 결정이 포함된 경우):

다음 3가지 충분성을 검토하고 Gap/리스크를 사용자에게 보고한 후 진행 여부를 확인한다:

1. **파일 소유권**: 변경 파일이 구체적으로 명시됐는가? 두 단위가 같은 파일을 수정하는가?
2. **블로커**: 순서 의존성이 명시됐는가? 미게시 코드 의존성이 있는가?
3. **완료 기준**: 기계적으로 확인 가능한 완료 조건이 있는가?

Gap 발견 시 보고 형식:
```
⚠️ 계획 검토 결과
- Gap: (누락·모호한 항목)
- 리스크: (잘못된 방향으로 구현 시작 가능성)
- 권고: (보완 방법 또는 진행 가능 여부)

계획에 위 Gap이 있습니다. 그대로 진행할까요, 계획을 보완할까요?
```

**제공된 계획이 없는 경우**: 이 Step을 건너뛰고 Step 1로 이동.

---

### Step 1. 이슈 수집 및 파일 소유권 분석

**이슈 번호가 지정된 경우** — 단일 이슈 처리:
```bash
gh issue view <number> --json number,title,body,labels,assignees,milestone,url,comments
```
이슈 body + comments에서 파악할 항목: Goal / Why / 작업 내용 / 완료 기준 / 연관 이슈·블로커.  
comments는 body에 누락된 맥락·설계 결정·요구사항 변경을 담고 있는 경우가 많다. 최신 코멘트가 body와 충돌하면 코멘트를 우선한다.

### Quality Lens Router Output

각 worker BRIEF에는 `references/quality-lens-router.md` 기준으로 applicable gate families, skipped gates, required references, lightweight or limited gates, repo/product conventions that outrank generic rules를 명시한다. Domain gate is a lens, not a mandate이므로 router output이 필요한 domain gate만 포함하고, backend-only 작업은 rendered user-facing contract, deploy surface, auth/security boundary, data privacy contract, performance claim에 직접 영향이 없으면 frontend/UI/domain gates를 skipped로 기록하고 backend-only skip reason을 남긴다.

Gate priority/conflict order는 정확히 1 explicit user request, 2 repo/product convention, 3 safety/security/correctness, 4 human readability/deletability, 5 evidence-backed performance/accessibility, 6 generic upstream best practice, 7 named principles/patterns such as SOLID 순서로 해결한다. domain gate는 repo convention이나 product direction을 덮어쓰지 않는다.

### Evidence Contract

각 worker BRIEF에는 `references/evidence-contract.md` 기준으로 required evidence, 적용된 evidence template(UI/deploy/performance/bugfix/security/data/API), `not-applicable: <reason>`, blocking evidence gaps를 명시한다. worker 최종 출력과 PR body에는 `Evidence provided`, `Evidence not applicable`, `Blocking evidence gaps`를 포함해야 한다. 필수 증거가 누락되면 worker는 PR ready/approval ready를 주장하지 말고 gap을 blocking으로 보고한다.

### Simplicity / Deletability Gate

각 worker BRIEF에는 `references/simplicity-deletability-gate.md` 기준으로 **small direct change first**를 명시한다. 새 abstraction/helper/provider/wrapper/component/module/fallback/pattern을 제안하면 "why is this abstraction necessary?"에 답하고, 실제 reuse 또는 boundary clarification 근거와 6개월 뒤 삭제·수정 가능성을 적게 한다. SOLID 적용은 human readability/deletability보다 우선하지 않으며, client-side patch로 server/request/auth/data boundary 문제를 덮지 않는다.

### Frontend Design Gate

UI/frontend/design/page/component/layout/polish/responsive/dashboard/card/CTA/typography/animation/screenshot 작업, `.tsx`/`.jsx`/CSS/Tailwind/design token/Storybook/route/page/component/shared frontend primitive 변경, 또는 Bokbuk/orbit-dashboard 같은 product context가 있으면 worker BRIEF에 `references/frontend-design-gate.md` 기준 Frontend Design Gate를 포함한다. backend/API-only, test-only, narrow functional bugfix는 skip 또는 lightweight로 기록한다.

UI worker는 코딩 전 aesthetic direction, main visual idea, typography/color/layout/motion choices, preserved product constraints, generic AI UI patterns avoided를 복명복창해야 한다. BRIEF에는 screenshot/viewport/manual evidence 조건(경로, desktop/mobile viewport, Storybook/browser/manual 확인, `not-applicable: <reason>`)을 넣고, small direct change first와 one-off UI 변경을 위한 forced abstraction 금지를 유지한다.

UI/component worker BRIEF에는 component methodology gate를 넣는다: main component only assembles; large conditional UI fragments → `ComponentName.parts.tsx`; calculation/format/parse → `ComponentName.utils.ts`; variant/size/style maps use `satisfies Record<...>`; tests prioritize user behavior and public visual-contract classes; no silent fallback. 권장 role split은 `ComponentName/ComponentName.tsx`, `ComponentName.types.ts`, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `ComponentName.spec.tsx`, `ComponentName.stories.tsx`, `index.ts`이지만 실제 역할/크기/검증 필요가 있는 파일만 만들고 empty companion files를 강제하지 않는다.

### Vercel Agent Skills Gate

React/Next, composition, motion, web design/a11y, Vercel deploy/token, React Native/Expo/mobile 작업이면 worker BRIEF에 `references/vercel-agent-skills-gates.md` 기준 Vercel Agent Skills Gate를 포함한다. Applicable upstream skill families는 `react-best-practices`, `composition-patterns`, `react-view-transitions`, `web-design-guidelines`, `deploy-to-vercel`, `vercel-cli-with-tokens`, `react-native-skills` 중 해당 항목으로 기록한다. backend-only 작업은 frontend/deploy/mobile surface가 없으면 skipped 또는 lightweight 사유를 기록한다.

BRIEF에는 server/client boundary, unnecessary client component avoidance, hydration/bundle regression avoidance, component API simplification evidence, animation/motion continuity meaning, contrast/focus/keyboard/responsive/empty-loading-error evidence, token source without printing secrets, preview-first, verified URL/env state, list virtualization, animation performance, platform boundary evidence 중 해당 항목을 넣는다.

알려진 반복 Medium/High AI code-quality 리스크가 관련될 때만 `references/regression-library.md`를 유용한 범위에서 언급하고, one-off incident 이름이 아니라 class-level risk로 적는다.

**Clarification Gate 판정**:
- 명확: Goal, 변경 범위, 완료 기준, 검증 방법이 모두 식별됨 → 진행
- 부분적으로 불명확: 구현 가능하지만 선택지가 2개 이상임 → 객관식 질문 후 진행
- 근본적으로 빈약: Goal/범위/완료 기준 중 2개 이상 없음 → `/ddalggak plan` 폴백 제안 후 start 중단

이슈 + 코멘트 파악 후 **명확화 질문 루프**를 실행한다:

불명확하거나 구현 방향에 영향을 주는 항목이 있으면 `AskUserQuestion`으로 객관식 질문한다.

**질문 트리거 조건:**
- Goal이 복수이거나 모호한 경우
- 완료 기준이 기계적으로 검증 불가능한 경우
- 구현 방식에 설계 선택지가 존재하는 경우 (예: 수정 vs. 신규 파일)
- body와 코멘트 간 내용이 충돌하는 경우
- 범위가 불명확하여 파일 소유권을 특정할 수 없는 경우

**질문 규칙:**
- `AskUserQuestion` 도구를 사용한다. 자유 입력 형태로 묻지 않는다.
- 한 번에 1-4개 항목을 묶어 질문한다.
- 모든 질문은 **객관식** 옵션으로 제공한다.
- 답변 후 새로운 불명확 항목이 생기면 다시 질문한다.
- **질문이 없을 때까지 반복**한다.
- 이슈 내용이 충분히 명확하면 이 루프를 건너뛴다.
- 명확화를 거쳐도 이슈가 근본적으로 빈약하면: "이슈 #N의 작업 내용이 구체적이지 않습니다. `/ddalggak plan`으로 계획을 작성하시겠습니까?" 제안 후 중단한다.

명확화 완료 후 → Step 2B(단일 이슈 계획)로 이동.

**이슈 번호 없이 호출된 경우** — 자동 배치 처리:

1. `status:unlocked` 레이블 이슈를 우선 후보로 자동 수집:
   ```bash
   gh issue list --label "status:unlocked" --json number,title,labels,body
   ```
   `status:unlocked` 후보가 없으면 레이블을 추가·삭제·변경하지 않고 open 전체로 fallback 수집:
   ```bash
   gh issue list --state open --json number,title,labels,body
   ```

   > ⛔ **ISSUE GATE**: open 이슈가 0개이면 즉시 중단한다. `AskUserQuestion`으로 확인:
   > ```
   > Q: GitHub Issue가 없습니다. 어떻게 진행할까요?
   >   A. /ddalggak plan → /ddalggak issue 순서로 이슈 먼저 작성
   >   B. 이슈 없이 진행 (이유를 명시하고 명시적 승인)
   >   C. 취소
   > ```
   > "이슈 없이 진행"을 선택한 경우에만 이하 단계를 계속한다. 이 확인 없이 이슈 없는 브랜치를 만들지 않는다.

   레이블은 selection hint일 뿐이며 issue/label mutation trigger가 아니다. label 유무만으로 workflow outcome을 결정하지 말고 body, comments, 파일 소유권, 완료 기준을 함께 확인한다.

   `status:locked` 레이블 이슈는 레이블을 변경하지 않은 채 수집 대상에서 제외하고 안내만 한다:
   "🔒 status:locked 이슈 #N은 선행 조건이 충족되지 않아 이번 배치에서 제외됩니다."

   수집된 각 이슈에 대해 comments까지 포함하여 상세 조회한다:
   ```bash
   # 각 이슈마다 실행
   gh issue view <number> --json number,title,body,comments
   ```
   최신 코멘트가 body와 충돌하면 코멘트를 우선한다.

   이슈별로 Clarification Gate를 적용한다. Goal/범위/완료 기준 중 2개 이상이 비어 있으면 해당 이슈는 구현 commit-lane에 넣지 않고 `/ddalggak plan` 또는 discovery 이슈로 돌린다.

2. parent tracker 이슈(sub-issue만 열거하고 코드 파일을 직접 소유하지 않는 이슈)를 별도 표시하고 commit-lane 배정에서 제외.

3. **명확화 질문 루프** — 이슈 + 코멘트 파악 후, Conflict 분석 전에 실행한다.

   이슈별로 불명확하거나 구현 방향에 영향을 주는 항목이 있으면 `AskUserQuestion`으로 객관식 질문한다.

   **질문 트리거 조건 (이슈 하나라도 해당하면 질문):**
   - 작업 범위나 완료 기준이 기계적으로 검증 불가능한 이슈가 있는 경우
   - 두 이슈 간 요구사항이 충돌하거나 중복되는 경우
   - body와 코멘트 간 내용이 충돌하는 이슈가 있는 경우
   - 구현 방식에 설계 선택지가 존재하는 이슈가 있는 경우

   **질문 규칙:**
   - `AskUserQuestion` 도구를 사용한다. 자유 입력 형태로 묻지 않는다.
   - 이슈 번호를 명시해서 어떤 이슈에 대한 질문인지 구분한다.
   - 모든 질문은 **객관식** 옵션으로 제공한다.
   - 답변 후 새로운 불명확 항목이 생기면 다시 질문한다.
   - **질문이 없을 때까지 반복**한다.
   - 모든 이슈가 충분히 명확하면 이 루프를 건너뛴다.

4. 각 구현 이슈 body + comments의 "파일 소유권" / "수정 파일" / "구현 범위" 섹션에서 파일 경로 추출.  
   **`/ddalggak plan` 결과물에 패턴 레지스트리(따를 패턴·anti-patterns·모듈 컨벤션)가 이미 있으면 아래 탐색을 생략하고 해당 내용을 그대로 BRIEF "코드베이스 컨텍스트" 섹션에 삽입한다.**  
   plan 결과물이 없는 경우, 파일 경로 명시 여부와 무관하게 **모든 이슈에 대해** 해당 모듈 디렉토리를 직접 탐색하고 결과를 BRIEF "코드베이스 컨텍스트" 섹션에 삽입한다:

   ```bash
   # 모듈 구조 확인
   ls -la <module-dir>/
   cat <module-dir>/index.ts 2>/dev/null || cat <module-dir>/index.tsx 2>/dev/null
   # 유사 구현 탐색
   grep -r "<이슈 핵심 키워드>" src/ --include="*.ts" -l 2>/dev/null
   ```

   탐색 후 BRIEF에 기록할 항목:
   - 따를 패턴 (유사 구현 파일 경로 + 핵심 코드 발췌)
   - Anti-patterns (이 모듈에서 사용 중지된 방식)
   - 모듈 컨벤션 (barrel export 구조, 파일 명명 규칙)

   - Confidence `high`: 명시적 경로 또는 repo grep으로 좁은 파일 셋 확인됨  
   - Confidence `medium`: 경로 추정 + 실제 파일 읽어 패턴 발췌  
   - Confidence `low`: 파일 읽어도 판단 불가 → discovery 이슈로 전환, 병렬 구현 대상 제외

5. **Conflict 분석**:

   | 이슈 A | 이슈 B | 겹치는 파일 | 판정 |
   |---|---|---|---|

   - **Hard Blocker**: 같은 기존 파일 수정 / 같은 생성 아티팩트 / 같은 공유 설정·레지스트리·barrel / 미게시 코드 의존성 / gitignored·local-only 파일 / repo 밖 파일 / 같은 delivery·output contract 또는 task scope contract의 원자적 전환 → 독립 issue PR 금지, fallback PR 안 serial commit 또는 tracked PR 대상 밖 local-only 처리
   - **Soft Blocker**: 의미적 선행 조건 / 트래커·체크리스트 순서 → 독립 파일이면 별도 issue PR 허용
   - Hard Blocker만 병렬 lane을 serial lane으로 낮출 수 있다. Soft Blocker만으로 레인을 닫으면 안 된다.

6. **Issue-PR Strategy with Conflict Fallback 구성**:
   - 기본값은 이슈 하나당 독립 브랜치와 PR 하나다.
   - `Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it`를 계획에 명시한다.
   - parent tracker는 구현 lane이 아니라 child lane table로만 둔다.
   - Hard Blocker가 있는 이슈끼리만 단일 fallback PR 안 serial commit 또는 blocked lane으로 분류한다.

7. 아래 형식으로 **실행 계획 출력**:

```
### 파일 소유권 매핑

| 이슈 | 수정 파일 |
|------|-----------|
| #N   | `path/to/file` |

### Conflict 분석
- Hard Blocker: (없음 / 이슈 X ↔ 이슈 Y — `path/file` 겹침)
- Soft Blocker: (없음 / 이슈 Z는 이슈 W 이후 serial commit 권장)

### Issue-PR Strategy with Conflict Fallback
- Base branch: `<default/current base>`
- Independent issue branches: `<purpose branch per issue; no timestamp>`
- PR count: one PR per independent issue by default
- Conflict fallback: one integration branch/PR only for issues with hard conflicts
- Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it
- Commit policy: one coherent commit per issue PR; serial issue commits only inside the fallback PR for shared files/contracts

| Lane | Issue/scope | Boundary | Owned files | Independent because | Must not touch | Evidence / validation | Commit message |
|---|---|---|---|---|---|---|---|
| L1 | #N | `<boundary>` | `scripts/foo.py` | `<why no shared file/contract/runtime flip>` | `<paths>` | `<commands/evidence>` | `docs: ...` |

### Parallelization Decision
- Parallel lanes: lanes with disjoint owned files and no shared runtime flip.
- Serial lanes: lanes sharing files/contracts; keep as separate commits but do not dispatch as independent writers.
- Blocked lanes: lanes depending on open PRs, missing credentials, unclear acceptance criteria, or repo-external state.
```

8. 계획 출력 후 실행 방식 확인:

```
실행 방식을 선택해 주세요:
1. worktree/agent 병렬 초안 + integrator가 하나의 PR에 commit lane으로 반영 — 추천
2. 순차 실행 (느리지만 단순)
```

### Step 1.5. 간이 구현 계획 확인

Issue-PR Strategy with Conflict Fallback 구성 후, 워커 배포 전에 다음 초안을 제시하고 사용자 확인을 받는다.

**`/ddalggak plan` 결과물이 이미 있는 경우**: 해당 계획을 불러와 이 Step을 대체한다.

**초안 제시 항목:**

```
### 간이 구현 계획

#### Phase 분할
| Phase | 목적 | 포함 단위 |
|-------|------|-----------|
| Foundation | 의존성 없는 신규 코드 | (Unit 목록) |
| Integration | 기존 코드 연결·수정 | (Unit 목록) |
| Regression | 전체 동작 검증 | (Unit 목록) |

#### 인터페이스 계약 초안
- 공유 타입 후보: (없음 / 타입명 + 경로)
- API shape 후보: (없음 / 엔드포인트·함수 시그니처)
- DB 스키마 변경 후보: (없음 / 테이블·컬럼)

#### 주요 리스크
- (파일 충돌, 미게시 의존성, 고위험 변경 등)
```

> ⛔ **DEPLOYMENT GATE**: 아래 AskUserQuestion 확인을 받기 전까지 worktree 생성·브랜치 생성·teammate 배포 불가. Auto mode 활성화 여부와 무관하게 이 gate는 건너뛸 수 없다.

`AskUserQuestion`으로 다음을 확인한다:
```
Q: 위 간이 구현 계획으로 진행할까요?
  A. 진행 — Step 2A로 이동
  B. 계획 수정 후 재확인
  C. /ddalggak plan으로 상세 계획 먼저 작성
```

사용자가 "진행"을 선택하면 Step 2A/2B로 이동.  
수정 요청이 있으면 반영 후 재확인.

### Step 2A. 배치 실행 (방식 선택 후)

**2A-1. Worktree 생성**

브랜치 이름은 `fix/issue-42-pr-quality`처럼 목적 중심으로 정하고 날짜·타임스탬프·생성 시각 suffix를 넣지 않는다.

`.worktrees/` ignore는 repo-tracked `.gitignore`가 아니라 local-only `.git/info/exclude`에 기록한다. 병렬 가능성이 증명된 commit lane마다:
```bash
grep -qxF '.worktrees/' <repo-root>/.git/info/exclude || printf '\n.worktrees/\n' >> <repo-root>/.git/info/exclude
git -C <repo-root> worktree add <repo-root>/.worktrees/<branch-name> -b <branch-name>
```

repo 밖 파일이나 gitignored/local-only 파일을 다루는 Lane은 PR worktree를 만들지 않는다. `git check-ignore -v <path>` 결과를 BRIEF에 넣고 직접 수정 + `MODIFIED:` 신호 + 수동 이슈 처리로 분리한다.

**2A-2. Team 생성 및 배포**

Lane마다 named teammate를 생성하고 동시에 작업을 배포할 수 있지만, 기본 publish 형태는 이슈별 PR이다. hard conflict가 있는 lane만 하나의 integration branch/PR로 묶는다. Worker는 독립 이슈 lane이면 validation evidence와 issue PR을 만들고, hard conflict lane이면 patch/local commit/evidence를 만들어 integrator가 conflict-fallback PR에 이슈별 commit으로 반영한다.

1. 각 Lane에 teammate 생성 (Lane 수 = teammate 수):
   ```
   TeamCreate(name="worker-<N>", ...)
   ```
2. 각 teammate에 worktree 경로와 함께 작업 전달 (전체 동시 전송):
   ```
   SendMessage(to="worker-<N>", content="<BRIEF 내용 또는 BRIEF 파일 경로>")
   ```
   전달 내용에 반드시 포함:
   1. TASK — 이슈 번호, 구현 목표, 이슈 URL
   2. EXPECTED OUTCOME — 이슈 body의 완료 기준 그대로
   3. WORKTREE PATH — `.worktrees/<branch-name>` 에서만 작업
   4. FILES TO TOUCH — 허용 파일 목록 (이 파일 외 수정 금지)
   5. MUST NOT — 다른 branch switch 금지, 허용 목록 외 파일 수정 금지, 새 외부 의존성/import 금지(기존 의존성 증명 전)
   6. COMMIT FORMAT — `type(scope): 한글 제목\n\nWhat: ...\nWhy: ...\n\nCloses #N` / `-F` 파일로 전달
   7. PR FORMAT — What / Why / Validation / Risk / Issues 구조 + `Closes #N` 또는 `Refs #N`
   8. PR CREATE — 독립 이슈는 기본 생성. Worker는 independent issue라면 issue PR을 만들고, conflict fallback인 경우에만 lane-specific PR을 만들지 않고 `LANE_READY: <lane> <commit-or-patch> <validation>`을 출력한다. 독립 이슈 lane은 PR URL을 출력하고, conflict fallback lane은 통합 PR의 commit/evidence를 출력한다.

모든 teammate 완료 후 integration 요약 테이블 출력:
```
| Lane | 이슈 | Integration commit | Evidence / validation |
|------|------|--------------------|-----------------------|
```

Integrator는 독립 이슈 lane의 PR URL/evidence를 수집한다. hard conflict lane만 하나의 integration branch에 이슈별 commit으로 적용하고, 전체 validation 후 conflict-fallback draft PR 하나를 생성한다.

### Step 2B. 단일 이슈 계획 (이슈 번호 지정 시)

이슈에서 발견된 상태를 간결하게 요약하고 구현 계획(Phases + Workers) 제시:

- 전체 작업을 Phase로 나누기 (Foundation=의존성 없는 신규 코드 / Integration=기존 코드 연결·수정 / Regression=전체 동작 검증)
- 각 Phase는 파일 소유 겹침 없는 Worker들로 병렬화하고, publish는 독립 이슈별 PR이 기본이다. conflict lane만 fallback PR로 통합
- 이슈 간 파일/contract conflict → 같은 PR 안 serial commit

계획 표:
```
| Phase | Worker/Lane | 범위(파일) | Independent because | 완료 조건 |
```

계획 확정 후 실행 방식 선택 → Step 1.5(간이 구현 계획 확인) → Step 2A 진행.

### Step 2.5. Skeleton / Contract First

각 워커의 BRIEF를 작성하기 전, 공유 인터페이스가 존재하는 경우에만 실행한다.

**트리거 조건** (하나라도 해당하면 실행):
- 여러 워커가 같은 타입·인터페이스·API shape을 import/export하는 경우
- DB 스키마 변경이 여러 워커에 걸쳐 있는 경우
- 신규 공유 barrel export / 레지스트리 항목이 생성되는 경우

**해당 없으면 건너뜀.**

**실행 절차:**

1. Conductor가 인터페이스 계약 draft 작성:

```markdown
## Interface Contract Draft

### 공유 타입
// path: src/types/foo.ts
export type FooType = { ... }

### API Shape
- GET /api/foo → { ... }

### DB 스키마 변경
- 테이블 foo: 컬럼 bar 추가 (nullable)
```

2. 사용자에게 확인 요청:
   "인터페이스 계약 draft입니다. 확인 후 각 워커 BRIEF에 삽입합니다."

3. 확인 완료 → 각 BRIEF의 "다른 워커가 확정한 타입" 섹션에 계약 내용 삽입.

---

### Step 3. BRIEF 작성 및 배포

BRIEF.md를 작성하기 전, worktree의 `.gitignore`에 임시 파일을 추가한다:
```bash
# 각 worktree에서 실행
echo "BRIEF.md" >> .worktrees/<branch>/.gitignore
echo "REVIEW_BRIEF*.md" >> .worktrees/<branch>/.gitignore
echo "FIX_BRIEF*.md" >> .worktrees/<branch>/.gitignore
```

각 워커의 worktree 루트에 `BRIEF.md`를 작성. BRIEF는 아래 섹션을 반드시 포함.

**"코드베이스 컨텍스트" 섹션 채우기 우선순위:**
1. `/ddalggak plan` Section 1.5(코드베이스 그라운딩) 결과물이 있으면 → 해당 패턴 레지스트리를 그대로 삽입
2. plan 없이 start한 경우 → Start Step 1에서 탐색한 결과(모듈 구조·따를 패턴·anti-patterns)를 삽입
3. 어느 쪽도 없으면 → BRIEF 작성 전 해당 모듈을 직접 탐색 후 삽입

```
# Worker N (Teammate X) — Phase Y: <제목>

## 전체 맥락
(왜 이 작업을 하는지, 관련 이슈 번호, 다른 워커와의 관계)

## GitHub Issue
- Issue #<number>: <URL>
- 완료 기준: (이슈 body의 Done Criteria)
- 원본 이슈 body + 코멘트:
  (gh issue view <number> --json body,comments 로 한 번 조회 후,
   body 전문을 그대로 삽입하고 이어서 코멘트는 body에 없는 요구사항·설계 결정·범위 변경만 발췌.
   최신 코멘트가 body와 충돌하면 코멘트를 우선한다. 코멘트가 없거나 body와 동일하면 "없음")

### Quality Lens Router Output
- Applicable gate families:
- Skipped gates:
- Required references:
- Lightweight or limited gates:
- Repo/product conventions that outrank generic rules:

### Evidence Contract
- Required evidence:
- Evidence templates applied (UI/deploy/performance/bugfix/security/data/API):
- Evidence not applicable (`not-applicable: <reason>`):
- Blocking evidence gaps:
- Final output requirement: worker는 `Evidence provided`, `Evidence not applicable`, `Blocking evidence gaps`를 반드시 출력한다.

### Task Scope Contract
- Goal: (이번 task가 달성해야 하는 결과)
- Authorized files: (수정 허용 파일)
- Forbidden files/actions: (수정 금지 파일과 금지 행동)
- Allowed side effects: (허용된 side effect; 없으면 none)
- Escalation-required actions: (별도 승인 없이는 금지되는 행동)
- Validation commands: (검증 명령)
- Completion evidence: (완료 증거)
- Boundary rule: tool capability boundary가 task scope contract보다 넓어도, contract 밖 행동은 out-of-scope diff / scope-expansion failure로 보고 중단 또는 escalation한다.

### Simplicity / Deletability Gate
- Required reference: `references/simplicity-deletability-gate.md`
- Default direction: small direct change first
- Abstraction question: why is this abstraction necessary?
- Boundary/reuse evidence: (없음이면 새 helper/provider/wrapper/component/module/fallback 추가 금지)
- Human readability/deletability: SOLID does not outrank readability

### Frontend Design Gate (UI/frontend 해당 시)
- Required reference: `references/frontend-design-gate.md`
- Activation/skip: (UI/frontend/design/page/component/layout/polish/responsive/dashboard/card/CTA/typography/animation/screenshot 또는 `.tsx`/`.jsx`/CSS/Tailwind/design token/Storybook/route/page/component/shared frontend primitive / backend-only skip 사유)
- Aesthetic direction:
- Main visual idea:
- Typography/color/layout/motion choices:
- Preserved product constraints:
- Generic AI UI patterns avoided:
- Screenshot/viewport/manual evidence conditions:
- Forced abstraction prevention: one-off wrapper/provider/design-system layer 금지; small direct change first

### Vercel Agent Skills Gate (해당 시)
- Required reference: `references/vercel-agent-skills-gates.md`
- Applicable upstream skill families: (`react-best-practices`, `composition-patterns`, `react-view-transitions`, `web-design-guidelines`, `deploy-to-vercel`, `vercel-cli-with-tokens`, `react-native-skills` 중 해당 항목)
- Activation/skip: (React/Next component/page/data-fetching/performance, component API/composition, view transition/motion, UI/a11y/UX/screenshot/viewport, Vercel deploy/preview/env/token, React Native/Expo/mobile/native/platform API / backend-only skip 사유)
- React/Next: server/client boundary 유지, unnecessary client component avoidance, hydration/bundle regression avoidance
- Composition: compound/render-prop/context/provider/slot API 추가 시 actual API simplification evidence 필요
- View transitions: coding 전 state spatial/continuity meaning 설명, decorative transition 금지, reduced-motion 고려
- Web design/a11y: contrast/focus/keyboard/responsive/empty-loading-error evidence
- Vercel deploy/token: token source without printing secrets, preview-first, verified URL/env state, explicit production deploy intent 필요
- React Native/Expo: list virtualization, animation performance, platform boundary evidence
- Explicit anti-goals: unnecessary client conversion, one-off compound/context API, decorative transition, token value printed, evidence 없는 UI review 금지

## 현재 상태
- repo root: <절대경로>
- working directory: <절대경로 — 예: /Users/x/.worktrees/fix-123-slug>
- branch: feature/issue-<N>-<slug>/worker-<N>
- base freshness: `git fetch --prune` 및 ahead/behind 확인 결과

## 너의 범위 (이 파일들만 건드려)
1. ...
2. ...

## 금지/Inspect-only 파일
- 수정 금지: (경로 목록)
- 읽기만 허용: (경로 목록)
- ignored/local-only 확인: 필요 시 `git check-ignore -v <path>` 결과 첨부

## 코드베이스 컨텍스트

### 모듈 구조
(관련 디렉토리 목록, barrel exports, 공유 타입 경로)

### 따를 패턴
(유사 구현 코드 발췌 — 경로 포함)

### Anti-patterns (이것은 하지 마)
(deprecated 방식, 교체된 패턴, 이 모듈에서 금지된 접근)

### 공유 언어 / 도메인 용어
(이 이슈에서 같은 의미로 써야 하는 용어, 번역, 약어)

### Deep module / Gray-box 경계
(공개 계약으로 취급할 API·타입, 내부 구현으로 유지할 세부사항, 테스트가 의존해도 되는 gray-box 경계)

### 시작 전 확인 (복명복창)
구현 시작 전, 아래 두 가지를 먼저 출력해:
1. 내가 따를 패턴: (발견한 기존 구현 방식 1줄 요약)
2. 의도치 않게 영향 줄 수 있는 파일: (BRIEF 범위 외 파일 중 수정 가능성 있는 것)

## [의존 워커가 있다면] 다른 워커가 확정한 타입 (stub으로 써)
(코드 블록 그대로)

## 구체 요구사항
(함수 시그니처, 알고리즘, 테스트 케이스 최소 3개: happy path + edge case + error case)
- 구현 품질 기본값: repo 스타일이 허용하면 arrow function 우선, 단일 책임(SRP) 유지, side effect와 pure function 분리, TDD 또는 Unit Test로 핵심 동작 고정, 파일 naming과 companion test/story/helper convention 준수. 컴포넌트/함수 companion 파일이 필요하면 repo convention을 우선하되 `ABC.styles.tsx`, `ABC.constants.tsx`, `ABC.types.tsx`, `ABC.parts.tsx`처럼 대표 이름과 역할 suffix가 드러나는 형태를 사용한다. UI/component 작업에서는 main component only assembles, large conditional UI fragments → `ComponentName.parts.tsx`, calculation/format/parse → `ComponentName.utils.ts`, variant/size/style maps use `satisfies Record<...>`, tests prioritize user behavior and public visual-contract classes, no silent fallback을 확인하고, empty companion files를 만들지 않는다.

## 테스트 우선 계약
- 가능하면 실패 테스트 또는 기대 동작을 먼저 작성한다.
- 테스트를 먼저 쓰기 어렵다면 이유와 대신 확인할 정확한 명령어를 기록한다.

## 완료 조건
1. lint pass (scope 명시)
2. test pass
3. regression 없음 (전체 테스트)
4. validation evidence 정리
5. 독립 이슈 lane이면 commit → push → issue PR 생성까지 완료하고 `ISSUE_PR_READY: #<issue> <PR URL> <commit> <validation>` 한 줄 출력. 이 경우 PR body에 What/Why/Validation/Risk와 `Closes #N` 또는 `Refs #N`를 포함한다.
6. hard conflict fallback lane이면 lane-specific PR을 만들지 않고 fallback integration용 patch/local commit을 준비한 뒤 `LANE_READY: Phase Y W<번호> <patch-or-commit> <validation>` 한 줄 출력.
7. 최종 출력에 `Evidence provided`, `Evidence not applicable`, `Blocking evidence gaps` 포함. required evidence가 비어 있으면 PR ready/approval ready를 주장하지 말고 blocking gap으로 보고

## 병행 워커 참고 (수정 금지)

## 규칙
- 기존 시그니처 호환성 유지
- 테스트 fixture는 가짜 데이터
- BRIEF 범위 밖은 건드리지 마
- 테스트 pass만으로 완료 아님 — 독립 이슈는 commit/push/issue PR/PR URL/evidence까지, conflict lane은 patch/commit/validation/integration handoff까지 완료해야 함. Fallback integration PR 생성은 integrator 단계에서만 수행
- 새 외부 의존성/import 금지. 필요하면 package manifest 또는 repo 검색으로 기존 의존성 존재를 먼저 증명
- 모든 git/file 명령은 worktree 절대 경로 또는 `git -C <worktree>` 사용
- ignored/local-only 파일이면 `git check-ignore -v <path>` 확인 후 PR에 포함하지 말 것

## Conductor Recovery Anchor
- conductor-state 경로: `.ddalggak/conductor-state.md`
- 이 BRIEF의 위치: Phase Y / Worker N
- 완료 시그널 예상: 독립 이슈 lane은 `ISSUE_PR_READY: #<issue> <PR URL> <commit> <validation>`, conflict fallback lane은 `LANE_READY: Phase Y WN <patch-or-commit> <validation>`

시작해.
```

배포:

Step 2A-2에서 teammate에 이미 BRIEF 경로를 포함했으면 별도 전송 불필요.
추가 지시가 필요한 경우:
```
SendMessage(to="worker-<N>", content="BRIEF.md(.worktrees/<branch>/BRIEF.md)를 읽고 지시된 대로 구현해. 독립 이슈 lane이면 완료 후 한 줄: ISSUE_PR_READY: #<issue> <PR URL> <commit> <validation>. conflict fallback lane이면 완료 후 한 줄: LANE_READY: Phase Y W<번호> <patch-or-commit> <validation>.")
```

### Step 4. 대기 및 상태 수집

- 병렬 워커 작업은 3-10분 소요. **ScheduleWakeup으로 4-5분 뒤 체크** (~270s, 캐시 창 유지)

**완료 확인**:
- `TaskGet <task-id>`로 각 teammate 완료 여부 확인
- 완료된 `TaskOutput`에서 독립 이슈 lane은 `ISSUE_PR_READY:` 라인과 PR URL/validation evidence를, conflict fallback lane은 `LANE_READY:` 라인과 validation evidence를 추출
- **실패 복구**: ScheduleWakeup 3회(~13분) 후에도 예상 완료 신호(`ISSUE_PR_READY:` 또는 `LANE_READY:`)가 없으면:
  1. `TaskOutput`으로 teammate 출력 확인 후 원인 진단
  2. "워커 N 응답 없음 — 수동 개입 필요" 보고 후 사용자 대기

모든 독립 이슈 워커가 `ISSUE_PR_READY:`를 출력하고, hard conflict fallback 워커가 `LANE_READY:`를 출력하면 lane 수집 완료. Integrator는 독립 이슈 PR URL/evidence를 수집하고, hard conflict로 묶인 lane만 fallback integration branch에 issue-separated commit으로 반영한 뒤 conflict-fallback PR 하나를 생성한다.

### Step 5. Progressive Review Start

모든 worker 완료를 기다리지 않는다. 각 branch에서 `ISSUE_PR_READY:`, `LANE_READY:` 또는 idle 알림이 오면 즉시 완료 여부를 사실로 검증한다.

```bash
git -C <worktree> log --oneline -3
git -C <worktree> status --short
git -C <worktree> diff --stat
```

- lane patch/commit과 evidence가 있으면 integrator가 integration branch에 별도 commit으로 적용하고, 남은 worker 구현 대기와 병렬로 local diff review를 시작할 수 있다.
- idle 알림만 있고 lane evidence가 없으면 완료가 아니다.
- 구현은 있는데 handoff만 빠진 경우, Conductor는 추상 지시 대신 확인된 정확한 명령을 제공한다:
  ```bash
  git -C <worktree> status --short
  git -C <worktree> diff --stat
  git -C <worktree> diff > /tmp/<lane>.patch
  ```
- local-only 작업이면 PR 대신 `MODIFIED: <path>` 신호와 수동 이슈 처리 상태를 확인한다.

---

## Cross-Review Loop

Cross-Review Loop의 리뷰는 칭찬이나 요약이 아니라 **AI code quality gate**다. CI는 테스트·타입·빌드로 현재 동작의 correctness를 확인하고, fresh reviewer teammate는 PR의 방향·스코프·유지보수성·삭제 가능성을 막는 gatekeeper로 동작한다. "버그가 없다"만으로 통과하지 말고, 장기적으로 repo의 domain boundary, data flow, failure semantics, 기존 패턴을 흐리는 변경도 결함으로 다룬다.

리뷰어는 특히 아래 방향을 선호한다:
- scope 축소: 이슈 완료에 필요한 최소 diff인지 확인한다.
- 기존 패턴 정렬: repo 안의 이미 합의된 구조·명명·오류 처리·테스트 패턴을 우선한다.
- 삭제 가능성: 새 abstraction이 나중에 안전하게 제거·수정 가능한지 본다.
- 명확한 data flow: 상태·fallback·type escape가 실패를 숨기거나 ownership을 흐리지 않는지 본다.
- 복잡도 증가를 defect로 취급: self-created complexity, forced modularization, 불필요한 abstraction/helper/module/provider/wrapper, duplication, silent fallback, local state, client-side patch로 boundary 문제 덮기, `any`/type assertion 같은 type escape 증가는 최소 Medium 이상으로 기록한다. failure semantics를 숨기거나 delivered contract를 이해·수정·삭제하기 어렵게 만들면 High로 본다.

### Quality Lens Router Output

각 REVIEW_BRIEF에는 `references/quality-lens-router.md` 기준의 applicable gate families, skipped gates, required references, lightweight or limited gates, repo/product conventions that outrank generic rules를 포함한다. 리뷰어는 이 출력으로 unrelated backend-only diff에 frontend/UI/deploy/mobile gate를 과적용하지 않는다. Domain gate is a lens, not a mandate이므로 required references의 applicable bullets만 확인하고, backend-only skip 사유가 타당하면 UI/deploy/mobile checklist를 blocking으로 만들지 않는다.

### Continuous Regression Library

각 REVIEW_BRIEF는 반복되는 Medium/High 패턴이 있거나 known recurring regression class와 닮은 finding이 있을 때 `references/regression-library.md`를 포함한다. 리뷰어는 Generic AI UI, unnecessary provider/helper/wrapper, silent fallback, server/client boundary violation, token leakage, screenshot-free UI approval, production deploy without explicit request, overfitted incident rule, test-after instead of TDD, readability-hostile SOLID/pattern application 같은 class-level failures를 확인한다.

반복 Medium/High 패턴이 library에 없으면 리뷰 output에 **Regression Library Candidate**를 제안한다. Candidate는 one-off PR/issue/file 이름이 아니라 generalized failure class, detection signal, blocking review rule, minimal fixture/evidence idea를 포함해야 한다. transient incident는 memory에 저장하지 않고, durable pattern만 skill/reference 또는 follow-up issue 후보로 남긴다.

Gate priority/conflict order는 정확히 1 explicit user request, 2 repo/product convention, 3 safety/security/correctness, 4 human readability/deletability, 5 evidence-backed performance/accessibility, 6 generic upstream best practice, 7 named principles/patterns such as SOLID 순서로 해결한다. repo/product convention은 generic upstream best practice보다 우선한다.

### Evidence Contract

각 REVIEW_BRIEF에는 `references/evidence-contract.md` 기준의 Evidence Contract를 포함한다. 리뷰어는 PR body, Validation, 로그, screenshot, preview URL, benchmark, regression test, adversarial/security case, actual API response/query evidence를 required evidence와 대조한다. required evidence가 없으면 High/blocking finding으로 분류하고, 해당 gap이 남아 있는 동안 `APPROVE`, PR ready, merge-ready 결론을 남기지 않는다.

### Simplicity / Deletability Gate

각 REVIEW_BRIEF에는 `references/simplicity-deletability-gate.md` 기준의 Simplicity / Deletability Gate를 포함한다. 리뷰어는 one-off abstraction을 기본 High finding으로 보고, helper/provider/wrapper/component/module/fallback이 실제 reuse 또는 boundary clarification 없이 추가됐는지 확인한다. Review Rubric에는 human readability/deletability 항목을 포함하고, SOLID/pattern 적용이 human readability를 낮추면 통과시키지 않는다.

### Frontend Design Review Gate

UI PR의 REVIEW_BRIEF에는 `references/frontend-design-gate.md` 기준 Frontend Design Review Gate를 포함한다. 리뷰어는 design intent와 product fit, typography/hierarchy/spacing, palette, layout/grid/alignment/density/responsive behavior, useful performant motion, empty/loading/error states, keyboard/contrast/semantics/reduced motion/focus states, minimal/reviewable code, screenshot/viewport/Storybook/browser/manual evidence를 확인한다.

Component PR이면 component methodology gate도 확인한다: main component only assembles, `ComponentName.parts.tsx`로 큰 조건부 UI fragment 분리, `ComponentName.utils.ts`로 calculation/format/parse 분리, variant/size/style maps use `satisfies Record<...>`, tests prioritize user behavior and public visual-contract classes, no silent fallback, empty companion files 금지.

Blocking examples: polish claim without design direction/evidence, generic AI/template layout/colors/fonts, one-off UI wrapper/provider/design-system layer, breaking product grid/rhythm/responsive constraints, missing screenshot/manual verification for visual acceptance criteria. Subjective taste alone is not a blocker; product-specific constraints outrank novelty.

### Vercel Agent Skills Review Gate

React/Next, component API, motion, web design/a11y, Vercel deployment/token, React Native/Expo PR의 REVIEW_BRIEF에는 `references/vercel-agent-skills-gates.md` 기준 Vercel Agent Skills Gate를 포함한다. 리뷰어는 React/Next correctness, performance evidence, component API quality, animation meaning, UI/a11y evidence, Vercel deploy safety, React Native/Expo constraints를 확인한다. Blocking examples: unnecessary client conversion, one-off compound/context API, decorative transition without continuity/reduced-motion, production mutation without explicit production deploy intent, token value printed, UI review without file/line/screenshot/viewport evidence.

### Step 0. 대상 PR 확정

PR 목록을 보기 전 base freshness를 먼저 확인한다:
```bash
git fetch --prune
git status -sb
git branch --show-current
git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
```

**인수 파싱 (반드시 이 순서로 판정)**:

1. **인수로 PR 번호가 전달된 경우** (`/ddalggak review 123` 또는 `123 456` 복수): 해당 번호들을 대상으로 삼는다.
2. **인수 없음**: open PR을 자동 탐색한다.
   ```bash
   gh pr list --author @me --state open --json number,title,headRefName,url
   ```
   open PR이 0개이면 즉시 중단:
   ```
   ⛔ 리뷰할 open PR이 없습니다.
   워커가 아직 push하지 않았으면 /ddalggak status로 상태를 확인하세요.
   ```
   open PR이 있으면 목록을 출력하고 `AskUserQuestion`으로 확인:
   ```
   Q: 리뷰 대상 PR을 선택해 주세요.
     A. 전체 (N개 모두)
     B. 특정 PR 번호 지정
   ```

PR 목록 확정 후 Step 1로 진행.

### Step 1. Reviewer 매핑

각 PR마다 **dedicated reviewer teammate를 fresh로 생성**한다. 구현자(`worker-N`) teammate를 reviewer로 **재사용하지 않는다**.

**이유**: 구현자 conversation에는 자기 BRIEF.md·구현 결정 잔상이 남아 있어 "내가 짠 패턴 = 옳은 패턴" 편향이 샌다. fresh teammate는 PR diff만 보고 판단한다.

**금지**:
- 구현자 teammate 재사용 (implementation context 오염)
- Self-review (같은 PR의 author와 reviewer가 동일 teammate)
- 한 teammate가 두 PR을 동시에 리뷰 (cross-context 오염)

**생성**: PR마다 1개씩 새 teammate. 기본 리뷰는 `gh pr view`/`gh pr diff`만 사용하고 implementation worktree에서 `git checkout` / `gh pr checkout`을 하지 않는다. 로컬 빌드·테스트가 꼭 필요하면 `/tmp/pr-<num>-review` 같은 별도 checkout을 만든다.
  ```
  TeamCreate(name="reviewer-pr<num>", cwd="<repo-root>", ...)
  ```
  이름 컨벤션: `reviewer-pr<num>` (PR 번호 사용, worker-N 아님)

**배포**: `SendMessage`로 리뷰 작업 전달
  ```
  SendMessage(to="reviewer-pr<num>", content="PR #<num>을 리뷰해. REVIEW_BRIEF_PR<num>.md(<repo-root>/.ddalggak/reviews/REVIEW_BRIEF_PR<num>.md)를 읽고 지시대로 수행. implementation worktree에는 들어가지 말고 gh pr view/diff/checks를 우선 사용해. 완료 후 한 줄: REVIEW DONE PR#<num>: <APPROVE|CHANGES_REQUESTED> critical=N high=N medium=N low=N")
  ```

**재리뷰(Step 5)**: 같은 `reviewer-pr<num>` teammate 유지. 이전 iteration에서 지적한 항목 기억이 재리뷰 정확도에 도움된다.

### Step 2. REVIEW_BRIEF 작성

리뷰 brief는 implementation worktree가 아니라 repo root의 local-only 상태 경로(권장: `<repo-root>/.ddalggak/reviews/REVIEW_BRIEF_PR<num>.md`) 또는 `/tmp`에 작성한다. reviewer teammate의 cwd도 implementation worktree가 아니라 repo root 또는 별도 review checkout이어야 한다. 포함할 내용:

```
# Reviewer Brief — Teammate X reviews PR #<num>

## 맥락
- 대상 PR, 작성자 브랜치
- 원 GitHub Issue: 이슈 번호는 PR body의 `Closes #N` 또는 BRIEF의 GitHub Issue 섹션에서 확인.
  조회 명령어: gh issue view <issue-number> --json number,title,body,url,comments (한 번 조회)
- 이슈 완료 기준: (BRIEF의 완료 기준 섹션 그대로)
- 이슈 body 핵심 요구사항: (이슈 body에서 구현 기준·제약·완료 조건 발췌)
- Quality Lens Router Output: applicable gate families, skipped gates, required references, lightweight/limited gates, repo/product conventions that outrank generic rules, backend-only skip reason when applicable
- Evidence Contract: required evidence, evidence templates applied(UI/deploy/performance/bugfix/security/data/API), `not-applicable: <reason>` items, blocking evidence gaps
- Task Scope Contract: Goal, Authorized files, Forbidden files/actions, Allowed side effects, Escalation-required actions, Validation commands, Completion evidence; tool capability boundary와 task scope contract 분리; out-of-scope diff / scope-expansion failure 후보
- Diff Footprint / Scope Expansion Review: PR changed files, side effects, config/credential/migration/branch operations, cleanup/refactor footprint를 Task Scope Contract와 대조
- Simplicity / Deletability Gate: one-off abstraction default High, human readability/deletability, "why is this abstraction necessary?", SOLID does not outrank readability
- Counterargument Pass: 약한 가정, repo convention 충돌 가능성, readiness를 반증할 evidence, 더 작은 직접 변경 대안을 먼저 확인
- Continuous Regression Library: repeated Medium/High patterns checked against `references/regression-library.md`; **Regression Library Candidate** suggested when a durable generalized class is missing
- Frontend Design Review Gate (UI PR일 때): design intent/product fit, typography/hierarchy/spacing, palette, layout/grid/alignment/density/responsive behavior, useful performant motion, empty/loading/error states, keyboard/contrast/semantics/reduced motion/focus states, minimal/reviewable code, screenshot/viewport/Storybook/browser/manual evidence, generic AI/template/evidence blockers
- Component methodology gate (UI/component PR일 때): main component only assembles, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `satisfies Record<...>`, user behavior와 public visual-contract classes 중심 테스트, no silent fallback, empty companion files 금지
- Vercel Agent Skills Gate (해당 PR일 때): React/Next correctness, performance evidence, component API quality, animation meaning, UI/a11y evidence, Vercel deploy safety, React Native/Expo constraints; backend-only skip/lightweight 사유
- 이슈 코멘트 보완 사항: (같은 조회 결과에서, body에 없고 코멘트에만 있는 요구사항·설계 결정·범위 변경 발췌. 최신 코멘트가 body와 충돌하면 코멘트를 우선한다. 코멘트가 없거나 body와 동일하면 "없음")

## 리뷰 방법
1. gh pr view <num> --json title,body,files,commits,baseRefName,headRefName,reviews,statusCheckRollup
2. gh pr diff <num>
3. CI 결과 우선:
   - `gh pr checks <num>` 결과를 먼저 확인하고 그대로 인용한다.
   - CI가 이미 실행하는 검증(typecheck / lint / unit test / build)은 로컬에서 중복 실행하지 않는다. CI 결과를 신뢰한다.
   - CI fail이면 → 자동 Critical (선결 체크 1과 일관). 재현 위한 직접 실행 불필요.
   - CI가 커버하지 않는 영역(통합 시나리오, UI 동작, 환경 변수 분기, 빌드 산출물 확인 등) 또는 diff만으로 동작 판단이 불가한 경우에만 별도 review checkout(`/tmp/pr-<num>-review`)에서 직접 검증. implementation worktree에서 `git checkout` / `gh pr checkout` 금지.
4. 같은 PR 안 commit-lane 순서 의존성이 있으면 선행 commit/contract, 비교 기준, 현재 base와의 불일치가 의도된 것인지 기록
5. 아래 AI Code Quality Gate checklist와 Review Rubric으로 심각도 분류

> **리뷰 초점**: CI는 코드 정상성을 검증한다. 리뷰어는 AI가 만든 diff가 repo의 방향을 망가뜨리지 않는지 지키는 gatekeeper다. 설계, domain boundary, data flow, failure semantics, scope creep, 추상화 삭제 가능성, 기존 패턴 drift, 보안, 의도 불일치에 집중한다.
> CI status는 증거로 인용하되, 리뷰 결론은 behavior intent, 이슈 scope, code quality, architecture/domain boundary, maintainability/deletability를 중심으로 판단한다.

## AI Code Quality Gate checklist
- Scope & Ownership
  - 이 PR이 이슈 완료 기준에 필요한 최소 범위인가?
  - author branch가 건드리면 안 되는 파일·domain·team ownership을 침범하지 않았는가?
  - 새 기능·광범위 refactor·관련 없는 cleanup이 섞였으면 severity를 올린다.
- Diff Footprint / Scope Expansion Review
  - 모든 변경 파일과 side effect가 Task Scope Contract의 Authorized files / Allowed side effects 안에 있는가?
  - tool capability boundary와 task scope contract가 분리되어 있는가?
  - 허용 파일 밖 수정, unrelated cleanup/refactor, 요청되지 않은 config 변경, credential/secret/token 파일 변경, destructive action, migration 변경, 외부 API write, production data touch, force-push 또는 branch mutation은 out-of-scope diff / scope-expansion failure High/Critical 후보로 분류한다.
- Counterargument Pass
  - 이 plan/PR을 실패하게 만들 약한 가정은 무엇인가?
  - 기존 repo convention 중 이 접근과 충돌할 수 있는 것은 무엇인가?
  - PR ready 또는 APPROVE 결론을 반증할 evidence gap은 무엇인가?
  - 이슈를 만족하는 더 작은 직접 변경 대안이 있는가?
- Simplicity & Deletability
  - 불필요한 abstraction/layer/config/helper/module/provider/wrapper/fallback/local state가 추가되지 않았는가?
  - 6개월 뒤 이 변경을 쉽게 수정·삭제할 수 있는가?
  - 새 추상화가 실제 반복 코드를 줄이거나 boundary를 명확히 한다고 증명되는가, 아니면 forced modularization인가?
  - "나중에 확장 가능"만을 이유로 복잡도가 늘었으면 결함으로 본다.
- Existing Patterns
  - repo의 기존 파일 구조, naming, error handling, test style, dependency 사용 패턴과 맞는가?
  - 유사 기능을 새로 복제하지 않고 기존 helper/contract를 재사용했는가?
  - pattern drift가 있으면 "동작함"이어도 Medium/High로 기록한다.
- Failure Semantics
  - 실패를 조용히 삼키는 fallback/default/cache/local state가 없는가?
  - 에러가 호출자·사용자·로그·테스트에 명확히 드러나는가?
  - client-side patch가 server/request/auth/data boundary 실패를 숨기지 않는가?
  - auth/redirect/data-boundary 동작을 mock-only tests가 아니라 실제 계약에 가까운 검증으로 확인했는가?
  - silent fallback이 core contract 실패를 숨기면 High로 본다.
- Human Readability / Deletability
  - diff가 작고 읽기 쉬우며 data flow가 한눈에 추적되는가?
  - type escape(`any`, broad assertion, unchecked cast), 중복 구현, naming/ownership 혼동이 리뷰 가능성을 낮추지 않는가?
  - 6개월 뒤 수정·삭제가 쉬운가, 아니면 structure가 과도하게 얽혀 있는가?
  - SOLID/pattern 적용이 human readability를 낮추면 readability가 우선한다.
  - reviewer가 diff만으로 의도를 검증하기 어렵다면 scope 축소 또는 follow-up 분리를 요구한다.
- Rendered Evidence
  - frontend 변경은 route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, contract graph evidence를 제공했는가?
  - 누락된 증거는 `not-applicable: <reason>`, Medium, High로 분류했는가? 완료 기준·critical path·privacy/security·fallback 누락은 High 후보로 본다.
- Frontend Design Review Gate
  - UI PR은 Frontend Design Brief와 design intent가 명확하고 product fit이 있는가?
  - typography/hierarchy/spacing, palette, layout/grid/alignment/density/responsive behavior가 기존 product rhythm과 맞는가?
  - motion/interactions가 useful performant motion이고 empty/loading/error states가 다듬어졌는가?
  - keyboard/contrast/semantics/reduced motion/focus states가 확인됐는가?
  - generic AI/template layout/colors/fonts, evidence 없는 polish claim, one-off wrapper/provider/design-system layer, forced abstraction, screenshot/manual verification 누락이 있으면 blocking candidate로 본다.
- Component methodology gate
  - UI/component PR에서 main component only assembles가 지켜지고, 큰 조건부 UI fragment만 `ComponentName.parts.tsx`로 분리됐는가?
  - calculation/format/parse 로직은 `ComponentName.utils.ts`로 분리할 만큼 non-trivial할 때만 분리됐는가?
  - variant/size/style maps use `satisfies Record<...>`로 누락을 드러내고, unknown variant/size/state에 no silent fallback을 지켰는가?
  - tests prioritize user behavior and public visual-contract classes이며 private implementation detail class를 과도하게 고정하지 않는가?
  - `ComponentName/ComponentName.tsx`, `ComponentName.types.ts`, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `ComponentName.spec.tsx`, `ComponentName.stories.tsx`, `index.ts` 구조는 실제 역할/크기/검증 필요가 있을 때만 만들고 empty companion files를 피했는가?
- Vercel Agent Skills Gate
  - React/Next correctness: server/client boundary, data fetching ownership, hydration risk, bundle growth를 확인했는가?
  - Performance evidence: claimed improvement가 measurement 또는 validation으로 뒷받침되는가?
  - Component API quality: compound/render-prop/context/provider/slot API가 실제 API 단순화 근거 없이 추가되지 않았는가?
  - Animation meaning: transition이 continuity/state/identity를 전달하고 reduced-motion을 고려하는가?
  - UI/a11y evidence: contrast/focus/keyboard/responsive/empty-loading-error 및 file/line/screenshot/viewport evidence가 있는가?
  - Vercel deploy safety: preview-first, explicit production deploy intent, token secrecy, env var scope, verified URL/env state가 확인됐는가?
  - React Native/Expo constraints: list virtualization, animation performance, native/platform boundary, device-specific behavior가 검토됐는가?
- Evidence Contract
  - PR이 required evidence를 제공했는가, 아니면 각 항목을 `not-applicable: <reason>`으로 구체적으로 제외했는가?
  - UI/deploy/performance/bugfix/security/data/API template 중 적용 대상이 누락되지 않았는가?
  - required evidence가 누락되면 High/blocking으로 기록하고 `APPROVE` 또는 PR ready 결론을 남기지 않는다.
- Transitive rendered fallback
  - list/detail surface, shared card/media primitive, missing media, empty DB/data, nullable fields, mapper defaults를 전이적으로 검토했는가?
  - shared primitive가 범위 밖이면 callsite mitigation 또는 follow-up/blocker가 있는가?
- Analytics/privacy
  - analytics 이벤트는 allowlist/denylist 계약을 따르는가?
  - raw search terms, prompt titles/bodies, arbitrary user-entered text, email/name/profile identifiers, full query strings가 기본 전송되지 않는가?

## 선결 체크 (리뷰 전 반드시)
1. `gh pr checks <num>` — **fail이 하나라도 있으면 자동 Critical**. 이유 기록 필수.
   - CI fail 원인이 "의존 PR 미merge" 또는 "stacked PR"이라도 Critical 유지. 올바른 수정은 PR을 의존 브랜치 위로 rebase해 CI를 통과시키는 것이지, 심각도를 낮추는 것이 아님.
   - `cancelled` 상태만 있는 경우: **Warning**으로 분류하고 재실행 권장
2. `gh pr view <num> --json baseRefName` — base가 main이 아니면 stacked PR. diff는 base 브랜치 기준으로 읽어야 맞음.

## Review Rubric / 심각도 기준
- Critical: 보안 취약점, secret 노출, 데이터 유실, CI/test/typecheck/lint/build 실패, 명백한 오작동, destructive migration, 스펙과 정반대 동작.
- High: architecture/domain boundary 위반, 잘못된 data flow, silent fallback이 실패를 숨김, client-side patch가 server/request/auth/data boundary 문제를 우회함, 과도한 scope creep, one-off abstraction 기본값, 삭제·수정하기 어려운 abstraction 또는 forced modularization, SOLID/pattern 적용으로 human readability가 낮아짐, core contract 테스트 누락, 중대한 성능/동작 버그, 스펙 핵심 동작 불일치.
- Medium: duplicate implementation, naming/ownership confusion, 불필요한 local state, type escape 증가(`any`, broad assertion, unchecked cast), inconsistent error handling, 기존 패턴과 subtle mismatch, 마이너 버그, 누락된 edge case 테스트.
- Low: docs/comments/readability, 스타일 nit, follow-up cleanup. 단, Low가 core contract나 shared contract를 흐리면 Medium 이상으로 올린다.

복잡도 증가는 자체로 결함이다. self-created complexity, forced modularization, 불필요한 abstraction/helper/module/provider/wrapper, duplication, fallback, local state, type escape가 추가되면 "동작한다"는 이유만으로 통과시키지 말고 위 기준에 따라 기록한다. 새 추상화보다 삭제·직접화·boundary clarification이 가능한지 먼저 묻는다.

## 리뷰 작성
Critical+High = 0이고 required evidence gap = 0이면 `gh pr review <num> --approve --body "..."`. 단, reviewer 독립성이 충분하지 않거나 formal GitHub approval이 부적절하면 approval review 대신 top-level PR comment를 남긴다.
Critical+High > 0 또는 required evidence gap > 0이면 `gh pr review <num> --request-changes --body "..."`. formal request-changes도 부적절하면 top-level PR comment로 `CHANGES_REQUESTED` conclusion을 남긴다.

Approval-comment fallback 본문에는 반드시 current head SHA, review scope, validation evidence, blocking finding count, `APPROVE` 또는 `CHANGES_REQUESTED` conclusion을 포함한다. `APPROVE` conclusion은 green CI와 함께 `ready for manual merge` 보고까지만 허용하며 merge 또는 auto-merge enable을 승인하지 않는다.

본문 구조:
## Verdict
## Issues
### Critical (N)
### High (N)
### Medium (N)
### Low (N)
## Summary

## Merge-order context
- 선행 PR / 의존 브랜치: (없음 또는 PR#)
- 비교 기준: baseRefName/headRefName
- 현재 base와 diff 불일치가 의도인지: (예/아니오/불명확)

## 완료 출력
REVIEW DONE PR#<num>: <APPROVE|CHANGES_REQUESTED> critical=N high=N medium=N low=N

## 규칙
- 수정 금지 (작성자가 수정함)
- 최초 1회만 리뷰
- implementation worktree에서 checkout 금지. 필요 시 별도 `/tmp/pr-<num>-review` checkout 사용
```

**주의**: 같은 GitHub 계정이면 self-approve가 막힘. "Cannot approve your own pull request" 에러 시 `gh pr review <num> --comment --body ...` 또는 `gh pr comment <num> --body-file ...`로 top-level PR comment를 남기고, comment에 head SHA, review scope, validation evidence, blocking finding count, conclusion을 포함한다.

### Step 3. 리뷰 수집 (streaming)

reviewer teammate 여러 명의 완료를 streaming polling으로 들어오는 대로 사용자에게 보고한다. Step 4 batch Fix 라우팅 흐름은 그대로 유지.

폴링 절차:
1. 첫 ScheduleWakeup: 240s (270s 미만, 캐시 창 유지).
2. 깨어나면 `TaskList`로 `reviewer-pr*` 전체 상태 조회.
3. 새로 완료된 teammate마다 `TaskOutput`에서 `REVIEW DONE PR#` 라인 추출 → 사용자에게 즉시 한 줄 보고:
   `✅ PR#<num> 리뷰 완료 — verdict: <APPROVE|CHANGES_REQUESTED> critical=N high=N medium=N low=N`
   → "수집 완료" 집합에 추가.
4. 미완료 teammate가 남아 있으면 다시 ScheduleWakeup(~240s) 반복.
5. 모두 완료(또는 명시적 wait 처리)될 때까지 반복.

**중복 보고 방지**: "수집 완료" 집합으로 동일 PR이 두 번 보고되지 않도록 추적한다.

**실패 복구**: 동일 reviewer가 3회(~12분) 폴링 후에도 미완료면 "리뷰어 PR#<num> 응답 없음 — 수동 개입 필요" 보고. **해당 PR만** wait 처리, 다른 PR 폴링은 계속 진행.

> **역할 분리**: GitHub 코멘트(`gh pr review`)는 reviewer teammate가 본인이 직접 단다. Step 3 폴링은 Conductor 진행 가시성 확보용이다. Conductor는 `gh pr review`를 호출하지 않는다.

종료 후 PR마다 `(verdict, critical, high)`을 파싱해 Step 4로 전달한다. Step 4 진입 조건은 **모든 PR 수집 완료**이다 (batch Fix 라우팅 흐름 유지).

### Step 4. Fix 라우팅

각 PR별로:
- **Critical+High = 0**: 통과
- **Critical+High > 0**: 해당 PR 작성자의 worktree에 `FIX_BRIEF_PR<num>_<iter>.md` 작성

FIX_BRIEF 내용:
```
# Fix Brief — Iteration N for PR #<num>

## 리뷰 결과
- Verdict, 심각도별 카운트

## 너의 할 일
기본 방향: 기존 기능은 유지하되 diff를 줄인다. 중복, premature abstraction, forced modularization, 불필요한 helper/module/provider/wrapper/fallback, silent fallback, type escape, 불필요한 local state를 제거하고 repo의 기존 패턴과 올바른 server/request/auth/data boundary에 맞춘다. 새 추상화를 추가하기 전에 삭제·직접화·boundary clarification으로 해결할 수 있는지 증명한다. auth/redirect/data-boundary 수정은 mock-only tests만으로 완료 처리하지 않는다. 새 기능이나 광범위 refactor는 하지 않는다.

### High (필수 수정)
- <구체 이슈 1> — 사유 + 수정 방향 (2가지 옵션 제시)
### Medium/Low (권장)
- 미머지 PR 출력값·공유 계약 전환에 의존하는 Medium/Low는 직접 구현하지 말고 TODO/follow-up으로 제한

## 작업 순서
1. 코드 수정
2. lint/test/build 통과
3. 새 fix commit 생성 (`git commit -F <msg-file>`)
4. git push origin <branch>
5. gh pr comment <num> --body "Iteration N fix: <요약>"

## 완료 출력
FIX DONE PR#<num> iterN: high_fixed=<N> medium_fixed=<N> low_fixed=<N>
또는
FIX FAILED PR#<num> iterN: <사유>

## 규칙
- 수정은 새 커밋 + 일반 push가 기본. `commit --amend` / `push --force-with-lease`는 사용자가 명시 승인하고 branch protection·SafetyGuard·stacked PR 영향을 확인한 경우만 허용
- 리뷰어가 지적 안 한 곳은 수정 금지
- 기존 기능 유지, diff 축소, 기존 repo 패턴 정렬이 기본값이다. 새 feature, broad refactor, 임의 dependency 추가 금지
- duplication/premature abstraction/forced modularization/silent fallback/type escape/local state 증가는 제거하거나 리뷰 코멘트에 근거 있는 예외를 남긴다
- client-side patch로 server/request/auth/data boundary 문제를 덮지 말고, mock-only tests가 boundary 동작의 유일한 증거가 되지 않게 한다
- Medium/Low만 남았고 미머지 PR이나 공유 계약 전환에 의존하면 직접 수정 대신 TODO/follow-up issue로 제한
```

### Step 5. 재리뷰

각 fix 완료 후 원래 리뷰어에게 재리뷰 지시:
```
PR #<num>이 iteration N fix commit으로 갱신되었다. 최신 상태로 재리뷰해.
같은 심각도 기준으로 재평가 후 gh pr review <num> --comment --body로 새 verdict 포스팅.
완료 후 한 줄: REVIEW DONE PR#<num> iter<N+1>: <verdict> critical=N high=N medium=N low=N
```

**Stacked PR 주의**: base가 새 fix commit으로 갱신되거나, 명시 승인된 amend/force-push로 바뀔 때 하위 PR의 author에게 rebase도 지시:
```
PR #<base>가 fix commit으로 갱신되었다. 너의 PR #<dep>은 stack되어 있으므로 새 base 위로 rebase해야 한다.
순서: git fetch origin → git rebase origin/<base-branch> → 충돌 없으면 test 확인 → git push --force-with-lease(명시 승인된 stacked rebase인 경우) 또는 일반 push 가능 여부 확인 → gh pr comment <dep> --body "..."
완료 출력: REBASE DONE PR#<dep> on-top-of-<base>-iterN
충돌 시: RESOLVE FAILED 라인과 conflict 파일 나열
```

### Step 6. 탈출 조건

- 모든 PR의 Critical+High = 0 → 루프 종료, 사용자에게 merge 준비 상태 보고
- 3회 반복 후에도 미해결 → 사용자에게 질문:
  - "3회 iteration에도 PR #X의 High/Critical이 남았습니다. 추가 3회 반복?"
  - Yes → iteration 카운터 리셋해서 3회 더
  - No → 현재 상태로 보고, 수동 개입 대기

### Step 7. Merge 대기

루프 종료 후 사용자가 직접 머지하는 것을 기다린다. Conductor는 push/merge 직접 수행 금지.

모든 PR merge 완료 후 다음 Phase가 있으면 **Phase 전환** 섹션으로 이동한다.

---

## Phase 전환

한 Phase가 완료(모든 PR merge)되면 다음 Phase 준비:

**진입 전 안전 체크 (필수)**:
```bash
# 현재 Phase의 모든 PR이 merge됐는지 확인
gh pr list --state open
# open PR이 0개여야 다음 단계로 진행

# 각 worktree의 uncommitted 작업 확인
git worktree list --porcelain
# 각 경로에서: git -C <worktree-path> status --short
```
uncommitted 작업이 있으면 즉시 중단하고 사용자에게 보고한다.

1. 사용자가 "Phase N+1 진행" 지시
2. Phase N+1 worktree를 **새 main**에서 리셋:
   ```bash
   git fetch origin main
   for wt in <phase-N+1 worktrees>; do
     git -C "$wt" status --short
     git -C "$wt" rebase --abort 2>/dev/null || true
     git -C "$wt" reset --hard
     git -C "$wt" clean -fd
     git -C "$wt" checkout -B <new-branch> origin/main
   done
   ```
3. 각 teammate에 새 Phase BRIEF 전달:
   ```
   SendMessage(to="worker-<N>", content="새 Phase N+1 작업을 시작한다. BRIEF.md(.worktrees/<branch>/BRIEF.md)를 읽고 시작해.")
   ```
4. 새 BRIEF 작성 및 배포 (Step 3부터 반복)

---

## Status

- read-only snapshot 전에 base freshness를 확인한다:
  ```bash
  git fetch --prune
  git status -sb
  git branch --show-current
  git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
  ```
- `TaskList`로 진행 중인 teammate 작업 상태 전체 조회
- `gh pr list --author @me --state open --json number,title,headRefName,url`로 열린 PR 수집
- PR body의 `Closes #N`으로 이슈 연결 파악
- 각 open PR은 `gh pr view <num> --json baseRefName,headRefName,statusCheckRollup`로 stale/CI 상태를 구분

**출력**:
- 현재 Phase
- 각 teammate의 (task, status, worktree, 연관 이슈)
- 열린 PR 목록
- 다음 액션 제안

---

## Issue-Ready Plan

GitHub issue 등록 전, 저성능 모델이 실행 가능하고 review agent가 평가 가능한 구체 구현 계획을 작성한다. `/ddalggak issue`의 소스 자료가 된다.

구현 코드를 작성하지 않는다. 사용자가 명시적으로 요청하지 않으면 GitHub issue도 등록하지 않는다.

### Quality Lens Router Output

계획서는 구현 단위보다 먼저 `references/quality-lens-router.md` 기준의 applicable gate families, skipped gates, required references, lightweight or limited gates, repo/product conventions that outrank generic rules를 기록한다. Domain gate is a lens, not a mandate이므로 UI, React/Next, component API, motion, deploy/token, bugfix, backend-only 같은 작업 유형별 gate 적용·생략 이유와 backend-only skip reason을 명시하고, 필요한 domain gate만 계획에 포함한다.

반복되는 AI code-quality 리스크가 이미 알려진 경우에만 `references/regression-library.md`를 계획의 review checklist에 유용한 범위에서 연결한다. 계획은 one-off incident를 memory에 저장하지 않고, class-level failure로 일반화 가능한 경우에만 follow-up issue 또는 Regression Library Candidate로 남긴다.

Gate priority/conflict order는 정확히 1 explicit user request, 2 repo/product convention, 3 safety/security/correctness, 4 human readability/deletability, 5 evidence-backed performance/accessibility, 6 generic upstream best practice, 7 named principles/patterns such as SOLID 순서로 해결한다. domain gate는 repo convention이나 product direction을 덮어쓰지 않는다.

### Evidence Contract

계획서는 구현 단위보다 먼저 `references/evidence-contract.md` 기준의 Evidence Contract를 작성한다. required evidence, 적용할 UI/deploy/performance/bugfix/security/data/API template, 정확한 증거 산출물(명령어·로그·screenshot·preview URL·benchmark·API response 등), `not-applicable: <reason>`, blocking evidence gaps를 정의한다. evidence가 없으면 review가 High/blocking으로 분류하고 PR ready/APPROVE 결론을 막는다는 조건을 계획에 포함한다.

### Simplicity / Deletability Gate

계획서는 구현 단위보다 먼저 `references/simplicity-deletability-gate.md` 기준의 Simplicity / Deletability Gate를 작성한다. 각 구현 단위가 새 abstraction/helper/provider/wrapper/component/module/fallback/pattern을 포함하면 "why is this abstraction necessary?"에 답하고 small direct change alternative, real reuse 또는 boundary clarification, human readability/deletability 판단을 기록한다. SOLID does not outrank readability 원칙을 계획에 포함한다.

### Frontend Design Brief

UI/frontend/design/page/component/layout/polish/responsive/dashboard/card/CTA/typography/animation/screenshot 작업, `.tsx`/`.jsx`/CSS/Tailwind/design token/Storybook/route/page/component/shared frontend primitive 변경, Bokbuk/orbit-dashboard 같은 product context가 있으면 구현 단위보다 먼저 `references/frontend-design-gate.md` 기준의 `Frontend Design Brief`를 작성한다.

포함 항목: product/user context, existing design constraints/system, aesthetic direction, memorable visual idea, typography, color/theme, layout/spatial composition, motion/interactions, background/detail, accessibility constraints, explicit anti-goals. anti-goals에는 generic AI/template UI, 근거 없는 default typography, product 맥락 없는 gradient/card-grid cliché, readability/performance를 해치는 decorative motion, one-off UI 변경을 위한 forced abstraction을 포함한다. backend/API-only, test-only, narrow functional bugfix는 skipped gate로 기록한다.

### Step -1. 인수 처리

**인수 파싱 (반드시 이 순서로 판정)**:

1. **인수로 텍스트가 전달된 경우** (`/ddalggak plan <요구사항 텍스트>`): 해당 텍스트를 Source of truth(사용자 프롬프트)로 삼고 Section 0(명확화 루프)으로 진행한다.
2. **인수 없음**: Section 0에서 명확화 질문으로 요구사항을 수집한다.

### 0. 명확화 질문 루프 (Clarification Loop)

`Section 1` 진행 전, 불명확하거나 확인이 필요한 항목이 있으면 `AskUserQuestion`으로 객관식 질문한다.

**질문 트리거 조건:**
- Goal이 복수이거나 모호한 경우
- Source of truth(이슈/문서/프롬프트)가 불충분한 경우
- Constraints / Non-Goals가 명시되지 않은 경우
- 구현 방식에 설계 선택지가 존재하는 경우 (예: 수정 vs. 신규 파일)
- 범위가 불명확하여 파일 소유권을 특정할 수 없는 경우

**질문 규칙:**
- `AskUserQuestion` 도구를 사용한다. 자유 입력 형태로 묻지 않는다.
- 한 번에 1-4개 항목을 묶어 질문한다.
- 모든 질문은 **객관식** 옵션으로 제공한다 (사용자가 선택만 하면 됨).
- 답변 후 새로운 불명확 항목이 발생하면 다시 질문한다.
- **질문이 없을 때까지 반복**한다.
- 명확화 완료 후 Section 1로 진행한다.

**질문 예시 패턴:**
```
Q: 구현 범위를 어디까지 볼까요?
  A. 이슈에 명시된 파일만 수정
  B. 연관 테스트 파일까지 포함
  C. 문서·타입 파일도 포함
  D. 코드베이스 탐색 후 결정

Q: 기존 코드를 어떻게 처리할까요?
  A. 기존 파일 수정
  B. 신규 파일로 분리
  C. 기존 파일 수정 + 신규 파일 추가
  D. 현재 구조 확인 후 결정

Q: 이 작업의 완성도 기준은?
  A. 핵심 기능 완성 (edge case는 후속 이슈)
  B. 견고성 포함 (edge case·에러 처리)
  C. 성능 최적화까지
```

---

### 1. 요청 계약 파악

다음 항목을 식별하고 기록:

- `Goal`: 사용자/유지보수자가 볼 수 있는 결과
- `Why`: 필요 이유와 해결하는 실패/gap
- `Source of truth`: 사용자 프롬프트, GitHub 이슈 번호, PR, 브랜치, 코드 근거
- `Repo context`: repo 경로, base 브랜치, 관련 모듈, 패키지 매니저, 검증 명령어
- `Constraints`: 비목표, 릴리스/게시 제한, 언어 요구사항
- `Unknowns`: 프롬프트나 repo에서 안전하게 추론할 수 없는 사실

**Subject 자동 추론** (사용자 입력 불필요):
요청 텍스트에서 `$-prefix`, `/slash-command`, 따옴표 안 고유명사, 약어를 추출하고 repo에서 탐색한다:
```bash
grep -r "<표현>" skills/ commands/ brain/ docs/ README.md --include="*.md" -l 2>/dev/null
find . -name "*<표현>*" -not -path "*/.git/*" 2>/dev/null
```
- 히트 있음 → "이 repo의 `<경로>`"로 Subject 확정, 계획서에 자동 기록
- 히트 없음 → "repo 외부 또는 개념어"로 분류, 계획서에 자동 기록
- 탐색으로도 확정 불가 → 질문 1회: "`<표현>`이 [A: 이 repo의 X] / [B: 외부 도구 Y] 중 어느 것인가요?"

구체적인 작업 항목, 계획 텍스트, 경로, repo 타깃이 없으면 먼저 요청한다.

### 1.5. 코드베이스 그라운딩 (Codebase Grounding)

구현 범위가 결정되면, 계획서 작성 전에 해당 모듈의 현재 상태를 직접 탐색한다.
이 단계의 결과는 Section 3(파일 소유권 인벤토리)의 Existing Patterns와 이후 BRIEF의 "코드베이스 컨텍스트" 섹션에 직접 반영된다.

**탐색 항목:**

1. **모듈 구조 파악**
   ```bash
   ls -la <관련-모듈-디렉토리>/
   cat <관련-모듈-디렉토리>/index.ts 2>/dev/null || cat <관련-모듈-디렉토리>/index.tsx 2>/dev/null
   ```

2. **유사 구현 패턴 탐색**: grep으로 이슈 핵심 키워드 검색 후 가장 유사한 기존 파일 1-2개 읽기
   ```bash
   grep -r "<핵심-키워드>" src/ --include="*.ts" -l 2>/dev/null
   ```

3. **공유 타입·인터페이스 확인**
   ```bash
   grep -r "export type\|export interface" src/types/ --include="*.ts" -l 2>/dev/null
   ```

4. **패턴 레지스트리 기록** (Section 3 및 BRIEF에 반영):
   - 따를 패턴: (발견한 기존 구현 방식, 경로 포함)
   - Anti-patterns: (모듈에서 deprecated된 방식, 이미 교체된 패턴)
   - 모듈 컨벤션: (파일 명명, export 방식, 디렉토리 구조 규칙)

**완료 기준:**
- 변경 대상 모듈의 barrel export 또는 디렉토리 구조 확인
- 유사 구현 1개 이상 발견 (없으면 "신규 패턴" 명시)
- Anti-patterns 목록 작성 (없으면 "없음" 명시)

### 2. 컨텍스트 복구 앵커 구축

새 세션이 컨텍스트를 빠르게 재구성할 수 있도록:

- 먼저 확인해야 할 파일/디렉토리 (정확한 경로)
- 검색 키워드와 심볼
- 따라야 할 기존 패턴 (파일 경로 포함)
- 관련 이슈, PR, 문서, 브랜치
- 구현 전 재확인해야 할 가정

"코드베이스를 확인하세요" 같은 일반적 방향은 금지. 실제 경로나 검색어를 명시한다.

### 3. 작업 및 파일 소유권 인벤토리

단위 분할 전 모든 변경 후보를 나열:

| Candidate | Files | Change | Source | Confidence | Notes |
|---|---|---|---|---|---|
| 짧은 이름 | `path/file.ts` | create/modify/test/docs | explicit/inferred | high/medium/low | 근거 또는 불확실성 |

Confidence 규칙:
- `high`: 사용자의 명시적 경로 또는 repo 근거가 좁은 파일 셋으로 강하게 매핑됨
- `medium`: 좁은 파일 셋이 존재할 가능성이 높지만 인근 helper/test 파일 필요 가능
- `low`: 광범위한 서브시스템, 모호한 동작, repo 근거 부족, 공유 소유권 불명확

low confidence 후보는 병렬 구현 이슈 대상이 아니다. discovery 작업으로 전환하거나 scope 명확화를 요청한다.

### 4. Issue-Ready 단위로 분할

각 구현 단위는 변경 이유가 하나이고 구체적인 소유 표면을 가져야 한다.

각 단위에 정의할 항목:
- 제목 후보
- 목적 (한 문장)
- 포함 파일과 파일별 예상 변경
- 제외 범위 및 후속 작업
- 저성능 모델이 실행 가능한 구현 단계
- 참고할 기존 패턴 (경로 포함)
- 데이터 계약, API shape, UI 상태, edge case, 실패 모드
- 테스트 또는 스모크 체크

같은 파일, 공유 설정, 레지스트리, 생성 아티팩트를 수정하는 두 단위를 병렬 레인으로 분리하지 않는다.

### 5. 병렬성 및 블로커 분석

Issue-PR Strategy with Conflict Fallback 전 conflict matrix 구축:

| Unit A | Unit B | Overlap | Decision |
|---|---|---|---|
| A | B | `path/file.ts` | Hard blocker: serial commit lane |
| C | D | 파일 분리, 시맨틱 순서만 | Soft blocker: parallel commit lanes allowed |

Hard blocker: 같은 기존 파일 / 같은 생성 아티팩트 / 같은 공유 설정·레지스트리·스키마·barrel export / 미게시 코드 의존성

Soft blocker: 트래커 순서 / 리뷰 선호 / 시맨틱 권장 (하드 블로커 아님)

Issue-PR Strategy with Conflict Fallback 구성:
- Base branch:
- Integration branch:
- PR count: one PR per issue by default
- Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it
- Commit policy: 독립 lane마다 하나의 coherent commit, 공유 파일/contract는 serial commit

Commit-lane matrix:
| Lane | Issue/scope | Boundary | Owned files | Independent because | Must not touch | Evidence / validation | Commit message |
|---|---|---|---|---|---|---|---|

Parallelization Decision:
- Parallel lanes: 파일·contract·runtime flip이 분리된 lane
- Serial lanes: 같은 파일/contract를 공유하여 같은 PR 안 순서 있는 commit으로 처리할 lane
- Blocked lanes: open PR, missing credential, unclear acceptance criteria, repo-external state 때문에 보류할 lane
- 전체 시스템 검증은 병렬 구현 레인이 아닌 integration gate

### 6. Review Agent Contract 추가

각 구현 단위마다:
- 예상 after-state
- 허용 불가 구현
- 회귀 불가 동작
- 리뷰어가 확인해야 할 edge case
- 리뷰어가 기대해야 할 테스트/명령어
- 먼저 확인할 파일
- `changes requested` 트리거 모호성
- frontend 변경이면 rendered evidence 요구사항: route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, contract graph evidence
- 누락된 증거의 분류: `not-applicable: <reason>`, Medium, High (완료 기준·critical path·privacy/security·fallback은 High 후보)
- analytics/privacy 변경이면 allowlist/denylist: raw search terms, prompt titles/bodies, arbitrary user-entered text, email/name/profile identifiers, full query strings 금지; stable IDs/categories/buckets/booleans/GTM 변환 선호

### 7. 검증 및 증거 요구사항

각 단위와 최종 gate에:
- 정확한 명령어 (알 수 있으면)
- 명령어가 checkout을 변경하는지 여부
- 필요한 환경 변수, 서비스, fixture, 인증
- 자동화 불가 시 수동 검증 단계
- 성공 시그널
- 차단 케이스 보고 형식
- frontend 작업의 rendered evidence 목록과 저장/첨부 위치
- 증거를 제공하지 못한 항목별 `not-applicable: <reason>` / Medium / High 분류

"테스트 실행" 같은 지시는 금지. 정확한 명령어를 명시한다.

### 7.5. Vercel Agent Skills Gate

React/Next, component API/composition, view transition/motion, UI/a11y/UX/screenshot/viewport, Vercel deploy/preview/env/token, React Native/Expo/mobile/native/platform API 작업이면 `references/vercel-agent-skills-gates.md`를 읽고 계획에 `Vercel Agent Skills Gate`를 포함한다. Backend-only 작업은 frontend/deploy/mobile surface가 없으면 skip 또는 lightweight 사유를 기록한다.

계획에는 다음 항목을 채운다:
- Applicable upstream skill families: `react-best-practices`, `composition-patterns`, `react-view-transitions`, `web-design-guidelines`, `deploy-to-vercel`, `vercel-cli-with-tokens`, `react-native-skills` 중 해당 항목
- Product/repo constraints that outrank generic rules
- React/Next.js performance risks
- Component API/composition risks
- Animation/motion continuity rule
- UI/a11y/design evidence required
- Vercel deploy/env/token safety constraints
- React Native/mobile constraints
- Explicit anti-goals
- Backend-only skip/lightweight reason

### 8. 준비 게이트

완료 전 모든 체크:
- 요청 내 모든 `$-prefix` / `/slash` / 고유명사의 Subject가 repo 탐색 또는 사용자 답변으로 확정됐다
- 모든 구현 단위에 명확한 파일 소유권 또는 discovery-only 명시
- 모든 inferred 경로에 근거와 confidence
- 같은 파일·공유 레지스트리 충돌이 분리됨
- 동시 non-stacked PR을 원하면 미게시 코드 의존성 없음
- in scope/out of scope 명시
- review agent가 잘못된 구현을 식별 가능
- `/ddalggak issue`가 plan을 이슈 body로 직접 매핑 가능
- "etc.", "clean up", "handle edge cases" 같은 모호한 placeholder 없음

### 출력 형식

```markdown
## Issue-Ready Plan

### Goal
### Source Of Truth
### Non-Goals / Constraints
### Context Recovery Anchors
### Assumptions And Unknowns

### Quality Lens Router Output
- Applicable gate families:
- Skipped gates:
- Required references:
- Lightweight or limited gates:
- Repo/product conventions that outrank generic rules:

### Evidence Contract
- Required evidence:
- Evidence templates applied (UI/deploy/performance/bugfix/security/data/API):
- Evidence not applicable (`not-applicable: <reason>`):
- Blocking evidence gaps:
- Review blocking rule: required evidence 누락 시 High/blocking, PR ready/APPROVE 금지

### Counterargument Pass
- Weak assumptions / 약한 가정:
- Repo convention conflicts / 기존 repo convention 충돌 가능성:
- Evidence that would disprove readiness / readiness를 반증할 evidence:
- Smaller or more direct change / 더 작은 직접 변경 대안:

### Simplicity / Deletability Gate
- Why is this abstraction necessary?:
- Small direct change first / 작은 직접 변경 우선:
- Reuse or boundary clarification evidence:
- Human readability/deletability check:
- Principle: SOLID does not outrank readability

### Frontend Design Brief
- Product/user context:
- Existing design constraints/system:
- Aesthetic direction:
- Memorable visual idea:
- Typography:
- Color/theme:
- Layout/spatial composition:
- Motion/interactions:
- Background/detail:
- Accessibility constraints:
- Explicit anti-goals:

### Vercel Agent Skills Gate
- Applicable upstream skill families:
- Product/repo constraints that outrank generic rules:
- React/Next.js performance risks:
- Component API/composition risks:
- Animation/motion continuity rule:
- UI/a11y/design evidence required:
- Vercel deploy/env/token safety constraints:
- React Native/mobile constraints:
- Explicit anti-goals:
- Backend-only skip/lightweight reason:

### Work Inventory And File Ownership
| Candidate | Files | Change | Source | Confidence | Notes |

### Implementation Units
#### Unit A: <title>
- Purpose:
- Files:
- Included:
- Excluded:
- Implementation Steps:
- Existing Patterns:
- Edge Cases:
- Validation:
- Review Agent Checklist:

### Conflict Matrix
| Unit A | Unit B | Overlap | Decision |

### Issue-PR Strategy with Conflict Fallback
- Base branch:
- Integration branch:
- PR count: one PR per issue by default
- Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it
- Commit policy:

| Lane | Issue/scope | Boundary | Owned files | Independent because | Must not touch | Evidence / validation | Commit message |
|---|---|---|---|---|---|---|---|

### Parallelization Decision
- Parallel lanes:
- Serial lanes:
- Blocked lanes:
- Final integration gate:

### Plan-to-Issues Readiness
- Parent epic 필요 여부와 이유:
- 제안 이슈 목록:
- 이슈 생성 전 남은 블로커:
```

이슈 등록이 필요하면 이 plan을 소스로 `/ddalggak issue`를 실행한다.

---

## Plan to Issues

구현 계획을 단일 책임, conflict-aware GitHub 이슈로 변환한다. 기본은 각 구현 이슈가 독립 PR이 될 수 있는 형태이며, 이슈 간 hard conflict가 있는 경우에만 fallback PR 안 serial commit으로 묶을 수 있게 표시한다.

> **plan vs issue 구분**: `/ddalggak plan`은 계획 문서만 작성한다(이슈 미생성). 이슈 생성은 반드시 `/ddalggak issue`로만 수행한다. plan 내 "Phase 7: 승인 후 GitHub 이슈 생성"은 issue 서브커맨드로 위임하는 것을 의미한다.

사용자가 확인하기 전 `gh issue create`나 `gh issue edit`을 실행하지 않는다. 단, 현재 요청이 명시적으로 "지금 등록"을 요청하면 실행한다.

### Phase 1: 계획 수집

계획이 없으면 계획 문서 경로나 텍스트를 요청한다.

계획에서 추출:
- `why`: 목적과 사용자 가시 결과
- `what`: 의도된 코드/문서/테스트 변경
- `files`: 명시적 파일 소유권 또는 예상 경로
- `order`: 선행 조건, 후행 작업, integration gate
- `validation`: 완료를 증명하는 명령어 또는 수동 체크
- `scope`: 범위 외 제약사항
- `commit_lanes`: Issue-PR Strategy with Conflict Fallback, Parallelization Decision, lane별 owned files / must-not-touch / evidence

codebase 내 작업이면 언급된 경로를 최종 draft 전 검증:
```bash
rg --files | rg '<path-or-pattern>'
test -e <mentioned-path>
```

### Phase 2: 이슈 단위 설계

이슈 하나 = 변경 이유 하나.

좋은 단위: API 라우트 1개 생성 / 클라이언트 훅 1개 교체 / 집중된 동작 테스트 추가
나쁜 단위: API 라우트 + 클라이언트 마이그레이션 + 문서 업데이트

| Size | 기준 | 처리 |
|---|---|---|
| Small | 파일 1개, ~10-50줄 변경 | 독립 이슈 |
| Medium | 1-3 파일, 새 파일 + 집중 테스트 가능 | 독립 이슈 |
| Large | 4+ 파일, 복수 이유, 여러 serial/parallel lane 필요 | parent epic + sub-issues |

parent epic 사용 조건: sub-issue 3개 이상 / 여러 commit-lane 또는 serial integration 의존 / 사용자가 tracker 요청.

### Phase 3: 파일 소유권 매핑

이슈 body 작성 전 소유권 테이블 구성:

| 제안 이슈 | Files | Change type | Source | Confidence |
|---|---|---|---|---|

low confidence는 독립 구현 이슈 대상이 아니다. discovery 이슈로 분리하거나 serial 블로커로 표시한다.

새 파일은 정확한 경로가 유일하고 다른 이슈와 같은 생성 인덱스·barrel export·공유 설정을 공유하지 않을 때만 conflict-free.

### Phase 4: Conflict 분석

| Issue A | Issue B | Overlap | Decision |
|---|---|---|---|

Hard blocker: 같은 기존 파일 수정 / 같은 생성 아티팩트 / 같은 공유 설정·레지스트리·route map·스키마·barrel / 미게시 코드 의존성

Soft blocker: 비즈니스/리뷰 선호 / 트래커 순서 / 같은 base를 타겟으로 하는 시맨틱 권장

하드 블로커만 병렬 lane을 serial/blocked lane으로 낮출 수 있다. 이슈를 지연시키면 정확한 공유 파일 또는 미게시 의존성을 명시한다.

### Phase 5: Issue-PR / Conflict Fallback 구성

이슈는 기본적으로 독립 PR을 열기 위한 단위다. 단, 이슈 간 hard conflict가 있으면 같은 fallback PR 안에서 이슈별 serial commit으로 분리한다.

- Base branch, independent issue branch/PR, `Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it`를 parent/tracker 또는 plan-derived issue에 기록한다.
- Parallel lane: owned files가 겹치지 않고 shared contract/runtime flip/미게시 코드 의존성이 없어 별도 issue PR로 열 이슈.
- Serial lane: 같은 기존 파일, shared config/registry/barrel/schema, runtime flip, delivery/output contract를 공유하므로 fallback PR 안에서 순서 있는 commit으로 처리할 이슈.
- Blocked lane: open PR, missing credential, unclear acceptance criteria, repo-external state 때문에 아직 구현 착수 불가한 이슈.
- Parent epic은 구현 파일을 직접 소유하지 않고 child lane table과 integration gate만 가진다.

### Phase 6: 이슈 body 초안

이슈 body 작성 전, plan의 모든 핵심 필드가 이슈 body에 매핑되는지 확인한다:

```
Plan → Issue Body 필드 매핑 체크리스트
- [ ] Implementation Steps    → ## 작업 내용
- [ ] Edge Cases              → ## 완료 기준 (또는 별도 항목)
- [ ] Validation Commands     → ## 완료 기준의 정확한 명령어
- [ ] Review Agent Checklist  → 이슈 body 내 리뷰 기준 섹션 (없으면 추가)
- [ ] Context Recovery Anchors→ ## 원본 근거 / 컨텍스트 복구
- [ ] Constraints / Non-Goals → ## 범위 / 제외 범위
- [ ] Existing Patterns       → ## 작업 내용의 "참고할 기존 패턴"
- [ ] Owned files             → ## 파일 소유권
- [ ] Must not touch          → ## 범위 / 제외 범위 또는 ## 병렬 실행 메모
- [ ] Parallelization note    → ## 병렬 실행 메모
- [ ] Commit lane suggestion  → ## 병렬 실행 메모
- [ ] Validation/evidence     → ## 완료 기준
- [ ] Dependencies / blocked by → ## 선행 조건
```

누락 필드가 있으면 이슈 body에 보완한 뒤 초안을 작성한다.

각 구현 이슈:

```markdown
## 부모 이슈
#<parent-number> / 없음

## 목적
한 문장.

## 작업 내용
- 구체적인 코드 변경
- 참고할 기존 패턴: `path/to/example.ts`
- inferred 경로이면 근거와 신뢰도 명시

## 범위 / 제외 범위
- 포함:
- 제외:

## 원본 근거 / 컨텍스트 복구
- Source plan의 관련 섹션 또는 파일 경로
- 새 세션이 재확인해야 할 키워드나 참조 파일
- **작업 주어 (자동 추론)**: `<공식명>` — `<이 repo 경로 또는 "외부 도구/개념어">`
- **혼동 방지**: `<유사 표현>` → `<실제 의미>` (이 이슈와 구분되는 점) ← 유사 표현이 없으면 이 줄 생략

## 파일 소유권
| 파일 | 변경 | 근거 | 신뢰도 |

## 완료 기준
- [ ] 구체적인 기능 검증
- [ ] 관련 테스트 또는 스모크 실행
- [ ] 기존 주요 게이트 통과: `<command>`

## 선행 조건
없음 / #<number> merge 필요

## Dependencies / blocked by
없음 / open PR·missing credential·unclear acceptance criteria·repo-external state

## 후행 조건
없음 / #<number>

## 병렬 실행 메모
- Parallelization note: parallel / serial / blocked 중 하나와 근거.
- Commit lane suggestion: `<issue PR>` 또는 hard conflict 시 `<fallback PR commit L1/L2/...>`.
- Owned files: `path/to/file`.
- Must not touch: `path/to/other-file` 또는 shared contract.
- Validation/evidence: `<command>` 또는 manual artifact.
```

Parent epic body:

```markdown
## 배경
왜 이 작업이 필요한가.

## 목표
Before / After.

## 실행 순서
Issue-PR Strategy with Conflict Fallback 기준으로 parallel / serial / blocked lane과 integration gate를 명시.

## Sub-issues
| Lane | Issue | Parallelization note | Commit lane suggestion | Owned files | Must not touch | Dependencies / blocked by |
|---|---|---|---|---|---|---|
| L1 | #N 제목 | parallel / serial / blocked | issue PR 또는 fallback commit L1 | `path/file.ts` | `shared/contract.ts` | 없음 |

## 완료 기준
- [ ] 독립 이슈는 이슈별 PR 생성, hard conflict 이슈는 fallback PR 안 lane별 commit 반영
- [ ] 전체 기능 검증

## 병렬 실행 메모
Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it. Parallel lane은 독립성 증명 후 이슈별 PR로 병렬 진행하고, shared file/contract lane만 fallback PR의 serial commit으로 통합한다.
```

### Phase 7: 승인 후 GitHub 이슈 생성

parent epic이 필요하면 순서:
1. parent epic 먼저 생성 (placeholder sub-issue 체크리스트)
2. 각 sub-issue를 실제 parent 번호로 생성
3. parent epic body를 실제 sub-issue 번호로 업데이트

```bash
gh issue create --title "[Epic] ..." --body-file /tmp/epic-body.md
gh issue create --title "[Sub] ..." --body-file /tmp/sub-issue-body.md
gh issue edit <epic-number> --body-file /tmp/epic-body-final.md
```

생성 전 존재하는 레이블만 사용:
```bash
gh label list --json name
```

`--body-file` 사용을 선호한다.

### Phase 8: 완료 보고

```markdown
## 생성된 Issue 목록
| # | 제목 | 파일 | Commit lane | Parallelization note | Blockers | 상태 |

## Conflict 설계 근거
- Hard Blocker: ...
- Soft Blocker: ...

## Single-PR commit-lane 실행 계획
- Parallel lanes:
- Serial lanes:
- Blocked lanes:
- Integration gate:
```

이슈 생성을 건너뛰었으면 `created` 대신 `drafted`로 표시하고 다음 명령어나 승인 절차를 제공한다.

---

## Merge Cleanup

PR이 merge된 후 repo, 이슈 트래커, 로컬 브랜치, worktree, 임시 문서를 정리하고 깨끗한 상태로 마무리한다.

PR이 아직 merge되지 않았으면 즉시 중단하고 블로커를 보고한다.

### 핵심 규칙

1. cleanup 전 merge 증거를 반드시 검증한다.
2. merge된 PR 또는 사용자가 명시한 항목만 정리한다.
3. 되돌릴 수 있는 안전한 명령어를 먼저 사용한다.
4. 불확실한 이슈·브랜치·worktree·임시 파일 소유권은 블로커다. 자동화 뒤에 숨기지 않는다.
5. 원격 브랜치 삭제, 패키지 게시, 태그 생성, 릴리스 트리거, 보호된 브랜치 push는 별도 명시적 확인 없이 하지 않는다.
6. dirty uncommitted 작업이 있는 worktree는 제거하지 않는다.

### Step 1. PR 및 repo 사실 확인

```bash
git status -sb
git branch --show-current
git worktree list --porcelain
```

```bash
gh pr view <pr-or-current-branch> --json number,state,mergedAt,headRefName,baseRefName,url,closingIssuesReferences,title,body
```

PR 조회 실패 시:
```bash
gh pr list --head <current-branch> --json number,state,mergedAt,headRefName,baseRefName,url,title
```

필수 merge 증거: `state == MERGED` AND `mergedAt` 비어있지 않음 AND head branch/PR 번호가 cleanup 대상과 일치.

이 조건이 모두 충족되지 않으면 cleanup을 멈추고 누락 증거를 보고한다.

### Step 2. 연관 이슈 식별

cleanup 후보로만 취급할 항목:
- `gh pr view`의 `closingIssuesReferences`
- 사용자가 명시적으로 제공한 이슈 번호
- merge된 PR body의 `Fixes #N`, `Closes #N`, `Resolves #N`

자동으로 닫지 않을 항목:
- merged PR이 명시적으로 닫지 않은 parent/epic 이슈
- 브랜치 이름, 느슨한 코멘트, TODO 텍스트에서 추론한 이슈
- repo 또는 번호가 모호한 이슈

각 이슈 후보 확인 후 처리:
```bash
gh issue view <number> --json number,title,state,url
```

이미 닫혀 있으면 "already closed" 기록. open이고 명확히 연관되면:
```bash
gh issue comment <number> --body "<PR URL과 merge 날짜를 포함한 한국어 코멘트>"
gh issue close <number> --comment "<한국어 코멘트>"
```

관계가 불명확하면 open 유지하고 이유를 보고한다.

### Step 3. 로컬 cleanup 준비

브랜치 전환이나 삭제 전:
```bash
git status --short
```

uncommitted 변경이 있으면 해당 파일이 명시적으로 이 PR의 임시 아티팩트인 경우에만 계속 진행. 관련 없는 사용자 변경은 stage/stash/restore/삭제하지 않는다.

checkout이 깨끗하면 base 브랜치로 전환:
```bash
git switch <baseRefName>
git pull --ff-only
```

### Step 4. 로컬 브랜치 제거

안전 삭제 우선:
```bash
git branch -d <headRefName>
```

다음 조건이 모두 참일 때만 force 삭제 사용:
- GitHub가 PR merge 상태 확인
- `mergedAt` 존재
- 브랜치가 정확히 merged PR head branch
- `git branch -d`가 squash/rebase merge 히스토리 이유로만 실패

```bash
git branch -D <headRefName>
```

현재 브랜치, default/base 브랜치, 소유권 모호한 브랜치는 절대 삭제하지 않는다.

### Step 5. Worktree 제거

`git worktree list --porcelain`에서 merged PR head branch이거나 해당 PR 레인에 명확히 속하는 worktree를 찾는다.

각 후보 상태 확인:
```bash
git -C <worktree-path> status --short
```

깨끗한 matching worktree만 제거:
```bash
git worktree remove <worktree-path>
git worktree prune
```

dirty worktree는 그대로 두고 경로와 dirty 파일을 보고한다.

### Step 6. 임시 아티팩트 제거

merged PR, 현재 cleanup 레인, 또는 ddalggak 워크플로우 scratch 파일에 명확히 연결된 임시 파일만 제거:

- `PR_DESCRIPTION*.md`
- `BRIEF.md`, `REVIEW_BRIEF.md`, `FIX_BRIEF_*.md` (해당 레인의 것)
- `TaskList`로 확인 후 활성 teammate 작업과 무관한 임시 상태 파일

삭제 전 tracked 파일인지 확인:
```bash
git status --short -- <candidate>
git ls-files -- <candidate>
```

tracked 계획 문서, 공개 문서, TODO, lockfile, 생성 fixture는 삭제하지 않는다. 안전한 경우 명시적 경로만 삭제. 관련 없는 파일이 매칭될 수 있는 광범위한 glob 사용 금지.

### Step 7. 최종 상태 검증

```bash
git status -sb
git worktree list --porcelain
```

이슈 작업을 했으면:
```bash
gh issue view <number> --json number,state,url
```

cleanup 완료 조건:
- merge된 PR 상태 검증 완료
- 명확히 연관된 이슈 모두 닫힘 또는 의도적으로 open 유지 (이유 포함)
- 로컬 브랜치/worktree/임시 파일 cleanup 완료 또는 명시적 블로커 존재
- 최종 repo 상태 보고

### Step 8. 최종 보고

한국어로 보고:

- merge된 PR 번호, URL, head 브랜치, base 브랜치, merge 날짜
- 닫힌 이슈, 이미 닫혀 있던 이슈, 의도적으로 open 유지한 이슈
- 삭제한 로컬 브랜치 또는 유지 이유
- 제거한 worktree 또는 유지 이유
- 제거한 임시 아티팩트 또는 유지 이유
- 현재 브랜치와 `git status -sb`
- 남은 블로커 또는 리스크

---

## Ship

현재 워크트리의 변경사항을 검증하고 브랜치·커밋·push·draft PR 생성까지 한 번에 처리한다.

### 0. 게시 전제 조건 확인

게시 전에 base freshness와 local-only 위험을 확인한다:
```bash
git fetch --prune
git status -sb
git branch --show-current
git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
```

현재 브랜치가 base branch이고 dirty 변경이 없으면 `git pull --ff-only` 후 검증한다. 변경 파일 중 ignored/local-only 후보가 있으면 `git check-ignore -v <path>`로 PR 포함 가능 여부를 확인한다.

병렬 구현 레인에서 온 경우:
- 검증 명령어 실행 결과(exit 0)가 최근 커밋 이후에 남아있으면 완료로 간주. 없으면 Step 4로 이동해 직접 실행
- `devils-advocate-review-loop`가 Critical/High = 0 결과를 반환했는지 확인. 없으면 `/ddalggak check`를 실행하거나 건너뛰는 이유(예: "간단한 문서 수정")를 PR description에 명시
- 사용자가 로컬 브랜치 준비만 원하면 `$branch-commit-pr-description` 사용
- 사용자가 push 전 코드 리뷰를 원하면 `ship` 전에 `/ddalggak check`를 먼저 실행한다

### 1. 범위 및 브랜치 상태 파악

```bash
git status -sb
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true
git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
git diff --stat
git diff --name-only
git diff --cached --name-only
git worktree list --porcelain
```

확인 항목:
- staged/unstaged 변경 여부
- 워크트리가 깨끗해도 upstream보다 앞선 커밋이 있으면 publish 대상
- 혼재 파일이 있는 경우 명시적으로 분리
- 현재 브랜치가 이미 feature 브랜치인지
- 여러 worktree가 사용 중인지

아래 두 조건이 모두 없을 때만 "ship할 것 없음"으로 처리:
- staged/unstaged 변경 없음
- upstream 대비 앞선 커밋 없음

### 2. 이슈 컨텍스트 파악

이슈 번호 또는 URL이 주어지면 조회:
```bash
gh issue view <number> --json number,title,body,url,comments
```
없으면 현재 diff와 repo 컨벤션에서 의도를 추론한다. comments가 body와 충돌하거나 PR body의 범위를 바꾸는 경우 PR description에 충돌 및 선택 근거를 적는다.

### 3. 브랜치 및 커밋 전략 결정

- 이미 feature 브랜치이면 유지
- `main`/`master` 등 기본 브랜치이면 `claude/<description>` 브랜치 생성
- 새 브랜치가 필요하면 목적 중심 이름을 사용하고 날짜·타임스탬프·생성 시각 suffix를 넣지 않는다.
- 같은 목적·같은 파일 범위 → 1커밋. 목적이 다르거나 독립적으로 rollback 가능한 변경이 2개 이상 → 복수 커밋

### 4. 검증 경로 발견

repo에서 검증 진입점을 탐색:

```bash
# 예시 — repo 구조에 맞게 선택
cat package.json | grep '"scripts"' -A 20
ls Makefile justfile 2>/dev/null || true
ls .github/workflows/ 2>/dev/null || true
```

선택 기준:
- 기본: 변경된 영역 대상의 targeted 검증
- full: 사용자가 명시적으로 요청 시 CI-like 전체 검증

검증이 실행 불가능한 경우(의존성 누락 등) 이유를 명시하고 중단한다.

### 5. 의도적 스테이징

```bash
git add <명시적-파일-목록>
```

- 관련 없는 파일, 생성 아티팩트, ephemeral scratch 파일은 스테이징 금지
- 전체 워크트리가 명확히 대상일 때만 broad staging 허용

### 6. 의도적 커밋

커밋 메시지 형식 (CLAUDE.md 전역 규칙 준수):

```
<type>(<scope>): <한글 제목>

What: 무엇을 바꿨는가.
Why: 왜 이 변경이 필요한가.

Closes #<issue_number>
```

`-F` 파일로 전달, `-m` 한 줄 커밋 금지:

```bash
cat > /tmp/commit-msg.txt << 'EOF'
<type>(<scope>): 제목

What: 무엇을 바꿨는가.
Why: 왜 이 변경이 필요한가.

Closes #N
EOF
git commit -F /tmp/commit-msg.txt
```

### 7. Push

```bash
git push -u origin <branch-name>
```

remote 또는 인증 문제가 있으면 추측하지 않고 블로커를 보고한다.
push 성공 후 PR 생성 전이면 `ship_result: pushed_no_pr`로 표시.

### 8. Draft PR 생성

사용자가 명시적으로 ready-for-review를 요청하지 않으면 draft PR. Draft PR을 ready로 바꾸는 것은 current-head checks가 terminal success/skipped이고 fresh independent review가 `APPROVE` conclusion을 낸 뒤에만 가능하다. 이 상태도 `ready for manual merge` 보고까지만 허용하며 merge 또는 auto-merge enable은 사용자가 현재 턴에서 명시적으로 요청한 경우만 수행한다.

PR description 형식 (What / Why / Validation / Risk / Issues):

```bash
gh pr create --draft --title "<제목>" --body "$(cat <<'EOF'
## What
- 무엇을 바꿨는가.

## Why
- 왜 이 변경이 필요한가.

## Validation
- 실행한 검증 명령어와 결과

## Risk
- 남은 리스크, 범위 제외, rollback 고려사항

## 브랜치 / 워크트리
- 브랜치: <branch>
- 소스 브랜치/worktree (있을 경우): ...

## Issues
Closes #<number>
EOF
)"
```

PR 생성 후 커밋 메시지 검증:
```bash
git log -1 --format="%B"
# 제목/본문/Closes #N 형식 확인
```

### 9. 결과 보고

한국어로 보고:

- `ship_result` (pushed_no_pr / pr_opened)
- `remote_branch`
- `pr_number`
- `pr_url`
- `pr_state`
- 브랜치 이름
- 현재 worktree 경로
- 커밋 목록
- 실행한 검증
- PR 상태 및 URL
- 포함된 소스 브랜치·워크트리
- 건너뛴 검증이나 남은 리스크

**혼재 워크트리 가드레일**: 범위를 안전하게 분리할 수 없으면 `git add -A` 금지. 어떤 파일이 publish에 속하는지 사용자에게 확인한다.

---

## Local Diff Check

push/PR 없이, 로컬의 미커밋 변경사항 또는 특정 worktree diff를 대상으로 one-shot 코드 리뷰를 수행한다. 결과는 GitHub 코멘트가 아닌 사용자에게 직접 제안 형태로 출력된다. iteration loop 없음.

**사용 시나리오:**
- `ship` 전에 코드 품질을 확인하고 싶을 때
- GitHub PR 없이 독립적으로 로컬 변경사항을 점검할 때
- 병렬 워커 결과물을 배포 전 단독 리뷰할 때

**인수 파싱:**
- 인수 없음: 현재 repo의 `git diff HEAD` + staged 변경
- `<worktree-path>`: 해당 경로의 `git -C <path> diff HEAD`
- `--staged`: staged 변경만 대상 (`git diff --cached`)

### Step 1. Diff 수집

리뷰 전 stale/base 상태를 read-only로 확인한다:
```bash
git fetch --prune
git status -sb
git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
```

```bash
# 인수 없음 (기본)
git diff HEAD --stat
git diff --stat --cached
git status -sb

# worktree 지정 시
git -C <worktree-path> diff HEAD --stat
git -C <worktree-path> status -sb
```

변경이 전혀 없으면 즉시 중단하고 보고한다: "리뷰할 변경사항이 없습니다."

diff가 **500줄 이상**이면 `AskUserQuestion`으로 확인:
```
Q: diff가 N줄입니다. 어떻게 진행할까요?
  A. 전체 리뷰 (느릴 수 있음)
  B. 변경된 파일 목록만 보고 범위 좁혀서 재실행
  C. 취소
```

### Step 2. Reviewer Teammate 생성

fresh reviewer teammate를 생성한다. 구현자와 같은 teammate를 재사용하지 않는다.

```
TeamCreate(name="reviewer-local-<YYYYMMDD-HHMM>", ...)
```

worktree가 지정된 경우 해당 경로를 cwd로 설정. 없으면 현재 repo root.

### Step 3. CHECK_BRIEF 작성 및 배포

teammate의 cwd 아래 `CHECK_BRIEF.md`를 작성한다.

```bash
# .gitignore에 추가 (미등록 시)
echo "CHECK_BRIEF.md" >> .gitignore
```

**CHECK_BRIEF.md 내용:**

```
# Local Check Brief — reviewer-local-<ts>

## 대상
- repo: <절대 경로>
- diff 범위: HEAD 기준 미커밋 변경 (또는 staged / worktree: <path>)
- 브랜치: <current-branch>

## 작업
1. CHECK_BRIEF.md 내의 diff를 읽는다
2. 필요한 경우 파일을 직접 읽어 맥락을 보완한다 (수정 금지)
3. GitHub API 또는 gh 명령어는 사용하지 않는다
4. 심각도별로 분류하고 구체적인 수정 제안을 작성한다

## Diff
```diff
<git diff HEAD 전문 또는 일부>
```

## 심각도 기준
- Critical: 빌드 깨짐, 보안 구멍, 데이터 유실, 타입 오류
- High: 중대한 버그, 스펙 불일치, 후속 작업을 막는 잘못된 추상화
- Medium: 마이너 버그, 누락된 edge case, 코드 스멜
- Low: 네이밍, 주석, 스타일 nit

## 출력 형식 (반드시 이 형식 준수)
CHECK DONE: critical=N high=N medium=N low=N

## Issues
### Critical (N)
- [`<파일>:<라인>`] 문제 설명
  → 수정 제안 (구체적으로)

### High (N)
- [`<파일>:<라인>`] 문제 설명
  → 수정 제안

### Medium (N)
...

### Low (N)
...

## Summary
전체 판단 한 줄 요약 (예: "Critical 없음. High 1건 수정 권장 후 ship 가능")

## 규칙
- 파일 수정 금지 (read-only 분석만)
- GitHub 명령어 사용 금지
- 파일 읽기는 diff만으로 맥락이 부족할 때만 허용
- 근거 없는 추정 금지 — diff에서 직접 확인한 것만 기재
```

teammate에 배포:
```
SendMessage(to="reviewer-local-<ts>", content="CHECK_BRIEF.md를 읽고 지시된 대로 로컬 diff를 리뷰해. 완료 후 반드시 CHECK DONE 라인을 출력해.")
```

### Step 4. 결과 수집

ScheduleWakeup으로 4-5분 뒤 확인 (~270s, 캐시 창 유지).

`TaskGet`으로 teammate 완료 여부 확인 후 `TaskOutput`에서 `CHECK DONE` 라인 추출.

**실패 복구**: ScheduleWakeup 2회(~9분) 후에도 `CHECK DONE` 없으면:
- `TaskOutput` 확인 후 원인 진단
- "reviewer-local-<ts> 응답 없음 — 수동 개입 필요" 보고 후 사용자 대기

### Step 5. 사용자에게 결과 제안

GitHub 코멘트 형식이 아닌, 대화에서 직접 구조화된 텍스트로 출력한다.

**출력 형식:**

```
## Check 결과 — <branch> (<파일 수>개 파일, +N/-M줄)

| 심각도 | 건수 |
|--------|------|
| Critical | N |
| High | N |
| Medium | N |
| Low | N |

### Critical
...

### High
...

### Medium / Low (요약)
...

## 권고
- Critical+High = 0: ship 가능
- Critical+High > 0: 아래 항목 수정 후 ship 권장
```

iteration loop 없음. 수정 여부는 사용자가 결정한다.

### Step 6. CHECK_BRIEF 정리

리뷰 완료 후 임시 파일 제거:
```bash
rm -f CHECK_BRIEF.md
```

---

## Retrospective

PR merge 이후 이번 사이클에서 배운 것을 정리하고 `~/workspace/retrospective/`에 저장한다. 또한 재사용 가치 있는 교훈을 Claude 메모리(`~/.claude/projects/.../memory/`)에 저장한다.

### Step 0. PR 번호 확정

**인수 파싱 (반드시 이 순서로 판정)**:

1. **인수로 PR 번호가 전달된 경우** (`/ddalggak retro 123`): 해당 번호 사용.
2. **인수 없음**: 최근 merged PR을 탐색한다.
   ```bash
   gh pr list --state merged --author @me --json number,title,mergedAt --limit 5
   ```
   결과가 여러 개이면 `AskUserQuestion`으로 확인:
   ```
   Q: 어떤 PR에 대한 회고를 작성할까요?
     A. #N — <제목> (merged: <날짜>)
     B. ...
   ```
   결과가 0개이면 즉시 중단하지 않고 `AskUserQuestion`으로 확인:
   ```
   Q: merged PR이 없습니다. 어떻게 진행할까요?
     A. 이번 세션 작업 내용으로 회고 작성 (PR 없이 컨텍스트 기반)
     B. PR 번호를 직접 입력
     C. 취소
   ```
   "세션 컨텍스트 기반" 선택 시: 현재 대화에서 수행한 작업 내용을 소스로 삼아 Step 2로 진행한다. 파일명에는 PR 번호 대신 작업 슬러그를 사용한다 (예: `YYYY-MM-DD-session-<slug>.md`).

PR 번호 확정 후 Step 1로 진행.

### Step 1. merge 확인

```bash
gh pr view <확정된-PR-번호> --json number,state,mergedAt,title
```

`state != MERGED`이면 중단하고 보고한다.

### Step 2. 회고 내용 구성

다음 섹션으로 회고 문서를 작성한다:

```markdown
# 회고 — PR #<N> <제목>

- **날짜**: YYYY-MM-DD
- **PR**: <URL>
- **소요**: (리뷰 반복 횟수, 주요 이슈 수)

## 무엇을 했는가
(변경 항목 요약 테이블)

## 잘 된 것
(리뷰 iteration을 줄인 요인 / 예상보다 빠른 진행 원인 / 반복해서 쓸 가치 있는 패턴·접근법)

## 실패 패턴과 교훈
각 실패 패턴마다:
- **시도**: 무엇을 했는가
- **결과**: 무슨 일이 생겼는가
- **근본 원인**: 왜 그렇게 됐는가
- **교훈**: 다음엔 어떻게 다르게 할 것인가

## 지식 추출 분리
- 일회성 incident record: 이번 PR/환경/사람/순서에만 해당하는 사실. PR numbers, commit SHAs, single-session completion logs는 일반화하지 않는 한 incident records이며 durable reusable knowledge가 아니다.
- 재사용 가능한 knowledge extraction: `harness-engineering/*`, `principles/*`, `frontend/*`, `llm-wiki/*` 중 하나로 분류한 durable rule
- frontend/analytics 관련 누락 증거가 있었다면 rendered evidence, transitive fallback, privacy allowlist/denylist 중 어느 guardrail로 흡수할지 기록

## 아키텍처 정리 (해당 시)
(미래 참고용 구조 다이어그램이나 규칙)

## 최종 결과
(CI, 리뷰 verdict, merge 날짜)
```

### Step 3. 파일 저장

파일명 형식: `YYYY-MM-DD-pr<N>-<slug>.md`

저장 경로 (CLAUDE.md에 `RETRO_DIR: ~/custom/path` 지정 시 그 경로, 미지정 시 기본값):
```
~/workspace/retrospective/YYYY-MM-DD-pr<N>-<slug>.md
```

디렉토리가 없으면 사용자에게 확인 후 생성한다.

### Step 4. 메모리 추출

회고 내용에서 **미래 세션에서 재사용할 가치가 있는 교훈**을 골라 메모리로 저장한다.

저장 기준:
- 반복 실수 방지에 직접 도움이 되는 것 → `feedback` 타입
- 특정 기술/패턴의 비자명한 제약 → `feedback` 타입
- 프로젝트 구조나 설계 결정의 이유 → `project` 타입

저장하지 않는 것:
- 이미 코드나 CLAUDE.md에 반영된 것
- 이번 PR에만 해당하는 일회성 맥락
- PR numbers, commit SHAs, single-session completion logs처럼 특정 incident records에 속하고 아직 durable reusable knowledge로 일반화되지 않은 산출물

각 메모리 파일은 `~/.claude/projects/.../memory/`에 저장하고 `MEMORY.md` 인덱스를 업데이트한다.

### Step 5. 완료 보고

```
RETRO DONE PR#<N>: 파일=<경로> 메모리=<저장한 개수>개
```

cleanup이 아직 완료되지 않았으면 `/ddalggak clean`을 실행한다.

### Step 6. Wiki 등록

저장된 회고 파일을 iCloud Wiki의 `retrospectives/` 카테고리에 entity page로 등록한다.

`/setwiki`를 호출하며 다음 정보를 함께 전달한다:
- **소스**: Step 3에서 저장된 회고 파일 경로 (`~/workspace/retrospective/YYYY-MM-DD-...md`)
- **카테고리 힌트**: `retrospectives`
- **태그 힌트**: `#retrospective #ddalggak #PR#N` (PR 번호 없는 commit-lane 회고는 `#retrospective #ddalggak #commit-lane`)
- **제목 힌트**: 회고 파일의 H1 제목 그대로 사용

setwiki 실패 시 retro 전체를 실패 처리하지 않는다. 경고를 출력하고 계속한다:
```
⚠️ Wiki 등록 실패: <사유>. 회고 파일은 ~/workspace/retrospective/에 저장되었습니다.
```

wiki 등록 성공 시 완료 보고 포맷이 확장된다:
```
RETRO DONE PR#<N>: 파일=<경로> 메모리=<N>개 wiki=retrospectives/<entity-파일명>
```

---

---

## Conductor State File

compact 전 또는 긴 대기 전에 `.ddalggak/conductor-state.md`에 아래 포맷으로 저장한다.
이 파일은 git에 추적하지 않는다:

```bash
echo ".ddalggak/conductor-state.md" >> .gitignore
```

````markdown
# Conductor State — <ISO timestamp>

## 현재 Phase
Phase N / Cross-Review Iter M / Merge Cleanup

## 이슈 및 Commit Lane 매핑
| 이슈 | 브랜치 | worktree 경로 | Teammate | Integration commit | 상태 |

## 대기 중인 시그널
- [ ] worker-1 (독립 이슈): ISSUE_PR_READY: #<issue> <PR URL> <commit> <validation>
- [ ] worker-2 (conflict fallback): LANE_READY: Phase Y W2 <patch-or-commit> <validation>

## Cross-Review 상태 (해당 시)
| PR | 리뷰어 Teammate | Iteration | 마지막 verdict |

## 다음 액션
1. ...

## Context Recovery 체크리스트
- 현재 브랜치: `<branch>`
- 핵심 파일 경로: `<file1>`, `<file2>`
````

## Context 관리 — Compact 실행 포인트

compact를 실행하기 전 반드시 `.ddalggak/conductor-state.md`를 저장한 후 `/compact`를 실행한다.

- **CP1**: Start Workflow Step 1 완료 직후 (이슈 분석 + commit-lane 계획 확정 후)
  - 이유: 이슈 목록, git log, 파일 grep 결과 등 탐색 context가 최대
  - 절차: conductor-state.md 저장 → 사용자 안내 → /compact

- **CP2**: Phase 전환 직전 (Phase N 완료, Phase N+1 착수 전)
  - 이유: Phase N의 diff, 리뷰 코멘트, FIX_BRIEF 내용 불필요
  - 절차: conductor-state.md 저장 → /compact → resume 후 state 읽기

- **CP3**: Cross-Review Iteration 3 진입 전
  - 이유: 이전 iter의 REVIEW_BRIEF, FIX_BRIEF 누적
  - 절차: PR별 누적 이슈 목록 저장 → /compact

- **CP4**: ScheduleWakeup 300s+ 전 (긴 대기 직전)
  - 이유: 어차피 캐시 miss → compact으로 정리 후 sleep이 더 효율적
  - 절차: conductor-state.md 저장 → /compact → ScheduleWakeup
  - 참고: 270s 이하 대기에서는 캐시가 살아있으므로 CP4 트리거 불필요

- **CP5**: Ship/Retro 완료 후 (한 사이클 종료)
  - 이유: 다음 이슈 처리 전 완전 정리
  - 절차: conductor-state.md 삭제 → /compact

## Wake/Resume 프로토콜

compact 또는 세션 재시작 후 첫 액션:

1. `.ddalggak/conductor-state.md` 읽기
   - 없으면: `/ddalggak status`로 현재 상태 재파악
2. stale 검증:
   ```bash
   gh pr list --state open --json number,state,title --limit 20
   ```
3. "대기 중인 시그널" 미완료 항목 → TaskGet으로 teammate 상태 확인
4. "다음 액션" 첫 항목 실행

---

## Prompt Optimizer

프롬프트를 Opus 4.7 원칙에 맞게 점검·개선한다.

> **동작 범위 가드** (이 서브커맨드는 이것만 한다):
> - Step 4 사용자 확인 후 **대상 프롬프트 파일**(BRIEF.md, REVIEW_BRIEF*.md, FIX_BRIEF*.md 또는 인수로 받은 파일)만 Edit한다.
> - **수정 금지**: `SKILL.md`(이 파일), ddalggak skill의 다른 정의 파일, 일반 소스 코드 파일.
> - 인수에 "SKILL.md 수정", "서브커맨드 정의 변경" 같은 메타 의도가 보이면 즉시 라우팅 중단 + 사용자에게 안내. 사용자의 명시적 "진행" 확인 없이 SKILL.md를 Edit하지 않는다.

### 서브커맨드

- `/ddalggak prompt <텍스트>` → 인수로 넘긴 텍스트를 직접 최적화 대상으로 삼음
- `/ddalggak prompt brief` → 현재 BRIEF.md 파일 점검 및 개선
- `/ddalggak prompt review` → 현재 REVIEW_BRIEF.md 파일 점검 및 개선
- `/ddalggak prompt plan` → Issue-Ready Plan 프롬프트 설계 점검
- 인수 없음 → 현재 워크플로우의 BRIEF 파일 자동 감지

### Step 1. 대상 프롬프트 수집

**인수 파싱 우선순위** (반드시 이 순서로 판정):

1. **인수가 `brief`, `review`, `plan` 중 하나**: 해당 파일을 탐색한다.
   ```bash
   # brief: 현재 디렉토리 또는 .worktrees에서 BRIEF.md 탐색
   find . .worktrees -name "BRIEF.md" 2>/dev/null | head -5
   # review: REVIEW_BRIEF*.md 탐색
   find . .worktrees -name "REVIEW_BRIEF*.md" 2>/dev/null | head -5
   ```

2. **인수가 텍스트(프롬프트 내용)**: 인수 전체를 최적화 대상 프롬프트로 간주한다. 파일 탐색하지 않는다.

3. **인수 없음**: worktree에서 BRIEF 파일 자동 감지.
   ```bash
   find .worktrees -name "BRIEF.md" -o -name "REVIEW_BRIEF*.md" -o -name "FIX_BRIEF*.md" 2>/dev/null
   ```
   파일도 없으면 `AskUserQuestion`으로 확인:
   ```
   Q: 최적화할 프롬프트를 어떻게 제공할까요?
     A. 텍스트 직접 붙여넣기 (다음 메시지에 입력)
     B. 파일 경로 지정
     C. 취소
   ```

대상이 확정되면 내용을 읽은 후 Step 1.5로 진행.

### Step 1.5. 명확화 질문 루프 (Clarification Loop)

프롬프트 파일을 읽은 후, 평가 전에 개선 방향을 구체화하기 위해 `AskUserQuestion`으로 객관식 질문한다.

**질문 규칙:**
- `AskUserQuestion` 도구를 사용한다. 자유 입력 형태로 묻지 않는다.
- 모든 질문은 **객관식** 옵션으로 제공한다.
- 파일 내용을 읽은 후 실제로 불명확하거나 개선 방향이 갈릴 수 있는 항목만 질문한다.
- 답변 후 새로운 불명확 항목이 생기면 다시 질문한다.
- **질문이 없을 때까지 반복**한다.
- 명확화 완료 후 Step 2로 진행한다.

**질문 대상 항목 (해당하는 것만 질문):**

```
Q: 이 프롬프트에서 가장 개선하고 싶은 부분은?
  A. 전체 균형 잡힌 개선
  B. 목표 단일화 / 구조 명확성
  C. 검증 기준 구체화
  D. 워커 지시 방식 (복명복창·질문 경로 등)

Q: 현재 이 프롬프트로 어떤 문제를 경험하고 있나?
  A. 워커가 의도와 다른 방향으로 구현함
  B. 완료 보고는 하는데 품질이 낮음
  C. 검증 단계를 건너뜀
  D. 특정 문제 없음 (예방·품질 향상 목적)

Q: 개선 후 적용 범위는?
  A. 파일에 직접 반영
  B. Draft만 보고 직접 판단
  C. 일부 항목만 선택해서 적용
```

### Step 2. Opus 4.7 기준 평가

5가지 항목을 체크한다:

| # | 항목 | 체크 기준 | 문제 시 권고 |
|---|------|-----------|-------------|
| ① | 단일 목표 | 프롬프트에 목표가 1개인가? | 목표를 별도 BRIEF로 분리 |
| ② | Why 명시 | 왜 이 작업을 하는지 명시됐는가? | 이슈 배경·Goal 섹션 보강 |
| ③ | 검증 기준 구체성 | 정확한 명령어·성공 시그널이 있는가? | 검증 명령어 명시 |
| ④ | 복명복창 지시 | "네가 이해한 목표를 먼저 말해봐" 지시가 있는가? | 완료 조건 0번에 추가 |
| ⑤ | 질문 경로 | 불명확한 점을 질문할 수 있는 안내가 있는가? | "시작 전 질문하라" 문장 추가 |

Opus 4.7 원칙 배경: 지시를 문자 그대로 이행하므로 목표 단일화 필수. 숨은 의도를 추론하므로 Why 명시 시 품질 상승. 검증 기준 없으면 "완료" 보고로 끝남. 복명복창으로 오해 조기 차단. 대리급 수준이므로 질문 경로 열어두면 삽질 방지.

### Step 3. 개선 Draft 작성

**분기 판정 (필수)**: Step 2의 평가표에서 ⚠️ 또는 ❌ 항목의 개수를 센다.

- **0건 (5개 모두 ✅)** → Case A로 진행, Step 4 건너뜀
- **1건 이상** → Case B로 진행, Step 4 실행

#### Case A — 개선 항목 0건 (5/5 ✅)

평가표와 함께 Nice-to-have 강화 제안을 짧게 보고하고 종료한다. 새 Draft 작성·적용 확인을 수행하지 않는다.

출력 형식:

```
## Prompt Audit — <대상> · ✅ 5/5

| 항목 | 상태 | 통과 사유 (1줄) |
|------|------|----------------|
| ① 단일 목표 | ✅ | (이 프롬프트가 통과한 구체적 이유) |
| ② Why 명시 | ✅ | ... |
| ③ 검증 기준 | ✅ | ... |
| ④ 복명복창 | ✅ | ... |
| ⑤ 질문 경로 | ✅ | ... |

### Nice-to-have (선택 — 강제 아님)
1. (5개 축 외부에서 발견한 미세 개선)
2. ...

### 결론
현재 프롬프트로 충분합니다. 적용하지 않아도 됩니다.
```

Nice-to-have 규칙:
- 5개 평가 축 **외부**에서 발견한 미세 개선만 제안 (예: 예시 입력·출력 추가, 시작 출력 포맷 명시, 실패 시 fallback 경로, 시간 예산 명시)
- **최대 2개**. 없으면 `### Nice-to-have: 없음. 현재 프롬프트로 충분합니다.` 한 줄만 출력
- 적용을 권유하지 않는다. 사용자가 원하면 명시적으로 `/ddalggak prompt <텍스트>`로 재실행하도록 안내만 한다
- "더 자세히", "더 명확히" 같은 모호한 제안 금지 — 구체적인 추가 문장 또는 섹션 후보를 제시

#### Case B — 개선 항목 1건 이상

평가 결과에서 문제 항목만 개선안을 작성한다:

```
## Prompt Audit — <대상 파일명>

### 평가 결과
| 항목 | 현재 상태 | 권고 |
|------|-----------|------|
| ① 단일 목표 | ⚠️ 목표 2개 혼합 | 분리안: ... |
| ② Why 명시 | ✅ | — |
| ③ 검증 기준 | ⚠️ "테스트 통과" 수준 | 정확한 명령어: pnpm test foo |
| ④ 복명복창 | ❌ 없음 | 완료 조건 0번: "이해한 목표 먼저 출력" 추가 |
| ⑤ 질문 경로 | ❌ 없음 | 규칙 마지막: "불명확 사항은 시작 전 질문" 추가 |

### 개선 Draft
(수정된 섹션 전문)
```

### Step 4. 적용 여부 확인

**Case A에서는 이 단계를 실행하지 않는다.** 적용할 Draft가 없기 때문이다.

Case B인 경우에만 AskUserQuestion으로 확인:

```
개선안을 <파일명>에 직접 반영할까요?
  A. 전체 적용
  B. 적용 안 함 (Draft만 유지)
  C. 일부만 적용 (적용할 항목 번호 선택)
```

사용자가 확인하면 해당 파일에 Edit를 적용한다.

---

## 공통 규칙

- **커밋 메시지 트레일러 금지**: `Co-authored-by:`, AI 도구 흔적 삽입 금지.
- **한국어 응답**이 기본. 커밋 메시지도 한국어.
- **개인정보 보호**: roster 파일은 커밋하지 말고, 테스트 fixture는 반드시 가짜 데이터.
- **ScheduleWakeup 지연**: 5분 이내(60-270s)는 캐시 창 유지, 300s는 피하고, 20-30분(1200-1800s)는 idle tick용.
- **탐색 질문에는 짧게**: 2-3 문장 + 옵션 + tradeoff로 답하고 사용자 결정 기다림. 곧바로 구현 금지.
- **파일 소유 겹침 감지**: 두 워커가 같은 파일을 수정하면 병렬이 깨진다. 병렬이 깨진 lane은 같은 PR 안 serial commit으로 통합한다.
- **Cross-dependency는 stacked PR이 아니라 serial commit**: Worker A의 output을 Worker B가 import해야 하면, B를 독립 병렬 lane으로 배포하지 않는다. A의 integration commit 이후 B를 같은 integration branch에서 순차 적용하고 integration gate를 다시 실행한다.
- **Stub 전략은 테스트 mock에만**: 프로덕션 코드에 stub 직접 박지 말고 테스트에서 `vi.mock`으로 격리.

## 실패 모드 예방

- **Amend 오염**: `git add <specific paths>`를 명시해 다른 워커 파일이 섞이지 않게 한다.
- **Rebase가 커밋을 삼킴**: "patch already upstream"이면 force-push 금지. 원인 조사 지시.
- **Self-approve 제한**: `--comment` fallback 사용.
- **Stale repo 오진**: fetch/ahead-behind 없이 "이미 반영됨", "테스트 실패", "충돌"로 판단하지 않는다.
- **외부 의존성 환각**: package manifest 또는 repo 검색 증거 없이 새 import를 지시하지 않는다.
- **Force-push fix loop**: fix iteration은 새 커밋 + 일반 push가 기본이다. amend/force-push는 승인된 예외다.
- **Worker 완료 신호 오판**: test pass, idle 알림, commit 존재만으로 완료가 아니다. 독립 이슈는 `ISSUE_PR_READY`의 commit/push/issue PR/PR URL/validation evidence를 확인하고, conflict fallback은 `LANE_READY`의 patch/local commit/validation/integration handoff를 확인한다. publish는 독립 이슈 PR 또는 conflict-fallback PR에서 확인한다.
- **gitignored/local-only 파일 PR 포함**: `git check-ignore -v`로 ignored 여부를 확인하고 PR workflow와 직접 수정 workflow를 분리한다.
- **문서/Skill 패치 회귀**: markdown 블록 교체 후 기존 라우팅, 코드 수정 권한 invariant, heading 번호, fenced code block 균형을 즉시 재확인한다.

## Verification Checklist

start/review/status/ship/check/clean 종료 전 해당되는 항목을 확인한다:

- `git fetch --prune` 및 base/upstream ahead-behind 확인을 수행했다.
- issue body와 comments를 함께 확인했고, 충돌 시 우선순위와 근거를 기록했다.
- 변경 파일이 tracked PR 대상인지, ignored/local-only/repo 밖 파일인지 확인했다.
- subagent/teammate side effect를 `git status`, `git diff --name-only`, lane evidence, integration commit 조회로 직접 재검증했다.
- test pass와 issue PR publish 또는 conflict-fallback handoff 완료를 구분했고, 완료 신호가 실제 산출물과 일치한다.
- reviewer는 구현자 context와 checkout 상태에 오염되지 않았다.
- Medium/Low 수정이 미머지 PR 또는 공유 계약 전환에 의존하면 TODO/follow-up으로 제한했다.
- SKILL.md/문서 surgery 후 기존 동작 보존, 번호 재정렬, markdown fence 균형을 확인했다.

## 명명 규칙

- 브랜치: `feature/issue-<N>-<slug>/worker-<N>`
- 파일: `BRIEF.md`, `REVIEW_BRIEF_PR<num>.md`, `FIX_BRIEF_PR<num>_1.md`, `FIX_BRIEF_PR<num>_2.md`, ...
- Teammate: 구현자 `worker-<N>`, 리뷰어 `reviewer-pr<num>` (PR 번호 사용, worker-N 재사용 금지)
- 완료 시그널:
  - 독립 이슈 구현: `ISSUE_PR_READY: #<issue> <PR URL> <commit> <validation>`
  - conflict fallback 구현: `LANE_READY: Phase Y W<번호> <patch-or-commit> <validation>`
  - 리뷰: `REVIEW DONE PR#<num>: <verdict> critical=N high=N medium=N low=N`
  - 수정: `FIX DONE PR#<num> iter<N>: high_fixed=<N> medium_fixed=<N> low_fixed=<N>`
  - Rebase: `REBASE DONE PR#<dep> on-top-of-<base>-iter<N>`
