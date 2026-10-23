<!-- ddalggak:generated:file command-doc:review -->
# Command: review

Use when: Independent semantic review of an explicit PR, file, document, or context.
Required by: `review` command.
Side effects: Only verified inline findings on the requested PR when authorized; local review results otherwise. No source edits, commit/push, formal approval, top-level verdict, thread reply/resolve, or CI rerun.
Do not use when: Outside this command's scope or permissions. For PR targets, before writes re-check lifecycle. state=MERGED/mergedAt emits REVIEW_STOPPED_PR_MERGED and stops; uncertainty is BLOCKED.

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
- `templates/review-brief.md`
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "review",
  "command_order": "020",
  "show_doc_heading": "Cross-Review Loop",
  "source_edit_allowed": false,
  "github_write_allowed": true,
  "purpose": "Independent semantic review of an explicit PR, file, document, or context.",
  "mode": "github-write",
  "write_side_effects": "Only verified inline findings on the requested PR when authorized; local review results otherwise. No source edits, commit/push, formal approval, top-level verdict, thread reply/resolve, or CI rerun.",
  "stop_condition": "For PR targets, before writes re-check lifecycle. state=MERGED/mergedAt emits REVIEW_STOPPED_PR_MERGED and stops; uncertainty is BLOCKED.",
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
  "required_templates": [
    "review-brief.md"
  ],
  "conditional_templates": [],
  "output_contract": {
    "completion_signal": "REVIEW_DONE",
    "evidence_required": true
  },
  "allowed_artifact": "verified inline comments on the requested PR and local review results only"
}
```

## `review` - Cross-Review Loop

Command contract: `github-write`, `source_edit_allowed: false`; local review results and authorized verified inline comments on the requested PR only. Compatibility change: automatic accepted-fix loops and top-level verdict/summary publication are removed; `review-fix` and summary renderer APIs remain inspect-only compatibility.

Full procedure: `references/cross-review-loop.md`; public renderer: `references/review-output-contract.md` + `references/review-comment-style.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; mandatory independent review brief: `templates/review-brief.md`.

Execution contract index:
- Resolve explicit PR/file/document/context scope and exact source/version/section; never fabricate Git/PR metadata for non-PR review.
- Require a fresh independent reviewer result and parent source/counterevidence recheck. Missing result blocks completion.
- PR only: live lifecycle/head/diff/files/checks/requirements and v3 admission/aggregate/provenance remain required. Merged emits `REVIEW_STOPPED_PR_MERGED`; uncertain lifecycle is `BLOCKED`.
- Run Wiki Context Preflight and Router/Evidence; optional gates remain activation-bound. Findings separate live evidence, wiki rationale, inference, and retrieval gaps.
- Publish only Korean two-sentence inline findings with exact anchor and body/location/URL readback; zero findings/read-only/non-PR means no writes. Keep summary/verdict in chat. No source fix, commit/push, formal approval, top-level verdict, thread reply/resolve, or CI rerun.
