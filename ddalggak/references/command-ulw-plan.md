<!-- ddalggak:generated:file command-doc:ulw-plan -->
# Command: ulw-plan

Use when: ULW plan.
Required by: `ulw-plan` command.
Side effects: Writes only .omo plan artifacts/state; no source or GitHub.
Do not use when: Outside this command's scope or permissions. Stop after criteria/blockers.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/ulw-plan.md`
- `references/ulw-intent-routing.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "ulw-plan",
  "command_order": "170",
  "show_doc_heading": "ULW Plan",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "ULW plan.",
  "mode": "plan-only",
  "write_side_effects": "Writes only .omo plan artifacts/state; no source or GitHub.",
  "stop_condition": "Stop after criteria/blockers.",
  "runtime_entrypoint": "core/ulw-plan/runtime.mjs",
  "runtime_subcommands": "scaffold,approve,review-init,review-receipt,finalize,status",
  "required_references": [
    "wiki-context-preflight.md",
    "ulw-plan.md",
    "ulw-intent-routing.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "ULW_PLAN_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "plan output only"
}
```

## ULW Plan

Full procedure: `references/ulw-plan.md`; `source_edit_allowed: false`; `ULW_PLAN_DONE`.
