# Spark Runtime Goal
Use when: objective acceptance criteria are ready and the user needs a copyable runtime goal sentence.
Required by: `spark`
Side effects: none
Do not use when: acceptance criteria are still vague; use `forge` first.

`spark` writes the final goal sentence that the user can set in a runtime goal mechanism. The agent proposes the sentence; the user or runtime owns the actual goal setting.

## Procedure

1. Read the accepted criteria and preserve every mandatory verification condition.
2. Write one copyable goal sentence that includes scope, forbidden actions, and proof required for completion.
3. Include the exact validation commands/observations and the expected result in the sentence or immediately below it.
4. Add stop conditions: merge, release, publish, deployment, destructive actions, secrets, and external writes remain outside the goal unless explicitly authorized.
5. If the work is sequential, produce one active goal at a time and list later goals as parked follow-ups.

## Output contract

Return:

- Copyable runtime goal sentence
- Validation checklist
- Explicit non-goals / stop conditions
- Next instruction for the user
- `SPARK_DONE`
