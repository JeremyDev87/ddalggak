# Local Diff Check Reference

`/ddalggak check`는 push/PR 없이 로컬 미커밋 변경 또는 특정 worktree diff를 대상으로 one-shot 코드 리뷰를 수행한다. 결과는 GitHub 코멘트가 아니라 사용자에게 직접 제안 형태로 보고하며 iteration loop는 없다.

## 사용 시나리오

- `ship` 전에 코드 품질을 확인하고 싶을 때
- GitHub PR 없이 독립적으로 로컬 변경사항을 점검할 때
- 병렬 워커 결과물을 배포 전 단독 리뷰할 때

## 인수 파싱

- 인수 없음: 현재 repo의 `git diff HEAD` + staged 변경
- `<worktree-path>`: 해당 경로의 `git -C <path> diff HEAD`
- `--staged`: staged 변경만 대상 (`git diff --cached`)

## Step 1. Diff 수집

리뷰 전 stale/base 상태를 read-only로 확인한다:

```bash
git fetch --prune
git status -sb
git rev-list --left-right --count @{upstream}...HEAD 2>/dev/null || true
```

기본 diff와 worktree 지정 diff를 구분해 수집한다:

```bash
# 인수 없음 (기본)
git diff HEAD --stat
git diff --stat --cached
git status -sb

# worktree 지정 시
git -C <worktree-path> diff HEAD --stat
git -C <worktree-path> status -sb
```

변경이 전혀 없으면 즉시 중단하고 보고한다: `리뷰할 변경사항이 없습니다.`

diff가 **500줄 이상**이면 `AskUserQuestion`으로 확인한다:

```text
Q: diff가 N줄입니다. 어떻게 진행할까요?
  A. 전체 리뷰 (느릴 수 있음)
  B. 변경된 파일 목록만 보고 범위 좁혀서 재실행
  C. 취소
```

## Step 2. Reviewer Teammate 생성

fresh reviewer teammate를 생성한다. 구현자와 같은 teammate를 재사용하지 않는다.

```text
TeamCreate(name="reviewer-local-<YYYYMMDD-HHMM>", ...)
```

worktree가 지정된 경우 해당 경로를 cwd로 설정한다. 없으면 현재 repo root를 사용한다.

## Step 3. CHECK_BRIEF 작성 및 배포

teammate의 cwd 아래 `CHECK_BRIEF.md`를 작성한다. 임시 파일은 추적되지 않게 한다.

```bash
# .gitignore에 추가 (미등록 시)
echo "CHECK_BRIEF.md" >> .gitignore
```

`CHECK_BRIEF.md`에는 대상 repo/브랜치/diff 범위, diff 전문 또는 필요한 일부, 심각도 기준, 출력 형식, read-only 규칙을 포함한다.

권장 brief skeleton:

````markdown
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
````

teammate에 배포:

```text
SendMessage(to="reviewer-local-<ts>", content="CHECK_BRIEF.md를 읽고 지시된 대로 로컬 diff를 리뷰해. 완료 후 반드시 CHECK DONE 라인을 출력해.")
```

## Step 4. 결과 수집

ScheduleWakeup으로 4-5분 뒤 확인한다. 270초 이하를 사용해 캐시 창을 유지한다.

`TaskGet`으로 teammate 완료 여부를 확인하고 `TaskOutput`에서 `CHECK DONE` 라인을 추출한다.

실패 복구:

1. ScheduleWakeup 2회(~9분) 후에도 `CHECK DONE`이 없으면 `TaskOutput`으로 원인을 진단한다.
2. `reviewer-local-<ts> 응답 없음 — 수동 개입 필요`를 보고하고 사용자 대기한다.

## Step 5. 사용자에게 결과 제안

GitHub 코멘트 형식이 아니라 대화에서 직접 구조화된 텍스트로 출력한다.

```markdown
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

iteration loop는 없다. 수정 여부는 사용자가 결정한다.

## Step 6. CHECK_BRIEF 정리

리뷰 완료 후 임시 파일을 제거한다:

```bash
rm -f CHECK_BRIEF.md
```
