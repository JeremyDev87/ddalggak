# Cross-Review Loop 상세 절차
Use when: a `review` run must judge a live PR/diff, verify current-head evidence, or decide whether blocker findings prevent APPROVE/ready.
Required by: `review`; post-PR review/fix loops after `start`/`ship`.
Side effects: source-edit
Do not use when: there is no PR/diff to review, or the task is a read-only local `check` that must not post comments or edit source.

> Source of truth for Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Cross-Review Loop

`review`는 AI code quality gate다. PR diff/files/checks, issue contract, Quality Lens Router Output, Evidence Contract, Diff Footprint / Scope Expansion Review, Counterargument Pass, Simplicity / Deletability Gate, Frontend Design Review Gate, React Code Quality Harness(React/Next.js 표면일 때만), Vercel Agent Skills Gate, Continuous Regression Library를 사용한다. one-off abstraction, human readability, generic AI/template, screenshot/manual verification, Vercel deploy safety, component API quality, animation meaning, React Native/Expo, Regression Library Candidate, references/regression-library.md를 확인한다.

## Accepted finding authority

A review finding is only **accepted** for a fix iteration when one of these authorities records it:

1. 박정욱의 직접 지시 또는 PR/issue comment.
2. The conductor running `review`, after validating the finding against the live diff, linked issue contract, and Evidence Contract.
3. A reviewer/subagent finding that the conductor explicitly promotes with severity and evidence.

A reviewer/subagent cannot accept its own finding by completion text alone. Low/Medium findings are not automatically accepted unless they block issue evidence, scope control, or current-head readiness.

## Fix iteration loop

Use a bounded loop so review does not become open-ended implementation:

1. Record accepted findings by severity before editing.
2. Apply the smallest in-scope fix only; do not broaden the PR or touch unrelated cleanup.
3. Run focused validation for the changed surface, then the repo-required verifier when readiness is claimed.
4. Emit or record `FIX_DONE PR#<num> iter<N>: critical_fixed=N high_fixed=N medium_fixed=N low_fixed=N` after the fix validation passes.
5. Re-run review on the new current head before any `approve`/ready conclusion.

Default automated limit: **2 fix iterations per PR review run**. A third loop requires a new user instruction or a fresh conductor decision explaining why the remaining accepted blocker is still in-scope and safe to continue. Critical security/privacy/secret-exposure blockers still stop approval immediately; they do not grant unlimited editing authority.

## Human review feedback loop

When live PR comments, review threads, or unresolved conversation evidence exist, apply `references/human-review-feedback-loop.md` before any current-head `approve`/ready conclusion. Human feedback is classified as `accepted`, `countered`, `deferred`, `stale/outdated`, or `needs-human-decision`; accepted Critical/High feedback may be fixed only through the bounded `review` fix authority above, and unknown thread freshness blocks “all feedback resolved” claims.

## CI failure triage loop

When current-head checks are pending or failing, apply `references/ci-failure-triage-loop.md` before any `approve`/ready conclusion. Check classification alone is not approval evidence: `test-failure` may authorize a bounded in-scope review fix only when backed by check evidence plus live diff/issue evidence; `infra-failure` may authorize one safe rerun or a blocker report; `permission-auth-failure` and `unknown-failure` stay human/evidence blockers unless fresh evidence proves otherwise.

## Current-head and stale-review rule

Every review verdict and every fix result is tied to a concrete PR head SHA.

- If the PR head changes after a verdict, the verdict is stale until `review` re-reads metadata, diff, files, checks, and linked issue/comments for the new head.
- If CI/checks are pending or failed on the current head, do not conclude `approve` or ready unless the missing check is explicitly proven not applicable.
- If a fix commit changes files outside the accepted finding scope, treat the review as reopened and run scope-expansion review again.
- If formal GitHub approval is self-review or otherwise inappropriate, use a top-level `approve`/`change request` comment that names the current head SHA, scope, validation, blocker count, and human merge boundary.

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
