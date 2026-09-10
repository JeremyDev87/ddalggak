<!-- ddalggak:generated:file command-doc:review -->
# Command: review

Use when: Risk-adaptive current-head semantic review and accepted fix loop.
Required by: `review` command.
Side effects: Top-level review comment plus inline line-anchored review comments for every triage-passing finding in one COMMENT-event batch; accepted Critical/High fixes may edit source and push to the reviewed PR branch.
Do not use when: Outside this command's scope or permissions. Before writes, re-check lifecycle. state=MERGED/mergedAt emits REVIEW_STOPPED_PR_MERGED and stops; uncertainty is BLOCKED.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`
- `references/quality-lens-router.md`
- `references/evidence-contract.md`
- `references/cross-review-loop.md`
- `references/review-quality-contract.md`
Conditional references (activation -> asset):
- `code-shape` -> `references/simplicity-deletability-gate.md`
- `scope-or-privacy` -> `references/core-invariants.md`
- `regression-risk` -> `references/regression-library.md`
- `human-feedback` -> `references/human-review-feedback-loop.md`
- `failing-ci` -> `references/ci-failure-triage-loop.md`
- `package-workflow-release-or-security-posture` -> `references/security-posture-gate.md`
- `public-body` -> `references/review-output-contract.md`
- `public-body` -> `references/review-comment-style.md`

Required templates:
- None.
Conditional templates (activation -> asset):
- `delegated-review` -> `templates/review-brief.md`
- `accepted-critical-high-fix` -> `templates/fix-brief.md`

```json
{
  "command": "review",
  "command_order": "020",
  "show_doc_heading": "Cross-Review Loop",
  "source_edit_allowed": true,
  "github_write_allowed": true,
  "purpose": "Risk-adaptive current-head semantic review and accepted fix loop.",
  "mode": "review-fix",
  "write_side_effects": "Top-level review comment plus inline line-anchored review comments for every triage-passing finding in one COMMENT-event batch; accepted Critical/High fixes may edit source and push to the reviewed PR branch.",
  "stop_condition": "Before writes, re-check lifecycle. state=MERGED/mergedAt emits REVIEW_STOPPED_PR_MERGED and stops; uncertainty is BLOCKED.",
  "required_references": [
    "wiki-context-preflight.md",
    "2026-06-04-brain-v0-wiki-authority-in-ddalggak.md",
    "quality-lens-router.md",
    "evidence-contract.md",
    "cross-review-loop.md",
    "review-quality-contract.md"
  ],
  "conditional_references": [
    "code-shape=simplicity-deletability-gate.md",
    "scope-or-privacy=core-invariants.md",
    "regression-risk=regression-library.md",
    "human-feedback=human-review-feedback-loop.md",
    "failing-ci=ci-failure-triage-loop.md",
    "package-workflow-release-or-security-posture=security-posture-gate.md",
    "public-body=review-output-contract.md",
    "public-body=review-comment-style.md"
  ],
  "required_templates": [],
  "conditional_templates": [
    "delegated-review=review-brief.md",
    "accepted-critical-high-fix=fix-brief.md"
  ],
  "output_contract": {
    "completion_signal": "REVIEW_DONE",
    "evidence_required": true
  },
  "allowed_artifact": "author agents may apply accepted Critical/High review fixes only"
}
```

## Cross-Review Loop

Command contract: `review-fix`; accepted Critical/High fixes/comments only. Follow `cross-review-loop.md` lifecycle checkpoints; merged emits `REVIEW_STOPPED_PR_MERGED`, uncertainty is `BLOCKED`.

Full procedure: `references/cross-review-loop.md`; public renderer: `references/review-output-contract.md` + `references/review-comment-style.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; delegated-review만 `templates/review-brief.md`를 로드한다.

Execution contract index:
- Re-read live PR state, diff/files/checks, linked issue, current head SHA, and wiki-context preflight.
- Lifecycle: merged stops probes/delegation/edits/pushes/GitHub writes after authoritative readback; default `MERGED / NO_FOLLOW_UP`. Lookup ambiguity is `BLOCKED`.
- Gates: Router/Evidence는 base; 나머지는 activation evidence applies일 때만 로드한다.
- Findings must separate live evidence, wiki-strengthened rationale, non-wiki inference, and retrieval gaps.
- Apply admission schema v3 first: only aggregate-member canonical candidate findings publish, filtered notes stay internal, deterministic fixed summary renders, and zero-finding needs substantive evidence.

---
