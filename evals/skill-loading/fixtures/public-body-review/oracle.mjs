import assert from "node:assert/strict";
import {
  aggregateReview, decidePublication, evaluateCandidate, evaluateChecksEvidence,
  evaluatePublicationReceipt, evaluateReviewEvidence, renderPublicFinding,
  renderPublicReview, validatePublicFinding, validatePublicReview,
} from "../../../../ddalggak/scripts/review-contract-policy.mjs";

export function renderFixturePublic(inputs, writeAuthorized = true) {
  const candidate = evaluateCandidate(inputs.candidate);
  assert.equal(candidate.disposition, "BLOCKING");
  assert.equal(candidate.public_finding.anchor, "src/load.mjs:3");
  const aggregate = aggregateReview({ lifecycle: "OPEN", candidates: [candidate],
    reviewEvidence: evaluateReviewEvidence(inputs.reviewEvidence), checksEvidence: evaluateChecksEvidence(inputs.checksEvidence) });
  const publicationDecision = decidePublication({ aggregate,
    publicationReceipt: evaluatePublicationReceipt(inputs.publicationReceipt), writeAuthorized });
  // Authorization belongs ONLY to this local fixture sink, never to gh or a network runner.
  const summary = renderPublicReview({ publicationDecision, evidenceGapCount: aggregate.evidenceGapCount,
    reason: inputs.reason, nextAction: inputs.nextAction });
  const inline = renderPublicFinding({ publicationDecision, candidate });
  return { summary, inline, fixtureOnly: true, externalWriteAuthorized: false, outcome: aggregate.outcome };
}

export function checkPublic(observed, inputs) {
  assert.equal(observed.fixtureOnly, true);
  assert.equal(observed.externalWriteAuthorized, false);
  assert.equal(validatePublicReview(observed.summary).outcome, "CHANGES_REQUESTED");
  assert.equal(validatePublicFinding(observed.inline).valid, true);
  const expected = renderFixturePublic(inputs);
  // Shipped renderer equality binds the valid text to the admitted candidate, not arbitrary prose.
  assert.equal(observed.summary, expected.summary, "summary is not the shipped renderer output");
  assert.equal(observed.inline, expected.inline, "inline is not the admitted candidate output");
  return { summaryValid: true, inlineValid: true, fixtureOnly: true, externalWriteAuthorized: false };
}
