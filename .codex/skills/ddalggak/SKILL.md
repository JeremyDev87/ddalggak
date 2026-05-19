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

The state file is the source of truth for lane IDs, worktree paths, branch names, issue numbers, the per-issue PR URL, validation commands, review verdicts, and unresolved blockers.

## Global Guardrails

Apply these rules to every subcommand without weakening the routing or code-modification invariants above.

- **Base freshness first**: sessions that validate, review, ship, or clean must start with `git fetch --prune` and an ahead/behind check for the current branch or base branch. If the session validates directly on the base branch and the checkout is clean, run `git pull --ff-only` before trusting local state.
- **Issue comments are source-of-truth candidates**: read issue body and comments together. If the latest explicit comment conflicts with the body, prefer the comment and record the conflict in the brief or review packet.
- **No implicit dependencies**: do not give workers vague choices such as "add a library or parse text". Before any new import or package is used, prove it already exists in the repository. If uncertain, require the standard library or an existing repository pattern.
- **No force-push fix loop by default**: fixes after review use a new commit and ordinary push. Amend plus force push is allowed only after explicit user approval and after branch-protection or safety constraints are checked.
- **Reviewer isolation**: reviewers do not switch branches inside an implementation worktree. Prefer `gh pr diff`, `gh pr view --json files`, and isolated temporary checkouts when build or test reproduction is needed.
- **Commit-lane order context**: when lanes in the same PR depend on commit order or compare against different baselines, review packets must name predecessor commits or contracts, comparison targets, and whether base mismatch is expected.
- **Completion is not test pass**: tests are intermediate evidence only. An independent issue lane is incomplete until commit, push, issue PR URL, validation evidence, and requested review signals are verified. A hard-conflict fallback lane is incomplete until patch or local commit, validation evidence, integration handoff, and fallback PR publish evidence are verified. Idle notifications are not completion evidence.
- **PR quality defaults**: branch names must describe purpose and must not include dates or timestamps. Commit messages and PR descriptions must include What and Why, and PR descriptions must also include Validation and Risk.
- **Issue-PRs by default**: for 박정욱/default ddalggak workflows, do not replace independent issue PRs with stacked PRs, branch matrices, or lane-only PRs. When work can be parallelized, use one base branch and one PR per independent issue; use a single PR with issue-separated commits only when conflicts make separate PRs unsafe. Only use stacked PRs when the user explicitly asks for them.
- **Conflict-fallback planning**: every parallel plan must name owned files, must-not-touch files, why each issue can have its own PR, lane-specific evidence/validation, and conflict gates. Shared files, shared contracts, or runtime flips make affected issues serial commits in one fallback PR, not the default for independent issues.
- **Exact handoff rescue**: if a worker repeatedly idles after implementation without lane evidence, send exact validation, patch/export, or integration-handoff commands verified by the conductor instead of a generic reminder. For independent issue lanes, rescue the missing issue PR creation and PR URL evidence; reserve integration handoff without PR creation for hard-conflict fallback lanes or explicitly requested stacked PRs.
- **Gitignored and local-only handling**: for ignored, local-only, permission-cache, or repo-external paths, include `git check-ignore -v <path>` in the brief when applicable. Do not force such files into PR workflow; use direct local modification signals and manual issue handling when the path cannot be represented in git.
- **Medium fix restraint**: Medium findings are non-blocking by default. If a Medium or Low fix depends on an unmerged PR output or shared contract transition, prefer TODO or follow-up issue over speculative code changes.
- **Markdown surgery discipline**: when editing Markdown or skill files, preserve existing behavior, update headings and numbering immediately, keep fenced blocks valid, and re-check the diff for accidental block deletion.
- **Strategy versus tactics**: worker agents execute tactical code changes. The conductor and reviewers protect system design, boundaries, validation, and deletability; code that merely works is lower priority than code understandable, changeable, and removable in six months.
- **Self-created complexity is a defect**: before adding helpers, modules, providers, wrappers, or fallback branches, prefer deletion, direct code, and boundary clarification. Forced modularization must prove it reduces real repeated code rather than making an AI patch look organized. Client-side patches must not replace correct server, request, auth, or data boundary fixes, and mock-only tests are insufficient for auth, redirect, or data-boundary behavior.
- **Result criteria first**: briefs should emphasize success criteria, allowed files, forbidden conditions, validation commands, and completion signals over long step-by-step scripts, while safety, scope, and completion signals remain absolute rules.
- **Absorb repeated lessons**: stale repositories, hallucinated dependencies, unsafe force-push loops, ignored-file mistakes, and missing worker validation or integration handoff steps are default guardrails for every start, review, fix, and ship flow.
- **Evidence Contract is mandatory for readiness claims**: `plan`, `start`, and `review` must read `references/evidence-contract.md` whenever work claims completion, PR readiness, approval, deploy readiness, performance, UI, security, data, or API behavior. The contract defines required evidence, applied templates, explicit `not-applicable: <reason>` items, and blocking evidence gaps.
- **Simplicity / Deletability Gate is mandatory for code-shape decisions**: `plan`, `start`, and `review` must read `references/simplicity-deletability-gate.md` whenever work may add code, abstraction, indirection, helpers, providers, wrappers, fallbacks, or patterns. Start from the smallest direct change that preserves real boundaries. SOLID and named patterns are useful tools, but they do not outrank human readability or deletability.
- **Counterargument Pass comes before readiness claims**: `plan` and `review` must actively look for weak assumptions, existing repository conventions that could contradict the proposed approach, evidence that would disprove readiness, and the smaller or more direct change that would satisfy the issue. This complements Quality Lens Router, Evidence Contract, and Simplicity / Deletability Gate; it is not a praise pass or duplicate summary.
- **Frontend Design Gate is conditional for visual work**: `plan`, `start`, and `review` must read `references/frontend-design-gate.md` when request text, issue/PR files, diff paths, or product context indicate UI/frontend/design/page/component/layout/polish/responsive/dashboard/card/CTA/typography/animation/screenshot work. Backend/API-only, test-only, or narrow functional bugfix work should skip or keep this gate lightweight and record the reason. Product-specific constraints outrank novelty, and forced abstraction is blocked for one-off UI changes.
- **Component methodology gate is conditional for UI/component work**: when `frontend-design` or `composition-api` applies to components, use it as a worker brief and review lens, not as a command to refactor ddalggak itself into a React/UI app. The lens requires main component only assembles, large conditional UI fragments → `ComponentName.parts.tsx`, calculation/format/parse → `ComponentName.utils.ts`, variant/size/style maps use `satisfies Record<...>`, tests prioritize user behavior and public visual-contract classes, and no silent fallback. The recommended role split is `ComponentName/ComponentName.tsx`, `ComponentName.types.ts`, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `ComponentName.spec.tsx`, `ComponentName.stories.tsx`, and `index.ts`, but only when a real role, size, or verification need exists; do not require empty companion files.
- **Vercel Agent Skills Gate is conditional for React, Vercel, motion, composition, web-a11y, and mobile work**: `plan`, `start`, and `review` must read `references/vercel-agent-skills-gates.md` when request text, issue/PR files, diff paths, or product context indicate React/Next component/page/data-fetching/performance work, component API/composition refactors, view transitions or list/enter-exit motion, UI/a11y/UX/screenshot acceptance, Vercel deploy/preview/env/project/token work, or React Native/Expo/mobile/native/platform work. Backend-only work skips or keeps this gate lightweight unless it affects a frontend, deploy, or mobile surface. Product/repo constraints, Simplicity / Deletability, and the Frontend Design Gate outrank generic upstream rules.
- **Continuous Regression Library is a durable review reference**: `review` must read `references/regression-library.md` when repeated Medium/High AI code-quality patterns appear or when a finding resembles a known regression class. `plan` and `start` should mention the regression-library reference only where useful for known recurring risks. Transient failures, PR numbers, commit SHAs, single-session completion logs, and incident records do not go to memory; promote only generalized class-level failures with detection signals, blocking review rules, and minimal fixture/evidence ideas to skill/reference or a follow-up issue.
- **Evidence is a first-class deliverable**: CI or typecheck success is not enough for user-visible frontend behavior. Plans and reviews must request rendered evidence when frontend work changes routes, responsive layouts, DOM states, screenshots, fallbacks, or shared data contracts.
- **Missing evidence classification**: every skipped evidence item must be classified as `not-applicable: <reason>`, Medium, or High. Missing evidence is High when it covers an explicit acceptance criterion, user-visible critical path, PR readiness, deploy/performance claim, privacy/security/auth behavior, data/API contract, or a fallback likely to hide broken data; otherwise it is Medium unless truly out of scope.
- **No evidence, no readiness or approval**: without required evidence, do not leave a PR ready, `APPROVE`, `ready for review`, `ship`, or `merge ready` conclusion. Request changes or block until evidence is supplied or reclassified with a specific `not-applicable` reason.
- **Analytics privacy**: analytics plans and reviews must state an allowlist/denylist contract. Deny raw search terms, prompt titles or bodies, arbitrary user-entered text, email/name/profile identifiers, and full query strings by default. Prefer stable IDs, categories, buckets, booleans, and GTM-managed transformations.


