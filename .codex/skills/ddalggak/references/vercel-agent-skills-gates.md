# Vercel Agent Skills Quality Gates

Use this reference when `ddalggak plan`, `ddalggak start`, or `ddalggak review` involves React, Next.js, frontend architecture, Vercel deployment, React Native/Expo, animations, or UI/web design review.

Source studied: Vercel Labs `agent-skills/skills` at `https://github.com/vercel-labs/agent-skills/tree/main/skills`.

This file intentionally summarizes and transforms the workflow principles instead of copying upstream skills verbatim.

## Skill Families Observed

- `react-best-practices`: React/Next.js performance and maintainability rules, including components, pages, data fetching, bundle optimization, and performance reviews.
- `composition-patterns`: React component API design and composition patterns to avoid boolean prop proliferation and keep reusable component APIs maintainable.
- `react-view-transitions`: Native-feeling UI transitions using React/View Transition primitives; every animation must communicate continuity or state change.
- `web-design-guidelines`: UI/a11y/UX review workflow that checks concrete files and reports terse evidence-backed findings.
- `deploy-to-vercel`: Preview-first deployment workflow; gather git/link/project state before deciding deployment method.
- `vercel-cli-with-tokens`: Token-based Vercel CLI workflow; locate token safely, avoid interactive login dependency, and manage env/deploy operations with explicit token source.
- `react-native-skills`: React Native/Expo best practices for mobile performance, lists, animations, UI patterns, and native/platform APIs.

## Activation

Apply one or more gates when the repo or issue indicates:

- React/Next.js component/page/data-fetching/performance work.
- Component library/API/refactor work involving booleans, variants, slots, compound components, render props, or context providers. Require behavior/type tests or concrete usage evidence when the API changes.
- UI animation, page transition, shared element transition, list reorder, enter/exit animation, or native-feeling motion. Treat this as UI work too: pair motion meaning with the frontend design/a11y evidence gate unless the change is purely internal plumbing.
- UI review, accessibility, UX audit, design quality, or screenshot/viewport acceptance criteria.
- Vercel deployment, preview URL, production deploy, environment variables, project linking, or token-based CLI use.
- React Native/Expo/mobile performance, native module, platform API, or device-specific behavior.

Skip or keep lightweight for backend-only code with no frontend, deployment, or mobile surface.

## `ddalggak plan` Requirements

For applicable work, add a compact `Vercel Agent Skills Gate` section to the plan:

```markdown
## Vercel Agent Skills Gate
- Applicable upstream skill families:
- Product/repo constraints that outrank generic rules:
- React/Next.js performance risks:
- Component API/composition risks:
- Animation/motion continuity rule:
- UI/a11y/design evidence required:
- Vercel deploy/env/token safety constraints:
- React Native/mobile constraints:
- Explicit anti-goals:
```

Planning rules:

- Existing repo conventions and product constraints outrank generic best-practice imports.
- Do not add abstractions merely because a pattern exists. Use composition patterns only when they reduce real boolean-prop explosion, duplication, or unclear API ownership.
- For React/Next.js performance work, require evidence: current data-fetching path, client/server boundary, bundle/load/perf symptom, and validation command or measurement.
- For animations, require the worker to articulate what the transition communicates. If it communicates nothing, do not add it.
- For Vercel deploy work, default to preview deploy unless the user explicitly requests production; always gather git remote, existing Vercel link, package manager/build command, and token/project state before mutating deploy state.
- For React Native/Expo work, record list virtualization, JS thread pressure, animation performance, native module boundary, and platform API risks before implementation.

## `ddalggak start` Handoff Additions

Implementation briefs should include the applicable gate bullets:

- React/Next.js: preserve server/client boundaries, avoid unnecessary client components, avoid hydration/bundle regressions, and add tests or measurement where possible.
- Composition: justify any compound component, render prop, context provider, slot API, or variant split with real API simplification. Otherwise keep the change direct.
- View transitions: state the spatial/continuity meaning before coding; prefer graceful no-op in unsupported browsers; do not animate for decoration alone; include reduced-motion handling when user-visible.
- Web design/a11y: include contrast/focus/keyboard/responsive/empty-loading-error state evidence when visual behavior changes.
- Vercel deploy/token: identify token source without printing secrets; preview-first; verify live deployment URL or env state after mutation; record verified URL/env state; require explicit production deploy intent before production mutation.
- React Native/Expo: optimize lists/animations/platform boundaries with mobile performance evidence, including list virtualization, animation performance, and platform boundary evidence.

## `ddalggak review` Gate

For affected PRs, reviewers must check:

1. React/Next.js correctness: server/client boundary, data fetching ownership, Suspense/cache behavior, hydration risk, bundle growth, and route/page conventions.
2. Performance evidence: whether the PR measures or at least validates the claimed improvement; no silent fallback that hides failure.
3. Component API quality: no boolean prop proliferation, no over-generalized API, no context/provider when local composition is clearer, no wrapper for one-off style organization.
4. Animation meaning: every transition communicates continuity/state/identity; no decorative motion that hurts readability, accessibility, or performance.
5. UI/a11y evidence: screenshots/viewport checks, keyboard/focus, contrast, semantics, reduced motion, empty/loading/error states.
6. Vercel deploy safety: preview vs production intent, token secrecy, env var scope, project link correctness, deployment URL verification.
7. React Native/Expo: list virtualization, JS thread pressure, native module/platform constraints, animation performance, and device-specific behavior.

Blocking examples:

- A PR converts server-renderable code to client code without need.
- A component refactor introduces a compound/context API for one call site.
- A transition is added because it looks polished but has no continuity meaning or reduced-motion handling.
- A deployment task prints token values, mutates production without explicit request, or reports a URL without verifying it.
- A UI review lacks concrete file/line/screenshot/viewport evidence.

## Relationship to Existing ddalggak Gates

This reference complements, not replaces:

- `frontend-design-gate.md` for distinctive, non-generic UI direction.
- existing self-created complexity rules for minimal, deletable code.
- repo-specific rules such as Bokbuk grid/motif and orbit-dashboard data/auth boundaries.

When gates conflict, prefer: explicit user request > repo/product convention > safety/security > performance evidence > generic upstream pattern.
