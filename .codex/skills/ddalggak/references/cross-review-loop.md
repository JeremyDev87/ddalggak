# Cross-Review Loop 상세 절차
Use when: a `review` run must judge a live PR/diff, verify current-head evidence, or decide whether blocker findings prevent APPROVE/ready.
Required by: `review`; post-PR review/fix loops after `start`/`ship`.
Side effects: source-edit
Do not use when: there is no PR/diff to review, or the task is a read-only local `check` that must not post comments or edit source.

> Source of truth for Claude Code ddalggak details. The always-loaded SKILL.md keeps only router/invariant anchors and points here for low-frequency detail.

## Cross-Review Loop

`review`는 PR diff/checks, issue, Quality/Evidence, scope, critic consensus, simplicity, UI/React/Vercel, regression을 검증한다. Live evidence가 우선이다.

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

## Inline finding comments

Review finding은 top-level 요약이 아니라 diff 라인에 앵커된 inline review comment로 게시한다. severity로 게시 위치를 나누지 않는다 — Critical부터 nit·suggestion까지 모든 finding이 inline이다.

- 게시는 단일 review 제출 1건으로 묶는다: `POST /repos/{owner}/{repo}/pulls/{number}/reviews`, `event: COMMENT`, `comments: [{path, line, side, body}, ...]`. finding마다 개별 comment API를 반복 호출하지 않는다.
- 구체적 코드 대안이 있는 finding은 body에 GitHub ` ```suggestion ` 블록을 포함해 리뷰이가 한 번에 적용할 수 있게 한다.
- 앵커 순서(fallback): (1) 추가·변경 라인은 `side: RIGHT`, (2) 삭제 라인은 `side: LEFT`, (3) 파일 전반 지적은 file-level comment(`subject_type: file`), (4) diff 밖 코드를 유발한 변경 라인에 근접 앵커, (5) 그래도 앵커 불가하면 blocker는 top-level의 blocking finding count에만 반영하고 non-blocker는 drop하되 drop 사실을 리뷰 로그에 남긴다. 조용한 누락은 금지.
- top-level 요약 comment는 현재 approval-comment 형식 그대로다(current head SHA, review scope, validation evidence, blocking finding count, conclusion). finding 본문을 top-level에 중복하지 않는다.

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
