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
  failure: "변경된 검증이 거절된 카드를 성공으로 처리하여",
  impact: "잘못된 결제가 완료된 것으로 표시됩니다",
  correction: "거절 검증을 복원하고 실패 사례를 추가한 뒤",
  validation: "결제 테스트를 실행하십시오",
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
assert.equal(body, "변경된 검증이 거절된 카드를 성공으로 처리하여, 잘못된 결제가 완료된 것으로 표시됩니다. 거절 검증을 복원하고 실패 사례를 추가한 뒤, 결제 테스트를 실행하십시오.", "한국어 네 의미 슬롯을 두 문장으로 조립합니다");
assert.equal(validatePublicFinding(body).valid, true);
assert.equal(/, (so|then) /u.test(body), false, "영어 접속사를 삽입하지 않습니다");
assert.throws(() => renderPublicFinding({ publicationDecision: publication, candidate: { ...evaluated } }), /candidate lacks evaluator provenance/, "복사된 후보의 provenance를 거부합니다");
assert.throws(() => renderPublicFinding({ publicationDecision: { ...publication }, candidate: evaluated }), /eligible publication decision/, "복사된 게시 결정의 provenance를 거부합니다");
assert.equal(body.split(/[.!?]+/u).filter(Boolean).length, 2);
assert.equal(/severity|confidence|candidate|evidence-gap|gate/iu.test(body), false);

for (const [설명, field, value, pattern] of [
  ["빈 anchor", "anchor", "", /anchor must be path:line/],
  ["0번 줄 anchor", "anchor", "src/payment.js:0", /anchor line is invalid/],
  ["238자 의미 슬롯", "failure", "가".repeat(238), /exceeds 237 characters/],
  ["개행 주입", "correction", "수정한 뒤\n검증합니다", /must be one line/],
  ["합성 비밀값", "failure", "api key = synthetic-secret", /prohibited public pattern|two valid sentences/],
]) {
  assert.throws(() => evaluateCandidate(candidate({ public_finding: { ...PUBLIC_FINDING, [field]: value } })), pattern, 설명);
}
assert.equal(validatePublicFinding(`${"가".repeat(479)}. 다음 문장입니다.`).valid, true, "480자 문장을 허용합니다");
assert.throws(() => validatePublicFinding(`${"가".repeat(480)}. 다음 문장입니다.`), /exceeds 480 characters/, "481자 문장을 거부합니다");

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

assert.throws(
  () => evaluateCandidate(candidate({
    candidate_id: "finding-internal-period",
    public_finding: {
      ...PUBLIC_FINDING,
      failure: "The changed assertion accepts a declined card as success e.g. timeout",
    },
  })),
  /two valid sentences|exactly two complete sentences/,
);

assert.throws(
  () => validatePublicFinding("One sentence only."),
  /exactly two complete sentences/,
);

console.log("[test-review-finding-two-sentence] passed");
