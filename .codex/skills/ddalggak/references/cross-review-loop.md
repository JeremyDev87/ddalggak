# Cross-Review Loop
Use when: `review` evaluates a current PR/head and may publish a bounded review result.
Required by: review
Side effects: review comments and accepted Critical/High fixes only when separately authorized by the review command contract.
Do not use when: the task is a local read-only diff check or a plan.

## Review quality execution order

Apply `references/review-quality-contract.md` before producing findings or a verdict:

1. **Intake:** classify risk and choose `ready-for-review | needs-intent | needs-evidence | needs-split | blocked-human-owner`. Only `ready-for-review` proceeds.
2. **Semantic coverage:** map every acceptance criterion to changed symbols/surfaces, callers or consumers, failure modes, and tests/evidence. Unexplained changed surfaces and in-scope gaps block `approve`.
3. **Counterexample pass:** inspect test changes first when assertions/fixtures/guards changed. Run one sharp disposable mutation probe for guard/test/harness/generator claims; High/Critical zero-finding reviews require a documented counterexample pass.
4. **Quality sensor finding:** require severity, claim, changed-line/file anchor, reproducible failing scenario, impact, minimal fix, confidence, and counterevidence checked. This is not an Admission schema record or publication authority.
5. **Sensor verdict:** Review Quality v2 stores only `approve | change request | comment | blocked` as internal evidence. The conductor must separately run the v3 candidate admission, aggregation, publication, and deterministic rendering contracts; the sensor result cannot choose or publish their outcome.

Load human-feedback, CI-triage, security-posture, and regression references only when their triggers in the Review Quality Contract apply. Record both triggered and skipped gate reasons. Conditional loading never weakens a stop condition.

## Lifecycle gate

Resolve the live lifecycle before evaluating candidates:

- OPEN: `APPROVE | CHANGES_REQUESTED | BLOCKED`
- MERGED: `NO_FOLLOW_UP | FOLLOW_UP_REQUIRED | BLOCKED`
- CLOSED_UNMERGED: `NO_ACTION | FOLLOW_UP_REQUIRED | BLOCKED`

Re-read current head, base, files, checks, linked requirements, issue/body comments, prior review decisions, and Wiki Context Preflight. `checksStatus: PASS | FAIL | PENDING | NOT_APPLICABLE`; `NOT_APPLICABLE` requires a non-empty `checksJustification`. FAIL or PENDING makes the aggregate BLOCKED and completion-ineligible.

## Accepted finding authority

A review finding is only **accepted** for a fix iteration when one of these authorities records it:

1. 박정욱의 직접 지시 또는 PR/issue comment.
2. The conductor running `review`, after validating the finding against the live diff, linked issue contract, and Evidence Contract.
3. A reviewer/subagent finding that the conductor explicitly promotes with severity and evidence.

A reviewer/subagent cannot accept its own finding by completion text alone. Low/Medium findings are not automatically accepted unless they block issue evidence, scope control, or current-head readiness.

## Fix iteration loop

Use a bounded loop so review does not become open-ended implementation:

1. Record accepted findings by severity before editing.
2. Apply the smallest in-scope fix only; do not broaden the PR or touch unrelated cleanup.
3. Run focused validation for the changed surface, then the repo-required verifier when readiness is claimed.
4. Emit or record `FIX_DONE PR#<num> iter<N>: critical_fixed=N high_fixed=N medium_fixed=N low_fixed=N` after the fix validation passes.
5. Re-run review on the new current head before any `approve`/ready conclusion.

Default automated limit: **2 fix iterations per PR review run**. A third loop requires a new user instruction or a fresh conductor decision explaining why the remaining accepted blocker is still in-scope and safe to continue. Critical security/privacy/secret-exposure blockers still stop approval immediately; they do not grant unlimited editing authority.

## Human review feedback loop

When live PR comments, review threads, or unresolved conversation evidence exist, apply `references/human-review-feedback-loop.md` before any current-head `approve`/ready conclusion. Human feedback is classified as `accepted`, `countered`, `deferred`, `stale/outdated`, or `needs-human-decision`; accepted Critical/High feedback may be fixed only through the bounded `review` fix authority above, and unknown thread freshness blocks “all feedback resolved” claims.

## CI failure triage loop

When current-head checks are pending or failing, apply `references/ci-failure-triage-loop.md` before any `approve`/ready conclusion. Check classification alone is not approval evidence: `test-failure` may authorize a bounded in-scope review fix only when backed by check evidence plus live diff/issue evidence; `infra-failure` may authorize one safe rerun or a blocker report; `permission-auth-failure` and `unknown-failure` stay human/evidence blockers unless fresh evidence proves otherwise.

## Current-head and stale-review rule

Every review verdict and every fix result is tied to a concrete PR head SHA.

- If the PR head changes after a verdict, the verdict is stale until `review` re-reads metadata, diff, files, checks, and linked issue/comments for the new head.
- If CI/checks are pending or failed on the current head, do not conclude `approve` or ready unless the missing check is explicitly proven not applicable.
- If a fix commit changes files outside the accepted finding scope, treat the review as reopened and run scope-expansion review again.
- If formal GitHub approval is self-review or otherwise inappropriate, use a top-level `approve`/`change request` comment that names the current head SHA, scope, validation, blocker count, and human merge boundary.