## Quality Lens Router

Before `plan`, `start`, or `review` selects detailed gates, route the work through the Quality Lens Router. Read `references/quality-lens-router.md` for the full predicate table and keep the router output in the plan, worker brief, or review packet. Domain gate is a lens, not a mandate: include only applicable domain gates, required references, skipped reasons, backend-only skip reasons, and lightweight limits from router output. When `simplicity-deletability` applies, also read `references/simplicity-deletability-gate.md`.

When `frontend-design` applies, read `references/frontend-design-gate.md`. Activation includes visible UI/front-end requests, `.tsx`/`.jsx`/CSS/Tailwind/design-token/Storybook/route/page/component/shared primitive changes, screenshot or responsive acceptance, and visually sensitive product contexts such as Bokbuk or orbit-dashboard. Backend-only work must skip this gate unless it changes rendered behavior or visual evidence requirements.

When `vercel-agent-skills` or any of its subfamilies applies, read `references/vercel-agent-skills-gates.md`. Applicable upstream skill families include `react-best-practices`, `composition-patterns`, `react-view-transitions`, `web-design-guidelines`, `deploy-to-vercel`, `vercel-cli-with-tokens`, and `react-native-skills`. Backend-only work should record a skip/lightweight reason unless it changes React/Next, component APIs, motion, web design/a11y evidence, Vercel deploy/env/token behavior, or React Native/Expo constraints.

