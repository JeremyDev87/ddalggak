# Continuous Regression Library

Use this reference to recognize repeated AI code-quality failure classes across reviews. The library is durable reference material, not session memory. Do not add transient progress, one-off incident details, PR numbers, commit SHAs, or single-session logs here. Promote a new entry only when a repeated Medium/High pattern generalizes across work and has a detection signal, a blocking review rule, and a minimal fixture or evidence idea.

Reviewers should suggest a **Regression Library Candidate** when the same Medium/High pattern appears repeatedly but is not yet represented below. Candidate suggestions belong in review output or a follow-up issue until maintainers choose to promote the class-level pattern to this reference.

## Generic AI UI
- Symptom: A UI change looks polished in isolation but uses generic template layout, vague gradients, stock cards, or non-product-specific copy that does not match the existing product language.
- Generalized failure class: AI-generated visual treatment substitutes broadly plausible UI for product-specific design intent, hierarchy, and constraints.
- Detection signal: Diff adds or rewrites visible surfaces without a design brief, product constraint, route/viewport evidence, or explanation of generic AI/template patterns avoided.
- Blocking review rule: Block UI readiness when visual acceptance depends on generic AI UI and the PR lacks product-specific design direction plus screenshot/manual evidence.
- Minimal fixture/evidence idea: Compare before/after screenshots for the changed route at desktop and mobile widths, annotated with product-specific constraints and avoided template patterns.
- Related gates: Frontend Design Gate; Evidence Contract; Vercel Agent Skills Gate; Quality Lens Router.

## Unnecessary provider/helper/wrapper
- Symptom: The diff adds a provider, helper, wrapper, context, registry, adapter, or module layer for a one-off use or to make a small change look organized.
- Generalized failure class: Self-created indirection increases maintenance cost without proving real reuse, boundary clarification, or deletion safety.
- Detection signal: New abstraction has one caller, mostly forwards arguments, duplicates existing patterns, hides simple control flow, or lacks an answer to why the abstraction is necessary.
- Blocking review rule: Treat one-off abstraction as High unless it proves real repeated use or boundary clarification and remains easier to read, modify, and delete than direct code.
- Minimal fixture/evidence idea: Caller-count evidence, before/after diff-size comparison, and a direct-code alternative showing why the abstraction is or is not necessary.
- Related gates: Simplicity / Deletability Gate; Review Rubric; Quality Lens Router.

## Silent fallback
- Symptom: Errors, missing data, auth failures, API failures, or unsupported states are converted into empty UI, defaults, cached-looking data, success status, or broad catch branches.
- Generalized failure class: Failure semantics are hidden, making broken contracts appear successful and preventing tests or operators from seeing the real defect.
- Detection signal: Broad `catch`, default mapper values, optional chaining chains, fallback components, or empty arrays appear without explicit error state, logging/observability, or regression coverage for the failed path.
- Blocking review rule: Block when a fallback can hide a critical data/API/auth/user-visible failure or when the PR claims readiness without testing the failure path.
- Minimal fixture/evidence idea: Regression test or manual evidence that forces the failed request/data/auth state and verifies an explicit error, denied state, or observable signal.
- Related gates: Evidence Contract; Simplicity / Deletability Gate; Vercel Agent Skills Gate.

## Server/client boundary violation
- Symptom: Client-side code patches over server, request, auth, data, cache, or routing behavior; server-only data leaks into client components; or a component is converted to client mode unnecessarily.
- Generalized failure class: The implementation moves ownership across the server/client boundary instead of fixing the responsible layer.
- Detection signal: New `use client`, browser storage, client redirects, client validation, client fetch duplication, or hydration-prone state appears in a change whose source of truth is server/request/auth/data behavior.
- Blocking review rule: Block boundary patches that bypass the responsible server/request/auth/data layer or increase hydration/bundle risk without evidence-backed necessity.
- Minimal fixture/evidence idea: Boundary test or request/response evidence proving the server-side contract, plus bundle/hydration evidence when a client conversion is unavoidable.
- Related gates: Vercel Agent Skills Gate; Evidence Contract; Simplicity / Deletability Gate.

## Token leakage
- Symptom: Logs, screenshots, command output, PR text, or source changes expose secrets, token values, full environment values, or credential-bearing URLs.
- Generalized failure class: Validation or deployment evidence reveals sensitive credentials instead of proving token source and safety without printing secrets.
- Detection signal: Diff or evidence contains environment variable values, bearer strings, secret-like substrings, full deploy URLs with credentials, or commands that echo secret material.
- Blocking review rule: Critical block for exposed token values or evidence that requires printing secrets; require redaction and secret rotation assessment when exposure is possible.
- Minimal fixture/evidence idea: Redacted command output showing token source, project/env context, and success state without revealing secret values.
- Related gates: Vercel Agent Skills Gate; Evidence Contract; Security/auth/privacy evidence.

