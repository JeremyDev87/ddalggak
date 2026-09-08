<!-- ddalggak:generated:file command-doc:status -->
# Command: status

Use when: Read-only live git/GitHub/session state snapshot.
Required by: `status` command.
Side effects: No source, GitHub, or local cleanup mutation; report live git/GitHub/session state only.
Do not use when: Outside this command's scope or permissions. Stop after a live state snapshot and next-action recommendation.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/status.md`
- `references/pr-check-evidence-bundle.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "status",
  "command_order": "030",
  "show_doc_heading": "Status",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Read-only live git/GitHub/session state snapshot.",
  "mode": "read-only",
  "write_side_effects": "No source, GitHub, or local cleanup mutation; report live git/GitHub/session state only.",
  "stop_condition": "Stop after a live state snapshot and next-action recommendation.",
  "required_references": [
    "wiki-context-preflight.md",
    "status.md",
    "pr-check-evidence-bundle.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "STATUS_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "response output only"
}
```

## Status

Full procedure: `references/status.md`.

Read-only snapshot: fetch/prune, status, branch/upstream, worktrees, open PRs, linked issues, checks, blockers, session state, and next action. No source edits.

---
