<!-- ddalggak:generated:file command-doc:forge -->
# Command: forge

Use when: Convert done conditions into objective acceptance checks.
Required by: `forge` command.
Side effects: Criteria only; no source, GitHub, or git mutation.
Do not use when: Outside this command's scope or permissions. Stop after verifiable criteria or explicit gaps.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/forge-goal.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "forge",
  "command_order": "110",
  "show_doc_heading": "Forge Acceptance Criteria",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Convert done conditions into objective acceptance checks.",
  "mode": "plan-only",
  "write_side_effects": "Criteria only; no source, GitHub, or git mutation.",
  "stop_condition": "Stop after verifiable criteria or explicit gaps.",
  "required_references": [
    "wiki-context-preflight.md",
    "forge-goal.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "FORGE_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "acceptance-criteria artifacts only"
}
```

## Forge Acceptance Criteria

Full procedure: `references/forge-goal.md`; objective command/observation plus expected-result acceptance criteria, with no source edits.
