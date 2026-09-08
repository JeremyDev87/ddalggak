<!-- ddalggak:generated:file command-doc:check -->
# Command: check

Use when: Read-only local diff review.
Required by: `check` command.
Side effects: Local diff review notes only; no GitHub comments and no repository edits.
Do not use when: Outside this command's scope or permissions. Stop after findings and exact validation gaps are reported.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/local-diff-check.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "check",
  "command_order": "130",
  "show_doc_heading": "Local Diff Check",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Read-only local diff review.",
  "mode": "read-only",
  "write_side_effects": "Local diff review notes only; no GitHub comments and no repository edits.",
  "stop_condition": "Stop after findings and exact validation gaps are reported.",
  "required_references": [
    "wiki-context-preflight.md",
    "local-diff-check.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "CHECK_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "local review notes only; no repository edits"
}
```

## `check` - Local Diff Check

Run a read-only local diff review. Capture base freshness, status, diff stat, ignored/local-only/generated paths, and findings. Use references/local-diff-check.md for details.
