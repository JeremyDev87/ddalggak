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

## Global Guardrails

Apply these rules to every subcommand without weakening the routing or code-modification invariants above.

- **Base freshness first**: sessions that validate, review, ship, or clean must start with `git fetch --prune` and an ahead/behind check for the current branch or base branch. If the session validates directly on the base branch and the checkout is clean, run `git pull --ff-only` before trusting local state.
- **Issue comments are source-of-truth candidates**: read issue body and comments together. If the latest explicit comment conflicts with the body, prefer the comment and record the conflict in the brief or review packet.
- **No implicit dependencies**: do not give workers vague choices such as "add a library or parse text". Before any new import or package is used, prove it already exists in the repository. If uncertain, require the standard library or an existing repository pattern.
- **No force-push fix loop by default**: fixes after review use a new commit and ordinary push. Amend plus force push is allowed only after explicit user approval and after branch-protection or safety constraints are checked.
- **Reviewer isolation**: reviewers do not switch branches inside an implementation worktree. Prefer `gh pr diff`, `gh pr view --json files`, and isolated temporary checkouts when build or test reproduction is needed.
- **Merge-order context**: when PRs in the same wave depend on merge order or compare against different baselines, review packets must name predecessor PRs, comparison targets, and whether base mismatch is expected.
- **Completion is not test pass**: a lane is incomplete until tests, commit, push, draft PR, and requested review or handoff signals are verified. Idle notifications are not completion evidence.
- **PR quality defaults**: branch names must describe purpose and must not include dates or timestamps. Commit messages and PR descriptions must include What and Why, and PR descriptions must also include Validation and Risk.
- **Exact command rescue**: if a worker repeatedly idles after commit without push or PR, send the exact `git push` and `gh pr create` commands verified by the conductor instead of a generic reminder.
- **Gitignored and local-only handling**: for ignored, local-only, permission-cache, or repo-external paths, include `git check-ignore -v <path>` in the brief when applicable. Do not force such files into PR workflow; use direct local modification signals and manual issue handling when the path cannot be represented in git.
- **Medium fix restraint**: Medium findings are non-blocking by default. If a Medium or Low fix depends on an unmerged PR output or shared contract transition, prefer TODO or follow-up issue over speculative code changes.
- **Markdown surgery discipline**: when editing Markdown or skill files, preserve existing behavior, update headings and numbering immediately, keep fenced blocks valid, and re-check the diff for accidental block deletion.
- **Strategy versus tactics**: worker agents execute tactical code changes. The conductor and reviewers protect system design, boundaries, validation, and deletability; code that merely works is lower priority than code understandable, changeable, and removable in six months.
- **Self-created complexity is a defect**: before adding helpers, modules, providers, wrappers, or fallback branches, prefer deletion, direct code, and boundary clarification. Forced modularization must prove it reduces real repeated code rather than making an AI patch look organized. Client-side patches must not replace correct server, request, auth, or data boundary fixes, and mock-only tests are insufficient for auth, redirect, or data-boundary behavior.
- **Result criteria first**: briefs should emphasize success criteria, allowed files, forbidden conditions, validation commands, and completion signals over long step-by-step scripts, while safety, scope, and completion signals remain absolute rules.
- **Absorb repeated lessons**: stale repositories, hallucinated dependencies, unsafe force-push loops, ignored-file mistakes, and missing worker commit/push/PR steps are default guardrails for every start, review, fix, and ship flow.
- **Evidence is a first-class deliverable**: CI or typecheck success is not enough for user-visible frontend behavior. Plans and reviews must request rendered evidence when frontend work changes routes, responsive layouts, DOM states, screenshots, fallbacks, or shared data contracts.
- **Missing evidence classification**: every skipped evidence item must be classified as `not-applicable: <reason>`, Medium, or High. Missing evidence is High when it covers an explicit acceptance criterion, user-visible critical path, privacy/security behavior, or a fallback likely to hide broken data; otherwise it is Medium unless truly out of scope.
- **Analytics privacy**: analytics plans and reviews must state an allowlist/denylist contract. Deny raw search terms, prompt titles or bodies, arbitrary user-entered text, email/name/profile identifiers, and full query strings by default. Prefer stable IDs, categories, buckets, booleans, and GTM-managed transformations.


## Quality Lens Router

