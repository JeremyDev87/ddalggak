# Spark Runtime Goal
Use when: objective acceptance criteria are ready and the user needs a copyable runtime goal sentence.
Required by: `spark`
Side effects: none
Do not use when: acceptance criteria are still vague; use `forge` first.

`spark` writes the final goal sentence the user pins with Claude Code's `/goal` completion-condition feature. The agent only proposes copyable text; it cannot run `/goal` itself (a built-in slash command), so the user owns the actual setting and its timing.

## Procedure

1. Read the accepted criteria and preserve every mandatory verification condition.
2. Write one copyable goal sentence that includes scope, forbidden actions, and proof required for completion.
3. Include the exact validation commands/observations and the expected result in the sentence or immediately below it.
4. Add stop conditions: merge, release, publish, deployment, destructive actions, secrets, and external writes remain outside the goal unless explicitly authorized.
5. If the work is sequential, produce one active goal at a time and list later goals as parked follow-ups.
6. Also draft a `/goal`-ready completion condition for output-only verification. `/goal` is judged each turn by a fast model that reads only the agent's output and never runs commands or reads files, so phrase the condition as "the agent has reported <evidence> in its output" (e.g. "the agent has shown `<command>` output matching <expected>"), never as objective external truth. Objective phrasing either never satisfies or trusts an unverified self-report.
7. Present that condition as a copyable `/goal <condition>` block. The user sets it, and the natural point is on entering `start` (autonomous implementation), not during planning — pinning an implementation goal mid-planning pressures the agent to skip the plan/issue/start gates.

## Output contract

Return:

- Copyable runtime goal sentence
- Validation checklist (human acceptance)
- Copyable `/goal <condition>` block: output-verifiable completion condition, set by the user on `start` entry
- Explicit non-goals / stop conditions
- Next instruction for the user
- `SPARK_DONE`
