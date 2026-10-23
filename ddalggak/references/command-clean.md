<!-- ddalggak:generated:file command-doc:clean -->
# Command: clean

Use when: Safely sync the default branch and clean merged-task local leftovers.
Required by: `clean` command.
Side effects: Verified safe fast-forward sync; merge-verified task local branch/worktree and proven task-owned disposable path cleanup; no authored source edits or GitHub mutation.
Do not use when: Outside this command's scope or permissions. Stop all deletion on failed repository/default/fetch/sync verification, invalid inventory, or unknown task scope. Preserve unsafe, ambiguous, unmerged, or non-ancestor targets; process independent safe targets but withhold CLEAN_DONE for unresolved requests. Verified empty scope may complete after sync.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/merge-cleanup.md`
Conditional references (activation -> asset):
- None.

Required templates:
- None.
Conditional templates (activation -> asset):
- None.

```json
{
  "command": "clean",
  "command_order": "060",
  "show_doc_heading": "Merge Cleanup",
  "source_edit_allowed": false,
  "github_write_allowed": false,
  "purpose": "Safely sync the default branch and clean merged-task local leftovers.",
  "mode": "local-destructive",
  "write_side_effects": "Verified safe fast-forward sync; merge-verified task local branch/worktree and proven task-owned disposable path cleanup; no authored source edits or GitHub mutation.",
  "stop_condition": "Stop all deletion on failed repository/default/fetch/sync verification, invalid inventory, or unknown task scope. Preserve unsafe, ambiguous, unmerged, or non-ancestor targets; process independent safe targets but withhold CLEAN_DONE for unresolved requests. Verified empty scope may complete after sync.",
  "required_references": [
    "wiki-context-preflight.md",
    "merge-cleanup.md"
  ],
  "required_templates": [],
  "output_contract": {
    "completion_signal": "CLEAN_DONE",
    "evidence_required": true
  },
  "conditional_references": [],
  "conditional_templates": [],
  "allowed_artifact": "verified safe default-branch fast-forward; merge-verified task local branches/worktrees and proven task-owned disposable paths only; no authored source edits or GitHub mutation"
}
```

## Merge Cleanup

Full procedure: `references/merge-cleanup.md`.

First verify default-branch synchronization, then remove only verified merged-task local branches/worktrees and exact disposable paths. Preserve unsafe requested targets and withhold `CLEAN_DONE` while any requested target remains unresolved. Never merge pull requests, enable auto-merge, or mutate remote branches.

---
