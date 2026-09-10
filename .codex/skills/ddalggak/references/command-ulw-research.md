<!-- ddalggak:generated:file command-doc:ulw-research -->
# Command: ulw-research

Use when: ULW research.
Required by: `ulw-research` command.
Side effects: Writes only .omo research journals/receipts; no source or GitHub.
Do not use when: Outside this command's scope or permissions. Stop after cited claims/gaps.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/ulw-research.md`
- `references/ulw-epistemic-instrumentation.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "ulw-research",
  "command_order": "180",
  "show_doc_heading": "ULW Research",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "ULW research.",
  "mode": "read-only",
  "write_side_effects": "Writes only .omo research journals/receipts; no source or GitHub.",
  "stop_condition": "Stop after cited claims/gaps.",
  "runtime_entrypoint": "core/ulw-research/runtime.mjs",
  "runtime_subcommands": "init,accept-format,wave,claim,record-evidence,finalize,status",
  "required_references": [
    "wiki-context-preflight.md",
    "ulw-research.md",
    "ulw-epistemic-instrumentation.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "ULW_RESEARCH_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "research output only"
}
```

## `ulw-research` - ULW Research

Full procedure: `references/ulw-research.md`; `source_edit_allowed: false`; `ULW_RESEARCH_DONE`.
