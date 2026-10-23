# Simplicity / Deletability Gate
Use when: a proposed change may add structure, abstraction, helper layers, wrappers, registries, or other indirection that affects future readability/deletion.
Required by: `plan`, `start`, `review`; code-shape and architecture judgment.
Side effects: none
Do not use when: the change is metadata-only or a narrow documentation/reporting update that adds no new code shape or abstraction.


Use this reference from `plan`, `start`, and `review` whenever a change may add code, structure, abstraction, indirection, or a new pattern.

This gate does not ban abstraction and does not abandon SOLID. It protects human readability, clear boundaries, and future deletion. SOLID and named design patterns are useful tools, but they do not outrank human readability or the ability to modify or delete the change six months later.

## Philosophy

- Prefer the smallest direct change that satisfies the issue and keeps existing domain boundaries intact.
- Structure and boundaries matter more than code volume, but code volume must not pretend to be architecture.
- TDD, Clean Code, SOLID, and patterns are valuable only when they make behavior easier to understand, test, modify, or delete.
- If SOLID or a named pattern makes the code harder for a human maintainer to read, the human-readable design wins.
- Simplicity is not an excuse to collapse real domain, server, request, auth, data, or security boundaries.

## plan

Plan Gate:

Before proposing a helper, provider, wrapper, component, module, pattern, interface, registry, fallback, or shared layer, answer:

- Why is this abstraction necessary?
- What existing repetition or unclear boundary does it remove?
- What would the small direct change look like first?
- Can the change be modified or deleted in six months without surprising callers?
- Does it preserve server/request/auth/data ownership instead of masking a boundary problem on the client side?

If these answers are weak, plan the direct change or boundary clarification instead of a new abstraction.

## start

Start Brief Gate:

Every implementation brief should state: **small direct change first**.

Worker instructions should prefer deleting, inlining, or clarifying boundaries before adding helpers, providers, wrappers, fallback branches, or generalized component layers. A new abstraction must include concrete reuse or boundary-clarification evidence in the final output.

## review

Review Gate:

Reviewers should investigate the following for concrete impact, not treat their shape alone as a blocking finding:

- helper/provider/wrapper/component/module without real reuse or boundary clarification;
- one-off abstraction that obscures intent without meaningful boundary clarification or repeated-code reduction;
- SOLID or pattern application that lowers human readability;
- code volume pretending to be architecture;
- client-side patch masking server/request/auth/data boundary ownership;
- structure that will be hard to delete or modify in six months.

## Impact-Based Severity

Judge severity from the evidenced failure, affected callers, and consequence under the existing review admission and evidence contracts. A one-off abstraction or forced modularization is not automatically High. A single-use helper that clarifies a real boundary, or side effects at an I/O boundary, may need no change. Readability/deletability concerns need a concrete maintenance consequence; speculative preference alone is not a blocking finding.

## Non-Goals

- Do not ban all abstractions.
- Do not abandon SOLID or patterns when they improve readability and boundaries.
- Do not break domain, server, request, auth, data, security, or API boundaries in the name of simplicity.