The router inspects request text, issue body and comments, PR files, diff paths, and repository or product conventions. It must emit this stable contract:

```markdown
## Quality Lens Router Output
- Applicable gate families:
  - <gate>: <why it applies>
- Skipped gates:
  - <gate>: <why it is omitted>
- Repo/product conventions that outrank generic rules:
  - <convention or none>
- Required references:
  - <reference file>: <why this reference is required now>
- Lightweight or limited gates:
  - <gate>: <which bullets apply and which bullets are intentionally not applied>
```

Stable gate family names are: `frontend-design`, `vercel-agent-skills`, `react-next-boundary-performance`, `composition-api`, `motion-meaning`, `web-design-a11y-evidence`, `deploy-token-safety`, `react-native-expo`, `tdd-systematic-debugging`, `simplicity-deletability`, `evidence-contract`, and `regression-library`.

Required references are conditional: `frontend-design` requires `references/frontend-design-gate.md`; `vercel-agent-skills` and its React/Next, composition, motion, web design/a11y, deploy/token, or React Native/Expo subfamilies require `references/vercel-agent-skills-gates.md`; `simplicity-deletability` requires `references/simplicity-deletability-gate.md`; `evidence-contract` requires `references/evidence-contract.md`; repeated Medium/High AI code-quality patterns or known recurring regression classes require `references/regression-library.md`.

Backend-only work must not receive frontend/UI/domain gates unless it affects a rendered user-facing contract, deploy surface, auth/security boundary, data privacy contract, or performance claim. Treat `backend-only` skip reasons as stable review evidence. Record skipped gates and skip reasons explicitly; skipped gates are part of the quality contract, not omitted context.

When gates conflict, use this exact priority: 1 explicit user request, 2 repo/product convention, 3 safety/security/correctness, 4 human readability/deletability, 5 evidence-backed performance/accessibility, 6 generic upstream best practice, 7 named principles/patterns such as SOLID. A domain gate never overwrites a higher-priority item.

## Evidence Contract

