<!-- ddalggak:generated:file command-doc:start -->
# Command: start

Use when: Issue implementation from live issue body/comments; one issue PR by default.
Required by: `start` command.
Side effects: Repo source edits in issue scope; start publishes the issue PR via the ship procedure (ship.md); cross-review comments come through the review gate.
Do not use when: Outside this command's scope or permissions. Stop on stale base, missing issue body/comments, duplicate PR, or required files outside the issue-owned scope.

This command document and its required assets are the minimum required context, not a reading allowlist.
Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.
Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.
Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.
The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.
Paths below and in the locale notes are relative to the installed skill root.

Required references:
- `references/wiki-context-preflight.md`
- `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`
- `references/quality-lens-router.md`
- `references/evidence-contract.md`
- `references/agent-runtime-contract.md`
- `references/start-workflow.md`
Conditional references (activation -> asset):
- `code-shape` -> `references/simplicity-deletability-gate.md`
- `scope-or-privacy` -> `references/core-invariants.md`
- `ambiguous-intent` -> `references/deep-interview-readiness-gate.md`

Required templates:
- None.
Conditional templates (activation -> asset):
- `delegated-work` -> `templates/worker-brief.md`
- `multi-lane-long-running` -> `templates/conductor-state.md`
- `multi-lane-long-running` -> `templates/lane-state.md`
- `evidence-artifacts` -> `templates/artifact-manifest.md`

```json
{
  "command": "start",
  "command_order": "010",
  "show_doc_heading": "Start Workflow",
  "source_edit_allowed": true,
  "github_write_allowed": false,
  "purpose": "Issue implementation from live issue body/comments; one issue PR by default.",
  "mode": "source-edit",
  "write_side_effects": "Repo source edits in issue scope; start publishes the issue PR via the ship procedure (ship.md); cross-review comments come through the review gate.",
  "stop_condition": "Stop on stale base, missing issue body/comments, duplicate PR, or required files outside the issue-owned scope.",
  "required_references": [
    "wiki-context-preflight.md",
    "2026-06-04-brain-v0-wiki-authority-in-ddalggak.md",
    "quality-lens-router.md",
    "evidence-contract.md",
    "agent-runtime-contract.md",
    "start-workflow.md"
  ],
  "conditional_references": [
    "code-shape=simplicity-deletability-gate.md",
    "scope-or-privacy=core-invariants.md",
    "ambiguous-intent=deep-interview-readiness-gate.md"
  ],
  "required_templates": [],
  "conditional_templates": [
    "delegated-work=worker-brief.md",
    "multi-lane-long-running=conductor-state.md",
    "multi-lane-long-running=lane-state.md",
    "evidence-artifacts=artifact-manifest.md"
  ],
  "output_contract": {
    "completion_signal": "ISSUE_PR_READY",
    "evidence_required": true
  },
  "allowed_artifact": "worker agents may edit only files named in their brief"
}
```

## `start` - Issue-Based Implementation

Command contract: mode `source-edit`; source edits are limited to live issue-owned scope; start publishes the issue PR via the ship procedure (`references/ship.md`) and routes cross-review through the review gate; stop on stale base, missing issue body/comments, duplicate PR, or required files outside scope.

Full procedure: `references/start-workflow.md`; delegated work only loads `templates/worker-brief.md`.

Execution contract index: target repo/base freshness, issue body+comments, base Router/Evidence, activation-bound optional gates, allowed/forbidden/inspect-only/Must not touch, one issue PR by default, hard-conflict fallback only with reason, validation/PR evidence, and blocking gaps.
