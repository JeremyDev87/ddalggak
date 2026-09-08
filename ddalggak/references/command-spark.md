<!-- ddalggak:generated:file command-doc:spark -->
# Command: spark

Use when: Draft a copyable runtime goal sentence with validation checklist.
Required by: `spark` command.
Side effects: Goal text only; no source, GitHub, or git mutation.
Do not use when: Outside this command's scope or permissions. Stop after goal text and validation checklist.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/spark-goal.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "spark",
  "command_order": "120",
  "show_doc_heading": "Spark Runtime Goal",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Draft a copyable runtime goal sentence with validation checklist.",
  "mode": "plan-only",
  "write_side_effects": "Goal text only; no source, GitHub, or git mutation.",
  "stop_condition": "Stop after goal text and validation checklist.",
  "required_references": [
    "wiki-context-preflight.md",
    "spark-goal.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "SPARK_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "runtime-goal sentence artifacts only"
}
```

## Spark Runtime Goal

Full procedure: `references/spark-goal.md`; copyable runtime goal sentence, validation checklist, non-goals, next instruction, and no source edits.