Before `plan`, `start`, or `review` selects detailed gates, route the work through the Quality Lens Router. Read `references/quality-lens-router.md` for the full predicate table and keep the router output in the plan, worker brief, or review packet.

The router inspects request text, issue body and comments, PR files, diff paths, and repository or product conventions. It must emit this stable contract:

```markdown
## Quality Lens Router Output
- Applicable gate families:
  - <gate>: <why it applies>
- Skipped gates:
  - <gate>: <why it is omitted>
- Repo/product conventions that outrank generic rules:
  - <convention or none>
```

Stable gate family names are: `frontend-design`, `vercel-agent-skills`, `react-next-boundary-performance`, `composition-api`, `motion-meaning`, `web-design-a11y-evidence`, `deploy-token-safety`, `react-native-expo`, `tdd-systematic-debugging`, `simplicity-deletability`, `evidence-contract`, and `regression-library`.

Backend-only work must not receive frontend/UI/domain gates unless it affects a rendered user-facing contract, deploy surface, auth/security boundary, data privacy contract, or performance claim. Treat `backend-only` skip reasons as stable review evidence. Record skipped gates and skip reasons explicitly; skipped gates are part of the quality contract, not omitted context.

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
- Hard blockers include the same existing file, same generated artifact, shared registry or barrel, shared schema, unpublished code dependency, gitignored or local-only path, repo-external file, and atomic transition of the same delivery or output contract.
- Soft blockers include tracker order, review preference, or semantic ordering with no file, contract, or unpublished-code dependency.

## `start` - Issue-Based Implementation

Use for implementation from one or more GitHub issues.

0. Prerequisite discovery and base freshness.
   - Run `gh repo view --json nameWithOwner,url,defaultBranchRef`.
   - Run `git fetch --prune`, `git status -sb`, `git branch --show-current`, and `git worktree list --porcelain`.
   - If an upstream exists, run `git rev-list --left-right --count @{upstream}...HEAD`.
   - If operating directly on a clean base branch, run `git pull --ff-only` before planning.
1. Collect issue context.
   - For a specified issue, run `gh issue view <number> --json number,title,body,labels,assignees,milestone,url,comments`.
   - For batch mode, list candidate issues first, then inspect each issue with comments when possible.
   - For no-argument start, treat labels as selection hints only: first list `status:unlocked` open issues; if none exist, fall back to open issues without adding, removing, or changing labels. Exclude `status:locked` issues from the batch, but never mutate their labels.
   - Do not let workflow outcome depend excessively on label presence. Labels help choose candidates; they are not an issue mutation trigger and are not a substitute for issue body, comments, ownership, and completion criteria.
   - If comments conflict with the body, prefer the latest explicit comment and include the conflict in the lane brief.
2. Clarification gate.
   - **Clear**: goal, change scope, completion criteria, and validation method are all identifiable; continue.
   - **Partly unclear**: implementation is possible but there are two or more viable choices; ask a multiple-choice `request_user_input` question and continue after the answer.
   - **Fundamentally thin**: at least two of goal, scope, or completion criteria are missing; suggest `/ddalggak plan` fallback and stop `start`.
   - Ask until file ownership, blockers, and machine-checkable completion criteria are clear.
3. Map file ownership.
   - Extract explicit files from the issue body and comments.
   - Read the relevant module before assigning a worker.
   - Identify forbidden files and inspect-only files separately from allowed files.
   - Mark confidence as high, medium, or low.
4. Classify blockers.
   - Hard blockers: same existing file, same generated artifact, shared registry or barrel, shared schema, unpublished code dependency, gitignored or local-only file, repo-external file, or same delivery/output contract requiring atomic transition.
   - Soft blockers: tracker order, review preference, or semantic ordering with no file, contract, or unpublished-code dependency.
   - Only hard blockers reduce the number of simultaneous implementation lanes.
5. Build waves.
   - Wave 1 is the largest set with no hard blockers.
   - Later waves must name the exact blocking file, contract, ignored/local-only path, repo-external path, or unpublished dependency.
6. Prepare isolated worktrees.
   - Branch names must be purpose-centered, such as `docs/pr-quality-and-label-filtering` or `fix/issue-42-pr-quality`, and must not contain dates, timestamps, or generated time suffixes.
   - Keep `.worktrees/` local by writing to `.git/info/exclude`, not to the tracked ignore file:

