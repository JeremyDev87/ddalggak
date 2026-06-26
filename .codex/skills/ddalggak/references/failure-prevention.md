# Failure Prevention Reference
Use when: ddalggak work needs guardrails against stale state, unsafe writes, duplicate PRs, or invalid readiness/completion claims.
Required by: plan, start, review, ship, status.
Side effects: none.
Do not use when: a narrower gate fully covers the risk and no shared failure-prevention rule applies.

Guard against stale repo judgments, hallucinated dependencies, unsafe force pushes, ignored/local-only file inclusion, Markdown surgery regressions, missing handoff evidence, and duplicate PRs.

## Prerequisite and overlap waiting rule

Treat these as missing readiness / ordering input, not automation-rule rejection:

- an unmerged prerequisite PR/issue must land on the default branch before scope is stable;
- an overlapping verifier surface or another open automation PR can change the same contract;
- a human standard/decision is missing, so acceptance criteria or validation evidence cannot be safely fixed.

Do not create a branch or PR in that state. Dobby schedulers should leave one deduped Korean needs-info/waiting comment and must not mislabel it as `dobby:rejected`. Re-evaluate only after a newer human body/comment supplies the decision or prerequisite evidence.
