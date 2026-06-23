---
Use when: plan/review must choose a plan, PR topology, or approval/changes-requested verdict.
Required by: plan, review
Side effects: none
Do not use when: the command only reports status/check output without making a readiness or review verdict.
---

# RALPLAN Critic Consensus

Run a compact second-pass critic before final readiness or review verdicts.

Required output block:

```md
## RALPLAN Critic Consensus
- Proposer Pass: <intended plan/verdict and why>
- Critic Pass: <counterexample, missing evidence, or simpler alternative>
- Counterexample Search: <most likely failure mode>
- Consensus Decision: ACCEPT | NARROW | REWORK
- Change After Critic: <one concrete change, or evidence-backed no-change reason>
- Residual Dissent: <none, or severity + unresolved risk>
```

Fail-closed rules:

- A Critical/High unresolved critic finding blocks `PLAN_DONE`, `ISSUE_PR_READY`, and `approve`.
- Unresolved dissent without live evidence becomes an evidence gap, not a caveat-level approval.
- Prefer `NARROW` over broad abstractions when the simpler deletion/subtraction path satisfies the issue.