```bash
grep -qxF '.worktrees/' <repo-root>/.git/info/exclude || printf '\n.worktrees/\n' >> <repo-root>/.git/info/exclude
git -C <repo-root> worktree add <repo-root>/.worktrees/<branch-name> -b <branch-name>
```

7. Present the execution plan and ask for confirmation before spawning implementation lanes.
8. Write a brief per lane. Each brief must include:
   - task, issue URL, issue body summary, and issue comments summary;
   - latest comment conflicts or supplements when present;
   - expected outcome, result criteria, and machine-checkable completion signals;
   - Quality Lens Router Output with applicable gate families, skipped gates, and repo/product conventions that outrank generic rules;
   - repository root, absolute worktree path, branch, base branch, and base freshness result;
   - allowed files, forbidden files, and inspect-only files;
   - shared language, domain terms, deep-module boundaries, and gray-box boundaries;
   - test-first contract when feasible: failing test or expected behavior before implementation;
   - for frontend work, rendered evidence requirements: route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, and contract graph evidence;
   - missing evidence classification for each unavailable item as `not-applicable: <reason>`, Medium, or High;
   - for analytics or privacy work, an explicit allowlist/denylist contract that excludes raw search terms, prompt titles or bodies, arbitrary user-entered text, email/name/profile identifiers, and full query strings by default;
   - worker implementation quality rules: prefer arrow functions where the repository style allows, keep each unit single-responsibility, isolate pure functions from side effects when practical, use TDD or unit tests for core behavior, and follow the repository's file naming plus companion test/story/helper conventions such as `ABC.styles.tsx`, `ABC.constants.tsx`, `ABC.types.tsx`, and `ABC.parts.tsx` when that pattern fits the codebase;
   - validation commands and success signals;
   - no-new-dependency rule with proof required before any new import;
   - ignored/local-only handling with `git check-ignore -v <path>` when relevant;
   - requirement to use absolute worktree paths or `git -C <worktree>` for git and file commands;
   - commit format, draft PR format, and stop conditions;
   - commit and draft PR body requirements: What, Why, Validation, Risk, and issue references when applicable;
   - completion rule: test pass is insufficient; commit, push, and draft PR are required when publish is requested.
9. Use `spawn_agent` for each approved lane and record agent IDs in `.ddalggak/session-state.json`.
10. Progressive review start.
   - Use `wait_agent` to collect lane updates, but do not wait for every worker before starting review.
   - When a branch reports `PUSHED` or idles after apparent completion, run `gh pr list --head <branch>` to verify PR existence.
   - If a PR exists, start review for that PR while other workers continue.
   - If there is an idle signal without a PR, it is not complete. If only push or PR creation is missing after a commit, send exact `git push` and `gh pr create` commands with `send_input`.
11. A lane is not terminal until validation, adversarial review, accepted Critical and High fixes, commit, push, draft PR, and requested publish steps are finished or blocked.

## `review` - Cross-Review Loop

Use for independent PR or local-lane review. Treat review as an AI code quality gate, not a praise pass or summary. The gatekeeper must block bugs, security issues, and long-term maintainability risks. Prefer smaller scope, existing repository patterns, deletable code, explicit ownership, and clear data flow. Treat unnecessary complexity and self-created complexity as defects, including forced modularization, premature abstraction, duplicate paths, silent fallback, avoidable local state, client-side boundary patches, and increased type escape.

1. Determine target PRs from arguments or open PR discovery.
2. For each PR, collect a review packet before spawning review:
   - `gh pr view <num> --json title,body,files,commits,baseRefName,headRefName,reviews,statusCheckRollup`
   - `gh pr diff <num>`
   - `gh pr checks <num>` when available; failing CI is Critical unless proven unrelated.
   - issue body and comments, Quality Lens Router Output, validation already run, skipped checks, constraints, Review Rubric, AI Code Quality Gate checklist, and merge-order context.
3. For each PR, create a fresh reviewer agent with `spawn_agent`. Do not reuse the author or implementation agent for review, and do not let an agent review its own code.
4. Give the reviewer only the review packet: issue context, diff or PR URL, files changed, validation already run, skipped checks, constraints, merge-order context, Review Rubric, and AI Code Quality Gate checklist.
   - Require reviewers to cite CI status as evidence when available, but to focus findings on behavior intent, issue scope, code quality, architecture and domain boundaries, maintainability, and deletability.
