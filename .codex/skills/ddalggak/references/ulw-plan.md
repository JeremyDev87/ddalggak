# ULW Plan
Use when: a user wants a decision-complete implementation plan before source edits.
Required by: `ulw-plan`
Side effects: none
Do not use when: the user has authorized implementation now; use `ulw-loop`.

`ulw-plan` turns a goal into a bounded execution plan without editing source files.

## Procedure

1. Read the relevant repo, issue, docs, and evidence surfaces.
2. State the goal, source of truth, non-goals, and forbidden actions.
3. Route intent with `ulw-intent-routing.md`: CLEAR, UNCLEAR, or ON-THE-FENCE; record `review_required` separately.
4. Lock topology: enumerate 1-6 independently succeeding/failing components and trace todos to them.
5. List owned files, must-not-touch files, success criteria, and validation commands.
6. Identify parallel lanes only when write surfaces are independent.
7. Name blockers instead of guessing.
8. End with `ULW_PLAN_DONE`.

## Intent routing summary

See `references/ulw-intent-routing.md` for the ddalggak translation of lazycodex v4.16.0 `ulw-plan` routing.

- **CLEAR**: user knows the outcome; ask only genuine owner-decisions that repo/wiki/source evidence cannot answer.
- **UNCLEAR**: desired outcome is fuzzy; research, adopt defensible best-practice defaults, record assumptions/reversibility, then present the approval brief.
- **ON-THE-FENCE**: ask exactly one highest-leverage question rather than silently choosing.

Topology lock happens before detailed planning: list the 1-6 independent components, dependencies, owned surfaces, and forbidden side effects. Approval gate is `grounding -> brief_presented -> awaiting-approval -> approved` with `scope_changed` looping back to a fresh brief. `review_required` uses `ralplan-critic-consensus.md` / critic review before finalizing.

## Non-goals

Do not import lazycodex `.omo` CLI state, `scaffold-plan.mjs`, Codex teammode, or source-edit authority. Plan-only remains no source edits and no GitHub writes unless a separate ddalggak command explicitly grants them.
