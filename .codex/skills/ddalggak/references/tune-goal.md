# Tune Goal Brief
Use when: a user wants a future runtime goal or long-running implementation request aligned before code changes.
Required by: `tune`
Side effects: none
Do not use when: the request already has objective acceptance criteria and only needs final goal wording; use `spark`.

`tune` turns a rough request into a bounded, goal-ready brief without editing repository files.

## Procedure

1. Inspect available repo/task context before asking questions.
2. Restate the one-sentence goal, source of truth, in-scope work, out-of-scope work, forbidden actions, and assumptions.
3. Separate tool capability from task authority: note what could be done versus what the user actually authorized.
4. Name any blocker that prevents a safe goal brief; do not fill missing intent with guesses.
5. End with a compact brief that `forge` can convert into acceptance criteria.

## Output contract

Return:

- Goal brief
- Source of truth
- In scope / out of scope
- Assumptions and open questions
- Validation surfaces already known
- `TUNE_DONE`