Before `plan`, `start`, or `review` claims completion, readiness, approval, deploy safety, performance, UI, security, data, or API behavior, read `references/evidence-contract.md` and include an `Evidence Contract` section alongside the Quality Lens Router output.

Stable section format:

```markdown
## Evidence Contract
- Required evidence:
  - <evidence item>: <why this proves the changed behavior>
- Evidence templates applied:
  - <template name>: <required proof>
- Evidence not applicable:
  - <evidence item>: not-applicable: <reason>
- Blocking evidence gaps:
  - <gap or none>
```

Template families that must be considered when applicable:

- UI/design/frontend: route or screen path, desktop/mobile viewport matrix, rendered DOM or accessibility state, screenshot or visual artifact, fallback/empty/loading/error state evidence, and contract graph evidence for shared dependencies.
- Deploy/release/env: preview or live URL, deployment state, environment/project context, deployed commit or version, and rollback/token-safety evidence when relevant.
- Performance: before/after measurement, focused benchmark or profiling result, dataset/fixture size, threshold or budget, and noise/repeatability note.
- Bugfix/regression: reproduction or failing regression test first, fix evidence, passing regression log, and adjacent edge/error coverage.
- Security/auth/privacy: adversarial cases, auth/authz boundary tests, privacy allowlist/denylist evidence, denied cases, and secret/sensitive-input non-exposure evidence.
- Data/API/backend: actual request/response, query result, schema or contract sample, error response evidence, migration/compatibility evidence, and fixture/source used.

Missing evidence is a High blocking gap when it covers an explicit acceptance criterion, critical user path, PR/deploy readiness, performance claim, security/privacy/auth behavior, data/API contract, or fallback that could hide broken data. Without required evidence, do not conclude `APPROVE`, `ready`, `ready for review`, `ship`, or `merge ready`.

## State Contract

Maintain `.ddalggak/session-state.json` when running multi-lane or multi-step flows. The file should be JSON and should include:

```json
{
  "phase": "commit-lane-integration",
  "base_branch": "origin/master",
  "integration_branch": "feature/single-pr-commit-lanes",
  "integration_pr_url": null,
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
      "integration_commit": null,
      "review": null,
      "blocker": null
    }
  ]
}
```

Use lane states such as `planned`, `briefed`, `implemented`, `validated`, `review_loop_passed`, `integrated`, `single_pr_opened`, `single_pr_review_approved`, and `blocked`. Do not call a lane complete immediately after code-writing.

## Shared Workflow Rules

- Inspect whether work can be split into independent lanes before choosing sequential execution.
- Parallel lanes must not share write surfaces, generated artifacts, branch mutation, or unpublished code dependencies.
- Default PR shape is one base branch and one issue PR per independent issue. Issue PRs are required for independent issues; only conflicting issues use one fallback integration PR with separated issue commits.
- In one shared checkout, serialize branch mutation, push, and PR creation.
- In isolated worktrees, implementation, validation, and issue PR creation may proceed per independent lane. Only hard-conflict lane outputs are integrated into a fallback single PR as separate commits.
- Final issue PR readiness gates and whole-repo verification are serialized unless the user explicitly chooses otherwise.
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
5. Build an issue-PR conflict-fallback plan.
   - Create an `Issue-PR Strategy with Conflict Fallback` before spawning agents: one base branch and one PR per independent issue; use a single PR with issue-separated commits only when conflicts make separate PRs unsafe.
   - Emit a lane matrix with `Lane`, `Issue/scope`, `Boundary`, `Owned files`, `Independent because`, `Must not touch`, `Evidence / validation`, `Commit message`, and `PR shape`.
   - Add a `Parallelization Decision` section: `Parallel issue PRs` have disjoint owned files and no shared runtime flip; `Conflict fallback serial commits` share files/contracts and must be integrated as ordered commits in one PR; `Blocked lanes` depend on open PRs, missing credentials, unclear acceptance criteria, or repo-external state.
   - Conflict-fallback commit groups must name the exact blocking file, contract, ignored/local-only path, repo-external path, or unpublished dependency.
