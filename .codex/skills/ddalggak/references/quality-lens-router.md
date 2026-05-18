# Quality Lens Router

Use this reference when `ddalggak plan`, `start`, or `review` must decide which quality gates apply to a request, issue, PR, or diff.

The router is intentionally a small predicate table, not a rule engine. It prevents gate over-application by recording both applied and skipped gates with reasons.

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
```

## Gate Families

Use these stable names so future issue-specific gates can plug into the same contract:

| Gate family | Activate when | Skip when |
| --- | --- | --- |
| `frontend-design` | UI, frontend, design, page, component, layout, polish, responsive, screenshot, or frontend primitives are in scope. | Backend/API-only, test-only, or narrow non-visual bugfixes. |
| `vercel-agent-skills` | React, Next.js, component API, animation, Vercel deploy/env/token, React Native, or mobile performance is in scope. | No React/frontend/deploy/mobile surface is touched. |
| `react-next-boundary-performance` | React/Next server-client boundary, data fetching, hydration, caching, bundle, or performance claims are in scope. | Non-React work or documentation-only work with no runtime claim. |
| `composition-api` | Component API, variants, slots, compound components, render props, context, or wrapper abstractions are proposed; require behavior/type tests or concrete usage evidence. | Local one-off rendering with no reusable API change. |
| `motion-meaning` | View transitions, page transitions, shared element motion, enter/exit animation, or list reorder animation is proposed; pair with `frontend-design` and `web-design-a11y-evidence` unless the change is purely internal plumbing. | No animation or only existing motion is preserved. |
| `web-design-a11y-evidence` | UI review, accessibility, keyboard/focus, contrast, responsive behavior, or screenshot/viewport acceptance is relevant. | Non-rendered backend work. |
| `deploy-token-safety` | Vercel deploy, preview URL, production deploy, env vars, project linking, or token CLI usage is in scope. | No deploy or environment mutation occurs. |
| `react-native-expo` | React Native, Expo, native modules, mobile lists, gestures, or device behavior is in scope. | Web-only or backend-only work. |
| `tdd-systematic-debugging` | Bugfix, regression, flaky behavior, incident recovery, or root-cause analysis is requested. | Pure documentation or planning with no code change. |
| `simplicity-deletability` | Any implementation or review may add code, abstractions, helpers, wrappers, providers, fallbacks, or patterns. | Almost never; if skipped, record why the work is read-only. |
| `evidence-contract` | Any work claims completion, readiness, review approval, performance, deploy, UI, security, or data behavior. | Almost never; if skipped, record why no completion claim is being made. |
| `regression-library` | A review finds a repeated Medium/High failure pattern or a retrospective generalizes a failure class. | One-off incident with no generalized detection signal. |

## Priority Order

When gates conflict, judge in this order:

1. Explicit user request.
2. Repository or product convention.
3. Safety, security, and correctness.
4. Human readability and deletability.
5. Evidence-backed performance and accessibility.
6. Generic upstream best practice.
7. Named principles or patterns such as SOLID.

## Required Behavior by Subcommand

- `plan`: include the router output before implementation units so work can be split without hidden gates.
- `start`: include applicable and skipped gates in every worker brief, plus the reason each gate applies or is omitted.
- `review`: include the router output in the review packet so reviewers do not apply UI, deploy, or mobile gates to unrelated backend-only diffs.

## Anti-Overreach Rule

Backend-only work must not receive frontend/UI/domain gates unless the backend change directly affects a rendered user-facing contract, deployment surface, auth/security boundary, data privacy contract, or performance claim.
