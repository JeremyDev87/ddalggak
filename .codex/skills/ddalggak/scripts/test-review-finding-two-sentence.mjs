#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  aggregateReview,
  decidePublication,
  evaluateCandidate,
  evaluateChecksEvidence,
  evaluatePublicationReceipt,
  evaluateReviewEvidence,
  renderPublicFinding,
  validatePublicFinding,
} from "./review-contract-policy.mjs";

const PR_NUMBER = 448;
const BASE_SHA = "1111111111111111111111111111111111111111";
const HEAD_SHA = "4444444444444444444444444444444444444444";

const PUBLIC_FINDING = {
  status: "RENDERABLE",
  anchor: "src/payment.js:42",
  failure: "The changed assertion accepts a declined card as success",
  impact: "invalid charges can be treated as completed",
  correction: "Restore the rejection assertion and add the declined-card negative case",
  validation: "run the focused payment test",
  reason: "",
  suggestion: null,
};

function candidate(overrides = {}) {
  return {
    candidate_id: "finding-1",
    pr_number: PR_NUMBER,
    base_sha: BASE_SHA,
    head_sha: HEAD_SHA,
    authority: "CONDUCTOR",
    lifecycle: "OPEN",
    observed_delta: "DEFECT: changed behavior",
    governing_contract: "PROVEN: linked requirement",
    scope_relation: "IN_SCOPE: changed surface",
    prior_decision: "NONE: no prior decision",
    base_state: "ABSENT: not present in base",
    current_head_evidence: "PROVEN: reproduced on current head",
    diff_causality: "NEW: introduced by current diff",
    impact: "PROVEN: concrete user impact",
    counterargument: "ADDRESSED: intentional trade-off considered",
    counterargument_disproof: "PROVEN: contract and reproduction refute it",
    minimum_correction: "PROPOSED: smallest scoped fix",
    severity: "HIGH",
    disposition: "CANDIDATE",
    publication_eligible: false,
    public_finding: PUBLIC_FINDING,
    ...overrides,
  };
}

function reviewEvidence() {
  return evaluateReviewEvidence({
    pr_number: PR_NUMBER,
    lifecycle: "OPEN",
    base_sha: BASE_SHA,
    head_sha: HEAD_SHA,
    review_risk: "HIGH",
    semantic_coverage: [{
      criterion_id: "c1",
      changed_surface: "review renderer",
      caller_or_consumer: "review conductor",
      failure_mode: "meaning disappears during publication",
      test_or_evidence: "PROVEN: focused renderer probe",
      verdict: "COVERED",
    }],
    counterexample: {
      claim: "unrenderable findings block publication",
      probe: "candidate with missing impact",
      expected_result: "VIOLATION_REJECTED: publication is blocked",
      actual_result: "VIOLATION_REJECTED: publication is blocked",
      restoration_proof: "PROVEN: disposable probe left source unchanged",
      status: "PASSED",
    },
  });
}

const evaluated = evaluateCandidate(candidate());
const evidence = reviewEvidence();
const checks = evaluateChecksEvidence({
  pr_number: PR_NUMBER,
  lifecycle: "OPEN",
  base_sha: BASE_SHA,
  head_sha: HEAD_SHA,
  status: "PASS",
  justification: "",
});
const aggregate = aggregateReview({ lifecycle: "OPEN", candidates: [evaluated], reviewEvidence: evidence, checksEvidence: checks });
const publication = decidePublication({
  aggregate,
  publicationReceipt: evaluatePublicationReceipt({ pr_number: PR_NUMBER, lifecycle: "OPEN", base_sha: BASE_SHA, head_sha: HEAD_SHA }),
  writeAuthorized: true,
});

assert.equal(evaluated.disposition, "BLOCKING");
assert.equal(aggregate.admittedFindingCount, 1);
const body = renderPublicFinding({ publicationDecision: publication, candidate: evaluated });
assert.equal(body, "The changed assertion accepts a declined card as success, so invalid charges can be treated as completed. Restore the rejection assertion and add the declined-card negative case, then run the focused payment test.");
assert.equal(validatePublicFinding(body).valid, true);
assert.equal(body.split(/[.!?]+/u).filter(Boolean).length, 2);
assert.equal(/severity|confidence|candidate|evidence-gap|gate/iu.test(body), false);

const unrenderable = evaluateCandidate(candidate({
  candidate_id: "finding-unrenderable",
  public_finding: { ...PUBLIC_FINDING, status: "UNRENDERABLE", impact: "", reason: "required meaning slot is missing" },
}));
assert.equal(unrenderable.disposition, "REVIEW_BLOCKED");
assert.equal(unrenderable.publication_eligible, false);
const blockedAggregate = aggregateReview({ lifecycle: "OPEN", candidates: [unrenderable], reviewEvidence: evidence, checksEvidence: checks });
assert.equal(blockedAggregate.outcome, "BLOCKED");

assert.throws(
  () => evaluateCandidate(candidate({
    candidate_id: "finding-unsafe-suggestion",
    public_finding: {
      ...PUBLIC_FINDING,
      suggestion: {
        path: "../outside.js",
        start_line: 1,
        end_line: 1,
        old_text: "old",
        new_text: "new",
        validation: "PROVEN: focused test passed",
      },
    },
  })),
  /suggestion/,
);

console.log("[test-review-finding-two-sentence] passed");
