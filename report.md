# remember-workflow 검증 리포트

> 이 파일은 ddalggak 오픈소스화 작업을 통해 remember-workflow 7단계를 진행하면서
> 발견된 버그·의도와 다른 동작·개선점을 기록한다.
> 세션: 6f03ec3e-9cba-49e3-b5f2-a27353c112a1

---

## 개요

- **요구사항**: ddalggak 프로젝트 오픈소스화 (LICENSE, package.json, README, FUNDING.yml, CONTRIBUTING.md, report.md)
- **목적 (부수)**: remember-workflow 7단계 실제 실행을 통한 워크플로우 검증
- **발견 총계**: 버그 2건, 의도와 다른 동작 1건, 개선 제안 3건

---

## Step 1: 요구사항 분석

_특이사항 없음. 인터뷰·명확화 질문 루프 정상 동작._

---

## Step 2: 구현 계획

_특이사항 없음._

---

## Step 3: 작업 계획

### 🐛 BUG-01: task_plan_validator.py 포맷 스펙 미문서화

- **현상**: step3-task-plan.md 최초 작성 시 `## task-N` + 서브헤딩 방식으로 작성했으나 lint 440개 에러 발생
- **원인**: validator가 요구하는 포맷(`### task-N: title` 헤딩 + `- **field**: value` 인라인 필드)이 어디에도 문서화되어 있지 않음. `task_plan_validator.py` 소스를 직접 읽어야만 확인 가능
- **영향**: 첫 시도에 오류가 필연적으로 발생. 반복 수정 비용 발생
- **개선 제안**: Step 3 Skill 또는 PRD에 `task_plan_validator.py` 필드 스펙 요약 추가 필요

### ⚠️ UNEXPECTED-01: 병렬 task 실행 UI 옵션이 실제로 동작하지 않음

- **현상**: Step 3 → Step 4 전이 시 `AskUserQuestion`으로 "Subagent 병렬 실행" 선택지가 제공됨. 사용자가 선택했으나 state machine이 "한 번에 하나의 task만 진행할 수 있습니다" 에러 반환
- **원인**: state machine이 task 병렬 실행을 지원하지 않으나 UI에 옵션이 노출됨
- **영향**: 사용자 혼란. 선택지가 있어서 가능한 줄 알고 선택했는데 실제로는 불가
- **개선 제안**: 병렬 실행이 실제로 지원되지 않는 경우 해당 옵션을 비활성화하거나 "현재 지원 안 됨" 표시 필요. 혹은 실제 병렬 실행 지원 구현

---

## Step 4: CPS 설계

_6개 task CPS 모두 정상 작성. 특이사항 없음._

---

## Step 5: PRD 작성

### 🐛 BUG-02: 멱등성 계약 유효 형식 미안내

- **현상**: task-6 PRD 작성 시 멱등성 계약을 `not-applicable: 지속 업데이트 파일, 덮어쓰지 않고 append`로 작성. DA 리뷰에서 invalid 판정
- **원인**: 멱등성 계약 허용 형식이 `idempotent: <설명>` 또는 `not-applicable: <이유>` 두 가지뿐인데, 이 제약이 PRD 작성 가이드에 명시되어 있지 않음. `task_plan_validator.py` 소스를 읽어야만 파악 가능
- **수정 경과**: `idempotent: 파일 덮어쓰기, 재실행 시 동일 스켈레톤으로 초기화`로 변경 후 통과
- **개선 제안**: Step 5 PRD Skill 또는 CPS 가이드에 멱등성 계약 유효 형식 명시 필요

### 💡 IMPROVE-01: DA 리뷰 iter 순서 강제 제약

- **현상**: task-6 Step 5 DA 리뷰 iter1(fail) 기록 없이 iter2(pass)로 바로 기록 시도 시 에러
- **원인**: review-record가 이전 iteration 기록 없이 다음 iteration을 허용하지 않음
- **평가**: 의도된 동작으로 보이나, 에러 메시지가 "이전 iteration을 먼저 기록하세요"처럼 명시적이지 않음. 일반적인 오류 메시지만 출력되어 원인 파악에 시간 소요

---

## Step 6: 구현

6개 task 모두 구현 완료:

- task-6: report.md 생성 ✓
- task-1: LICENSE (MIT, 2026, JeremyDev87) ✓
- task-2: package.json + bin/ddalggak.js ✓
- task-3: .github/FUNDING.yml ✓
- task-4: README.md (배지 3개, npx 설치, CONTRIBUTING 링크) ✓
- task-5: CONTRIBUTING.md (Issue First, Fork→PR, 연락처) ✓

_Step 6 주요 발견사항은 종합 발견사항 테이블 참고_

---

## Step 7: 평가

모든 task Step 7 평가 완료. 전체 DA 리뷰 통과 (Critical=0, High=0 최종 기준).

주요 반복 패턴:
- Step 7 산출물에 fresh evidence 누락 시 DA가 Critical로 에스컬레이션 (task-6, task-1 등 반복)
- CONTRIBUTING.md → README.md 링크 의존성 순서 문제 (task-4 평가에서 PENDING 명시로 해소)

---

## 종합 발견사항

| ID | 유형 | 단계 | 요약 | 심각도 |
|----|------|------|------|--------|
| BUG-01 | 버그 | Step 3 | task_plan_validator.py 포맷 스펙 미문서화 → 440 lint 에러 필연 | Medium |
| UNEXPECTED-01 | 의도와 다른 동작 | Step 3 | 병렬 실행 UI 옵션 노출되나 실제 미지원 | High |
| BUG-02 | 버그 | Step 5 | 멱등성 계약 허용 형식 미안내 → invalid 판정 | Medium |
| IMPROVE-01 | 개선 제안 | Step 5 | DA iter 순서 강제 에러 메시지 불명확 | Low |

### 우선순위 권고

1. **UNEXPECTED-01** (High): 병렬 실행 UI 옵션 실제 동작 or 비활성화 — 사용자 신뢰 직결
2. **BUG-01** (Medium): validator 포맷 스펙 문서화 — 첫 사용자 경험 개선
3. **BUG-02** (Medium): 멱등성 계약 형식 가이드 추가 — 반복 수정 비용 제거
4. **IMPROVE-01** (Low): DA iter 에러 메시지 개선
