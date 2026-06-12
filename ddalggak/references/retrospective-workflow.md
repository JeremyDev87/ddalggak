# Retrospective Workflow Reference
Use when: a `retro` run executes the retrospective steps: PR confirmation, note writing, memory extraction, completion report, and wiki registration.
Required by: `retro`; every retrospective artifact written outside the repository.
Side effects: repo-external writes only (retrospective notes, memory artifacts); never edits repository files.
Do not use when: the work would write any path inside the repository, or a wiki write would bypass the approval-gated `setwiki` bridge.

`/ddalggak retro`는 PR merge 이후 이번 사이클에서 배운 점을 정리해 `~/workspace/retrospective/`에 저장하고, 재사용 가치가 있는 교훈을 메모리 후보로 분리한다.

## 쓰기 권한 경계

canonical 계약은 `core/commands/retro.yaml`의 `write_side_effects`이며, retro가 파일을 쓸 수 있는 위치는 repo 외부로 한정된다.

- **허용**: `~/workspace/retrospective/`(또는 `RETRO_DIR` override 경로)의 회고 노트 파일(Step 3), 그리고 메모리 디렉토리(`~/.claude/projects/.../memory/`)의 메모리 파일과 `MEMORY.md` 인덱스(Step 4).
- **금지**: repo 내 파일은 소스·문서·설정을 불문하고 어떤 경로에도 쓰지 않는다(생성·수정 모두). 예외 없음 — 권한 표의 소스 코드 수정 ❌는 repo 내 모든 경로에 적용된다.
- **wiki**: 직접 쓰지 않는다. `wiki-bridge.md`의 approval-gated `/setwiki` 제안으로만 처리한다(Step 6).
- skill·권한 표 등 ddalggak 자체 개선점은 회고 노트 안의 제안(proposal)으로만 남기고 직접 반영하지 않는다.

## Step 0. PR 번호 확정

인수 파싱은 반드시 이 순서로 판정한다.

1. 인수로 PR 번호가 전달된 경우(`/ddalggak retro 123`) 해당 번호를 사용한다.
2. 인수 없음: 최근 merged PR을 탐색한다.

```bash
gh pr list --state merged --author @me --json number,title,mergedAt --limit 5
```

결과가 여러 개이면 `AskUserQuestion`으로 어떤 PR을 회고할지 선택한다.

```text
Q: 어떤 PR에 대한 회고를 작성할까요?
  A. #N — <제목> (merged: <날짜>)
  B. ...
```

결과가 0개이면 즉시 중단하지 않고 `AskUserQuestion`으로 진행 방식을 선택한다.

```text
Q: merged PR이 없습니다. 어떻게 진행할까요?
  A. 이번 세션 작업 내용으로 회고 작성 (PR 없이 컨텍스트 기반)
  B. PR 번호를 직접 입력
  C. 취소
```

`세션 컨텍스트 기반` 선택 시 현재 대화에서 수행한 작업 내용을 소스로 삼아 회고를 작성한다. 파일명에는 PR 번호 대신 작업 슬러그를 사용한다. 예: `YYYY-MM-DD-session-<slug>.md`.

## Step 1. merge 확인

```bash
gh pr view <확정된-PR-번호> --json number,state,mergedAt,title
```

`state != MERGED`이면 중단하고 보고한다.

## Step 2. 회고 내용 구성

다음 섹션으로 회고 문서를 작성한다.

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

## Step 3. 파일 저장

파일명 형식: `YYYY-MM-DD-pr<N>-<slug>.md`.

저장 경로는 `CLAUDE.md`에 `RETRO_DIR: ~/custom/path`가 지정되어 있으면 그 경로를 사용하고, 미지정 시 기본값을 사용한다.

```text
~/workspace/retrospective/YYYY-MM-DD-pr<N>-<slug>.md
```

디렉토리가 없으면 사용자 확인 후 생성한다.

## Step 4. 메모리 추출

회고 내용에서 미래 세션에서 재사용할 가치가 있는 교훈을 골라 메모리로 저장한다.

메모리·wiki 후보를 분류하기 전에 `references/wiki-growth-triage.md`를 먼저 로드해 triage 기준을 적용한다. 각 교훈은 classification lane(immediate guardrail / reference-template / verifier-script / GitHub issue / defer-reject) 중 정확히 하나의 primary lane으로 분류하고, getwiki 중복 검사를 통과한 항목만 이 단계의 메모리 저장 또는 Step 6의 wiki 등록 후보로 제안한다.

저장 기준:

- 반복 실수 방지에 직접 도움이 되는 것 → `feedback` 타입
- 특정 기술/패턴의 비자명한 제약 → `feedback` 타입
- 프로젝트 구조나 설계 결정의 이유 → `project` 타입

저장하지 않는 것:

- 이미 코드나 CLAUDE.md에 반영된 것
- 이번 PR에만 해당하는 일회성 맥락
- PR numbers, commit SHAs, single-session completion logs처럼 특정 incident records에 속하고 아직 durable reusable knowledge로 일반화되지 않은 산출물

각 메모리 파일은 `~/.claude/projects/.../memory/`에 저장하고 `MEMORY.md` 인덱스를 업데이트한다.

## Step 5. 완료 보고

```text
RETRO_DONE PR#<N>: 파일=<경로> 메모리=<저장한 개수>개
```

cleanup이 아직 완료되지 않았으면 `/ddalggak clean` 실행을 제안한다 — retro는 clean의 local-destructive 동작을 직접 수행하지 않고, 사용자 확인 후에만 clean으로 넘어간다(라우팅 invariant 6: 선택된 subcommand는 권한 표를 넘지 않는다).

## Step 6. Wiki 등록

저장된 회고 파일을 iCloud Wiki의 `retrospectives/` 카테고리에 entity page로 등록할 가치가 있으면 `wiki-bridge.md`의 setwiki bridge를 사용한다. 기본은 review-only이며, 명시 승인 전에는 wiki 파일을 쓰지 않는다.

`/setwiki`를 호출하거나 사용자에게 승인 요청을 남길 때 다음 정보를 함께 전달한다.

- **소스**: Step 3에서 저장된 회고 파일 경로 (`~/workspace/retrospective/YYYY-MM-DD-...md`)
- **카테고리 힌트**: `retrospectives`
- **태그 힌트**: `#retrospective #ddalggak #PR#N` (PR 번호 없는 commit-lane 회고는 `#retrospective #ddalggak #commit-lane`)
- **제목 힌트**: 회고 파일의 H1 제목 그대로 사용

setwiki 실패 시 retro 전체를 실패 처리하지 않는다. 경고를 출력하고 계속한다.

```text
⚠️ Wiki 등록 실패: <사유>. 회고 파일은 ~/workspace/retrospective/에 저장되었습니다.
```

wiki 등록 성공 시 완료 보고 포맷이 확장된다.

```text
RETRO_DONE PR#<N>: 파일=<경로> 메모리=<N>개 wiki=retrospectives/<entity-파일명>
```