5. Reviewer reports findings only. It does not edit files, and it does not run branch switching or PR checkout commands inside an implementation worktree.
6. If build or test reproduction is needed, use a separate temporary checkout such as `/tmp/<pr-num>-review`; otherwise prefer `gh pr diff` and `gh pr view --json files`.
7. Main session triages every finding as accept, reject, or defer.
8. Accepted Critical and High findings are fixed by the author lane only.
9. Fix loop default: create a new commit and ordinary push. Use amend or force-with-lease only after explicit user approval and after safety constraints are checked.
10. Medium and Low findings are non-blocking by default. If they depend on an unmerged PR or shared contract transition, limit them to TODO or follow-up issue unless the user explicitly asks for the change.
11. Re-run relevant validation and request delta review with `send_input` or a new `spawn_agent` when isolation is more important than continuity.
12. Stop when Critical and High are zero, or after three rounds with an explicit blocker.

### Review Rubric

- **Critical**: security vulnerability, data loss, CI/test failure, obvious malfunction, destructive migration, or secret exposure.
- **High**: architecture or domain boundary violation, existing pattern drift that creates a parallel path or changes ownership, data, error, or validation flow, AI-generated complexity that makes the change harder to delete or review, wrong data flow, silent fallback that hides failure, client-side patches that bypass the real server/request/auth/data boundary, excessive scope creep, abstraction that is hard to delete or modify, or tests missing a core contract.
- **Medium**: localized duplicate implementation, naming or ownership confusion, unnecessary local state, increased type escape, inconsistent error handling, or subtle mismatch with existing patterns that does not create a blocking parallel path.
- **Low**: documentation, comments, readability, or follow-up cleanup that does not affect the merge gate.

### REVIEW_BRIEF Requirements

Every REVIEW_BRIEF or review packet must include this AI Code Quality Gate checklist:

- **Scope & Ownership**: Is the diff limited to the issue, owned by the right module, and free of broad refactors or feature creep?
- **Simplicity & Deletability**: Does the change avoid unnecessary abstraction, forced modularization, duplication, fallback paths, local state, and type escape? Could it be deleted or modified later without surprising callers? Did any new helper/module/provider/wrapper prove that it reduces real repeated code or clarifies a boundary?
- **Existing Patterns**: Does it follow current repository patterns, naming, boundaries, error handling, validation style, and dependency rules instead of inventing a parallel path?
- **Failure Semantics**: Are failures explicit, testable, and observable rather than silently swallowed or converted into misleading success? Do client-side patches avoid masking server/request/auth/data boundary defects, and do auth, redirect, and data-boundary checks use more than mock-only tests?
- **Human Reviewability**: Is the data flow clear, the diff small enough to review, and the contract covered by tests or a concrete validation signal?
- **Rendered Evidence**: For frontend changes, did the PR provide rendered evidence covering route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, and contract graph evidence, or classify each missing item as `not-applicable: <reason>`, Medium, or High?
- **Transitive rendered fallback**: Did review audit list/detail surfaces, shared card/media primitives, missing media, empty DB/data, nullable fields, and mapper defaults? If a shared primitive is out of scope, did the PR include callsite mitigation or a follow-up/blocker?
- **Analytics privacy**: For analytics/privacy changes, does the diff enforce the allowlist/denylist contract by excluding raw search terms, prompt titles or bodies, arbitrary user-entered text, email/name/profile identifiers, and full query strings by default?

Review output must include severity, confidence, evidence, impact, suggested fix, file and line when available, and a repro or test idea. Findings should be concise and adversarial; avoid praise-only comments.

FIX_BRIEF packets must include: `기능은 유지하되 diff를 줄이고, 중복/성급한 추상화/forced modularization/불필요한 helper·module·provider·wrapper·fallback/type escape를 제거하며, 기존 저장소 패턴과 올바른 server/request/auth/data boundary에 맞춰라. 새 abstraction을 추가하기 전에 삭제·직접화·경계 정리로 해결할 수 있는지 먼저 증명하라. auth/redirect/data-boundary 수정은 mock-only tests만으로 완료 처리하지 마라. 새 기능이나 광범위한 리팩터는 하지 마라. 수정은 새 커밋으로 만들고 일반 push만 사용하라. Medium/Low 지적이 미머지 PR이나 공유 계약 전환에 걸려 있으면 과잉 수정하지 말고 TODO/follow-up으로 제한하라.`

