<!-- ddalggak:generated:file command-doc:getwiki -->
# Command: getwiki

Use when: Wiki context retrieval bridge.
Required by: `getwiki` command.
Side effects: Delegate to dedicated /getwiki retrieval; no wiki or repo mutation.
Do not use when: Outside this command's scope or permissions. Stop after cited wiki sources or retrieval gaps are reported.

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
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "getwiki",
  "command_order": "140",
  "show_doc_heading": "GetWiki Bridge",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Wiki context retrieval bridge.",
  "mode": "read-only",
  "write_side_effects": "Delegate to dedicated /getwiki retrieval; no wiki or repo mutation.",
  "stop_condition": "Stop after cited wiki sources or retrieval gaps are reported.",
  "required_references": [
    "wiki-context-preflight.md",
    "wiki-bridge.md",
    "2026-06-04-brain-v0-wiki-authority-in-ddalggak.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "GETWIKI_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "delegate to dedicated `/getwiki` read-only retrieval"
}
```

## GetWiki Bridge

Full procedure: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.

Delegate to dedicated `/getwiki` for read-only retrieval. Preserve source paths or retrieval gaps; do not mutate wiki files.

---
