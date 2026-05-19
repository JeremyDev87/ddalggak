# Agent Runtime Contract

Use this reference when `ddalggak plan`, `start`, or `review` must make the runtime boundary of an agent lane explicit. The goal is not to increase hidden worker autonomy; it is to keep conductor/reviewer-owned control flow visible, reviewable, and resumable.

## Why

Ddalggak already relies on `Issue-PRs by default`, `Phase sequential / workers parallel`, and conductor-owned review/fix gates. Runtime contract language makes those strengths explicit:

- workers execute small tactical changes;
- the conductor owns context assembly, lane boundaries, approval gates, retries, and wave transitions;
- reviewers judge the delivered diff against the task contract, not against the full set of tools an agent happened to have available.

## Task Scope Contract

Every worker brief, review packet, and fix brief must separate:

- **tool capability boundary**: what the agent or tool could technically do;
- **task scope contract**: what this issue/PR explicitly authorizes.

The contract must name:

- Goal
- Authorized files
- Forbidden files/actions
- Allowed side effects
- Escalation-required actions
- Validation commands
- Completion evidence

Out-of-scope diff, unrelated cleanup/refactor, config or credential changes, migration changes, destructive actions, external API writes, production data touch, force-push, or branch mutation are authorization failures unless the task scope explicitly allowed them.

## Context Assembly Manifest

Before dispatching a worker or reviewer, the conductor records the context sources that define the task:

- source issue body and comments;
- repo conventions and relevant files inspected;
- loaded skills and reference docs;
- applicable quality gates and skipped gates with reasons;
- assumptions, known blockers, and scope boundaries.

The manifest prevents workers from treating whatever happens to fit in the context window as authoritative. If a later comment conflicts with the issue body, the manifest records the conflict and the chosen source of truth.

## Resume Snapshot

Before idle waits, CI waits, review/fix loops, wave transitions, and handoff rescue, record a compact snapshot with:

- current phase and iteration;
- issue, branch, PR, and worktree path;
- changed files and validation evidence;
- blocking evidence gaps;
- waiting-on state;
- next gate;
- exact next command or expected completion signal.

A resumed session must rebuild state from the snapshot plus live GitHub/git checks, not from stale conversation memory.

## Control-flow ownership

Do not hide these decisions inside an autonomous worker loop:

- approval or ready-for-review gates;
- retry limits and fix iteration transitions;
- destructive actions;
- external side effects;
- force-push or branch rewrites;
- production data touch;
- verification completion and evidence classification.

Workers may execute the next authorized command, but the conductor/reviewer owns the deterministic gate that decides whether the workflow advances.

## Non-goals

This reference does not require:

- importing the full 12-Factor Agents checklist;
- implementing event sourcing, launch/pause/resume APIs, or a job state store;
- serializing independent issue PRs;
- replacing human manual merge policy;
- adding new helpers, providers, or runtime frameworks just to satisfy terminology.
