# ddalggak Review Output Contract v3
Use when: posting or preparing a `ddalggak review` GitHub inline comment after validated aggregation.
Required by: `review` publication and rendering.
Side effects: none; this contract validates and renders text but grants no external write authority.
Do not use when: admission, candidate disposition, lifecycle aggregation, or write authorization is unresolved.

Lifecycle and finding admission are owned by `references/cross-review-loop.md`.

## Required public surface

Only verified inline findings may be posted to the requested PR. Summary and substantive verdict stay in chat. Zero findings and read-only/non-PR targets require no GitHub write. The top-level summary renderer remains a compatibility API, not a default publication path.

Conductor and renderer responsibilities remain separate: the candidate preserves exact finding identity and evidence, aggregate preserves admitted finding count, and publication preserves same-process authority. Finding output is one plain-text line with exactly two complete sentences. Sentence one states what fails and who/what is affected; sentence two states the smallest correction and how it will be validated. Internal workflow labels, candidate IDs, severity/confidence labels, evidence inventories, and private paths never appear.

A finding is `UNRENDERABLE` when any required meaning slot is absent, ambiguous, stale, or unsafe to express in those two sentences. `UNRENDERABLE` is a blocking publication gap and cannot be dropped, approved, or replaced by caller prose. A suggestion is optional and must be a single anchored, contiguous, complete replacement with focused `PROVEN:` validation evidence; otherwise it is rejected fail-closed.

Public output excludes internal evidence inventories. Wiki Context Manifest, gate names, candidate ledger, hidden completion signals, source inventories, and private workflow labels stay in the internal review brief.

## Lifecycle vocabulary

- OPEN: `approve`, `change request`, `comment`, `blocked`
- MERGED: `no follow-up`, `follow-up required`, `blocked`
- CLOSED_UNMERGED: `no action`, `follow-up required`, `blocked`

Do not reuse `change request` for MERGED or CLOSED_UNMERGED. Immediately before rendering or publishing, re-read lifecycle. If `state=MERGED` or `mergedAt` is present, emit `REVIEW_STOPPED_PR_MERGED`, stop rendering/publication, and perform no GitHub mutation; report `MERGED / NO_FOLLOW_UP` by default. An authorized follow-up comment requires a reproducible or deterministic residual defect with material impact and is a separate action, not continuation of the stopped review. Lifecycle lookup failure or ambiguity is `BLOCKED`.

## Substantive gate requirement

A review artifact that only lists CI/check status, `reviewDecision`, `latestReviews`, mergeability, or generic approval language is not complete. Before a positive outcome, inspect the diff and relevant surrounding code, compare it to the linked issue/body/comments, and record concrete changed-code reasoning in the internal brief.

The brief must cover:

- issue acceptance coverage against the changed files;
- changed-code correctness with concrete code/test references;
- regression or edge-case risk;
- scope expansion/unrelated-change check;
- test/evidence adequacy and Evidence Contract gaps;
- every candidate's final admission disposition.

Finding 0건은 유효하다. 근거가 부족해 substantive observation을 만들 수 없으면 특정 결함을 발명하거나 `change request`를 쓰지 말고 `blocked`로 종료한다.

## Compatibility summary marker

The retained summary renderer uses this marker for compatibility tests only; do not append it to two-sentence inline findings or publish a summary:

```markdown
<!-- ddalggak-review-contract:v3 pr=<num> head=<full-sha> lifecycle=<lifecycle> outcome=<outcome> critical=<n> high=<n> gaps=<n> -->
```

## Ownership split

- Agent/model owns evidence collection and schema-valid admission inputs; it does not choose the final aggregate outcome outside the executable policy.
- Candidate evaluator owns only final candidate disposition; aggregate evaluator owns lifecycle outcome.
- Deterministic summary and finding renderers own public line order, labels, vocabulary, and marker. Their shared validator scans both the raw text and an NFKC plus Unicode slash-confusable canonical form before deny-pattern checks. It rejects structural additions, lifecycle/outcome/count mismatch, aggregate/evidence-gap mismatch, malformed terminal markers, multiline injection, case-insensitive internal-ledger and known gate/workflow tokens, punctuation/quote/assignment-adjacent macOS/Linux/Windows host-local paths including named-user tilde homes and profile-local runtime paths, Unicode-aware punctuation-adjacent repository/issue shorthand and private URI forms, credential and Cookie/session headers including arbitrary non-letter/number separator runs and every NFKC-equivalent colon/equal assignment delimiter, generic secret/session assignments, API-key assignments, provider token prefixes, and private-key headers. Summary rendering requires the original immutable aggregate; finding rendering additionally requires its original aggregate-member candidate.
- Publication authority is independent from content eligibility. Rendering a valid body never grants GitHub write authority.
- Follow the individual inline POST, exact anchor, UTF-8 JSON, unknown-result reconciliation and body/location/URL readback rules in `cross-review-loop.md`.

## Formal approval boundary

Do not request formal APPROVE/REQUEST_CHANGES and do not fall back to a top-level comment when formal review is unavailable. Report substantive review, publication status, CI/checks, formal review state, and manual merge boundary separately in chat.
