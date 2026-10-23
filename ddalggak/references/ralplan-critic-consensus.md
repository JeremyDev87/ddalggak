# RALPLAN Critic Consensus
Use when: plan/review must choose a plan, PR topology, or approval/changes-requested verdict.
Required by: plan, ulw-plan, gjc-plan, review
Side effects: none
Do not use when: the command only reports status/check output without making a readiness or review verdict.


Before finalizing a plan, obtain an actual result from one fresh independent critic session/context, separate from the author. Self-review or writing multiple viewpoints in the author session does not satisfy this gate. Give the critic the original request, source materials, exact reviewed plan version/digest, `references/quality-lens-router.md` criteria, and forbidden actions; do not supply the parent verdict, expected findings, or an answer key. The critic checks requirements, the smallest alternative, responsibility/permission boundaries, side effects, affected callers, and proposed validation. This is read-only planning review, not implementation authority.

Record the actual critic identity/session, reviewed version, and findings or an explicit no-findings result with coverage. The parent rechecks candidate findings against source evidence and counterexamples, records adoption/rejection reasons, and reconciles residual dissent. Changed content invalidates affected critic evidence; obtain a current result before completion. Existing high-risk zero-finding challenger requirements still apply; they are not replaced by this gate.

Required output block:

```md
## RALPLAN Critic Consensus
- Proposer Pass: <intended plan/verdict and why>
- Critic Identity / Session: <actual independent reviewer and session identifier>
- Reviewed Version: <plan path/version and content digest>
- Critic Result: <actual result artifact or returned result; findings or no-findings with coverage>
- Critic Pass: <counterexample, missing evidence, or simpler alternative>
- Parent Reconciliation: <source/counterexample recheck and adoption/rejection reasons>
- Counterexample Search: <most likely failure mode>
- Consensus Decision: ACCEPT | NARROW | REWORK
- Change After Critic: <one concrete change, or evidence-backed no-change reason>
- Residual Dissent: <none, or severity + unresolved risk>
```

Fail-closed rules:

- Missing/unavailable critic, absent result, stale/mismatched version, or missing parent reconciliation is an evidence gap: do not emit `PLAN_DONE`, `ULW_PLAN_DONE`, `GJC_PLAN_DONE`, or claim independent review completion.
- A Critical/High unresolved critic finding blocks those plan completion signals, `ISSUE_PR_READY`, and `approve`.
- Unresolved dissent without live evidence becomes an evidence gap, not a caveat-level approval.
- Prefer `NARROW` over broad abstractions when the simpler deletion/subtraction path satisfies the issue.
