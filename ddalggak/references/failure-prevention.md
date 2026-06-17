# 실패 모드 예방 상세 절차

> Source of truth for Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## 실패 모드 예방

Stale repo, issue comment 누락, dependency hallucination, unsafe force-push, test pass와 completion 혼동, review isolation 위반, forced modularization, silent fallback, analytics privacy 누락을 차단한다.

## 선행조건/overlap 대기 규칙

다음 상황은 자동화-rule rejection이 아니라 missing readiness / ordering input으로 취급한다.

- unmerged prerequisite PR/issue가 먼저 default branch에 들어가야 범위가 확정되는 경우
- overlapping verifier surface 또는 같은 contract를 바꾸는 open automation PR이 있어 현재 PR이 stale하거나 충돌할 수 있는 경우
- human standard/decision이 아직 없어서 acceptance criteria나 validation evidence를 안전하게 정할 수 없는 경우

이때 branch/PR을 만들지 않는다. Dobby 스케줄러에서는 deduped Korean needs-info/waiting comment를 남기고 `dobby:rejected`로 오분류하지 않는다. 새 human body/comment가 선행조건 완료나 진행 결정을 명시하면 그때 재평가한다.