6. Prepare isolated worktrees and choose the correct publish handoff.
   - Branch names must be purpose-centered, such as `docs/pr-quality-and-label-filtering` or `fix/issue-42-pr-quality`, and must not contain dates, timestamps, or generated time suffixes.
   - Independent issue workers complete commit, push, issue PR creation, PR URL, and validation evidence on their own issue branch. Only hard-conflict fallback workers produce patches or local commits for the conductor/integrator to apply to one fallback integration branch.
   - Keep `.worktrees/` local by writing to `.git/info/exclude`, not to the tracked ignore file:

```bash
grep -qxF '.worktrees/' <repo-root>/.git/info/exclude || printf '\n.worktrees/\n' >> <repo-root>/.git/info/exclude
git -C <repo-root> worktree add <repo-root>/.worktrees/<branch-name> -b <branch-name>
```

7. Present the execution plan and ask for confirmation before spawning implementation lanes. The plan must explicitly say `Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it` and show which lanes are parallel, serial, or blocked.
8. Write a brief per lane. Each brief must include:
   - task, issue URL, issue body summary, and issue comments summary;
   - latest comment conflicts or supplements when present;
   - expected outcome, result criteria, and machine-checkable completion signals;
   - Quality Lens Router Output with applicable gate families, skipped gates, and repo/product conventions that outrank generic rules;
   - Evidence Contract from `references/evidence-contract.md`, including required evidence, applied UI/deploy/performance/bugfix/security/data/API templates, explicit `not-applicable: <reason>` items, and blocking evidence gaps;
   - Simplicity / Deletability Gate from `references/simplicity-deletability-gate.md`, including the instruction **small direct change first**, why any proposed abstraction is necessary, whether it clarifies a boundary or removes real repetition, and why SOLID/pattern use does not reduce human readability;
   - for frontend-design work, Frontend Design Gate from `references/frontend-design-gate.md`, including aesthetic direction, main visual idea, typography/color/layout/motion choices, preserved product constraints, generic AI UI patterns avoided, and no forced abstraction for one-off UI changes;
   - for UI/component work, the component methodology gate: main component only assembles; large conditional UI fragments → `ComponentName.parts.tsx`; calculation/format/parse → `ComponentName.utils.ts`; variant/size/style maps use `satisfies Record<...>`; tests prioritize user behavior and public visual-contract classes; no silent fallback; recommended split `ComponentName/ComponentName.tsx`, `ComponentName.types.ts`, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `ComponentName.spec.tsx`, `ComponentName.stories.tsx`, `index.ts` only when the file has a real role, size, or verification need, with no empty companion files;
   - for React/Next, composition, motion, web design/a11y, Vercel deploy/token, or React Native/Expo work, Vercel Agent Skills Gate from `references/vercel-agent-skills-gates.md`, including server/client boundary, unnecessary client component avoidance, hydration/bundle regression avoidance, component API simplification evidence, animation meaning, contrast/focus/keyboard/responsive/empty-loading-error evidence, token source without printing secrets, preview-first deployment, verified URL/env state, list virtualization, animation performance, and platform boundary evidence;
   - when known recurring Medium/High AI code-quality risks are relevant, mention `references/regression-library.md` only where useful and identify class-level risks rather than one-off incident names;
   - repository root, absolute worktree path, branch, base branch, and base freshness result;
   - allowed files, forbidden files, and inspect-only files;
   - shared language, domain terms, deep-module boundaries, and gray-box boundaries;
   - test-first contract when feasible: failing test or expected behavior before implementation;
   - for frontend work, rendered evidence requirements: route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, and contract graph evidence;
   - for frontend work with visual acceptance, screenshot/viewport/manual evidence conditions, including exact routes, desktop/mobile viewport matrix, browser or Storybook checks, and explicit `not-applicable: <reason>` classifications where evidence cannot be collected;
   - missing evidence classification for each unavailable item as `not-applicable: <reason>`, Medium, or High;
   - for analytics or privacy work, an explicit allowlist/denylist contract that excludes raw search terms, prompt titles or bodies, arbitrary user-entered text, email/name/profile identifiers, and full query strings by default;
   - worker implementation quality rules: prefer arrow functions where the repository style allows, keep each unit single-responsibility, isolate pure functions from side effects when practical, use TDD or unit tests for core behavior, and follow the repository's file naming plus companion test/story/helper conventions such as `ABC.styles.tsx`, `ABC.constants.tsx`, `ABC.types.tsx`, and `ABC.parts.tsx` when that pattern fits the codebase;
   - validation commands and success signals;
   - final output requirement: list `Evidence provided`, `Evidence not applicable`, and `Blocking evidence gaps`; if any required evidence is missing, do not claim PR readiness or approval readiness;
   - no-new-dependency rule with proof required before any new import;
   - ignored/local-only handling with `git check-ignore -v <path>` when relevant;
   - requirement to use absolute worktree paths or `git -C <worktree>` for git and file commands;
   - issue-lane metadata: owned files, must-not-touch files, independence reason, lane-specific evidence, and the exact commit message;
   - commit format, draft PR per issue format, and stop conditions;
   - commit and draft PR body requirements: What, Why, Validation, Risk, the lane matrix, and issue references when applicable;
   - completion rule: test pass is insufficient; independent issue lanes require commit, push, issue PR URL, and validation evidence, while hard-conflict fallback lanes require patch/commit, validation, and integration handoff.
