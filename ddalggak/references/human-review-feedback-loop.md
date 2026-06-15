Use when: a PR has human review comments or unresolved conversations that need triage, response, fix, or deferral before a current-head `approve`/ready conclusion.
Required by: review when human PR feedback exists or reviewThreads/pr comments indicate unresolved feedback.
Side effects: source-edit through `review` only for accepted Critical/High feedback fixes; GitHub review/thread replies and resolution when authorized.
Do not use when: there is no live PR feedback to process; the request is only a read-only status snapshot; feedback requires merge/auto-merge or repository settings changes.

# Human review feedback loop

This reference fills the gap between “PR status reports counted unresolved threads” and “the workflow actually handles the human feedback.” It is part of the `review` command authority, not a new merge authority.

## Authority boundary

`review` owns the loop because it already has current-head review/fix authority.

Allowed:
- read live PR review comments, review threads, and top-level PR comments;
- classify each item as `accepted`, `countered`, `deferred`, `stale/outdated`, or `needs-human-decision`;
- apply the smallest in-scope source fix only for accepted Critical/High feedback that matches the issue/PR scope;
- reply with content-light evidence and, when the GitHub API permits and the feedback is actually resolved, resolve the thread;
- rerun validation and post a current-head verdict.

Not allowed:
- merge, auto-merge, bypass branch protection, or change repository settings;
- broaden the PR beyond the linked issue/accepted feedback scope;
- mark unknown or inaccessible review-thread state as resolved;
- paste raw secrets, private logs, or raw user content into evidence artifacts.

## Intake

Before editing or replying, gather current-head evidence:

```bash
gh pr view <PR> --repo <OWNER/REPO> \
  --json headRefOid,reviewDecision,reviews,comments,reviewThreads,mergeStateStatus,statusCheckRollup
```

If `reviewThreads` is unavailable or incomplete, record `threadFreshness=unknown` and do not claim all conversations are resolved.

## Triage classes

| Class | Meaning | Allowed action |
| --- | --- | --- |
| `accepted` | Feedback is correct, current, in scope, and has enough evidence to fix. | Apply smallest fix, validate, reply with fix evidence, resolve if allowed. |
| `countered` | Feedback is current but conflicts with issue scope, repo evidence, or a stronger invariant. | Reply with concise evidence and leave unresolved unless the reviewer accepts. |
| `deferred` | Feedback is valid but out of scope or needs a separate issue. | Reply with boundary and follow-up issue/ref if created; do not broaden this PR. |
| `stale/outdated` | Feedback refers to a previous head or code that no longer exists. | Reply only if useful; do not edit solely for stale feedback. |
| `needs-human-decision` | Feedback requires product/security/ops authority the agent cannot infer. | Ask 박정욱 or leave a clear blocker; do not approve. |

## Fix loop

1. Tie the loop to the current head SHA.
2. Record accepted findings before editing.
3. Patch only files required by the accepted feedback.
4. Run focused validation for the touched surface plus the repo-required verifier.
5. Re-read PR head SHA. If it changed unexpectedly, stop and reconcile.
6. Reply to each processed feedback item with:
   - classification;
   - changed files or reason for no code change;
   - validation evidence;
   - remaining blocker state.
7. Resolve a thread only when the fix/answer directly satisfies the thread and the API/user authority permits resolution.
8. Post a final current-head `approve` or `change request` top-level verdict that separates:
   - feedback processed;
   - feedback deferred/countered;
   - unresolved/unknown thread state;
   - CI/check state;
   - manual merge boundary.

## Evidence contract

Required evidence:
- current head SHA before and after fix/reply;
- feedback inventory count by class;
- exact validation commands for any source edit;
- current check status after the final head;
- thread freshness status (`confirmed`, `unknown`, or `blocked`).

Blocking gaps:
- thread freshness unknown while claiming all feedback is resolved;
- accepted Critical/High feedback without a fix or explicit `needs-human-decision` blocker;
- current-head CI not terminal green/skipped;
- feedback classification based only on stale local context.