## `status` - Current State Snapshot

Read `.ddalggak/session-state.json` if present, then inspect:

- `git fetch --prune`
- `git status --short`
- `git status -sb`
- current branch and upstream ahead/behind with `git rev-list --left-right --count @{upstream}...HEAD` when upstream exists
- `git worktree list --porcelain`
- `gh pr list --author @me --state open --json number,title,headRefName,baseRefName,url`

Report phase, lane states, worktrees, branches, PRs, blockers, base freshness, ahead/behind state, and next action. Do not edit files.

## `plan` - Issue-Ready Plan

Write an implementation plan that a low-context worker and a review agent can execute.

The plan must include:

- Goal
- Source of truth, including issue body and comments when an issue exists
- Non-goals and constraints
- Context recovery anchors with exact files and search terms
- Assumptions and unknowns
- Work inventory and file ownership
- Forbidden files and inspect-only files
- Implementation units
- Conflict matrix, including ignored/local-only paths and repo-external paths
- Waves
- Validation commands and success signals
- Completion signals beyond test pass when publish is expected
- Quality Lens Router Output with applicable and skipped gate families
- Review agent checklist

Do not create issues or edit source files unless the user separately asks outside this subcommand's read-only source-code boundary.

## `issue` - Plan To GitHub Issues

Convert a plan into GitHub issues. Preserve file ownership, hard blockers, waves, prerequisites, validation, result criteria, and review checklists. Parent tracker issues should not be assigned implementation write surfaces. Do not edit repository files.

## `ship` - Publish Current Lane

Use only for changes that already exist in the current lane.

1. Confirm changed files are in scope.
2. Re-read related issue body and comments when an issue number is known.
3. Run `git fetch --prune`, check current branch, and check upstream ahead/behind if an upstream exists.
4. If validating directly on a clean base branch, run `git pull --ff-only` first.
5. Check for ignored, local-only, or repo-external files with `git status --ignored --short` and `git check-ignore -v <path>` when relevant; do not stage ignored/local-only paths for PR.
6. Run relevant validation.
7. Run the local adversarial review gate when feasible.
8. Stage only intended files.
9. Commit with the requested convention.
   - The commit body must include `What:` and `Why:` lines unless the repository's explicit convention is stricter.
10. Push the current branch with ordinary push by default.
11. Open a draft PR whose body includes What, Why, Validation, Risk, and issue references.
12. Verify PR existence with `gh pr list --head <branch>` or equivalent.
13. Record PR metadata in `.ddalggak/session-state.json` when the state file is in scope.

Do not create new source changes as part of `ship`.

## `clean` - Post-Merge Cleanup

Verify the PR is actually merged before cleanup. Start with `git fetch --prune`, inspect dirty state, and require merge evidence before deleting local branches or worktrees. Then close or update linked issues, delete local branches or worktrees only when safe, and remove temporary brief files if they are in the cleanup scope. Stop on uncommitted work.

## `retro` - Retrospective

After merge, summarize what happened, what broke, what validation caught, and what should change in future briefs or skills. Write only retrospective or memory-update request artifacts, not source code. Capture whether stale base, implicit dependencies, unsafe push strategy, ignored files, worker completion ambiguity, or Markdown surgery contributed to the outcome.

Retrospectives must separate one-off incident records from reusable knowledge extraction. Tag reusable lessons into `harness-engineering/*`, `principles/*`, `frontend/*`, or `llm-wiki/*`, and keep project-specific incident facts out of reusable guidance unless they generalize into a durable rule.

## `prompt` - Prompt Optimizer

Audit and improve lane briefs or review briefs. Do not edit this skill or repository source files. If the requested prompt change would alter skill behavior, stop and tell the user to make that as a normal repo edit outside ddalggak.

## `check` - Local Diff Check

Run a read-only local diff review.

