<!-- ddalggak:generated:file command-doc:gjc-team -->
# Command: gjc-team

Use when: GJC team.
Required by: `gjc-team` command.
Side effects: Approved team work; no GitHub.
Do not use when: Outside this command's scope or permissions. Stop after team evidence/blockers.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/gajae-code.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "gjc-team",
  "command_order": "210",
  "show_doc_heading": "Gajae-Code Delegation",
  "source_edit_allowed": true,
  "github_write_allowed": false,
  "purpose": "GJC team.",
  "mode": "source-edit",
  "write_side_effects": "Approved team work; no GitHub.",
  "stop_condition": "Stop after team evidence/blockers.",
  "required_references": [
    "wiki-context-preflight.md",
    "gajae-code.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "GJC_TEAM_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "approved team work; no GitHub"
}
```

## Gajae-Code Delegation

Full procedure: `references/gajae-code.md`; `gjc_delegate_plan`; `gjc_delegate_execute`; `gjc_delegate_team`; `allow_mutation: false`; explicit user approval; external GJC visible-session helpers; `GJC_PLAN_DONE`; `GJC_EXECUTE_DONE`; `GJC_TEAM_DONE`.