# Ship 상세 절차
Use when: `ship` needs to publish already-existing validated changes as a draft PR with Korean metadata and manual-merge boundaries.
Required by: `ship`; combined `start` → `ship` runs after implementation evidence exists.
Side effects: github-write
Do not use when: there is no meaningful diff against the intended base or validation/scope evidence is missing.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Ship

`ship`은 이미 존재하는 변경만 commit/push/draft PR로 게시한다. issue body/comments 재확인, scope 확인, validation, local adversarial review, intended files만 stage, What/Why commit, draft PR body의 What/Why/Validation/Risk/Issues를 포함한다. merge/auto-merge 금지.
