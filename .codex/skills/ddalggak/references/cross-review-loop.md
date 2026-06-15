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

## Accepted finding authority

A finding is **accepted** for a fix iteration only when the authority is explicit:

1. 박정욱 directly accepts or orders the fix.
2. The conductor accepts it after checking live diff, linked issue contract, and Evidence Contract.
3. A reviewer/subagent reports it and the conductor promotes it with severity and evidence.

Reviewer completion text is not acceptance by itself. Medium/Low findings stay advisory unless they are required to satisfy issue evidence, scope control, or current-head readiness.

## Fix iteration loop

1. Record accepted findings by severity before editing.
2. Apply only the smallest in-scope fix; no speculative cleanup or broad rewrite.
3. Run focused validation for the changed surface plus the repo-required verifier when claiming readiness.
4. Emit or record `FIX_DONE PR#<num> iter<N>: critical_fixed=N high_fixed=N medium_fixed=N low_fixed=N` after validation passes.
5. Re-run review on the new current head before any `approve`/ready conclusion.

Default automated limit: **2 fix iterations per PR review run**. A third loop needs a new user instruction or a fresh conductor decision explaining why the remaining accepted blocker is still in-scope. Critical security/privacy/secret-exposure blockers stop approval immediately; they do not grant unlimited edit authority.

## Human review feedback loop

When live PR comments, review threads, or unresolved conversation evidence exist, apply `references/human-review-feedback-loop.md` before any current-head `approve`/ready conclusion. Human feedback is classified as `accepted`, `countered`, `deferred`, `stale/outdated`, or `needs-human-decision`; accepted Critical/High feedback may be fixed only through the bounded `review` fix authority above, and unknown thread freshness blocks “all feedback resolved” claims.

## CI failure triage loop

When current-head checks are pending or failing, apply `references/ci-failure-triage-loop.md` before any `approve`/ready conclusion. Check classification alone is not approval evidence: `test-failure` may authorize a bounded in-scope review fix only when backed by check evidence plus live diff/issue evidence; `infra-failure` may authorize one safe rerun or a blocker report; `permission-auth-failure` and `unknown-failure` stay human/evidence blockers unless fresh evidence proves otherwise.

## Current-head and stale-review rule

Verdicts and fix results are valid only for the named PR head SHA.

- A head change makes the prior verdict stale until review re-reads metadata, diff, files, checks, linked issue, and comments.
- Pending/failing checks block `approve`/ready unless the missing evidence is explicitly not applicable.
- Fix commits that touch outside accepted scope reopen scope-expansion review.
- If formal approval is self-review or otherwise inappropriate, use a top-level `approve`/`change request` comment naming head SHA, scope, validation, blocker count, and human merge boundary.

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
