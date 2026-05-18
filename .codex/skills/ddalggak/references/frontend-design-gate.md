# Frontend Design Gate

Use this reference when `ddalggak plan`, `ddalggak start`, or `ddalggak review` involves UI, frontend, design, page, component, layout, polish, responsive behavior, dashboard, card, CTA, typography, animation, visual acceptance, or screenshot-sensitive work.

Source studied: Anthropic frontend-design skill from the Claude Code repository. This reference summarizes and adapts the ideas for ddalggak; it is not a verbatim copy.

## Activation

Apply this gate when any source signal matches one or more of these surfaces:

- User or issue text mentions UI, frontend, design, page, component, layout, polish, responsive, dashboard, card, CTA, typography, animation, screenshot, or visual acceptance.
- The diff or planned files include `.tsx`, `.jsx`, CSS, Tailwind, design tokens, Storybook, route/page/component files, or shared frontend primitives.
- The product is visually sensitive, including Bokbuk or orbit-dashboard.

Keep the gate lightweight or skip it when the task is backend/API-only, test-only, or a narrow functional bugfix where redesign would expand scope. Record the skip reason in Quality Lens Router Output.

## `plan`: Frontend Design Brief

For UI work, the plan must include a `Frontend Design Brief` before implementation units:

- Product/user context.
- Existing product constraints and design system.
- Aesthetic direction.
- Memorable visual idea.
- Typography direction.
- Color/theme direction.
- Layout/spatial composition.
- Motion/interactions.
- Background/detail layer.
- Accessibility constraints.
- Explicit anti-goals.

Anti-goals should prevent generic AI/template layouts, unjustified default typography, purple-gradient/card-grid sameness unless the product requires it, decorative motion that reduces readability or performance, and new wrappers/providers/design-system layers for a one-off visual change.

Product-specific constraints outrank novelty. The brief should preserve existing grid rhythm, breakpoints, density, copy tone, data boundaries, and design conventions unless the issue explicitly asks to change them.

## `start`: Implementation Handoff

For frontend implementation lanes, the worker brief must require the implementer to restate before coding:

1. the aesthetic direction being executed;
2. the main memorable visual idea;
3. typography, color, layout, and motion choices;
4. preserved product constraints and design-system boundaries;
5. generic AI UI patterns being avoided.

The worker brief must also require screenshot/viewport/manual evidence when visual acceptance criteria are present. Evidence should name route or screen path, viewport matrix, rendered DOM or accessibility state, screenshot or comparable artifact, and manual browser or Storybook checks when automation is unavailable.

Preserve the small direct change first rule. Do not force a new abstraction, wrapper, provider, or design-system layer unless it removes real duplication or clarifies a real boundary.

## `review`: Frontend Design Review Gate

For UI PRs, the review packet must include a `Frontend Design Review Gate` that checks:

1. clear design intent and product fit;
2. typography, hierarchy, line-height, spacing, and density;
3. palette and theme fit;
4. layout, grid, alignment, responsive behavior, and product rhythm;
5. useful, performant motion and interaction states;
6. empty, loading, and error states;
7. keyboard access, contrast, semantics, reduced motion, and focus states;
8. minimal, reviewable code with no one-off abstraction;
9. screenshot, viewport, Storybook/browser, or concrete manual evidence.

Blocking examples:

- A polish claim has no design direction or visual evidence.
- The PR uses generic AI/template layout, colors, or fonts with no product-specific reason.
- It adds a one-off wrapper, provider, or design-system layer for a local UI change.
- It breaks existing product grid rhythm, spacing, density, or responsive constraints.
- It lacks screenshot/manual verification for visual acceptance criteria.

Subjective taste alone is not a blocker. Tie findings to the design brief, product constraints, accessibility, responsive behavior, evidence, or simplicity/deletability.

## Product Reminders

- Bokbuk: preserve the warm copy-card motif, grid rhythm, breakpoints, no empty placeholders, and viewport checks.
- orbit-dashboard: preserve dashboard readability, data density, auth/data boundaries, and existing conventions; do not hide server/data boundary problems with client-only UI changes.
