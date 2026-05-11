---
name: ddalggak
description: Use when the user wants to execute a full "GitHub issue → parallel implementation → cross-review → self-healing" workflow, or plan/create GitHub issues, or clean up after a merge. Subcommands — start: issue-based parallel implementation; review: cross-review loop; status: current state snapshot; plan: write an issue-ready implementation plan; issue: convert a plan into GitHub issues; clean: post-merge branch/worktree/issue cleanup; ship: validate, commit, push, and open a draft PR for current changes; retro: write a retrospective after merge and save lessons to memory; prompt: audit and improve BRIEF/REVIEW_BRIEF prompts using Opus 4.7 principles; check: one-shot local diff review — fresh reviewer teammate analyzes uncommitted/worktree changes and reports suggestions directly to user (no GitHub comments).
argument-hint: [start|review|status|plan|issue|clean|ship|retro|prompt|check] — no arg = start from GitHub issue
user-invocable: true
---

# ddalggak — 딸깍 워크플로우

"딸깍"은 **GitHub Issue → 계획 → 병렬 구현 → 교차 리뷰 → 자가 회복** 의 한 사이클이다. Phase 단위로 반복한다.

이 skill은 **claude team teammate** 위에 얹힌 방법론 레이어다. teammate가 독립 worktree에서 구현·리뷰를 수행하고, ddalggak은 그 위에서 "무엇을, 누구에게, 어떤 순서로 시킬지"를 결정한다.

## 핵심 원칙

- **Phase는 순차, Worker는 병렬**. 한 Phase 안의 워커 N명은 서로 다른 파일을 건드린다.
- **Conductor(이 Claude)는 지시만 한다**. 커밋/push/PR은 워커가 직접 한다. Conductor가 대신하면 안 된다.
- **파일 기반 BRIEF**. 짧은 인라인 프롬프트가 아니라 `BRIEF.md`/`REVIEW_BRIEF.md`/`FIX_BRIEF_N.md`를 worktree에 쓰고 워커가 읽게 한다.
- **탈출 조건 명시**. "Critical+High = 0"처럼 기계적으로 측정 가능한 기준으로만 반복을 멈춘다.
- **Reversibility 고려**. force push는 `--force` 통일 (rebase & merge 정책). amend > 새 커밋.

## 서브커맨드 분기

**파싱 규칙** — Arguments의 **첫 번째 단어만** 서브커맨드로 판정한다:

1. 첫 단어가 아래 목록과 **정확히 일치**하면 해당 서브커맨드로 라우팅. 나머지 인수는 해당 서브커맨드에 전달한다.
2. 첫 단어가 목록에 없거나 인수 전체가 없으면 → Start Workflow.
3. 서브커맨드로 판정된 이후에는 나머지 인수가 "구현 요청처럼 보여도" Start로 폴백하지 않는다. 절대 예외 없음.
4. 라우팅 결정 직후 **반드시 한 줄 출력**: `→ [서브커맨드] 실행` (복명복창). 이후 해당 섹션으로 이동.

