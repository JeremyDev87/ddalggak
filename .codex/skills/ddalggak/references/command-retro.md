<!-- ddalggak:generated:file command-doc:retro -->
# Command: retro

Use when: Extract reusable lessons after merge without transient memory.
Required by: `retro` command.
Side effects: Repo-external writes only: the retrospective note under ~/workspace/retrospective/ (or the RETRO_DIR override) and memory files or memory-update request artifacts; skill/wiki changes stay proposal-only (wiki via the approval-gated setwiki bridge); no writes to any path inside the repository.
Do not use when: Outside this command's scope or permissions. Stop after reusable lessons are separated from transient incident records.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/retrospective.md`
- `references/retrospective-workflow.md`
- `references/wiki-growth-triage.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "retro",
  "command_order": "080",
  "show_doc_heading": "Retrospective",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Extract reusable lessons after merge without transient memory.",
  "mode": "repo-external-write",
  "write_side_effects": "Repo-external writes only: the retrospective note under ~/workspace/retrospective/ (or the RETRO_DIR override) and memory files or memory-update request artifacts; skill/wiki changes stay proposal-only (wiki via the approval-gated setwiki bridge); no writes to any path inside the repository.",
  "stop_condition": "Stop after reusable lessons are separated from transient incident records.",
  "required_references": [
    "wiki-context-preflight.md",
    "retrospective.md",
    "retrospective-workflow.md",
    "wiki-growth-triage.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "RETRO_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "retrospective notes and memory update request artifacts only"
}
```

## `retro` - Retrospective

After merge, summarize the cycle and extract reusable lessons without storing transient PR numbers or commit SHAs as memory. Use `references/wiki-bridge.md` for setwiki admission: default review-only, explicit approval before wiki write. Use references/retrospective-workflow.md for low-frequency details.
