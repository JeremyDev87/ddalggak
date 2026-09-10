<!-- ddalggak:generated:file command-doc:issue -->
# Command: issue

Use when: Create GitHub issues from an approved plan.
Required by: `issue` command.
Side effects: Create/edit GitHub issues and comments only; no repository source edits.
Do not use when: Outside this command's scope or permissions. Stop after live issue URLs/labels/assignees/body UTF-8 verification or on metadata permission failure.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/plan-to-issues.md`
Conditional references (activation -> asset):
- None.

Required templates:
- `templates/issue-body.md`
- `templates/epic-body.md`
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "issue",
  "command_order": "050",
  "show_doc_heading": "Plan to Issues",
  "source_edit_allowed": false,
  "github_write_allowed": true,
  "purpose": "Create GitHub issues from an approved plan.",
  "mode": "github-write",
  "write_side_effects": "Create/edit GitHub issues and comments only; no repository source edits.",
  "stop_condition": "Stop after live issue URLs/labels/assignees/body UTF-8 verification or on metadata permission failure.",
  "required_references": [
    "wiki-context-preflight.md",
    "plan-to-issues.md"
  ],
  "required_templates": [
    "issue-body.md",
    "epic-body.md"
  ],
  "output_contract": {
    "completion_signal": "ISSUE_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "GitHub issues only"
}
```

## Plan to Issues

Full procedure: `references/plan-to-issues.md`; reusable prompts: `templates/issue-body.md`, `templates/epic-body.md`.

Each generated issue body must preserve Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, and Dependencies / blocked by. Use raw UTF-8 GitHub title/body payloads and verify no literal Unicode escapes persisted.

---