9. Use `spawn_agent` for each approved lane and record agent IDs in `.ddalggak/session-state.json`.
10. Integrate lane outputs into the issue PR branch.
   - Use `wait_agent` to collect lane updates, independent issue workers open their own PRs by default; conflicting lanes hand off patches/commits for the fallback PR.
   - Apply only hard-conflict lanes to the fallback integration branch as issue-separated commits; independent lanes publish their own issue PRs.
   - Run the lane's validation before committing and run integration gates between commit groups when shared contracts are affected.
   - If a worker reports only test pass or an idle state, it is not complete. Request the missing patch, validation evidence, or integration handoff with exact commands.
11. Open or update PRs per issue by default; for hard-conflict lanes, open or update one draft fallback PR for the integration branch, then run progressive review on each PR. A lane is not terminal until validation, adversarial review, accepted Critical and High fixes, integration commit, push, and requested publish steps are finished or blocked.

## `review` - Cross-Review Loop

Use for independent PR or local-lane review. Treat review as an AI code quality gate, not a praise pass or summary. The gatekeeper must block bugs, security issues, and long-term maintainability risks. Prefer smaller scope, existing repository patterns, deletable code, explicit ownership, and clear data flow. Treat unnecessary complexity and self-created complexity as defects, including forced modularization, premature abstraction, one-off abstraction, duplicate paths, silent fallback, avoidable local state, client-side boundary patches, and increased type escape. Human readability and deletability outrank SOLID or named pattern application when they conflict.

1. Determine target PRs from arguments or open PR discovery.
2. For each PR, collect a review packet before spawning review:
   - `gh pr view <num> --json title,body,files,commits,baseRefName,headRefName,reviews,statusCheckRollup`
   - `gh pr diff <num>`
   - `gh pr checks <num>` when available; failing CI is Critical unless proven unrelated.
   - issue body and comments, Quality Lens Router Output, Evidence Contract, validation already run, skipped checks, constraints, Review Rubric, AI Code Quality Gate checklist, and commit-lane order context.
   - Counterargument Pass: the reviewer must name weak assumptions, repo convention conflicts, evidence that would disprove readiness, and a smaller or more direct change that could satisfy the issue before concluding `APPROVE` or PR-ready.
   - Simplicity / Deletability Gate notes from `references/simplicity-deletability-gate.md`, including any abstraction necessity claim and any human readability/deletability risk.
   - For UI PRs, Frontend Design Review Gate notes from `references/frontend-design-gate.md`, including design intent, product fit, typography/hierarchy/spacing, palette, layout/grid/alignment/density/responsive behavior, useful performant motion, empty/loading/error states, keyboard/contrast/semantics/reduced motion/focus states, minimal code, and screenshot/viewport/Storybook/browser/manual evidence.
   - For component PRs, component methodology gate notes from `references/frontend-design-gate.md`, including whether main component only assembles, justified `ComponentName.parts.tsx` and `ComponentName.utils.ts` role splits, `satisfies Record<...>` coverage for variant/size/style maps, user behavior plus public visual-contract classes in tests, and no silent fallback for unknown variants, sizes, states, or data shapes.
   - For React/Next, component API, motion, Vercel deployment/token, web design/a11y, or React Native/Expo PRs, Vercel Agent Skills Gate notes from `references/vercel-agent-skills-gates.md`, including React/Next correctness, performance evidence, component API quality, animation meaning, UI/a11y evidence, Vercel deploy safety, and React Native/Expo constraints.
   - Continuous Regression Library notes from `references/regression-library.md` when findings repeat a Medium/High AI code-quality pattern or resemble an existing class such as generic AI UI, unnecessary provider/helper/wrapper, silent fallback, server/client boundary violation, token leakage, screenshot-free UI approval, production deploy without explicit request, overfitted incident rule, test-after instead of TDD, or readability-hostile SOLID/pattern application.