서브커맨드 목록:
- `start` 또는 인수 없음 → [Start Workflow](#start-workflow)
- `review` → [Cross-Review Loop](#cross-review-loop)
- `status` → [Status](#status)
- `plan` → [Issue-Ready Plan](#issue-ready-plan)
- `issue` → [Plan to Issues](#plan-to-issues)
- `clean` → [Merge Cleanup](#merge-cleanup)
- `ship` → [Ship](#ship)
- `check` → [Local Diff Check](#local-diff-check)
- `retro` → [Retrospective](#retrospective)
- `prompt` → [Prompt Optimizer](#prompt-optimizer)

---

## Start Workflow

### Step 0. 계획 타당성 검토 게이트

이슈/문서/프롬프트 수집 직후, Wave 구성 전에 실행한다.

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

1. `status:unlocked` 레이블 이슈 전체를 자동 수집:
   ```bash
   gh issue list --label "status:unlocked" --json number,title,labels,body
   ```
   `status:unlocked` 이슈가 없으면 open 전체 수집:
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

   `status:locked` 레이블 이슈는 수집 대상에서 제외하고 안내만 한다:  
   "🔒 status:locked 이슈 #N은 선행 조건이 충족되지 않아 이번 배치에서 제외됩니다."

   수집된 각 이슈에 대해 comments까지 포함하여 상세 조회한다:
   ```bash
   # 각 이슈마다 실행
   gh issue view <number> --json number,title,body,comments
   ```
   최신 코멘트가 body와 충돌하면 코멘트를 우선한다.

2. parent tracker 이슈(sub-issue만 열거하고 코드 파일을 직접 소유하지 않는 이슈)를 별도 표시하고 Wave 배정에서 제외.

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

   - **Hard Blocker**: 같은 기존 파일 수정 / 같은 생성 아티팩트 / 같은 공유 설정·레지스트리·barrel / 미게시 코드 의존성 → 반드시 다른 Wave
   - **Soft Blocker**: 의미적 선행 조건 / 트래커·체크리스트 순서 → 같은 Wave 허용
   - Hard Blocker만 Wave를 나눌 수 있다. Soft Blocker만으로 레인을 닫으면 안 된다.

6. **Wave 구성** (graph-coloring):
   - Wave 1: 내부 Hard Blocker 없는 가장 큰 안전 셋
   - Wave N: Wave N-1에 Hard Blocker가 걸린 이슈 → 정확한 blocking 파일·이슈 쌍 명시
   - parent tracker: wave 없음
   - **Wave N 착수 전 필수 확인**: Wave N-1의 모든 PR이 실제로 merge됐는지 검증
     ```bash
     gh pr list --state open
     # open PR 0개여야 Wave N 착수 가능
     ```

7. 아래 형식으로 **실행 계획 출력**:

```
### 파일 소유권 매핑

| 이슈 | 수정 파일 |
|------|-----------|
| #N   | `path/to/file` |

### Conflict 분석
- Hard Blocker: (없음 / 이슈 X ↔ 이슈 Y — `path/file` 겹침)
- Soft Blocker: (없음 / 이슈 Z는 이슈 W merge 후 착수 권장)

### Wave 1 — 완전 병렬 (N개 PR 동시)

| Lane | 이슈 | 브랜치 | 수정 파일 |
|------|------|--------|-----------|
| L1   | #N   | `fix/N-short-name` | `scripts/foo.py` |

### Wave 2 — 단독 PR (선행 조건: Wave 1 merge 완료)

| Lane | 이슈 | 브랜치 | 수정 파일 | 선행 조건 |
|------|------|--------|-----------|-----------|
| L4   | #M   | `fix/M-short-name` | `shared/config.py` | #N, #K merge |
```

8. 계획 출력 후 실행 방식 확인:

```
실행 방식을 선택해 주세요:
1. worktree + claude team teammate (병렬) — 추천
2. 순차 실행 (느리지만 단순)
```

### Step 1.5. 간이 구현 계획 확인

Wave 구성 후, 워커 배포 전에 다음 초안을 제시하고 사용자 확인을 받는다.

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

gitignore 검증 후 Wave 1 Lane마다:
```bash
git check-ignore -q .worktrees || echo ".worktrees/" >> .gitignore
git worktree add .worktrees/<branch-name> -b <branch-name>
```

**2A-2. Team 생성 및 배포**

Lane마다 named teammate를 생성하고 동시에 작업을 배포한다.

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
   5. MUST NOT — 다른 branch switch 금지, 허용 목록 외 파일 수정 금지
   6. COMMIT FORMAT — `type(scope): 한글 제목\n\n본문 2-4줄\n\nCloses #N` / `-F` 파일로 전달
   7. PR FORMAT — 한글 육하원칙(무엇을/왜/어떻게/검증/제외 범위) + `Closes #N`
   8. PR CREATE — `gh pr create`로 PR 생성까지 완료 후 PR URL 출력

모든 teammate 완료 후 PR URL 요약 테이블 출력:
```
| Lane | 이슈 | PR URL |
|------|------|--------|
```

### Step 2B. 단일 이슈 계획 (이슈 번호 지정 시)

이슈에서 발견된 상태를 간결하게 요약하고 구현 계획(Phases + Workers) 제시:

- 전체 작업을 Phase로 나누기 (Foundation=의존성 없는 신규 코드 / Integration=기존 코드 연결·수정 / Regression=전체 동작 검증)
- 각 Phase는 파일 소유 겹침 없는 Worker들로 병렬화
- Phase 간 데이터 의존 → 순차

계획 표:
```
| Phase | Worker | 범위(파일) | 완료 조건 |
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

## 현재 상태
- working directory: <절대경로 — 예: /Users/x/.worktrees/fix-123-slug>
- branch: feature/issue-<N>-<slug>/worker-<N>

## 너의 범위 (이 파일들만 건드려)
1. ...
2. ...

## 코드베이스 컨텍스트

### 모듈 구조
(관련 디렉토리 목록, barrel exports, 공유 타입 경로)

### 따를 패턴
(유사 구현 코드 발췌 — 경로 포함)

### Anti-patterns (이것은 하지 마)
(deprecated 방식, 교체된 패턴, 이 모듈에서 금지된 접근)

### 시작 전 확인 (복명복창)
구현 시작 전, 아래 두 가지를 먼저 출력해:
1. 내가 따를 패턴: (발견한 기존 구현 방식 1줄 요약)
2. 의도치 않게 영향 줄 수 있는 파일: (BRIEF 범위 외 파일 중 수정 가능성 있는 것)

## [의존 워커가 있다면] 다른 워커가 확정한 타입 (stub으로 써)
(코드 블록 그대로)

## 구체 요구사항
(함수 시그니처, 알고리즘, 테스트 케이스 최소 3개: happy path + edge case + error case)

## 완료 조건
1. lint pass (scope 명시)
2. test pass
3. regression 없음 (전체 테스트)
4. git add → commit → push → gh pr create (워커 본인이 전부)
5. PR URL 출력 후 `PUSHED: Phase Y W<번호>` 한 줄 출력

## 병행 워커 참고 (수정 금지)

## 규칙
- 기존 시그니처 호환성 유지
- 테스트 fixture는 가짜 데이터
- BRIEF 범위 밖은 건드리지 마

## Conductor Recovery Anchor
- conductor-state 경로: `.ddalggak/conductor-state.md`
- 이 BRIEF의 위치: Phase Y / Worker N
- 완료 시그널 예상: `PUSHED: Phase Y WN`

시작해.
```

배포:

Step 2A-2에서 teammate에 이미 BRIEF 경로를 포함했으면 별도 전송 불필요.
추가 지시가 필요한 경우:
```
SendMessage(to="worker-<N>", content="BRIEF.md(.worktrees/<branch>/BRIEF.md)를 읽고 지시된 대로 구현해. 완료 후 한 줄: PUSHED: Phase Y W<번호>")
```

### Step 4. 대기 및 상태 수집

- 병렬 워커 작업은 3-10분 소요. **ScheduleWakeup으로 4-5분 뒤 체크** (~270s, 캐시 창 유지)

**완료 확인**:
- `TaskGet <task-id>`로 각 teammate 완료 여부 확인
- 완료된 `TaskOutput`에서 `PUSHED:` 라인 추출
- **실패 복구**: ScheduleWakeup 3회(~13분) 후에도 `PUSHED:` 없으면:
  1. `TaskOutput`으로 teammate 출력 확인 후 원인 진단
  2. "워커 N 응답 없음 — 수동 개입 필요" 보고 후 사용자 대기

모든 워커가 `PUSHED:` 출력 나오면 Phase 완료. 사용자에게 PR 링크 요약해 보고.

---

## Cross-Review Loop

### Step 0. 대상 PR 확정

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

**생성**: PR마다 1개씩 새 teammate. 작업 디렉토리는 PR author의 worktree.
  ```
  TeamCreate(name="reviewer-pr<num>", cwd=".worktrees/<author-branch>", ...)
  ```
  이름 컨벤션: `reviewer-pr<num>` (PR 번호 사용, worker-N 아님)

**배포**: `SendMessage`로 리뷰 작업 전달
  ```
  SendMessage(to="reviewer-pr<num>", content="PR #<num>을 리뷰해. REVIEW_BRIEF_PR<num>.md(.worktrees/<author-branch>/REVIEW_BRIEF_PR<num>.md)를 읽고 지시대로 수행. 완료 후 한 줄: REVIEW DONE PR#<num>: <APPROVE|CHANGES_REQUESTED> critical=N high=N medium=N low=N")
  ```

**재리뷰(Step 5)**: 같은 `reviewer-pr<num>` teammate 유지. 이전 iteration에서 지적한 항목 기억이 재리뷰 정확도에 도움된다.

### Step 2. REVIEW_BRIEF 작성

각 PR author의 worktree(`reviewer-pr<num>` teammate의 cwd)에 `REVIEW_BRIEF_PR<num>.md`를 작성. 포함할 내용:

```
# Reviewer Brief — Teammate X reviews PR #<num>

## 맥락
- 대상 PR, 작성자 브랜치
- 원 GitHub Issue: 이슈 번호는 PR body의 `Closes #N` 또는 BRIEF의 GitHub Issue 섹션에서 확인.
  조회 명령어: gh issue view <issue-number> --json number,title,body,url,comments (한 번 조회)
- 이슈 완료 기준: (BRIEF의 완료 기준 섹션 그대로)
- 이슈 body 핵심 요구사항: (이슈 body에서 구현 기준·제약·완료 조건 발췌)
- 이슈 코멘트 보완 사항: (같은 조회 결과에서, body에 없고 코멘트에만 있는 요구사항·설계 결정·범위 변경 발췌. 최신 코멘트가 body와 충돌하면 코멘트를 우선한다. 코멘트가 없거나 body와 동일하면 "없음")

## 리뷰 방법
1. gh pr view <num> --json title,body,files,commits
2. gh pr diff <num>
3. diff만으로 런타임 동작 판단 불가한 경우(빌드 의존 로직, 환경 변수 분기 등)에만 gh pr checkout <num> --force → 실제 빌드/테스트 돌려봐
4. 심각도 분류

## 선결 체크 (리뷰 전 반드시)
1. `gh pr checks <num>` — **fail이 하나라도 있으면 자동 Critical**. 이유 기록 필수.
   - CI fail 원인이 "의존 PR 미merge" 또는 "stacked PR"이라도 Critical 유지. 올바른 수정은 PR을 의존 브랜치 위로 rebase해 CI를 통과시키는 것이지, 심각도를 낮추는 것이 아님.
   - `cancelled` 상태만 있는 경우: **Warning**으로 분류하고 재실행 권장
2. `gh pr view <num> --json baseRefName` — base가 main이 아니면 stacked PR. diff는 base 브랜치 기준으로 읽어야 맞음.

## 심각도 기준
- Critical: CI fail(typecheck/lint/test/build 중 하나라도), 보안 구멍, 데이터 유실, 스펙과 정반대 동작
- High: 중대한 버그, 중대 성능 이슈, 잘못된 추상화로 후속 작업이 막힘, 스펙 핵심 동작 불일치
- Medium: 마이너 버그, 누락된 edge case 테스트, 코드 스멜
- Low: 네이밍, 주석, 스타일 nit

## 리뷰 작성
Critical+High = 0이면 `gh pr review <num> --approve --body "..."`
Critical+High > 0이면 `gh pr review <num> --request-changes --body "..."`

본문 구조:
## Verdict
## Issues
### Critical (N)
### High (N)
### Medium (N)
### Low (N)
## Summary

## 완료 출력
REVIEW DONE PR#<num>: <APPROVE|CHANGES_REQUESTED> critical=N high=N medium=N low=N

## 규칙
- 수정 금지 (작성자가 수정함)
- 최초 1회만 리뷰
```

**주의**: 같은 GitHub 계정이면 self-approve가 막힘. "Cannot approve your own pull request" 에러 시 `gh pr review <num> --comment --body ...` 사용.

### Step 3. 리뷰 수집

- ScheduleWakeup으로 4-5분 뒤 체크
- `TaskGet <reviewer-task-id>`로 reviewer teammate 완료 여부 확인
- `TaskOutput`에서 `REVIEW DONE PR#` 라인 추출
- **실패 복구**: ScheduleWakeup 3회 후 응답 없으면 "리뷰어 N 응답 없음" 보고 후 사용자 대기

PR마다 (verdict, critical, high) 파싱.

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
### High (필수 수정)
- <구체 이슈 1> — 사유 + 수정 방향 (2가지 옵션 제시)
### Medium/Low (권장)

## 작업 순서
1. 코드 수정
2. lint/test/build 통과
3. git commit --amend --no-edit
4. git push --force origin <branch>
5. gh pr comment <num> --body "Iteration N fix: <요약>"

## 완료 출력
FIX DONE PR#<num> iterN: high_fixed=<N> medium_fixed=<N> low_fixed=<N>
또는
FIX FAILED PR#<num> iterN: <사유>

## 규칙
- 기존 커밋 메시지 유지 (--no-edit)
- 리뷰어가 지적 안 한 곳은 수정 금지
```

### Step 5. 재리뷰

각 fix 완료 후 원래 리뷰어에게 재리뷰 지시:
```
PR #<num>이 iteration N fix로 amend + force-push되었다. 최신 상태로 재리뷰해.
같은 심각도 기준으로 재평가 후 gh pr review <num> --comment --body로 새 verdict 포스팅.
완료 후 한 줄: REVIEW DONE PR#<num> iter<N+1>: <verdict> critical=N high=N medium=N low=N
```

**Stacked PR 주의**: base가 amend/force-push될 때 하위 PR의 author에게 rebase도 지시:
```
PR #<base>가 amend + force-push되었다. 너의 PR #<dep>은 stack되어 있으므로 새 base 위로 rebase해야 한다.
순서: git fetch origin → git rebase origin/<base-branch> → 충돌 없으면 test 확인 → git push --force → gh pr comment <dep> --body "..."
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

- `TaskList`로 진행 중인 teammate 작업 상태 전체 조회
- `gh pr list --author @me --state open --json number,title,headRefName,url`로 열린 PR 수집
- PR body의 `Closes #N`으로 이슈 연결 파악

**출력**:
- 현재 Phase
- 각 teammate의 (task, status, worktree, 연관 이슈)
- 열린 PR 목록
- 다음 액션 제안

---

## Issue-Ready Plan

GitHub issue 등록 전, 저성능 모델이 실행 가능하고 review agent가 평가 가능한 구체 구현 계획을 작성한다. `/ddalggak issue`의 소스 자료가 된다.

구현 코드를 작성하지 않는다. 사용자가 명시적으로 요청하지 않으면 GitHub issue도 등록하지 않는다.

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

Wave 전 conflict matrix 구축:

| Unit A | Unit B | Overlap | Decision |
|---|---|---|---|
| A | B | `path/file.ts` | Hard blocker: 별도 wave |
| C | D | 파일 분리, 시맨틱 순서만 | Soft blocker: 같은 wave 허용 |

Hard blocker: 같은 기존 파일 / 같은 생성 아티팩트 / 같은 공유 설정·레지스트리·스키마·barrel export / 미게시 코드 의존성

Soft blocker: 트래커 순서 / 리뷰 선호 / 시맨틱 권장 (하드 블로커 아님)

Wave 구성 (graph-coloring):
- Wave 1: 내부 하드 블로커 없는 가장 큰 안전 셋
- 이후 Wave: 정확한 blocking 이슈/파일 쌍 명시
- 부모/epic 트래커는 wave 없음
- 전체 시스템 검증은 병렬 구현 레인이 아닌 merge gate

### 6. Review Agent Contract 추가

각 구현 단위마다:
- 예상 after-state
- 허용 불가 구현
- 회귀 불가 동작
- 리뷰어가 확인해야 할 edge case
- 리뷰어가 기대해야 할 테스트/명령어
- 먼저 확인할 파일
- `changes requested` 트리거 모호성

### 7. 검증 및 증거 요구사항

각 단위와 최종 gate에:
- 정확한 명령어 (알 수 있으면)
- 명령어가 checkout을 변경하는지 여부
- 필요한 환경 변수, 서비스, fixture, 인증
- 자동화 불가 시 수동 검증 단계
- 성공 시그널
- 차단 케이스 보고 형식

"테스트 실행" 같은 지시는 금지. 정확한 명령어를 명시한다.

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

### Waves
- Wave 1:
- Wave 2:
- Final Serialized Gate:

### Plan-to-Issues Readiness
- Parent epic 필요 여부와 이유:
- 제안 이슈 목록:
- 이슈 생성 전 남은 블로커:
```

이슈 등록이 필요하면 이 plan을 소스로 `/ddalggak issue`를 실행한다.

---

## Plan to Issues

구현 계획을 단일 책임, conflict-aware GitHub 이슈로 변환한다. `/multi-issue-executor`로 바로 실행 가능한 형태로 만든다.

> **plan vs issue 구분**: `/ddalggak plan`은 계획 문서만 작성한다(이슈 미생성). 이슈 생성은 반드시 `/ddalggak issue`로만 수행한다. plan 내 "Phase 7: 승인 후 GitHub 이슈 생성"은 issue 서브커맨드로 위임하는 것을 의미한다.

사용자가 확인하기 전 `gh issue create`나 `gh issue edit`을 실행하지 않는다. 단, 현재 요청이 명시적으로 "지금 등록"을 요청하면 실행한다.

### Phase 1: 계획 수집

계획이 없으면 계획 문서 경로나 텍스트를 요청한다.

계획에서 추출:
- `why`: 목적과 사용자 가시 결과
- `what`: 의도된 코드/문서/테스트 변경
- `files`: 명시적 파일 소유권 또는 예상 경로
- `order`: 선행 조건, 후행 작업, merge gate
- `validation`: 완료를 증명하는 명령어 또는 수동 체크
- `scope`: 범위 외 제약사항

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
| Large | 4+ 파일, 복수 이유, 2+ wave | parent epic + sub-issues |

parent epic 사용 조건: sub-issue 3개 이상 / 복수 PR merge 의존 / 2+ wave 필요 / 사용자가 tracker 요청.

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

하드 블로커만 wave를 분리할 수 있다. 이슈를 지연시키면 정확한 공유 파일 또는 미게시 의존성을 명시한다.

### Phase 5: Wave 구성

같은 wave의 이슈는 내부 하드 블로커가 없어야 한다.

- Wave 1: 남은 이슈 중 내부 충돌 없는 가장 큰 안전 셋
- Wave N: 남은 이슈에서 재계산
- Parent epic: wave 없음
- Wave 1 외 이슈마다 정확한 블로커를 이슈/파일 쌍으로 기록

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

## 후행 조건
없음 / #<number>

## 병렬 실행 메모
Wave N. Hard Blocker: 없음 / `path/file.ts` 겹침 때문에 #<number>와 분리.
```

Parent epic body:

```markdown
## 배경
왜 이 작업이 필요한가.

## 목표
Before / After.

## 실행 순서
Wave 단위로 작업 순서와 hard blocker 이유 명시.

## Sub-issues
### Wave 1: 동시 진행 가능
- [ ] #N 제목
### Wave 2: 지정된 hard blocker merge 후
- [ ] #K 제목 (blocked by #N: `path/file.ts`)

## 완료 기준
- [ ] 모든 sub-issue merge
- [ ] 전체 기능 검증

## 병렬 실행 메모
`/multi-issue-executor`로 Wave 1부터 실행 가능.
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
| # | 제목 | 파일 | Wave | Blockers | 상태 |

## Conflict 설계 근거
- Hard Blocker: ...
- Soft Blocker: ...

## 병렬 실행 계획
`/multi-issue-executor`로 Wave 1부터 실행 가능.
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
gh issue view <number> --json number,title,body,url
```
없으면 현재 diff와 repo 컨벤션에서 의도를 추론한다.

### 3. 브랜치 및 커밋 전략 결정

- 이미 feature 브랜치이면 유지
- `main`/`master` 등 기본 브랜치이면 `claude/<description>` 브랜치 생성
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

<변경 이유와 내용 2~4줄>

Closes #<issue_number>
```

`-F` 파일로 전달, `-m` 한 줄 커밋 금지:

```bash
cat > /tmp/commit-msg.txt << 'EOF'
<type>(<scope>): 제목

본문 내용

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

사용자가 명시적으로 ready-for-review를 요청하지 않으면 draft PR.

PR description 형식 (한글 육하원칙):

```bash
gh pr create --draft --title "<제목>" --body "$(cat <<'EOF'
## 배경
왜 이 변경이 필요한가.

## 변경 사항
- 무엇을 바꿨는가

## 검증
- 실행한 검증 명령어와 결과

## 브랜치 / 워크트리
- 브랜치: <branch>
- 소스 브랜치/worktree (있을 경우): ...

## 이슈 연결
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
- **태그 힌트**: `#retrospective #ddalggak #PR#N` (PR 번호 없는 wave-level 회고는 `#retrospective #ddalggak #wave`)
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

## 이슈 및 Branch 매핑
| 이슈 | 브랜치 | worktree 경로 | Teammate | PR URL | 상태 |

## 대기 중인 시그널
- [ ] worker-1: PUSHED: Phase Y W1
- [x] worker-2: PUSHED: Phase Y W2

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

- **CP1**: Start Workflow Step 1 완료 직후 (이슈 분석 + Wave 계획 확정 후)
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
- **파일 소유 겹침 감지**: 두 워커가 같은 파일을 수정하면 병렬이 깨진다.
- **Cross-dependency는 stacked PR로 처음부터 구성**: Worker A의 output을 Worker B가 import해야 하면, B의 worktree를 A의 branch에서 분기:
  ```
  git worktree add <wt-B> -b <branch-B> <branch-A>
  ```
  B의 BRIEF에 "PR base = <branch-A>" 명시. `gh pr create` 시 `--base <branch-A>`.
- **Stub 전략은 테스트 mock에만**: 프로덕션 코드에 stub 직접 박지 말고 테스트에서 `vi.mock`으로 격리.

## 실패 모드 예방

- **Amend 오염**: `git add <specific paths>`를 명시해 다른 워커 파일이 섞이지 않게 한다.
- **Rebase가 커밋을 삼킴**: "patch already upstream"이면 force-push 금지. 원인 조사 지시.
- **Self-approve 제한**: `--comment` fallback 사용.

## 명명 규칙

- 브랜치: `feature/issue-<N>-<slug>/worker-<N>`
- 파일: `BRIEF.md`, `REVIEW_BRIEF_PR<num>.md`, `FIX_BRIEF_PR<num>_1.md`, `FIX_BRIEF_PR<num>_2.md`, ...
- Teammate: 구현자 `worker-<N>`, 리뷰어 `reviewer-pr<num>` (PR 번호 사용, worker-N 재사용 금지)
- 완료 시그널:
  - 구현: `PUSHED: Phase Y W<번호>`
  - 리뷰: `REVIEW DONE PR#<num>: <verdict> critical=N high=N medium=N low=N`
  - 수정: `FIX DONE PR#<num> iter<N>: high_fixed=<N> medium_fixed=<N> low_fixed=<N>`
  - Rebase: `REBASE DONE PR#<dep> on-top-of-<base>-iter<N>`
