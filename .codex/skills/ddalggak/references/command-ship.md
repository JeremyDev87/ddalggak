<!-- ddalggak:generated:file command-doc:ship -->
# Command: ship

Use when: Commit/push/open draft PR for existing scoped changes.
Required by: `ship` command.
Side effects: Commit, push, and draft PR for already-existing scoped changes; no new source edits.
Do not use when: Outside this command's scope or permissions. Stop after PR creation/current-head publication evidence or on no-diff/scope/validation blocker.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/ship.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "ship",
  "command_order": "070",
  "show_doc_heading": "Ship",
  "source_edit_allowed": false,
  "github_write_allowed": true,
  "purpose": "Commit/push/open draft PR for existing scoped changes.",
  "mode": "github-write",
  "write_side_effects": "Commit, push, and draft PR for already-existing scoped changes; no new source edits.",
  "stop_condition": "Stop after PR creation/current-head publication evidence or on no-diff/scope/validation blocker.",
  "required_references": [
    "wiki-context-preflight.md",
    "ship.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "SHIP_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "commit, push, and draft PR for existing changes only"
}
```

## `ship` - Publish Current Lane

Ship only existing changes. Confirm scope, re-read issue context, fetch, validate, locally review where feasible, stage intended files, commit with What and Why, push, open a draft PR, verify PR existence, and keep it draft until current-head checks and review evidence support ready for manual merge.
