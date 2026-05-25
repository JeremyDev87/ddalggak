# Cross-Review Loop 상세 절차
Use when: a `review` run must judge a live PR/diff, verify current-head evidence, or decide whether blocker findings prevent APPROVE/ready.
Required by: `review`; post-PR review/fix loops after `start`/`ship`.
Side effects: source-edit
Do not use when: there is no PR/diff to review, or the task is a read-only local `check` that must not post comments or edit source.


> Source of truth for legacy Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Cross-Review Loop

`review`는 AI code quality gate다. PR diff/files/checks, issue contract, Quality Lens Router Output, Evidence Contract, Diff Footprint / Scope Expansion Review, Counterargument Pass, Simplicity / Deletability Gate, Frontend Design Review Gate, Vercel Agent Skills Gate, Continuous Regression Library를 사용한다. one-off abstraction, human readability, generic AI/template, screenshot/manual verification, Vercel deploy safety, component API quality, animation meaning, React Native/Expo, Regression Library Candidate, references/regression-library.md를 확인한다.


## Wiki Review Context Preflight

Before judging the PR, run `references/wiki-context-preflight.md` using:

- PR title/body
- linked issue
- changed files
- public API or UX surfaces
- validation evidence
- recurring failure patterns

Review output must distinguish:

- Findings backed by live PR/repo evidence
- Findings strengthened by wiki sources
- Non-wiki inference
- Wiki search failures or gaps

Wiki context is a review lens, not an oracle. Blocking findings still require live diff/repo evidence.
