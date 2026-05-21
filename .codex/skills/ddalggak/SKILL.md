---
name: ddalggak
description: "Use when the user wants a Codex App native GitHub issue to implementation to review to recovery workflow, or wants to plan issues, create GitHub issues, inspect status, ship an existing lane, clean up after merge, write retrospectives, improve prompts, or run a one-shot local diff check."
---

# ddalggak - Codex App workflow

Ddalggak is a thin-router skill for one repeated cycle: GitHub Issue -> plan -> parallel implementation -> independent review -> self-healing -> retrospective. The always-loaded `SKILL.md` must stay small enough to route safely; detailed procedure belongs in `references/`, reusable wording belongs in `templates/`, and mechanical regression protection belongs in `scripts/` or future `fixtures/` / `evals/`.

## Subcommands

Supported subcommands are: `start|review|status|plan|issue|clean|ship|retro|prompt|check`.

Standard cycle: `prompt` -> `plan` -> `start` -> `ship` -> `review` -> `retro`. `status`, `issue`, `clean`, and `check` are supporting commands.

## Hot-Path Target Architecture

The hot path is frontmatter, overview, routing invariant, code modification invariant, global non-negotiable guardrails, subcommand dispatch table, required reference map, stop conditions, and verification checklist.

Size budget for this file after #94: target <= 450 lines and <= 35,000 chars. #95 may lower the budget after moving more long-form procedure to references/templates. Any detailed BRIEF, REVIEW, FIX, issue-body, or retrospective template that grows beyond a compact contract should move out of this file.


## Reference And Template Map

The hot path stays compact. Load these files only when the routed subcommand needs low-frequency detail:

| Area | References | Templates |
| --- | --- | --- |
| start | `references/start-workflow.md` | `templates/worker-brief.md`, `templates/conductor-state.md` |
| review | `references/cross-review-loop.md` | `templates/review-brief.md`, `templates/fix-brief.md` |
| plan | `references/issue-ready-plan.md` | - |
| issue | `references/plan-to-issues.md` | `templates/issue-body.md`, `templates/epic-body.md` |
| ship | `references/ship.md` | - |
| clean/status/check/retro/prompt | matching `references/*.md` | as needed |

Progressive disclosure rule: do not paste long BRIEF, REVIEW, FIX, issue, or conductor-state templates back into this always-loaded `SKILL.md`. Keep detailed procedure in `references/` and reusable body shapes in `templates/`.

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

Only `start` and `review` may authorize repository source file edits. All other subcommands are read-only for source code and may only produce their listed artifacts.

| Subcommand | May modify source files | Allowed artifacts |
| --- | --- | --- |
| `start` | yes | worker agents may edit only files named in their brief |
| `review` | yes | author agents may apply accepted review fixes only |
| `prompt` | no | brief artifacts after explicit confirmation |
| `plan` | no | response output only unless the user separately asks to write a plan document |
| `issue` | no | GitHub issues only |
| `status` | no | response output only |
| `check` | no | local review notes only; no repository edits |
| `ship` | no | commit, push, and draft PR for existing changes only |
| `clean` | no | local branch and worktree cleanup only after merge verification |
| `retro` | no | retrospective notes and memory update request artifacts only |

If a non-writing subcommand would need a source edit to continue, report the need and stop.

## Codex App Primitives

Use Codex App native orchestration names in briefs and state records: `spawn_agent`, `send_input`, `wait_agent`, `.ddalggak/session-state.json`, and `request_user_input` when available. The state file is the source of truth for lane IDs, worktree paths, branch names, issue numbers, PR URL/evidence, validation commands, review verdicts, and blockers.

## Global Guardrails