1. Capture base freshness with `git fetch --prune`, `git status -sb`, and upstream ahead/behind when an upstream exists.
2. Capture `git status --short`.
3. Inspect `git diff --stat` and `git diff`.
4. Check whether changed paths include ignored, local-only, repo-external, or generated artifacts.
5. Use a fresh reviewer agent with `spawn_agent` when available; otherwise perform a strict self-review and say it was not independent.
6. Report findings only. Do not edit, stage, commit, push, or comment on GitHub.

## Review Gate Contract

For implementation lanes, the normal finish pipeline is:

1. Relevant local validation.
2. Verify commit, push, and draft PR when publish is requested; do not equate test pass or idle state with completion.
3. Adversarial review in a fresh session when available.
4. Triage findings.
5. Fix accepted Critical and High findings with new commits and ordinary push by default.
6. Re-run validation.
7. Repeat up to three rounds.
8. Ship only after the gate passes and the user requested publish.

Return the gate result as:

```text
gate_result: pass|fail
blocking_summary: none|<summary>
next_action: ship|fix|stop
lane_completion_state: review_loop_passed|review_loop_blocked
```

## Common Pitfalls

- Stale repository state causing false failures or false approvals.
- Reading issue body while missing later clarifying comments.
- Hallucinating or adding external dependencies without proving they already exist.
- Starting an unsafe amend or force-push fix loop when a new fix commit is safer.
- Treating worker idle, local test pass, or commit-only state as completion.
- Reviewing inside an implementation worktree and disturbing the author's branch.
- Pulling gitignored, local-only, permission-cache, or repo-external files into a PR.
- Over-fixing Medium findings that depend on unmerged PRs or shared contracts.
- Losing behavior during Markdown or skill block replacement.
- Forgetting merge-order context for same-wave code and docs or follow-up PRs.
- Accepting frontend work with only CI/typecheck evidence and no rendered evidence.
- Auditing a visible fallback at one callsite while missing transitive rendered fallback risks in list/detail surfaces, shared card/media primitives, missing media, empty DB/data, nullable fields, or mapper defaults.
- Shipping analytics events without a privacy allowlist/denylist, especially raw search terms, prompt titles or bodies, arbitrary user-entered text, email/name/profile identifiers, or full query strings.

## Verification Checklist

Before declaring a lane, review, or ship step complete, verify:

- `git fetch --prune` ran and base freshness plus ahead/behind state are known.
- Issue body and comments were both inspected, and comment/body conflicts were recorded.
- Allowed, forbidden, and inspect-only files are explicit.
- Ignored, local-only, generated, and repo-external paths were checked when relevant.
- New dependencies or imports were either avoided or proven already present.
- Subagent side effects were independently rechecked with git and GitHub commands.
- Test pass is distinguished from commit, push, draft PR, and review completion.
- Reviewer isolation and merge-order context were preserved.
- Accepted Critical and High findings were fixed and revalidated; remaining Medium/Low items are documented or deferred.
- Markdown or skill edits preserve frontmatter, routing, code permissions, fenced blocks, and numbering.
- Frontend changes include rendered evidence: route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, and contract graph evidence, or missing evidence classification as `not-applicable: <reason>`, Medium, or High.
- Review covered Transitive rendered fallback risks across list/detail surfaces, shared card/media primitives, missing media, empty DB/data, nullable fields, mapper defaults, and any callsite mitigation or follow-up/blocker.
- Analytics privacy work includes an allowlist/denylist contract and excludes raw search terms, prompt titles or bodies, arbitrary user-entered text, email/name/profile identifiers, and full query strings by default.
- Retro outputs distinguish incident records from reusable knowledge extraction and categorize reusable lessons under `harness-engineering/*`, `principles/*`, `frontend/*`, or `llm-wiki/*`. PR numbers, commit SHAs, and single-session completion logs are incident records, not durable reusable knowledge unless generalized into a cross-session rule.

## Stop Conditions

Stop and report instead of continuing when:

- Required source edits fall outside the routed subcommand's permission.
- A lane needs a file outside its allowed file list.
- A hard blocker would force a stacked PR when non-stacked PRs are required.
- Validation mutates the checkout unexpectedly.
- Release or publish automation would run without explicit confirmation.
- The state file contradicts live git or GitHub state and cannot be reconciled safely.
- Base freshness cannot be established for validation, review, ship, or cleanup.
- The issue remains fundamentally thin after the clarification gate.
- The requested work targets ignored, local-only, or repo-external files that cannot be represented safely in PR workflow.
