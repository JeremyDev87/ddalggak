<!-- ddalggak:generated:file command-doc:plan -->
# Command: plan

Use when: Issue-ready implementation plan from issue/wiki/code evidence.
Required by: `plan` command.
Side effects: No source edits; no GitHub writes unless the user separately requests issue creation.
Do not use when: Outside this command's scope or permissions. Stop after an issue-ready plan with evidence/unknowns and PR topology.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`
- `references/wiki-bridge.md`
- `references/quality-lens-router.md`
- `references/evidence-contract.md`
- `references/issue-ready-plan.md`
Conditional references (activation -> asset):
- `code-shape` -> `references/simplicity-deletability-gate.md`
- `scope-or-privacy` -> `references/core-invariants.md`
- `ambiguous-intent` -> `references/deep-interview-readiness-gate.md`
- `high-risk` -> `references/ralplan-critic-consensus.md`

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "plan",
  "command_order": "040",
  "show_doc_heading": "Issue-Ready Plan",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Issue-ready implementation plan from issue/wiki/code evidence.",
  "mode": "plan-only",
  "write_side_effects": "No source edits; no GitHub writes unless the user separately requests issue creation.",
  "stop_condition": "Stop after an issue-ready plan with evidence/unknowns and PR topology.",
  "required_references": [
    "wiki-context-preflight.md",
    "2026-06-04-brain-v0-wiki-authority-in-ddalggak.md",
    "wiki-bridge.md",
    "quality-lens-router.md",
    "evidence-contract.md",
    "issue-ready-plan.md"
  ],
  "conditional_references": [
    "code-shape=simplicity-deletability-gate.md",
    "scope-or-privacy=core-invariants.md",
    "ambiguous-intent=deep-interview-readiness-gate.md",
    "high-risk=ralplan-critic-consensus.md"
  ],
  "required_templates": [],
  "conditional_templates": [],
  "output_contract": {
    "completion_signal": "PLAN_DONE",
    "evidence_required": true
  },
  "allowed_artifact": "response output only unless the user separately asks to write a plan document"
}
```

## `plan` - Issue-Ready Plan

Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Execution contract index: source of truth, non-goals, context anchors, assumptions/unknowns, work inventory, ownership, forbidden/inspect-only files, base Router/Evidence, activation-bound optional gates, one issue PR by default, conflict fallback only with proof, Parallelization Decision, Must not touch, evidence/validation, and commit message.
