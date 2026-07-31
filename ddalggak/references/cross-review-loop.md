# Cross-Review Loop
Use when: `review` evaluates a current PR/head and may publish a bounded review result.
Required by: review
Side effects: review comments and accepted Critical/High fixes only when separately authorized by the review command contract.
Do not use when: the task is a local read-only diff check or a plan.

## Lifecycle gate

Resolve the live lifecycle before evaluating candidates:

- OPEN: `APPROVE | CHANGES_REQUESTED | BLOCKED`
- MERGED: `NO_FOLLOW_UP | FOLLOW_UP_REQUIRED | BLOCKED`
- CLOSED_UNMERGED: `NO_ACTION | FOLLOW_UP_REQUIRED | BLOCKED`

Re-read current head, base, files, checks, linked requirements, issue/body comments, prior review decisions, and Wiki Context Preflight. `checksStatus: PASS | FAIL | PENDING | NOT_APPLICABLE`; `NOT_APPLICABLE` requires a non-empty `checksJustification`. FAIL or PENDING makes the aggregate BLOCKED and completion-ineligible.

## Finding admission record

Admission schema v3 owns exactly these 17 fields:

```yaml
candidate_id:
authority: CONDUCTOR | SUBREVIEW
lifecycle: OPEN | MERGED | CLOSED_UNMERGED
observed_delta:
governing_contract:
scope_relation:
prior_decision:
base_state:
current_head_evidence:
diff_causality:
impact:
counterargument:
counterargument_disproof:
minimum_correction:
severity: NONE | LOW | MEDIUM | HIGH | CRITICAL
disposition: CANDIDATE
publication_eligible: false
```

Evidence-bearing values use `TOKEN: detail`; bare tokens, unknown fields, unknown enums, missing fields, or contradictory fields are schema errors. A candidate is not a final disposition. Only the canonical evaluator may produce a final candidate, and only its provenance-bearing result may enter aggregation.

The record must establish prior decision, base and current-head evidence, governing requirement, scope relation, actual impact, smallest correction, counterargument, and disproof. Missing process evidence is not defect evidence. Difference is not defect. Express a finding as `symptom -> violated contract -> evidence -> impact -> smallest correction`.

## Candidate disposition and review outcome are separate axes

Apply the following order; mandatory process and unresolved severe evidence are evaluated before accepted/base DROP:

1. SUBREVIEW remains QUESTION until the conductor independently reproduces and promotes it.
2. Missing required process evidence becomes REVIEW_BLOCKED.
3. UNKNOWN governing contract, scope, prior decision, base/head evidence, causality, impact, counterargument, disproof, or correction becomes REVIEW_BLOCKED or QUESTION according to the executable evaluator; it cannot publish.
4. Unresolved Critical/High evidence cannot disappear as `DROP`, including under an accepted prior decision.
5. `ACCEPTED_NO_COUNTEREVIDENCE` may DROP only when current head neither worsens/exposes the behavior nor carries proven counterevidence.
6. `ACCEPTED_WITH_COUNTEREVIDENCE` preserves the current characterized evaluator behavior; this promotion does not redefine its product meaning.
7. A proven unchanged base issue outside scope may DROP; worsened/exposed behavior is not treated as unchanged.
8. STYLE_DIFFERENCE and PRIVACY_SURFACE_ONLY are non-blocking without a proven violated contract and actual impact.
9. A proven in-scope new/worsened defect with actual impact and a proposed minimum correction may become BLOCKING; lower severity may remain NON_BLOCKING.

Required PROCESS_GAP ordering is mandatory: evaluate it before accepted/base DROP. `UNKNOWN` prior decisions cannot publish a blocker.
If a required PROCESS_GAP remains, it cannot disappear as `DROP`.

## Severity discipline

Severity follows proven impact, not file category or security/privacy vocabulary. Privacy-adjacent code alone does not justify Medium+, CHANGES_REQUESTED, or automatic escalation. Require a newly introduced or worsened exposure path, a governing-contract violation, current-head evidence, and actual impact. Critical/High also require a minimum correction and counterargument disproof.

## Aggregate contract

Aggregate only same-process evaluator-produced candidates with a unique candidate_id. Duplicate IDs fail closed; silent dedupe is forbidden. Freeze the aggregate and nested counts so caller mutation cannot change admitted, blocking, severity, or gap totals.

Compute lifecycle outcome, review completion eligibility, blocking count, admitted count, and evidence-gap count from canonical candidates plus checks. Do not trust caller booleans, caller counts, shape equality, or reconstructed objects. Candidate disposition and review outcome are separate axes.

A blocking candidate, failed/pending checks, missing required evidence, or non-substantive review yields BLOCKED and completion false. Gap counts must equal the exact candidate/check/process gaps represented by the aggregate.

## Publication authority

Publication authority is independent from content eligibility. Publishing requires all of:

- a validated same-process aggregate;
- lifecycle-legal outcome and completion state;
- terminal checks or justified NOT_APPLICABLE;
- exact zero unresolved publication gaps for a publishable conclusion;
- explicit write authorization for the external action.

Caller authorization cannot repair invalid content. Content eligibility cannot grant write authority. For inline findings, the renderer accepts only the exact aggregate-member candidate identity; arbitrary or reconstructed five-line text is rejected.

## Deterministic public renderer

Load `review-output-contract.md` and `review-comment-style.md` immediately before constructing a public body. The summary uses the fixed v3 allowlist and terminal marker. Each inline finding derives exactly five public lines from its canonical aggregate-member candidate. Internal manifests never enter the public review body. Public output excludes internal evidence inventories, Wiki paths, gate labels, candidate IDs, raw ledger fields, arbitrary sections, and caller-supplied suggestions.

Summary and finding share one privacy chokepoint. Validate raw text and an NFKC canonical form, including cross-normalization where token and delimiter normalize differently. Reject generic secret/session assignments, every NFKC-equivalent colon/equal assignment delimiter, provider/private-key material, host-local paths including named-user tilde homes, private URI/SCP/scheme-less locators, and Unicode-aware punctuation-adjacent repository/issue shorthand. URI start boundaries use Unicode letter/number semantics rather than ASCII word boundaries.

A zero-finding review is valid only with substantive validation evidence. Filtered Low/nit notes remain internal rather than being collapsed into a public details section.

## Review brief

Every delegated brief includes lifecycle, base/head SHAs, diff scope, linked requirements, checks, prior decisions/comments, applicable gates, forbidden side effects, expected Admission schema v3 record, and the instruction that SUBREVIEW output is only a candidate. The conductor re-runs admission, aggregation, publication, and rendering; worker self-report is never publication authority.

## Packaged contract regression

Run all three fast gates after policy, fixture, reference, or renderer changes:

```bash
npm run test:review-contract
npm run verify:projections
npm run verify
```

The fast gate executes schema/candidate/aggregate/publication/renderer layers, fixture scenarios, and semantic mutations. Run `npm run test:review-contract:exhaustive` when changing Unicode credential/session or private-locator boundaries. Mutation probes must remove or corrupt the production chokepoint and prove the focused oracle fails; applied-string counts alone are not evidence.

## Wiki Review Context Preflight

Run Wiki Context Preflight before judgment. Wiki can strengthen rationale but cannot be the only proof of a blocking finding. Record the Wiki Context Manifest internally; public rendering follows the deterministic allowlist and privacy validator.
