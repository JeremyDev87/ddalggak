---
name: ddalggak
description: "Use when the user wants a Codex App native GitHub issue to implementation to review to recovery workflow, or wants to plan issues, create GitHub issues, inspect status, ship an existing lane, clean up after merge, write retrospectives, improve prompts, or run a one-shot local diff check."
---

# ddalggak - Codex App workflow

ddalggak is a repository-local Codex skill for one repeated cycle:

GitHub Issue -> plan -> parallel implementation -> independent review -> self-healing -> retrospective.

It is an orchestration layer. The main session acts as conductor, creates isolated Codex agents when needed, records durable state, and keeps code-writing authority inside the subcommands that are allowed to modify repository files.

## Subcommands

Supported subcommands are:

`start|review|status|plan|issue|clean|ship|retro|prompt|check`

The standard cycle is:

`prompt` -> `plan` -> `start` -> `ship` -> `review` -> `retro`

`status`, `issue`, `clean`, and `check` are supporting commands.

## Routing Invariant

Parse only the first whitespace-separated word from the invocation arguments.

1. If the first word exactly matches a supported subcommand, route to that subcommand.
2. If there are no arguments, route to `start`.
3. If the first word is not supported, route to `start` and treat the full argument string as start context.
4. Once a route is selected, later arguments must never reroute the request, even if they look like an implementation request.
5. Immediately print exactly one route line before doing work: `-> <subcommand> 실행`.
6. The routed subcommand must stay inside the code modification permissions in the table below.
7. If arguments request changes to this skill, its routing rules, its subcommand definitions, or the skill artifact itself, stop with: `메타 요청 감지 - 이 작업은 ddalggak 서브커맨드 범위 밖입니다. /ddalggak 외부 일반 메시지로 다시 요청해 주세요.`

## Code Modification Invariant

Only `start` and `review` may authorize repository source file edits. All other subcommands are read-only for source code and may only produce the artifacts listed below.

| Subcommand | May modify source files | Allowed artifacts |
| --- | --- | --- |
| `start` | yes | worker agents may edit only files named in their brief |
| `review` | yes | author agents may apply accepted review fixes only |
| `prompt` | no | `BRIEF.md`, `REVIEW_BRIEF*.md`, `FIX_BRIEF*.md` after explicit confirmation |
| `plan` | no | response output only unless the user separately asks to write a plan document |
| `issue` | no | GitHub issues only |
| `status` | no | response output only |
| `check` | no | local review notes only; no repository edits |
| `ship` | no | commit, push, and draft PR for existing changes only |
| `clean` | no | local branch and worktree cleanup only after merge verification |
| `retro` | no | retrospective notes and memory update request artifacts only |

If a non-writing subcommand would need a source edit to continue, report the need and stop. User confirmation inside that subcommand does not grant source-edit permission.

## Codex App Primitives

Use Codex App native orchestration names in all briefs and status records:

- Create a worker or reviewer lane with `spawn_agent`.
- Send additional instructions with `send_input`.
- Wait for results with `wait_agent`.
- Persist conductor state in `.ddalggak/session-state.json`.
- Ask structured questions with `request_user_input` when available; otherwise ask one concise plain question with explicit choices.
- Create a heartbeat automation only when the user explicitly asks for later continuation. Do not create timed follow-up automation as a default polling mechanism.

The state file is the source of truth for lane IDs, worktree paths, branch names, issue numbers, PR URLs, validation commands, review verdicts, and unresolved blockers.

## State Contract

Maintain `.ddalggak/session-state.json` when running multi-lane or multi-step flows. The file should be JSON and should include:

```json
{
  "phase": "wave-1",
  "base_branch": "origin/master",
  "lanes": [
    {
      "id": "issue-20",
      "role": "implementation",
      "issue": 20,
      "worktree": "/absolute/path",
      "branch": "feature/issue-20-codex-skill",
      "agent_id": "agent id from spawn_agent",
      "state": "briefed",
      "allowed_files": [],
      "validation": [],
      "pr_url": null,
      "review": null,
      "blocker": null
    }
  ]
}
```

Use lane states such as `planned`, `briefed`, `implemented`, `validated`, `review_loop_passed`, `pr_opened`, `pr_review_approved`, and `blocked`. Do not call a lane complete immediately after code-writing.

## Shared Workflow Rules

- Inspect whether work can be split into independent lanes before choosing sequential execution.
- Parallel lanes must not share write surfaces, generated artifacts, branch mutation, or unpublished code dependencies.
- In one shared checkout, serialize branch mutation, push, and PR creation.
- In isolated worktrees, implementation, validation, and PR creation may proceed per lane after each lane clears its local review gate.
- Final merge gates and whole-repo verification are serialized unless the user explicitly chooses otherwise.
- Protected default-branch pushes, release tags, package publication, and release-triggering workflows require an explicit pause for confirmation.

## `start` - Issue-Based Implementation

Use for implementation from one or more GitHub issues.

1. Collect issue context.
   - For a specified issue, run `gh issue view <number> --json number,title,body,labels,assignees,milestone,url,comments`.
   - For batch mode, list candidate issues first, then inspect each issue with comments.
   - If comments conflict with the body, prefer the latest explicit comment.
2. Clarify only material gaps.
   - Ask with `request_user_input` when available.
   - Ask until file ownership, blockers, and machine-checkable completion criteria are clear.
