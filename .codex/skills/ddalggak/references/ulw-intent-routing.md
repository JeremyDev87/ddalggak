# ULW Intent Routing
Use when: `ulw-plan` must decide whether to ask the owner, adopt defaults, lock topology, or wait for approval before writing an implementation plan.
Required by: `ulw-plan`
Side effects: none
Do not use when: the user has already approved implementation; use `ulw-loop.md`.

This reference absorbs lazycodex v4.16.0 `ulw-plan` intent routing into ddalggak's plan-only, deep-interview, and critic-consensus gates.

## Route exactly one intent

After repo/wiki/evidence grounding, record one route and the reason.

| Route | Meaning | ddalggak behavior |
| --- | --- | --- |
| CLEAR | User knows the outcome; only preferences/tradeoffs remain. | Ask only genuine owner-decisions that evidence cannot answer. Use `deep-interview-readiness-gate.md` for readiness and stop at plan output. |
| UNCLEAR | Desired outcome is fuzzy; asking would offload the agent's homework. | Research more, adopt defensible best-practice defaults, record assumptions/reversibility, then present an approval brief. |
| ON-THE-FENCE | CLEAR vs UNCLEAR is genuinely ambiguous. | Treat as CLEAR and ask exactly one highest-leverage question; a wrongly silenced owner is worse than one extra question. |

Review modifiers such as `high accuracy`, `고정밀`, or `deep review` set `review_required: true`; they do not by themselves change CLEAR/UNCLEAR routing.

## Topology lock

Before scoring ambiguity or writing todos, enumerate 1-6 independently succeeding/failing components. Each component records:

- component id and one-line objective;
- owned files/surfaces or discovery scope;
- independent success/failure criterion;
- dependencies on other components;
- must-not-touch / forbidden side effects.

A detailed component must not erase its less-described siblings. Every todo in the final plan should trace to a component or explicitly say why it is cross-cutting.

## Two filters for questions

Ask a question only if it survives both filters:

1. **Evidence-answerable filter** — if repo/docs/wiki/web/live checks can answer it, explore instead of asking.
2. **Intent + default filter** — if the user intent and a defensible repo/industry default resolve it, adopt the default and record rationale/reversibility.

Owner-decision exceptions still require user choice: irreversible/destructive operations, safety/security/privacy-critical policy, public/external side effects, cost-bearing actions, or product/UX tradeoffs with no defensible default.

## Approval gate state machine

`ulw-plan` writes or presents the plan only after the approval gate is satisfied:

1. `grounding` — gather repo/wiki/source evidence and list unknowns.
2. `brief_presented` — present findings, adopted defaults, surviving owner-decisions, and intended approach once.
3. `awaiting-approval` — stop until the user explicitly approves, answers the fork, or changes scope.
4. `approved` — write/present the plan; if `review_required`, run critic consensus before finalizing.
5. `scope_changed` — update grounding/brief once, then return to `awaiting-approval`.

For ddalggak, the user's original request to plan authorizes plan drafting after the brief/approval path, but not source edits, GitHub writes, deploys, merges, releases, or wiki writes.

## Critic / review integration

When `review_required` or risk is HEAVY, apply `ralplan-critic-consensus.md` / independent critic review to the plan. The reviewer should look for contradictions, scope creep, missing acceptance criteria, missing QA channels, stale self-report-only evidence, and owner-decision leakage.

## deep-interview-readiness-gate mapping

The intent route determines the default readiness verdict and interview posture; the readiness gate then validates the plan/start output before `PLAN_DONE` or source edits.

| Intent route | Default readiness verdict | Interview posture |
| --- | --- | --- |
| CLEAR | `READY` when all owner-decisions are answered; otherwise `NEEDS_INTERVIEW` for surviving forks only. | Ask only surviving owner-decisions with WHY; do not widen scope. |
| UNCLEAR | `READY` when adopted defaults are recorded with rationale/reversibility; `NEEDS_INTERVIEW` only for an irreversible/safety-critical fork research cannot settle. | Do not interrogate; announce defaults and let the user veto at the approval gate. |
| ON-THE-FENCE | `NEEDS_INTERVIEW` for exactly one highest-leverage question; resolve to `READY` on answer. | Ask one question; do not batch. |

Any route may produce `BLOCKED` when an external/system/source gap prevents safe planning or mutation. The route does not override the readiness gate; it shapes the default posture the gate validates.

## ddalggak translation table

| lazycodex concept | ddalggak equivalent |
| --- | --- |
| `.omo/drafts/*` | Conductor/work note or plan artifact when created; not required as a runtime dependency. |
| `.omo/plans/*` and `scaffold-plan.mjs` | Manual ddalggak plan output with the same sections; no scaffold script import. |
| Metis/Momus review | `ralplan-critic-consensus.md`, `delegate_task` reviewer, or explicit self-critic when delegation is unavailable. |
| `$start-work` | ddalggak `start` subcommand only after separate source-edit approval. |