- **Base freshness first**: run `git fetch --prune`; know branch and ahead/behind state before validation, review, ship, or cleanup.
- **URL beats cwd**: parse GitHub owner/repo/number from URL before mutation. GitHub URL handling criteria: issue URL, PR URL, and repo URL target resolution precedes cwd inference; if cwd remote does not match, stop and switch/clone the matching checkout.
- **Issue comments matter**: issue body and comments are both source-of-truth candidates; latest explicit comment wins over stale body text.
- **No implicit dependencies**: prove a dependency already exists before importing it.
- **Manual merge only**: never merge or enable auto-merge unless explicitly asked in the current turn. Green checks plus review only mean ready for manual merge.
- **Approval-comment policy**: when formal approval is inappropriate, leave a top-level PR comment with head SHA, review scope, validation evidence, blocking findings count, and an APPROVE or CHANGES_REQUESTED conclusion.
- **Issue-PRs by default**: do not replace independent issue PRs with stacked PRs or branch matrices. Use one issue PR per independent issue; only hard conflicts may use one PR with separate commits.
- **Runtime contract language**: use Task Scope Contract, Context Assembly Manifest, Resume Snapshot, and Control-flow ownership from references/agent-runtime-contract.md.
- **Task Scope Contract**: distinguish tool capability boundary from task scope contract. Unauthorized files, unrelated cleanup, config/credential/migration changes, destructive actions, external API writes, production data touch, branch mutation, and other out-of-scope diff are scope-expansion failure candidates.
- **Evidence Contract**: references/evidence-contract.md is mandatory before completion, readiness, approval, deploy, performance, UI, security, data, or API claims. Missing Blocking evidence gaps block No evidence, no readiness or approval.
- **Simplicity / Deletability Gate**: references/simplicity-deletability-gate.md is mandatory for code-shape decisions. Start with small direct change first, ask why any proposed abstraction is necessary, treat one-off abstraction skeptically, and keep human readability/deletability above SOLID or named patterns.
- **Counterargument Pass**: before readiness claims, name weak assumptions, repo convention conflicts, evidence that would disprove readiness, and the smaller or more direct change.
- **Quality Lens Router**: Quality Lens Router Output records Applicable gate families, Skipped gates, Required references, lightweight/limited gates, backend-only skip, and Repo/product conventions. Domain gate is a lens, not a mandate.
- **Wiki Context First**: `plan` and `review` must run `references/wiki-context-preflight.md` before final judgment. Search getwiki/LLM Wiki for reusable prior knowledge, repo/product conventions, past failure patterns, and known decisions. Cite wiki paths for wiki-derived claims; if retrieval fails or no relevant source exists, record the evidence gap and continue from live evidence.
- **Frontend Design Gate**: references/frontend-design-gate.md is conditional for visual/frontend work; include Frontend Design Brief and Frontend Design Review Gate only when applicable.
- **Vercel Agent Skills Gate**: references/vercel-agent-skills-gates.md is conditional for React/Next, composition, motion, web design/a11y, deploy/token, or mobile work. Consider react-best-practices, composition-patterns, react-view-transitions, web-design-guidelines, deploy-to-vercel, vercel-cli-with-tokens, and react-native-skills with server/client boundary, unnecessary client component avoidance, hydration/bundle regression avoidance, token source without printing secrets, preview-first, Vercel deploy safety, component API quality, animation meaning, and React Native/Expo constraints.
- **Component methodology gate**: for component work, main component only assembles; split ComponentName.parts.tsx and ComponentName.utils.ts only when justified; use satisfies Record<...> maps where supported; test public visual-contract classes and no silent fallback; do not create empty companion files.
- **Continuous Regression Library**: references/regression-library.md is a durable review reference for repeated Medium/High class-level risks. Suggest Regression Library Candidate only for generalized class-level failure; keep transient incidents in memory out of canonical guidance.
- **Self-created complexity is a defect**: forced modularization, Client-side patches that bypass real boundaries, mock-only tests, and unnecessary helper/provider/wrapper layers are review risks.
- **Evidence is first-class**: rendered evidence includes route evidence, viewport evidence, rendered DOM evidence, screenshot evidence, fallback evidence, and contract graph evidence. Use not-applicable with reasons where skipped.
- **Analytics privacy**: exclude raw search terms, prompt titles, prompt bodies, full query strings, arbitrary text, and personal identifiers unless a privacy allowlist proves otherwise.
- **Retrospective hygiene**: PR numbers, commit SHAs, single-session completion logs, incident records, and durable reusable knowledge are separated; reusable extraction categories include harness-engineering/*, principles/*, frontend/*, and llm-wiki/*.

## Required Reference Map

| Subcommand | Purpose | Required reference rule |
| --- | --- | --- |
| `start` | Issue implementation | references/quality-lens-router.md, references/evidence-contract.md, references/simplicity-deletability-gate.md, references/agent-runtime-contract.md; conditional frontend/vercel/regression references |
| `review` | Independent review/fix loop | references/wiki-context-preflight.md, references/evidence-contract.md, references/simplicity-deletability-gate.md, references/regression-library.md; conditional frontend/vercel references |
| `status` | State snapshot | state file + git/GitHub live state; no extra reference by default |
| `plan` | Issue-ready plan | references/wiki-context-preflight.md, references/quality-lens-router.md, references/evidence-contract.md, references/simplicity-deletability-gate.md; conditional design/deploy/regression references |
| `issue` | Plan to GitHub issues | the plan body; preserve ownership/dependency/evidence fields |
| `clean` | Post-merge cleanup | GitHub PR merge evidence and live git state |
| `ship` | Publish current lane | issue body/comments, local diff, validation evidence, draft PR contract |
| `retro` | Retrospective | references/retrospective-workflow.md |
| `prompt` | Prompt optimizer | prompt/brief artifacts only; source-edit requests stop as meta |
| `check` | Local diff check | references/local-diff-check.md |

## Shared Workflow Rules

- Inspect file ownership before parallelism.
- Parallel lanes must not share write surfaces, generated artifacts, branch mutation, or unpublished dependencies.
- Issue-PR Strategy with Conflict Fallback must state Parallelization Decision and Must not touch files. Independent issues create one PR. Conflicting scopes use one PR with separate commits only when the conflict is proven.
- Integration is not completion: independent issue lanes require commit, push, PR URL/evidence, validation, and review-ready signals.
- Protected default-branch pushes, release tags, package publication, and release-triggering workflows require explicit confirmation.

## `start` - Issue-Based Implementation

Use for implementation from one or more GitHub issues.

Hot-path steps: establish target repo and base freshness; read issue body and comments; run Quality Lens Router Output; map allowed, forbidden, inspect-only, and Must not touch files; apply Evidence Contract and Simplicity / Deletability Gate; choose issue PR or conflict fallback; brief focused workers; verify validation evidence, Integration commit when applicable, and PR CREATE evidence. Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it. Final output must include Evidence provided, Evidence not applicable, and Blocking evidence gaps.

## `review` - Cross-Review Loop

Use for independent PR or local-lane review. Treat review as an AI code quality gate, not a praise pass. Run Wiki Context Preflight first. Review packet includes PR diff/files/checks, issue contract, Wiki Context Manifest, Quality Lens Router Output, Evidence Contract, Diff Footprint / Scope Expansion Review, Counterargument Pass, Simplicity / Deletability Gate, optional Frontend Design Review Gate and Vercel Agent Skills Gate, and Continuous Regression Library notes. Review checks one-off abstraction, human readability, generic AI/template risk, screenshot/manual verification, Vercel deploy safety, component API quality, animation meaning, React Native/Expo constraints, and Regression Library Candidate suggestions when a repeated class is uncovered.

## `status` - Current State Snapshot

Read `.ddalggak/session-state.json` if present, then inspect live git/GitHub state. Report phase, lane states, branches, PRs, blockers, base freshness, and next action. Do not edit files.

## `plan` - Issue-Ready Plan

Write an implementation plan that a low-context worker and reviewer can execute. Run Wiki Context Preflight first and include a Wiki Context Manifest. Include source of truth, non-goals, context anchors, assumptions, work inventory, file ownership, forbidden and inspect-only files, Issue-PR Strategy with Conflict Fallback, PR count: one PR per issue by default, Default PR shape: one PR per issue; conflict fallback only when issue conflicts require it, Parallelization Decision, Must not touch, Evidence / validation, Commit message, Quality Lens Router Output, Evidence Contract, Counterargument Pass, and Simplicity / Deletability Gate with why is this abstraction necessary?. For frontend work include Frontend Design Brief. For applicable Vercel gates include Applicable upstream skill families, React/Next.js performance risks, Explicit anti-goals, and Backend-only skip/lightweight reason. Mention references/regression-library.md only where useful and include Regression Library Candidate checks for class-level risks.

## `issue` - Plan To GitHub Issues

Convert a plan into GitHub issues without editing repository files. Preserve Owned files, Must not touch, Parallelization note, Commit lane suggestion, Validation/evidence, and Dependencies / blocked by.

Issue titles and bodies must be submitted as raw UTF-8, not JSON-escaped text. Before any `gh issue create` or `gh issue edit`, reject or decode titles/bodies containing literal Unicode escapes such as `\\uD558` / `\\ud558`; do not persist those escape sequences to GitHub. Prefer `--body-file` for Markdown bodies, and for non-ASCII titles prefer a UTF-8 REST payload written with `json.dumps(..., ensure_ascii=False)` via `gh api --input`. After creation, re-read `gh issue view --json title,body,url` and verify the live title contains Korean characters, not literal `\\uXXXX` sequences.

## `ship` - Publish Current Lane

Ship only existing changes. Confirm scope, re-read issue context, fetch, validate, locally review where feasible, stage intended files, commit with What and Why, push, open a draft PR, verify PR existence, and keep it draft until current-head checks and review evidence support ready for manual merge.

## `clean` - Post-Merge Cleanup

Verify live PR merge evidence first, fetch, inspect dirty state, then clean only safe local branches/worktrees/state artifacts. Stop on uncommitted work or contradictory live state.

## `retro` - Retrospective

After merge, summarize the cycle and extract reusable lessons without storing transient PR numbers or commit SHAs as memory. Use references/retrospective-workflow.md for low-frequency details.

## `prompt` - Prompt Optimizer

Audit or improve brief artifacts only. If the request changes skill behavior or repository source, stop and require a normal repo edit outside this subcommand.

## `check` - Local Diff Check

Run a read-only local diff review. Capture base freshness, status, diff stat, ignored/local-only/generated paths, and findings. Use references/local-diff-check.md for details.

## Review Gate Contract

Normal finish pipeline: local validation, publish evidence when requested, fresh adversarial review, triage, accepted Critical/High fixes, revalidation, and top-level review comment when formal approval is inappropriate. Return gate_result, blocking_summary, next_action, and lane_completion_state.

## Common Pitfalls

Stale repo state; missing issue comments; hallucinated dependencies; unsafe force-push loops; equating test pass with completion; reviewing inside an implementation worktree; staging ignored/local-only files; over-fixing Medium findings; Markdown surgery that loses fenced blocks or routing; frontend approval without rendered evidence; analytics without privacy allowlist/denylist.

## Verification Checklist

- Base freshness and ahead/behind state known.
- Issue body and comments inspected.
- Allowed, forbidden, inspect-only, and Must not touch files explicit.
- New dependencies avoided or proven.
- Subagent side effects rechecked with git/GitHub.
- Tests distinguished from commit, push, PR, and review completion.
- Markdown edits preserve frontmatter, routing, code permissions, headings, fences, and numbering.
- Evidence Contract, Simplicity / Deletability Gate, and relevant conditional references applied or skipped with reasons.

## Stop Conditions

Stop when source edits fall outside the routed subcommand, a lane needs files outside its allowed list, a hard blocker would force an unauthorized topology, validation mutates unexpectedly, release/publish automation lacks explicit confirmation, state contradicts live git/GitHub, base freshness cannot be established, the issue is fundamentally thin, or the target is ignored/local-only/repo-external and cannot be represented safely in PR workflow.

## Reference Contract Summary

The following compact contract keeps hot-path guardrails operational while detailed procedure moves to references/templates/scripts. Each item is a required review or routing concept, not a standalone checklist to satisfy mechanically:

- URL beats cwd
- GitHub URL handling criteria
- owner/repo/number
- cwd remote does not match
- Task Scope Contract
- Context Assembly Manifest
- Resume Snapshot
- Control-flow ownership
- Runtime contract language
- Small focused workers, explicit orchestration
- tool capability boundary
- task scope contract
- out-of-scope diff
- scope-expansion failure
- Diff Footprint / Scope Expansion Review
- knowledge extraction
- harness-engineering/*
- principles/*
- frontend/*
- llm-wiki/*
- rendered evidence
- route evidence
- viewport evidence
- rendered DOM evidence
- screenshot evidence
- fallback evidence
- contract graph evidence
- not-applicable
- Analytics privacy
- raw search terms
- prompt titles
- full query strings
- Transitive rendered fallback
- PR numbers
- commit SHAs
- single-session completion logs
- incident records
- durable reusable knowledge
- Self-created complexity is a defect
- forced modularization
- Client-side patches
- mock-only tests
- Quality Lens Router
- Quality Lens Router Output
- Applicable gate families
- Skipped gates
- Required references
- Domain gate is a lens, not a mandate
- backend-only skip
- Repo/product conventions
- frontend-design
- backend-only
- Evidence Contract
- references/evidence-contract.md
- Blocking evidence gaps
- No evidence, no readiness or approval
- Counterargument Pass
- weak assumptions
- evidence that would disprove readiness
- smaller or more direct change
- Simplicity / Deletability Gate
- references/simplicity-deletability-gate.md
- Frontend Design Gate
- references/frontend-design-gate.md
- Frontend Design Brief
- Frontend Design Review Gate
- Vercel Agent Skills Gate
- references/vercel-agent-skills-gates.md
- react-best-practices
- composition-patterns
- react-view-transitions
- web-design-guidelines
- deploy-to-vercel
- vercel-cli-with-tokens
- react-native-skills
- server/client boundary
- unnecessary client component avoidance
- hydration/bundle regression avoidance
- token source without printing secrets
- preview-first
- Vercel deploy safety
- component API quality
- animation meaning
- React Native/Expo constraints
- small direct change first
- why any proposed abstraction is necessary
- one-off abstraction
- human readability
- SOLID
- Continuous Regression Library
- references/regression-library.md
- Regression Library Candidate
- class-level risks
- transient incidents in memory
- Manual merge only
- auto-merge
- ready for manual merge
- Approval-comment policy
- top-level PR comment
- head SHA
- review scope
- validation evidence
- blocking findings count
- Issue-PRs by default
- do not replace independent issue PRs
- one issue PR per independent issue
- Issue PRs are required for independent issues
- rescue the missing issue PR creation
- Issue-PR Strategy with Conflict Fallback
- Parallelization Decision
- Must not touch
- one PR
- separate commits
- Component methodology gate
- main component only assembles
- ComponentName.parts.tsx
- ComponentName.utils.ts
- satisfies Record<...>
- public visual-contract classes
- no silent fallback
- empty companion files
