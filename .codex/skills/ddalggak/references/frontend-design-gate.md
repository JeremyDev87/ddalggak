# Frontend Design Gate
Use when: `ddalggak plan`, `ddalggak start`, or `ddalggak review` involves UI, frontend, design, page, component, layout, polish, responsive behavior, dashboard, card, CTA, typography, animation, visual acceptance, or screenshot-sensitive work.
Required by: Quality Lens Router gate family `frontend-design`.
Side effects: none.
Do not use when: the work is backend/API-only, docs-only, infrastructure-only, or a narrow non-visual bugfix with no frontend/design acceptance claim.

Use this reference when `ddalggak plan`, `ddalggak start`, or `ddalggak review` involves UI, frontend, design, page, component, layout, polish, responsive behavior, dashboard, card, CTA, typography, animation, visual acceptance, or screenshot-sensitive work.

Source studied: Anthropic frontend-design skill from the Claude Code repository. This reference summarizes and adapts the ideas for ddalggak; it is not a verbatim copy.

## Activation

Apply this gate when any source signal matches one or more of these surfaces:

- User or issue text mentions UI, frontend, design, page, component, layout, polish, responsive, dashboard, card, CTA, typography, animation, screenshot, or visual acceptance.
- The diff or planned files include `.tsx`, `.jsx`, CSS, Tailwind, design tokens, Storybook, route/page/component files, or shared frontend primitives.
- The product is visually sensitive, including Bokbuk or orbit-dashboard.

Keep the gate lightweight or skip it when the task is backend/API-only, test-only, or a narrow functional bugfix where redesign would expand scope. Record the skip reason in Quality Lens Router Output.

## plan

Frontend Design Brief:

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

## start

Implementation Handoff:

For frontend implementation lanes, the worker brief must require the implementer to restate before coding:

1. the aesthetic direction being executed;
2. the main memorable visual idea;
3. typography, color, layout, and motion choices;
4. preserved product constraints and design-system boundaries;
5. generic AI UI patterns being avoided.

The worker brief must also require screenshot/viewport/manual evidence when visual acceptance criteria are present. Evidence should name route or screen path, viewport matrix, rendered DOM or accessibility state, screenshot or comparable artifact, and manual browser or Storybook checks when automation is unavailable.

Preserve the small direct change first rule. Do not force a new abstraction, wrapper, provider, or design-system layer unless it removes real duplication or clarifies a real boundary.

### Component methodology gate

For UI/component work, treat these rules as a quality gate, worker brief, and review lens for external repositories. They are not instructions to refactor ddalggak itself into a React/UI app.

- main component only assembles: the primary `ComponentName.tsx` should compose props, state, handlers, and child pieces rather than hide large conditional UI or parsing/calculation logic inline.
- large conditional UI fragments → `ComponentName.parts.tsx`: split only when a fragment is large enough that extracting it improves readability or reviewability.
- calculation/format/parse → `ComponentName.utils.ts`: keep pure calculation, formatting, and parsing logic testable outside rendered component assembly when that logic is non-trivial.
- variant/size/style maps use `satisfies Record<...>` where the repository TypeScript version and style allow it, so missing variants fail loudly instead of becoming runtime drift.
- tests prioritize user behavior and public visual-contract classes; avoid locking private implementation detail class names that users or consuming components cannot observe.
- no silent fallback: unknown variant, size, state, or data shape must fail explicitly, be validated, or be surfaced as an intentional error state instead of being quietly coerced to a default.

Recommended naming/role split when a component outgrows a small single-file implementation: `ComponentName/ComponentName.tsx`, `ComponentName.types.ts`, `ComponentName.parts.tsx`, `ComponentName.utils.ts`, `ComponentName.spec.tsx`, `ComponentName.stories.tsx`, and `index.ts`. Create only the files that have a real role, size, or verification need; do not require empty companion files.

## review

Frontend Design Review Gate:

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

For component PRs, also check the component methodology gate: main component only assembles, large conditional UI fragments live in `ComponentName.parts.tsx` when extraction is justified, calculation/format/parse logic moves to `ComponentName.utils.ts` when non-trivial, variant/size/style maps use `satisfies Record<...>` when supported, tests focus on user behavior and public visual-contract classes, and no silent fallback hides unknown variants, sizes, states, or data shapes.

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
