<!-- ddalggak:generated:file command-doc:setwiki -->
# Command: setwiki

Use when: Wiki write workflow bridge.
Required by: `setwiki` command.
Side effects: Delegate to dedicated /setwiki; wiki writes require explicit approval and verification.
Do not use when: Outside this command's scope or permissions. Stop at review-only plan unless explicit approval is present; then stop after wiki write verification.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/wiki-bridge.md`
- `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`
- `references/wiki-growth-triage.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "setwiki",
  "command_order": "150",
  "show_doc_heading": "SetWiki Bridge",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Wiki write workflow bridge.",
  "mode": "approval-gated-write",
  "write_side_effects": "Delegate to dedicated /setwiki; wiki writes require explicit approval and verification.",
  "stop_condition": "Stop at review-only plan unless explicit approval is present; then stop after wiki write verification.",
  "required_references": [
    "wiki-context-preflight.md",
    "wiki-bridge.md",
    "2026-06-04-brain-v0-wiki-authority-in-ddalggak.md",
    "wiki-growth-triage.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "SETWIKI_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "delegate to dedicated `/setwiki` approval-gated write workflow"
}
```

## SetWiki Bridge

Full procedure: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Delegate to dedicated `/setwiki` for approval-gated write workflow. Require explicit approval before wiki mutation; do not inline iCloud/QMD mechanics.

---
