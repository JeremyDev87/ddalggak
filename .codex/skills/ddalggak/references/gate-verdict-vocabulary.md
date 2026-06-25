# Gate Verdict Vocabulary Index
Use when: plan/start/review needs to compare multiple gate outcomes or explain how gate-specific verdict words map to the same workflow result axis.
Required by: Quality Lens Router, Core Invariants; gate result summaries that combine multiple references.
Side effects: none
Do not use when: the task is to rename existing gate verdict strings or change workflow output behavior; this index maps existing vocabulary only.

This index is the shared vocabulary for reading ddalggak gate outputs. It does **not** rename, replace, or normalize the existing verdict strings in the gate references. Keep every gate's local terms intact, then use this table when a packet needs to align several gate results into one result axis.

## Common result axis

| Axis | Meaning | PR/readiness effect |
|---|---|---|
| Pass | The gate has enough source authority, scope, evidence, and validation for its own lane. | May support readiness when every other required gate and check is also clear. |
| Conditional / low severity | The gate found a Medium/Low or informational limitation that does not block the explicit acceptance criteria. | May proceed only with the condition, limitation, or follow-up stated. |
| Blocked: evidence | Required proof is missing or insufficient. | Blocks readiness, approval, and manual-merge recommendation until evidence is supplied or reclassified as `not-applicable: <reason>`. |
| Blocked: question | A small human/source answer is needed before safe planning or mutation. | Blocks mutation; ask the smallest unlocking question instead of guessing. |
| Blocked: authority/safety | The requested action exceeds the command contract, side-effect boundary, safety policy, or source authority. | Blocks mutation and approval until explicit authority or a safer scope exists. |
| Not applicable | The gate is outside the task's actual surface. | Does not block only when the reason is specific and evidence-backed. |

## Gate-specific vocabulary map

| Gate/reference | Existing vocabulary | Common axis mapping | Preserve nuance |
|---|---|---|---|
| `deep-interview-readiness-gate.md` | `READY` | Pass | All readiness dimensions are evidence-backed. |
| `deep-interview-readiness-gate.md` | `NEEDS_INTERVIEW` | Blocked: question | A small human/source answer could unlock the lane; do not widen scope. |
| `deep-interview-readiness-gate.md` | `BLOCKED` | Blocked: authority/safety or evidence | External/system/source gaps prevent safe planning or mutation. |
| `react-code-quality-harness.md` | `PASS` | Pass | Gate-specific code-quality evidence is sufficient. |
| `react-code-quality-harness.md` | `FAIL` | Blocked: evidence or safety | Blocks PR-ready/APPROVE for applicable React quality gates. |
| `react-code-quality-harness.md` | `NEEDS_EVIDENCE` | Blocked: evidence | Different from `NEEDS_INTERVIEW`: proof is missing, not necessarily a user answer. |
| `react-code-quality-harness.md` | `N_A` | Not applicable | Requires a specific reason for skipping the gate. |
| `prompt-optimizer.md` | `READY_FOR_BRIEF` | Pass | Safe to compile an execution brief; not a source-edit approval by itself. |
| `prompt-optimizer.md` | `NEEDS_CLARIFICATION` | Blocked: question | Ask before compiling or executing the brief. |
| `prompt-optimizer.md` | `BLOCKED_UNSAFE` | Blocked: authority/safety | Scope, credentials, side effects, or validation risk blocks execution. |
| `prompt-optimizer.md` | `DISCOVERY_ONLY` | Conditional / low severity or Blocked: authority/safety | Safe path is read-only discovery; mutation remains blocked. |
| `prompt-optimizer.md` | `PROMPT_DONE` | Pass | Completion signal for the prompt command, not a cross-gate approval. |
| `evidence-contract.md` | `APPROVE` | Pass | Only valid when required evidence exists and no blocking gaps remain. |
| `evidence-contract.md` | request changes / blocked | Blocked: evidence | Missing High evidence blocks readiness and approval. |
| `evidence-contract.md` | `not-applicable: <reason>` | Not applicable | Reason must be concrete; vague N/A is an evidence gap. |
| `evidence-contract.md` | severity `Medium`/`Low` | Conditional / low severity | Non-blocking only when not part of explicit acceptance or critical path. |
| `evidence-contract.md` | severity `High` | Blocked: evidence | Blocks readiness if tied to acceptance, critical path, deploy, security, data/API, or fallback proof. |
| `regression-library.md` | Pass | Pass | Applicable scenario cards preserve hard invariants. |
| `regression-library.md` | Conditional pass / Medium | Conditional / low severity | Narrow follow-up or reasoned not-applicable; normally non-blocking. |
| `regression-library.md` | Fail / High | Blocked: evidence or safety | Request changes before approval. |
| `regression-library.md` | Fail / Critical | Blocked: authority/safety | Secret exposure, destructive mutation, unsafe force-push, unauthorized merge, or hidden CI failure. |

## Gates without explicit verdict strings

| Gate/reference | Common axis mapping rule |
|---|---|
| `simplicity-deletability-gate.md` | Treat unnecessary abstraction, forced modularization, client-side patches, mock-only tests, or readability-hostile patterns as Blocked when severity is High; Medium/Low findings are Conditional when they do not affect acceptance. |
| `security-posture-gate.md` | Map High/Critical security, auth, privacy, token, production, or destructive-action findings to Blocked: authority/safety; lower informational findings are Conditional with evidence. |
| `frontend-design-gate.md` | Map missing required design/rendered evidence to Blocked: evidence; backend/API-only or narrow non-UI changes can be Not applicable with a specific reason. |
| `vercel-agent-skills-gates.md` | Map token/deploy/env, server/client, performance, UI/a11y, or React Native risks to Blocked when required evidence or authority is missing; backend-only or non-Vercel/non-React surfaces can be Not applicable with a specific reason. |

## Reporting rule

When a plan, start, or review packet reports multiple gates together, keep the original gate verdict term in the gate row and add the common axis when it improves scanability. Do not collapse `NEEDS_INTERVIEW` into `NEEDS_EVIDENCE`, do not turn `DISCOVERY_ONLY` into implementation approval, and do not treat top-level approval wording as stronger than the Evidence Contract or current-head CI/check evidence.
