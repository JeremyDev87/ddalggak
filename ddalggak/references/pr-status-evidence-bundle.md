Use when: Step 7 / final PR report needs a content-light, multi-section PR status evidence bundle beyond check-only output.
Required by: status; Step 7 final report; PR-readiness reporting.
Side effects: none
Do not use when: check-only output is sufficient; PR merge/auto-merge implementation; GitHub branch protection setting changes.

# PR status evidence bundle

Use this reference when a final PR report requires more than CI check status — specifically when formal review state, branch protection/ruleset policy, conversation freshness, and human action boundary must all be reported as separate evidence fields.

## Contract

### Allowed output fields
- Check section: check name, workflow name, normalized state, conservative failure class, details/job URL
- Review section: reviewDecision (GitHub API enum), formalReviewApproved (boolean), approveCommentMisuseDetected, latestMeaningfulReview (state, author, submittedAt, commitId, headShaMatch)
- Merge state section: mergeStateStatus, branchProtection shape, active rulesets (enforcement, bypass actor presence, merge queue required), CODEOWNERS status
- Freshness section: threadFreshness, unresolvedThreadCount, nonOutdatedUnresolvedCount, caveat
- Human action section: manualMergeOnly (always true), mergeReady, blockers list, notes

### Forbidden output fields
- raw CI logs, raw CI stdout/stderr
- raw review body text (full comment content)
- private workflow output or internal automation logs
- secret, token, password, env var values — must be [REDACTED]
- inferred root cause not supported by content-light metadata

### Semantic constraints
- `unknown` fields are never promoted to `pass` or merge-ready
- `formal_review_approved=true` requires: a formal GitHub review with `state=APPROVED` whose `commit_id` matches the current head SHA (or is verifiably the same diff)
- A top-level APPROVE comment (e.g. `state=COMMENTED` with body containing "APPROVE") does NOT set `formalReviewApproved=true`
- Stale review: if the latest APPROVED review's `commit_id` differs from the current head SHA, `formalReviewApproved=false` and a blocker is emitted
- `reviewThreads` unavailable → `threadFreshness=unknown`, which is a blocker, not pass
- `mergeStateStatus=unknown` is a note, not automatically a blocker, but human verification is required
- `manualMergeOnly` is always `true` — this report is evidence only; it does not authorize merge

## check-only helper vs PR-status helper

| Aspect | pr-check-evidence-report | pr-status-evidence-report |
|---|---|---|
| Scope | CI check runs only | 5 sections: checks + review + merge state + freshness + human action |
| Review evidence | Not included | Formal review decision, stale SHA detection, approve-comment misuse |
| Branch protection | Not included | Legacy branch protection + active rulesets + merge queue + CODEOWNERS |
| Thread freshness | Not included | Unresolved/non-outdated thread count (unknown if unavailable) |
| Human action | Not included | Blockers list, merge-ready flag, manualMergeOnly |
| When to use | Quick CI status in check reports | Step 7 / final reports where full PR readiness snapshot is required |

## Local helper

```bash
# Collect PR metadata to a fixture JSON (content-light fields only):
gh pr view <PR_NUMBER> --repo OWNER/REPO \
  --json headRefOid,reviewDecision,mergeStateStatus,reviews,reviewThreads \
  > /tmp/pr-status.json

# Run report:
node scripts/pr-status-evidence-report.mjs --input /tmp/pr-status.json

# JSON output for downstream consumers:
node scripts/pr-status-evidence-report.mjs --input /tmp/pr-status.json --json
```

## Review rule

A content-light PR status evidence bundle is not a merge authorization signal. All five sections must be evaluated:
- Pending or failing checks block merge-ready.
- Missing formal approval or stale review blocks merge-ready.
- Unknown thread freshness blocks merge-ready (cannot confirm conversation resolution).
- Unknown rulesets/branch-protection are noted but do not automatically block — human verification required.
- `manualMergeOnly: true` is non-negotiable. The agent must not merge, auto-merge, or represent "ready" when evidence gaps exist.
