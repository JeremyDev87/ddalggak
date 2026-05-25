# Cross-Review Loop Reference
Use when: a `review` run must judge a live PR/diff, verify current-head evidence, or decide whether blocker findings prevent APPROVE/ready.
Required by: `review`; post-PR review/fix loops after `start`/`ship`.
Side effects: source-edit
Do not use when: there is no PR/diff to review, or the task is a read-only local `check` that must not post comments or edit source.


Use this when `review` needs full adversarial review details beyond the hot path.

## Required flow
1. Re-read PR metadata, diff, files, commits, checks, linked issues, and comments from GitHub.
2. Do not let implementation context pollute review. Review from `gh pr view`/`gh pr diff` first; use an isolated temporary checkout only when local reproduction is necessary.
3. Treat CI/check failures as Critical unless proven unrelated.
4. Compare the diff against the Task Scope Contract and Evidence Contract. Out-of-scope diff is a scope-expansion failure.
5. Findings must include severity, confidence, evidence, impact, suggested fix, file/line when available, and test/repro idea.
6. Critical/High or required evidence gaps block APPROVE and ready state.
7. If formal approval is inappropriate, post a top-level approval-comment policy body with head SHA, review scope, validation evidence, blocking finding count, and conclusion.


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
