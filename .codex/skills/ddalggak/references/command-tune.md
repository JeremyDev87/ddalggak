<!-- ddalggak:generated:file command-doc:tune -->
# Command: tune

Use when: Align rough intent into a source-grounded goal brief before implementation.
Required by: `tune` command.
Side effects: Brief only; no source, GitHub, or git mutation.
Do not use when: Outside this command's scope or permissions. Stop after a scoped brief or explicit blockers.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/tune-goal.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "tune",
  "command_order": "100",
  "show_doc_heading": "Tune Goal Brief",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Align rough intent into a source-grounded goal brief before implementation.",
  "mode": "plan-only",
  "write_side_effects": "Brief only; no source, GitHub, or git mutation.",
  "stop_condition": "Stop after a scoped brief or explicit blockers.",
  "required_references": [
    "wiki-context-preflight.md",
    "tune-goal.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "TUNE_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "goal-alignment brief artifacts only"
}
```

## `tune` - Tune Goal Brief

Full procedure: `references/tune-goal.md`; source-grounded goal brief with scope, non-goals, assumptions, open questions, validation surfaces, and no source edits.