3. For each integrated PR or local lane diff, create a fresh reviewer agent with `spawn_agent`. Do not reuse the author or implementation agent for review, and do not let an agent review its own code.
4. Give the reviewer only the review packet: issue context, diff or PR URL, files changed, validation already run, skipped checks, constraints, commit-lane order context, Review Rubric, and AI Code Quality Gate checklist.
   - Require reviewers to cite CI status as evidence when available, but to focus findings on behavior intent, issue scope, code quality, architecture and domain boundaries, maintainability, and deletability.
   - Require reviewers to compare the PR body, issue criteria, validation, screenshots/logs/responses, and other artifacts against the Evidence Contract. Missing required evidence is a High blocking finding, and review output must not conclude `APPROVE` or PR-ready while a required evidence gap remains.
   - Require reviewers to suggest a **Regression Library Candidate** when a repeated Medium/High pattern is not covered by the Continuous Regression Library. The suggestion must generalize the class-level failure and include a detection signal, blocking review rule, and minimal fixture/evidence idea; do not add transient incidents to memory.
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
- **High**: architecture or domain boundary violation, existing pattern drift that creates a parallel path or changes ownership, data, error, or validation flow, AI-generated complexity that makes the change harder to delete or review, wrong data flow, silent fallback that hides failure, client-side patches that bypass the real server/request/auth/data boundary, excessive scope creep, one-off abstraction by default, abstraction that is hard to delete or modify, SOLID/pattern use that lowers human readability, or tests missing a core contract.
- **Medium**: localized duplicate implementation, naming or ownership confusion, unnecessary local state, increased type escape, inconsistent error handling, or subtle mismatch with existing patterns that does not create a blocking parallel path.
- **Low**: documentation, comments, readability, or follow-up cleanup that does not affect the merge gate.

### REVIEW_BRIEF Requirements

Every REVIEW_BRIEF or review packet must include this AI Code Quality Gate checklist:

- **Scope & Ownership**: Is the diff limited to the issue, owned by the right module, and free of broad refactors or feature creep?
- **Counterargument Pass**: What assumption would make this PR or plan fail? Which existing repository convention could contradict it? What evidence would disprove readiness? What smaller or more direct change would satisfy the issue with less risk?
- **Simplicity & Deletability**: Does the change avoid unnecessary abstraction, forced modularization, duplication, fallback paths, local state, and type escape? Could it be deleted or modified later without surprising callers? Did any new helper/module/provider/wrapper prove that it reduces real repeated code or clarifies a boundary? Is a one-off abstraction being treated as High unless justified? Does human readability stay higher priority than SOLID or named patterns?
- **Existing Patterns**: Does it follow current repository patterns, naming, boundaries, error handling, validation style, and dependency rules instead of inventing a parallel path?
- **Failure Semantics**: Are failures explicit, testable, and observable rather than silently swallowed or converted into misleading success? Do client-side patches avoid masking server/request/auth/data boundary defects, and do auth, redirect, and data-boundary checks use more than mock-only tests?
- **Human Reviewability**: Is the data flow clear, the diff small enough to review, and the contract covered by tests or a concrete validation signal?
- **Rendered Evidence**: For frontend changes, did the PR provide rendered evidence covering route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, and contract graph evidence, or classify each missing item as `not-applicable: <reason>`, Medium, or High?
- **Frontend Design Review Gate**: For UI PRs, does the implementation match the Frontend Design Brief, preserve product-specific constraints over novelty, avoid generic AI/template UI, include design direction plus visual evidence, and avoid one-off wrapper/provider/design-system layers or other forced abstraction?
- **Component methodology gate**: For UI/component PRs, does the main component only assemble, are large conditional UI fragments split to `ComponentName.parts.tsx` only when justified, is calculation/format/parse logic in `ComponentName.utils.ts` when non-trivial, do variant/size/style maps use `satisfies Record<...>` when supported, do tests prioritize user behavior and public visual-contract classes rather than private implementation detail classes, is there no silent fallback for unknown variants/sizes/states, and are empty companion files avoided?
- **Vercel Agent Skills Gate**: For affected PRs, did review check React/Next correctness and performance evidence, component API quality, animation meaning, UI/a11y evidence, Vercel deploy safety, and React Native/Expo constraints? Blocking examples include unnecessary client conversion, one-off compound/context API, decorative transition without continuity or reduced-motion handling, explicit production deploy missing for production mutation, token value printed, and UI review without file/line/screenshot/viewport evidence.
- **Continuous Regression Library**: Does the review compare repeated Medium/High AI code-quality patterns against `references/regression-library.md` and, when a repeated class is missing, suggest a **Regression Library Candidate** with generalized failure class, detection signal, blocking review rule, and minimal fixture/evidence idea instead of storing transient incidents in memory?
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
- Issue-PR Strategy with Conflict Fallback: one base branch and one PR per independent issue, and stacked PRs forbidden unless explicitly requested
- Commit-lane matrix with `Lane`, `Issue/scope`, `Boundary`, `Owned files`, `Independent because`, `Must not touch`, `Evidence / validation`, and `Commit message`
- Parallelization Decision with `Parallel lanes`, `Serial lanes`, and `Blocked lanes`
- Validation commands and success signals
- Completion signals beyond test pass when publish is expected
- Quality Lens Router Output with applicable and skipped gate families
- Evidence Contract with required evidence, applied UI/deploy/performance/bugfix/security/data/API templates, exact artifacts or commands expected when known, and missing-evidence severity rules
- Counterargument Pass with weak assumptions, possible repo convention conflicts, readiness-disproving evidence, and the smaller or more direct change alternative
- Simplicity / Deletability Gate output from `references/simplicity-deletability-gate.md`, including the question "why is this abstraction necessary?", the small direct change alternative, and a human readability/deletability check. State that SOLID does not outrank readability.
- For UI/frontend/design work, a `Frontend Design Brief` from `references/frontend-design-gate.md` before implementation units, covering product/user context, existing design constraints/system, aesthetic direction, memorable visual idea, typography, color/theme, layout/spatial composition, motion/interactions, background/detail, accessibility constraints, and explicit anti-goals.
- For applicable React/Next, composition, view transition/motion, web design/a11y, Vercel deploy/env/token, or React Native/Expo work, a `Vercel Agent Skills Gate` from `references/vercel-agent-skills-gates.md`, covering applicable upstream skill families, product/repo constraints that outrank generic rules, React/Next performance risks, component API/composition risks, animation/motion continuity rule, UI/a11y/design evidence required, Vercel deploy/env/token safety constraints, React Native/mobile constraints, explicit anti-goals, and backend-only skip/lightweight reasons.
- Where recurring Medium/High AI code-quality risks are already known, mention `references/regression-library.md` only where useful in the review checklist and keep the risk generalized to class-level failures.
- Review agent checklist

Do not create issues or edit source files unless the user separately asks outside this subcommand's read-only source-code boundary.

## `issue` - Plan To GitHub Issues

Convert a plan into GitHub issues. Preserve file ownership, hard blockers, issue-PR conflict-fallback strategy, prerequisites, validation, result criteria, and review checklists. Every generated implementation issue must include `Owned files`, `Must not touch`, `Parallelization note`, `Commit lane suggestion`, `Validation/evidence`, and `Dependencies / blocked by`. Parent tracker issues should not be assigned implementation write surfaces; they should contain a child lane table that marks which children can run in parallel, which must be serial commits, and which are blocked. Do not edit repository files.

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
- Forgetting commit-lane order context for same-PR code/docs or follow-up work.
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
- Test pass is distinguished from lane handoff, integration commit, single PR publish, and review completion.
- Reviewer isolation and commit-lane order context were preserved.
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
