# Plan to Issues 상세 절차
Use when: `issue` converts an accepted plan into GitHub issue bodies with owned files, non-goals, validation, dependency, and UTF-8 metadata guarantees.
Required by: `issue`; parent/child issue generation.
Side effects: github-write
Do not use when: the user asked only for a plan/review, or the plan lacks enough detail to create automatable issues.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Plan to Issues

`issue`는 계획을 GitHub issue로 변환한다. 각 child issue는 Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, Dependencies / blocked by를 포함한다. 이슈 생성/수정은 사용자의 명시 요청이 있을 때만 수행하며, title/body는 raw UTF-8로 만들고 literal Unicode escape(`\uXXXX`)가 live title/body에 남지 않았는지 `gh issue view --json title,body,url`로 확인한다.
