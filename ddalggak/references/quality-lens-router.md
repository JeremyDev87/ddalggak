# Quality Lens Router
Use when: `plan`, `start`, or `review` must decide which quality gates apply and which gates are explicitly skipped for the current issue, PR, or diff.
Required by: `plan`, `start`, `review`; gate-family routing.
Side effects: none
Do not use when: the command is purely `status`, `clean`, `ship`, `check`, or issue metadata work with no quality-gate decision.


Use this reference when `ddalggak plan`, `start`, or `review` must decide which quality gates apply to a request, issue, PR, or diff.

The router is intentionally a small predicate table, not a rule engine. It prevents gate over-application by recording both applied and skipped gates with reasons. Domain gate is a lens, not a mandate: a routed gate adds focused questions and required references only for the surfaces it actually touches, and it must not overwrite explicit user scope or repository/product convention. The Gate Families table is a routing digest; verifier-owned activation keyword contracts keep its `Activate when` cells aligned with each gate reference's `## Activation` section so a router summary cannot silently drift from the detailed gate.

## Inputs

Inspect all available signals before selecting gates:

- user request text;
- GitHub issue body and comments;
- PR file list;
- diff paths and changed symbols;
- repository and product conventions that outrank generic rules.

## Router Output Contract

Every routed plan, implementation brief, or review packet should include:

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

If a gate is skipped, keep it in `Skipped gates` with a concrete reason such as `backend-only: no rendered, deploy, mobile, auth/security, data privacy, or performance surface`. Skipped gates are review evidence, not missing context.

## Domain Gate Integration Rule

`plan`, `start`, and `review` must use the router output to decide which domain gates are included:

- Include only applicable gate families and the required reference files for those families.
- Keep applicable gates scoped to the changed surface; use lightweight gates when only one subfamily applies.
- Do not copy every UI/deploy/mobile checklist into unrelated work.
- Do not let a domain gate overwrite repo convention, product direction, explicit file ownership, or user-requested non-goals.
- Backend-only work must record frontend/UI/deploy/mobile gates as skipped unless it affects a rendered user-facing contract, deploy surface, auth/security boundary, data privacy contract, or evidence-backed performance claim.

## Gate Families

Use these stable names so future issue-specific gates can plug into the same contract:

| Gate family | Activate when | Skip when |
| --- | --- | --- |
| `frontend-design` | UI, frontend, design, page, component, layout, polish, responsive, screenshot, or frontend primitives are in scope. | Backend/API-only, test-only, or narrow non-visual bugfixes. |
| `react-code-quality-harness` | React/Next.js code quality, AI-generated React diff review, component responsibility, hooks/effects, state/fallback behavior, runtime UI type boundary, rendered evidence, or React rendering/performance boundary is in scope. | Non-React work, backend/API-only work with no rendered contract, docs-only work with no runtime/frontend quality claim, or tests unrelated to React behavior. |
| `vercel-agent-skills` | React, Next.js, component API, animation, Vercel deploy/env/token, React Native, or mobile performance is in scope. | No React/frontend/deploy/mobile surface is touched. |
| `react-next-boundary-performance` | React/Next server-client boundary, data fetching, hydration, caching, bundle, or performance claims are in scope. | Non-React work or documentation-only work with no runtime claim. |
| `composition-api` | Component API, variants, slots, compound components, render props, context, wrapper abstractions, or component methodology gate concerns are proposed; require behavior/type tests or concrete usage evidence. For UI/component work, route the worker and review packet to the `frontend-design` component methodology gate covering main component only assembles, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `satisfies Record<...>`, public visual-contract tests, and no silent fallback. | Local one-off rendering with no reusable API change. |
| `motion-meaning` | View transitions, page transitions, shared element motion, enter/exit animation, or list reorder animation is proposed; pair with `frontend-design` and `web-design-a11y-evidence` unless the change is purely internal plumbing. | No animation or only existing motion is preserved. |
| `web-design-a11y-evidence` | UI review, accessibility, keyboard/focus, contrast, responsive behavior, or screenshot/viewport acceptance is relevant. | Non-rendered backend work. |
| `deploy-token-safety` | Vercel deploy, preview URL, production deploy, env vars, project linking, or token CLI usage is in scope. | No deploy or environment mutation occurs. |
| `react-native-expo` | React Native, Expo, native modules, mobile lists, gestures, or device behavior is in scope. | Web-only or backend-only work. |
| `tdd-systematic-debugging` | Bugfix, regression, flaky behavior, incident recovery, or root-cause analysis is requested. | Pure documentation or planning with no code change. |
| `simplicity-deletability` | Any implementation or review may add code, abstractions, helpers, wrappers, providers, fallbacks, or patterns. | Almost never; if skipped, record why the work is read-only. |
| `evidence-contract` | Any work claims completion, readiness, review approval, performance, deploy, UI, security, or data behavior. | Almost never; if skipped, record why no completion claim is being made. |
| `regression-library` | A review finds a repeated Medium/High failure pattern or a retrospective generalizes a failure class. | One-off incident with no generalized detection signal. |

## Required Reference Mapping

After choosing applicable gate families, attach only the matching references:

| Applicable gate family | Required reference |
| --- | --- |
| `frontend-design` | `references/frontend-design-gate.md` |
| `react-code-quality-harness` | `references/react-code-quality-harness.md` |
| `vercel-agent-skills`, `react-next-boundary-performance`, `composition-api`, `motion-meaning`, `web-design-a11y-evidence`, `deploy-token-safety`, `react-native-expo` | `references/vercel-agent-skills-gates.md` |
| `simplicity-deletability` | `references/simplicity-deletability-gate.md` |
| `evidence-contract` | `references/evidence-contract.md` |
| `regression-library` | `references/regression-library.md` |

`tdd-systematic-debugging` currently routes to the Evidence Contract bugfix/regression template and existing repository testing/debugging conventions. `regression-library` applies only when a review finds a repeated Medium/High pattern or a retrospective generalizes a failure class; one-off incidents without a generalized detection signal stay skipped.

`react-code-quality-harness` routes to the React Code Quality Harness reference. It uses `PASS`, `FAIL`, `NEEDS_EVIDENCE`, or `N_A` verdicts and includes Rendered evidence plus Rendering/performance boundary checks only when those surfaces are actually in scope.

## Priority Order

When gates conflict, judge in this order:

1. Explicit user request.
2. Repository or product convention.
3. Safety, security, and correctness.
4. Human readability and deletability.
5. Evidence-backed performance and accessibility.
6. Generic upstream best practice.
7. Named principles or patterns such as SOLID.

This priority is exact. For example, generic upstream React, design, Vercel, or mobile guidance cannot override repo/product conventions; SOLID or named patterns cannot override human readability/deletability; evidence-backed accessibility or performance can outrank generic upstream best practice when the claim is in scope.

## Required Behavior by Subcommand

- `plan`: include the router output before implementation units so work can be split without hidden gates; list applicable gates, skipped gates, required references, repo/product conventions, and any lightweight gate limits.
- `start`: include applicable and skipped gates in every worker brief, plus the reason each gate applies or is omitted, the required references each worker must read, and any backend-only skip reason.
- `review`: include the router output in the review packet so reviewers do not apply UI, deploy, or mobile gates to unrelated backend-only diffs. Reviewers should treat a domain gate as a lens and inspect only the applicable bullets.

## Anti-Overreach Rule

Backend-only work must not receive frontend/UI/domain gates unless the backend change directly affects a rendered user-facing contract, deployment surface, auth/security boundary, data privacy contract, or performance claim.
