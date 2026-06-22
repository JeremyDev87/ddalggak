# Forge Acceptance Criteria
Use when: a tuned goal brief needs objective acceptance criteria before a runtime goal sentence is written.
Required by: `forge`
Side effects: none
Do not use when: the user asked to implement; forge only writes criteria, not code.

`forge` converts “done” into checks that a human or runtime can judge without taste-based interpretation.

## Procedure

1. Read the tuned brief and extract every promised done condition.
2. Convert each condition into either a command with expected exit/output, or a direct observation with expected state.
3. Split mixed conditions until each criterion has one reason to pass or fail.
4. Reject vague criteria such as “clean”, “good”, or “works well” unless they are backed by observable evidence.
5. Mark gaps explicitly when no command or observation can prove a condition yet.

## Output contract

Return:

- Acceptance criteria table: condition, verification command/observation, expected result
- Coverage notes for in-scope items not yet verifiable
- Out-of-scope criteria removed
- `FORGE_DONE`
