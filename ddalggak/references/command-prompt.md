<!-- ddalggak:generated:file command-doc:prompt -->
# Command: prompt

Use when: Compile safer prompt briefs without source edits.
Required by: `prompt` command.
Side effects: Brief/review/fix artifacts only after explicit confirmation; no canonical source edits.
Do not use when: Outside this command's scope or permissions. Stop with READY_FOR_BRIEF, NEEDS_CLARIFICATION, BLOCKED_UNSAFE, or DISCOVERY_ONLY.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/prompt-optimizer.md`
- `references/prompt-skill-optimization-staging.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "prompt",
  "command_order": "090",
  "show_doc_heading": "Prompt Optimizer",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Compile safer prompt briefs without source edits.",
  "mode": "plan-only",
  "write_side_effects": "Brief/review/fix artifacts only after explicit confirmation; no canonical source edits.",
  "stop_condition": "Stop with READY_FOR_BRIEF, NEEDS_CLARIFICATION, BLOCKED_UNSAFE, or DISCOVERY_ONLY.",
  "required_references": [
    "wiki-context-preflight.md",
    "prompt-optimizer.md",
    "prompt-skill-optimization-staging.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "PROMPT_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "brief artifacts after explicit confirmation"
}
```

## Prompt Optimizer

Full procedure: `references/prompt-optimizer.md`.

Prompt Safety / Brief Compiler compact index: Prompt Audit, `prompt grill-me`, Unsafe Prompt Gate.

Judgement labels: `READY_FOR_BRIEF | NEEDS_CLARIFICATION | BLOCKED_UNSAFE | DISCOVERY_ONLY`.

Preserve `source_edit_allowed: false`; compile brief/review/fix artifacts only, and end with `PROMPT_DONE`.

---
