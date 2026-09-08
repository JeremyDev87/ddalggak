<!-- ddalggak:generated:file command-doc:clean -->
# Command: clean

Use when: Post-merge local cleanup after live merge evidence.
Required by: `clean` command.
Side effects: Local branch/worktree cleanup only after live merge evidence; no GitHub mutation.
Do not use when: Outside this command's scope or permissions. Stop on dirty, ambiguous, unmerged, or non-ancestor worktrees/branches.

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
  "purpose": "Post-merge local cleanup after live merge evidence.",
  "mode": "local-destructive",
  "write_side_effects": "Local branch/worktree cleanup only after live merge evidence; no GitHub mutation.",
  "stop_condition": "Stop on dirty, ambiguous, unmerged, or non-ancestor worktrees/branches.",
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
  "allowed_artifact": "local branch and worktree cleanup only after merge verification"
}
```

## `clean` - Post-Merge Cleanup

Verify live PR merge evidence first, fetch, inspect dirty state, then clean only safe local branches/worktrees/state artifacts. Stop on uncommitted work or contradictory live state.