## Finding admission record

Admission schema v3 owns exactly these 20 fields:

```yaml
candidate_id:
pr_number:
base_sha:
head_sha:
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

Evidence-bearing values use `TOKEN: detail`; bare tokens, unknown fields, unknown enums, missing fields, or contradictory fields are schema errors. A candidate is not a final disposition. Only the canonical evaluator may produce a final candidate, and only its provenance-bearing result may enter aggregation. Candidate, review evidence, checks, and publication receipts must bind the same `pr_number` / `lifecycle` / `base_sha` / `head_sha`.

The record must establish prior decision, base and current-head evidence, governing requirement, scope relation, actual impact, smallest correction, counterargument, and disproof. Missing process evidence is not defect evidence. Difference is not defect. Express a finding as `symptom -> violated contract -> evidence -> impact -> smallest correction`.

## Review evidence schema v3

Review evidence is evaluator-produced exact data, not caller booleans:

- required fields: `pr_number`, `lifecycle`, `base_sha`, `head_sha`, `review_risk`, `semantic_coverage`, `counterexample`
- checks evidence requires the same revision binding plus `status` and `justification`
- publication uses a same-process live receipt and an eligible publication decision; worker self-report is never publication authority

## Semantic coverage matrix

Before High/Critical zero-finding publication, every in-scope changed surface must have semantic coverage rows and a concrete counterexample with restoration proof. Coverage verdicts are `COVERED | GAP | NOT_APPLICABLE`. Counterexample status values are `PASSED | VIOLATION_PASSED | BLOCKED | NOT_RUN`. Gaps, unproven N/A, `VIOLATION_PASSED`, unrun probes, and status/actual contradictions fail closed.

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

## Finding signal gate (게시 전 트리아지)

finding 후보는 게시 전에 3문 트리아지를 통과해야 한다(Counterargument Pass의 finding 적용):

1. 저자가 이미 아는가? — diff·코드 주석·PR body의 재진술이면 탈락.
2. 반영 시 코드/문서가 실제로 바뀌는가? — "참고용"·"후속 튜닝 대상" 같은 무행동 메모는 탈락.
3. live evidence가 특정 라인을 지목하는가? — 증거 없는 가설적 엣지케이스는 탈락.

- 프로세스성 evidence-gap은 inline finding이 아니라 aggregate gap으로만 기록한다.
- 걸러진 Low/nit·정보성 항목과 drop 사유는 내부 리뷰 로그에만 남긴다. public summary에 `<details>`나 임의 섹션을 추가하지 않는다.
- **finding 0건 + 검증 evidence만 있는 리뷰는 유효할 수 있다.** 다만 High/Critical은 `review-quality-contract.md`의 documented counterexample pass가 있어야 하며, 큰 blast radius에서는 zero-finding heterogeneous challenger 조건도 확인한다. 채우기 위한 finding을 만들지 않는다.

## Inline finding publication

트리아지를 통과한 observation도 즉시 게시할 수 없다. Conductor가 현재 head에서 재현하고 exact Admission schema v3 candidate로 승격한 뒤, 동일 aggregate member와 publication decision provenance를 받은 경우에만 deterministic finding renderer가 exactly five allowlisted lines를 생성한다.

- caller prose, arbitrary `suggestion` blocks, 재구성한 candidate, 추가 세부 섹션은 renderer 입력이나 public body에 허용하지 않는다.
- line/file anchor와 단일 review 제출 같은 GitHub transport 선택은 renderer 결과를 바꾸거나 publication authority를 보충하지 못한다.
- top-level summary는 `references/review-output-contract.md`의 fixed v3 shape와 terminal marker만 사용한다. 내부 `REVIEW_DONE` completion signal이나 비차단 메모를 public summary에 덧붙이지 않는다.

## Deterministic public renderer

Load `review-output-contract.md` and `review-comment-style.md` immediately before constructing a public body. The summary uses the fixed v3 allowlist and terminal marker. Each inline finding derives exactly five public lines from its canonical aggregate-member candidate. Internal manifests never enter the public review body. Public output excludes internal evidence inventories, Wiki paths, gate labels, candidate IDs, raw ledger fields, arbitrary sections, and caller-supplied suggestions.

Summary and finding share one privacy chokepoint. Validate raw text and an NFKC canonical form, including cross-normalization where token and delimiter normalize differently. Reject generic secret/session assignments, every NFKC-equivalent colon/equal assignment delimiter, provider/private-key material, host-local paths including named-user tilde homes, private URI/SCP/scheme-less locators, and Unicode-aware punctuation-adjacent repository/issue shorthand. URI start boundaries use Unicode letter/number semantics rather than ASCII word boundaries.

A zero-finding review is valid only with substantive validation evidence. Filtered Low/nit notes remain internal rather than being collapsed into a public details section.

## Review brief

The review brief must capture PR number, Base SHA, Head SHA, checks Head SHA, lifecycle, authority boundaries, Forbidden side effects, semantic coverage matrix, and concrete counterexample pass requirements before review starts.


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