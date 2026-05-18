# Simplicity / Deletability Gate

Use this reference from `plan`, `start`, and `review` whenever a change may add code, structure, abstraction, indirection, or a new pattern.

This gate does not ban abstraction and does not abandon SOLID. It protects human readability, clear boundaries, and future deletion. SOLID and named design patterns are useful tools, but they do not outrank human readability or the ability to modify or delete the change six months later.

## Philosophy

- Prefer the smallest direct change that satisfies the issue and keeps existing domain boundaries intact.
- Structure and boundaries matter more than code volume, but code volume must not pretend to be architecture.
- TDD, Clean Code, SOLID, and patterns are valuable only when they make behavior easier to understand, test, modify, or delete.
- If SOLID or a named pattern makes the code harder for a human maintainer to read, the human-readable design wins.
- Simplicity is not an excuse to collapse real domain, server, request, auth, data, or security boundaries.

## Plan Gate

Before proposing a helper, provider, wrapper, component, module, pattern, interface, registry, fallback, or shared layer, answer:

- Why is this abstraction necessary?
- What existing repetition or unclear boundary does it remove?
- What would the small direct change look like first?
- Can the change be modified or deleted in six months without surprising callers?
- Does it preserve server/request/auth/data ownership instead of masking a boundary problem on the client side?

If these answers are weak, plan the direct change or boundary clarification instead of a new abstraction.

## Start Brief Gate

Every implementation brief should state: **small direct change first**.

Worker instructions should prefer deleting, inlining, or clarifying boundaries before adding helpers, providers, wrappers, fallback branches, or generalized component layers. A new abstraction must include concrete reuse or boundary-clarification evidence in the final output.

## Review Gate

Reviewers should treat the following as blocking targets:

- helper/provider/wrapper/component/module without real reuse or boundary clarification;
- one-off abstraction, default severity: High unless the PR proves a real boundary or repeated-code reduction;
- SOLID or pattern application that lowers human readability;
- code volume pretending to be architecture;
- client-side patch masking server/request/auth/data boundary ownership;
- structure that will be hard to delete or modify in six months.

## Severity Defaults

- High: one-off abstraction; abstraction hard to delete or modify; forced modularization; client-side patch that hides server/request/auth/data boundary defects; pattern use that makes intent materially harder to read.
- Medium: naming or ownership confusion, unnecessary helper/local state/fallback, duplicate path, or subtle readability loss that is easy to reverse.
- Low: comments, naming, or formatting nits that do not affect readability, deletability, or ownership.

## Non-Goals

- Do not ban all abstractions.
- Do not abandon SOLID or patterns when they improve readability and boundaries.
- Do not break domain, server, request, auth, data, security, or API boundaries in the name of simplicity.
