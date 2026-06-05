# React Code Quality Harness

Use when: `ddalggak plan`, `start`, or `review` touches React/Next.js code quality, AI-generated React diffs, shared components, hooks/effects, state/fallback behavior, rendered UI evidence, or frontend performance boundaries.
Required by: Quality Lens Router gate family `react-code-quality-harness`.
Side effects: none.
Do not use when: backend-only, docs-only, non-React, deploy-only, or test-only work has no rendered/runtime React quality claim.

This reference is the packaged ddalggak SSOT for React code-quality routing. Keep the always-loaded skill hot path as a pointer; do not copy this gate list into `SKILL.md`.

## Definition

React code quality means code that is readable, predictable, cohesive, weakly coupled, scoped to clear component responsibilities, stable across hook/effect execution, explicit at type/runtime boundaries, and backed by actual rendered evidence when UI behavior is claimed.

## Gate order and verdicts

Use `PASS`, `FAIL`, `NEEDS_EVIDENCE`, or `N_A` for each applicable gate.

| # | Gate | Apply when |
|---|---|---|
| 1 | Readability | The diff changes JSX structure, branching, naming, formatter/model mapping, or component decomposition. |
| 2 | Predictability | Same input/state must produce stable UI, state transitions, return shape, and fallback behavior. |
| 3 | Cohesion | UI, state, formatter, validation, policy, or tests that change together may be scattered or over-grouped. |
| 4 | Coupling | The diff adds prop drilling, broad context/global state, private imports, shared component leakage, or brittle parent-child knowledge. |
| 5 | Component responsibility | A component may be mixing fetch, transform, policy, mutation, rendering, analytics, and fallback ownership. |
| 6 | Hook/effect stability | The diff changes dependency arrays, derived state, memoization, cleanup, async effects, or closure-sensitive logic. |
| 7 | Type/runtime boundary | UI data crosses API/query/storage boundaries, nullable/optional fields, unsafe casts, mapper defaults, or discriminated states. |
| 8 | Rendered evidence | The change claims UI behavior, route behavior, a11y semantics, screenshot/viewport, DOM, or visual smoke readiness. |
| 9 | Empty/error/fallback state | Loading, empty, failed query, auth/permission, missing asset, partial response, or retry/recovery state is in scope. |
| 10 | Rendering/performance boundary | SSR/RSC/CSR, Suspense/ErrorBoundary, hydration, bundle, dynamic import, caching, prefetch, LCP/INP, or client promotion is in scope. |

## Minimal evidence bundle

For each applicable gate, cite the smallest concrete evidence available:

- file/path and relevant symbol or line range;
- route/component/hook affected;
- test, lint, typecheck, or build output when available;
- rendered route, DOM query, screenshot, viewport, or a11y role/name evidence when UI readiness is claimed;
- explicit reason for `N_A` or `NEEDS_EVIDENCE`.

## ddalggak integration

1. Add `react-code-quality-harness` to `Quality Lens Router Output > Applicable gate families` with the concrete reason.
2. Add `references/react-code-quality-harness.md` to `Required references`.
3. Apply only the gates touched by the diff; do not run all ten as heavyweight checks for unrelated work.
4. Treat `FAIL` or blocking `NEEDS_EVIDENCE` as a PR-ready/APPROVE blocker when the changed surface requires rendered/runtime evidence.
5. Keep Evidence Contract authoritative: React harness PASS does not replace current-head CI, issue scope checks, validation commands, or manual-merge boundaries.

## Report addendum

```md
### React Code Quality Harness
| Gate | 판정 | Evidence | Blocker |
|---|---|---|---|
| 가독성 | PASS/FAIL/NEEDS_EVIDENCE/N_A | <file/line/route/test/screenshot> | yes/no |
```
