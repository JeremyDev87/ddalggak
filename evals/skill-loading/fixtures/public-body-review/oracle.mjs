import assert from "node:assert/strict";
import {
  aggregateReview, decidePublication, evaluateCandidate, evaluateChecksEvidence,
  evaluatePublicationReceipt, evaluateReviewEvidence, renderPublicFinding,
  validatePublicFinding,
} from "../../../../ddalggak/scripts/review-contract-policy.mjs";

export function renderFixturePublic(inputs, writeAuthorized = true) {
  const candidate = evaluateCandidate(inputs.candidate);
  assert.equal(candidate.disposition, "BLOCKING");
  assert.equal(candidate.public_finding.anchor, "src/load.mjs:3");
  const aggregate = aggregateReview({ lifecycle: "OPEN", candidates: [candidate],
    reviewEvidence: evaluateReviewEvidence(inputs.reviewEvidence), checksEvidence: evaluateChecksEvidence(inputs.checksEvidence) });
  const publicationDecision = decidePublication({ aggregate,
    publicationReceipt: evaluatePublicationReceipt(inputs.publicationReceipt), writeAuthorized });
  // 권한은 로컬 fixture에만 적용하며 외부 게시 권한을 부여하지 않습니다.
  const inline = renderPublicFinding({ publicationDecision, candidate });
  return { inline, fixtureOnly: true, externalWriteAuthorized: false, outcome: aggregate.outcome };
}

export function checkPublic(observed, inputs) {
  assert.equal(observed.fixtureOnly, true);
  assert.equal(observed.externalWriteAuthorized, false);
  assert.equal(Object.hasOwn(observed, "summary"), false, "기본 fixture는 public summary를 허용하지 않습니다");
  assert.equal(validatePublicFinding(observed.inline).valid, true);
  const expected = renderFixturePublic(inputs);
  // 렌더러 일치로 공개 문구를 승인된 후보에 연결합니다.
  assert.equal(observed.inline, expected.inline, "inline is not the admitted candidate output");
  return { inlineValid: true, fixtureOnly: true, externalWriteAuthorized: false };
}
