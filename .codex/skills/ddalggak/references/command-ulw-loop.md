<!-- ddalggak:generated:file command-doc:ulw-loop -->
# Command: ulw-loop

Use when: ULW implement.
Required by: `ulw-loop` command.
Side effects: Scoped edits; no GitHub.
Do not use when: Outside this command's scope or permissions. Stop after evidence/blockers.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/ulw-loop.md`
- `references/ulw-tier-triage.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "ulw-loop",
  "command_order": "160",
  "show_doc_heading": "ULW Loop",
  "source_edit_allowed": true,
  "github_write_allowed": false,
  "purpose": "ULW implement.",
  "mode": "source-edit",
  "write_side_effects": "Scoped edits; no GitHub.",
  "stop_condition": "Stop after evidence/blockers.",
  "runtime_entrypoint": "core/ulw-loop/runtime.mjs",
  "runtime_subcommands": "create-goals,status,complete-goals,checkpoint,steer,add-goal,criteria,record-evidence,record-review-blockers,hook",
  "required_references": [
    "wiki-context-preflight.md",
    "ulw-loop.md",
    "ulw-tier-triage.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "ULW_LOOP_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "scoped edits; no GitHub"
}
```

## `ulw-loop` - ULW Loop

Full procedure: `references/ulw-loop.md`; `source_edit_allowed: true`; `github_write_allowed: false`; `ULW_LOOP_DONE`.
