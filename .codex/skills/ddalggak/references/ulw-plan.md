# ULW Plan
Use when: a user wants a decision-complete implementation plan before source edits.
Required by: `ulw-plan`
Side effects: none
Do not use when: the user has authorized implementation now; use `ulw-loop`.

`ulw-plan` turns a goal into a bounded execution plan without editing source files.

## Procedure

1. Read the relevant repo, issue, docs, and evidence surfaces.
2. State the goal, source of truth, non-goals, and forbidden actions.
3. List owned files, must-not-touch files, success criteria, and validation commands.
4. Identify parallel lanes only when write surfaces are independent.
5. Name blockers instead of guessing.
6. End with `ULW_PLAN_DONE`.