3. Map file ownership.
   - Extract explicit files from the issue body and comments.
   - Read the relevant module before assigning a worker.
   - Mark confidence as high, medium, or low.
4. Classify blockers.
   - Hard blockers: same existing file, same generated artifact, shared registry or barrel, shared schema, or unpublished code dependency.
   - Soft blockers: tracker order, review preference, or semantic ordering with no file or unpublished-code dependency.
   - Only hard blockers reduce the number of simultaneous implementation lanes.
5. Build waves.
   - Wave 1 is the largest set with no hard blockers.
   - Later waves must name the exact blocking file or unpublished dependency.
6. Present the execution plan and ask for confirmation before spawning implementation lanes.
7. Write a brief per lane. Each brief must include task, issue URL, expected outcome, worktree path, branch, allowed files, forbidden files, validation, commit format, PR format, and stop conditions.
8. Use `spawn_agent` for each approved lane and record agent IDs in `.ddalggak/session-state.json`.
9. Use `wait_agent` to collect results. Update lane state as results arrive.
10. A lane is not terminal until validation, adversarial review, accepted Critical and High fixes, and requested publish steps are finished or blocked.

## `review` - Cross-Review Loop

Use for independent PR or local-lane review.

1. Determine target PRs from arguments or open PR discovery.
2. For each PR, create a fresh reviewer agent with `spawn_agent`. Do not reuse the author agent for review.
3. Give the reviewer only the review packet: issue context, diff or PR URL, files changed, validation already run, skipped checks, constraints, and severity rubric.
4. Reviewer reports findings only. It does not edit files.
5. Main session triages every finding as accept, reject, or defer.
6. Accepted Critical and High findings are fixed by the author lane only.
7. Re-run relevant validation and request delta review with `send_input` or a new `spawn_agent` when isolation is more important than continuity.
8. Stop when Critical and High are zero, or after three rounds with an explicit blocker.

Review output must include severity, confidence, evidence, impact, suggested fix, file and line when available, and a repro or test idea.

## `status` - Current State Snapshot

Read `.ddalggak/session-state.json` if present, then inspect:

- `git status --short`
- `git worktree list --porcelain`
- `gh pr list --author @me --state open --json number,title,headRefName,baseRefName,url`

Report phase, lane states, worktrees, branches, PRs, blockers, and next action. Do not edit files.

## `plan` - Issue-Ready Plan

Write an implementation plan that a low-context worker and a review agent can execute.

The plan must include:

- Goal
- Source of truth
- Non-goals and constraints
- Context recovery anchors with exact files and search terms
- Assumptions and unknowns
- Work inventory and file ownership
- Implementation units
- Conflict matrix
- Waves
- Validation commands and success signals
- Review agent checklist

Do not create issues or edit source files unless the user separately asks outside this subcommand's read-only source-code boundary.

## `issue` - Plan To GitHub Issues

Convert a plan into GitHub issues. Preserve file ownership, hard blockers, waves, prerequisites, validation, and review checklists. Parent tracker issues should not be assigned implementation write surfaces. Do not edit repository files.

## `ship` - Publish Current Lane

Use only for changes that already exist in the current lane.

1. Confirm changed files are in scope.
2. Run relevant validation.
3. Run the local adversarial review gate when feasible.
4. Stage only intended files.
5. Commit with the requested convention.
6. Push the current branch.
7. Open a draft PR.
8. Record PR metadata in `.ddalggak/session-state.json` when the state file is in scope.

Do not create new source changes as part of `ship`.

## `clean` - Post-Merge Cleanup

Verify the PR is actually merged before cleanup. Then close or update linked issues, delete local branches or worktrees only when safe, and remove temporary brief files if they are in the cleanup scope. Stop on uncommitted work.

## `retro` - Retrospective

After merge, summarize what happened, what broke, what validation caught, and what should change in future briefs or skills. Write only retrospective or memory-update request artifacts, not source code.

## `prompt` - Prompt Optimizer

Audit and improve lane briefs or review briefs. Do not edit this skill or repository source files. If the requested prompt change would alter skill behavior, stop and tell the user to make that as a normal repo edit outside ddalggak.

## `check` - Local Diff Check

Run a read-only local diff review.

1. Capture `git status --short`.
2. Inspect `git diff --stat` and `git diff`.
3. Use a fresh reviewer agent with `spawn_agent` when available; otherwise perform a strict self-review and say it was not independent.
4. Report findings only. Do not edit, stage, commit, push, or comment on GitHub.

## Review Gate Contract

For implementation lanes, the normal finish pipeline is:

1. Relevant local validation.
2. Adversarial review in a fresh session when available.
3. Triage findings.
4. Fix accepted Critical and High findings.
5. Re-run validation.
6. Repeat up to three rounds.
7. Ship only after the gate passes and the user requested publish.

Return the gate result as:

```text
gate_result: pass|fail
blocking_summary: none|<summary>
next_action: ship|fix|stop
lane_completion_state: review_loop_passed|review_loop_blocked
```

## Stop Conditions

Stop and report instead of continuing when:

- Required source edits fall outside the routed subcommand's permission.
- A lane needs a file outside its allowed file list.
- A hard blocker would force a stacked PR when non-stacked PRs are required.
- Validation mutates the checkout unexpectedly.
- Release or publish automation would run without explicit confirmation.
- The state file contradicts live git or GitHub state and cannot be reconciled safely.
