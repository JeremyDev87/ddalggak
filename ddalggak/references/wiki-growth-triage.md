# Wiki Growth Triage
Use when: new wiki-derived knowledge, retrospectives, or research notes might change ddalggak policy, references, templates, verifiers, or backlog issues.
Required by: `retro`, `setwiki`; memory/wiki candidate triage before any durable save or promotion.
Side effects: none
Do not use when: the lesson is a one-off incident record without a generalized failure class; defer/reject instead of promoting it to a durable surface.

Use this reference when new wiki-derived knowledge, retrospectives, or research notes might change ddalggak policy, references, templates, verifiers, or backlog issues. The goal is to absorb durable lessons without turning the always-loaded skill into an ever-growing rule dump.

## Triage question

Before adding a new rule, ask: **what is the smallest durable surface that prevents the recurring failure without making unrelated issue work heavier?**


## Memory Candidate Deduplication via getwiki

Before saving durable memory or proposing a memory update from ddalggak work:

1. Search the LLM Wiki for the same principle, convention, or workflow.
2. If it already exists in wiki, cite it instead of duplicating memory.
3. Save to memory only if it is compact, durable, user-specific, and likely to reduce repeated steering.
4. Prefer wiki/setwiki for rich procedural knowledge; memory is only for compact preferences and stable facts.
5. Use `wiki-bridge.md` before crossing from ddalggak into wiki retrieval or write workflows: `getwiki` stays read-only, and `setwiki` requires explicit approval before write.
6. Never save PR numbers, commit SHAs, completion logs, or single-session artifacts as memory.

Classify the knowledge into exactly one primary lane. Add secondary lanes only when there is concrete evidence that one surface is insufficient.

## Classification lanes

| Lane | Use when | Allowed surfaces | Do not use when |
|---|---|---|---|
| Immediate guardrail | The lesson prevents a repeated High/Critical workflow failure on the normal plan/start/review/ship path. | Short SKILL invariant, review gate anchor, verifier anchor if stable. | The lesson is speculative, tool-specific, or only useful for rare research workflows. |
| Reference/template only | The lesson is useful but too bulky or situational for the hot path. | `ddalggak/references/*.md`, `ddalggak/templates/*.md`, mirrored Codex payload if packaged. | Agents must remember it before every issue to avoid severe failure. |
| Verifier/script candidate | The lesson can be checked mechanically and drift would silently break public behavior. | Narrow verifier anchor, CLI `--show-doc` surface check, package dry-run check. | The check would encode future work before the contract is stable. |
| GitHub issue candidate | The lesson needs product/design discussion, broad refactor, or multi-file rollout. | One issue per cohesive change; parent epic only for several independent child issues. | The change is small enough to include safely in the current PR scope. |
| Defer/reject | The lesson is not on the current execution path, lacks evidence, requires secrets or production state, or would add a runtime framework without demand. | Backlog note, wiki-only note, or no ddalggak change. | There is concrete repeated failure evidence and a small reversible guardrail exists. |

## Acceptance checklist

Before promoting wiki-derived knowledge into ddalggak, verify:

- The failure mode is generalized, not just one PR number, commit SHA, or single-session incident.
- The new rule has a detection signal: what would a planner, implementer, reviewer, or verifier see?
- The rule names an owner surface: SKILL invariant, reference, template, verifier, issue, or deferred wiki note.
- The smallest surface was chosen first; references and templates are preferred over hot-path SKILL growth for bulky details.
- The change preserves **Issue-PRs by default**: one issue PR per independent issue; conflict fallback only when concrete hard conflicts make separate PRs unsafe.
- The change does not create hidden runtime machinery, scheduler mutation, or durable state storage unless explicitly requested and separately scoped.
- The change includes validation evidence appropriate to the touched surface: `npm run verify:codex-skill`, `npm test`, package dry-run, `git diff --check`, or a specific not-applicable reason.

## Worked examples

| Input knowledge | Classification | Why |
|---|---|---|
| Task Scope Contract | Immediate guardrail already reflected | It prevents out-of-scope diff and authorization failures on the hot path, and it already appears in SKILL and review contracts. Do not duplicate it; point to existing anchors. |
| Minimal Harness | GitHub issue candidate or reference/template only | It can reduce policy bloat, but broad progressive disclosure must be scoped as a behavior-preserving documentation refactor rather than inserted as a sweeping invariant. |
| MCP sampling hardening | Defer/reject for ddalggak core | It is not on the current ddalggak execution path. Keep it in wiki/tooling notes until a concrete ddalggak integration exists. |
| Graph-assisted query | Wiki tooling only | It belongs to knowledge-base retrieval or research tooling, not ddalggak issue-to-PR workflow policy. |

## Promotion packet

When a lesson should become a PR or issue, include this packet:

```markdown
## Source
- Wiki / retrospective / research source:
- Generalized failure class:
- Detection signal:

## Proposed surface
- Primary lane: immediate guardrail / reference-template / verifier-script / GitHub issue / defer-reject
- Files or issue scope:
- Why this is the smallest durable surface:

## Safety boundaries
- Must not change:
- Issue-PR topology impact: none / conflict fallback with reason
- Secrets, credentials, production data: not touched

## Validation
- Commands:
- Manual evidence:
- Not applicable:
```

## Review rubric

A reviewer should block promotion when:

- the rule is merely a renamed one-off incident;
- the proposed SKILL change is long and could live in a reference;
- the verifier would fail future issues before their contracts exist;
- independent issue PR topology is weakened without a concrete hard conflict;
- the change introduces runtime storage, scheduler behavior, credential handling, or production side effects beyond the issue scope.
