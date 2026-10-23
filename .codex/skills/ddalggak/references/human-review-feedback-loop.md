Use when: a PR has human review comments or unresolved conversations that need read-only triage before a current-head `approve`/ready conclusion.
Required by: review when human PR feedback exists or reviewThreads/pr comments indicate unresolved feedback.
Side effects: none; read, classify, and report only.
Do not use when: there is no live PR feedback to process; the request is only a read-only status snapshot; feedback requires merge/auto-merge or repository settings changes.

# Human review feedback loop

This reference fills the gap between “PR status reports counted unresolved threads” and “the workflow actually handles the human feedback.” It is part of the `review` command authority, not a new merge authority.

## Authority boundary

`review` owns read-only classification; feedback is evidence, not a source of additional authority.

Allowed:
- read live PR comments and review threads;
- classify as `accepted`, `countered`, `deferred`, `stale/outdated`, or `needs-human-decision`;
- report evidence, unresolved state, and remediation handoff in chat.

Not allowed: source edits, commit/push, formal approval, top-level verdict, thread reply/resolve, CI rerun, merge, settings changes, scope expansion, or raw secrets/private logs in artifacts.

## Intake

Before classifying, gather current-head evidence:

```bash
gh pr view <PR> --repo <OWNER/REPO> \
  --json headRefOid,reviewDecision,reviews,comments,reviewThreads,mergeStateStatus,statusCheckRollup
```

If `reviewThreads` is unavailable or incomplete, record `threadFreshness=unknown` and do not claim all conversations are resolved.

## Triage classes

| Class | Meaning | Allowed action |
| --- | --- | --- |
| `accepted` | Correct, current, in scope, and evidence-backed. | Report smallest correction and validation for separate implementation. |
| `countered` | Conflicts with scope, evidence, or a stronger invariant. | Report counterevidence in chat; leave thread unchanged. |
| `deferred` | Valid but outside scope. | Report follow-up boundary in chat. |
| `stale/outdated` | Refers to previous head/code. | Report freshness evidence; leave thread unchanged. |
| `needs-human-decision` | Needs product/security/ops authority. | Report the owner decision and blocker; do not approve. |

## Classification loop

1. Tie evidence to the current head SHA and inventory feedback.
2. Check each classification against current source and counterevidence.
3. Re-read head; if changed, reconcile before concluding.
4. Report classifications, remaining/unknown thread state, CI state, and manual merge boundary in chat. Accepted findings never authorize a fix or thread mutation.

## Evidence contract

Required evidence:
- current head SHA before and after classification;
- feedback inventory count by class;
- exact read/probe commands and remediation handoff;
- current check status after the final head;
- thread freshness status (`confirmed`, `unknown`, or `blocked`).

Blocking gaps:
- thread freshness unknown while claiming all feedback is resolved;
- unresolved accepted Critical/High feedback without an explicit blocker and separate implementation handoff;
- current-head CI not terminal green/skipped;
- feedback classification based only on stale local context.