## Screenshot-free UI approval
- Symptom: A frontend PR is approved based only on tests, typecheck, code inspection, or story claims despite changing visible UI, responsive behavior, empty/loading/error states, or design acceptance.
- Generalized failure class: Review accepts user-visible UI without rendered evidence.
- Detection signal: Changed `.tsx`, `.jsx`, CSS, route, component, story, or design-token files with no route, viewport, DOM/accessibility, screenshot, or manual evidence and no `not-applicable: <reason>` classification.
- Blocking review rule: No screenshot/manual/rendered evidence, no UI readiness or approval when visual behavior or explicit frontend acceptance is in scope.
- Minimal fixture/evidence idea: Route and viewport matrix with screenshots or browser/Storybook manual notes, including empty/loading/error state coverage when touched.
- Related gates: Evidence Contract; Frontend Design Gate; Vercel Agent Skills Gate.

## Production deploy without explicit request
- Symptom: An agent deploys to production, mutates production env/project state, or instructs production promotion while the request only needed local validation, preview, or draft PR workflow.
- Generalized failure class: Deployment side effects exceed the user's explicit scope and bypass preview-first safety.
- Detection signal: Production deploy commands, promotion flags, env mutations, release tags, package publish, or live URL changes appear without explicit user approval and base/state verification.
- Blocking review rule: Block production deploy or release mutations unless the user explicitly requested them and the evidence shows preview-first validation, target environment, commit/version, and rollback/safety context.
- Minimal fixture/evidence idea: Preview URL and deployment-state evidence first, then explicit approval record and redacted production deploy evidence if production is requested.
- Related gates: Vercel Agent Skills Gate; Evidence Contract; Ship workflow; deploy-token-safety.

## Overfitted incident rule
- Symptom: A review, plan, or skill update converts a single incident into a rule tied to a specific PR, issue, file name, branch, model behavior, or temporary workaround.
- Generalized failure class: Durable knowledge is overfit to one event instead of generalized to a reusable class-level failure pattern.
- Detection signal: Proposed memory/reference text names one-off identifiers, includes session logs, or lacks a broader trigger, detection signal, blocking rule, and fixture/evidence idea.
- Blocking review rule: Do not promote one-off incident records into durable memory or references until the pattern is generalized and repeatable.
- Minimal fixture/evidence idea: Two or more comparable examples summarized without identifiers, plus a proposed class name, detection signal, and review rule.
- Related gates: Continuous Regression Library; Retrospective; Quality Lens Router.

## Test-after instead of TDD
- Symptom: The implementation writes code first and adds tests only after the fact, while the task was a bugfix, regression, contract change, or boundary repair where a failing test could have defined the desired behavior.
- Generalized failure class: Missing test-first evidence lets the fix conform to the implementation rather than proving the intended behavior.
- Detection signal: No failing test, reproduction script, fixture, or expected behavior captured before implementation for a regression/bugfix/core contract change.
- Blocking review rule: For high-risk bugfixes, regressions, auth/data/API boundaries, or explicit TDD requests, block readiness until failing-first or reproduction evidence is provided or a specific not-applicable reason is justified.
- Minimal fixture/evidence idea: Commit/log snippet, test output, or reproduction fixture showing failure before the fix and pass after the fix.
- Related gates: Evidence Contract; tdd-systematic-debugging; Review Rubric.

## Readability-hostile pattern application
- Symptom: The diff invokes SOLID, design patterns, layering, factories, strategies, generics, or inversion of control while making the code harder for humans to read, debug, modify, or delete.
- Generalized failure class: Named principles or patterns are applied as an end in themselves instead of serving repo-local clarity and deletability.
- Detection signal: Increased file count, indirection, generics, inheritance, factories, interfaces, or pattern vocabulary without simpler call flow, clearer ownership, or reduced real repetition.
- Blocking review rule: Block pattern-driven changes when human readability/deletability declines or when SOLID is used to outrank explicit user scope, repo conventions, or a small direct change.
- Minimal fixture/evidence idea: Side-by-side direct implementation sketch, changed-file/caller count, and reviewer trace of how a future maintainer would modify or delete the behavior.
- Related gates: Simplicity / Deletability Gate; Review Rubric; Quality Lens Router.
