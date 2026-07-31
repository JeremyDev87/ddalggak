#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  ADMISSION_FIELDS,
  aggregateReview,
  decidePublication,
  evaluateCandidate,
  renderPublicFinding,
  renderPublicReview,
  validateAdmissionRecord,
  validatePublicFinding,
  validatePublicReview,
} from "./review-contract-policy.mjs";

function candidate(overrides = {}) {
  return {
    candidate_id: "candidate-1",
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
    ...overrides,
  };
}

assert.equal(ADMISSION_FIELDS.length, 17);
assert.deepEqual(Object.keys(candidate()), ADMISSION_FIELDS);

assert.throws(() => validateAdmissionRecord(candidate({ authority: "unknown" })), /unknown authority/);
assert.throws(() => validateAdmissionRecord(candidate({ governing_contract: "PROVEN" })), /requires classified evidence detail/);
for (const field of ADMISSION_FIELDS) {
  const value = candidate();
  delete value[field];
  assert.throws(() => validateAdmissionRecord(value), new RegExp(`missing admission field: ${field}`));
}
assert.throws(
  () => validateAdmissionRecord(candidate({ severity: "HIGH", observed_delta: "NONE: no observed delta" })),
  /severity requires a defect delta/,
);

const blocking = evaluateCandidate(candidate());
assert.equal(blocking.disposition, "BLOCKING");
assert.equal(blocking.publication_eligible, true);
assert.equal(evaluateCandidate(candidate({ observed_delta: "STYLE_DIFFERENCE: intentional visual choice", governing_contract: "NOT_APPLICABLE: no mandatory style contract", impact: "NOT_PROVEN: no user impact", severity: "NONE" })).disposition, "DROP");
assert.equal(evaluateCandidate(candidate({ prior_decision: "ACCEPTED_NO_COUNTEREVIDENCE: accepted trade-off remains current", counterargument_disproof: "NOT_APPLICABLE: no fresh counterevidence exists" })).disposition, "DROP");
assert.equal(evaluateCandidate(candidate({ prior_decision: "ACCEPTED_NO_COUNTEREVIDENCE: accepted trade-off cannot be revalidated", governing_contract: "UNKNOWN: current contract not recovered", scope_relation: "UNKNOWN: current scope unresolved", base_state: "UNKNOWN: base not inspected", current_head_evidence: "UNKNOWN: current head not reproduced", diff_causality: "UNKNOWN: diff causality unresolved", impact: "UNKNOWN: impact unresolved", counterargument: "UNKNOWN: intent not recovered", counterargument_disproof: "UNKNOWN: fresh counterevidence not checked", minimum_correction: "UNKNOWN: correction cannot be scoped" })).disposition, "REVIEW_BLOCKED");
assert.equal(evaluateCandidate(candidate({ prior_decision: "UNKNOWN: review history unavailable" })).disposition, "REVIEW_BLOCKED");
assert.equal(evaluateCandidate(candidate({ observed_delta: "PROCESS_GAP: required acceptance evidence is absent", governing_contract: "PROVEN: acceptance contract requires the evidence", current_head_evidence: "UNKNOWN: required evidence unavailable", diff_causality: "UNRELATED: process evidence is not a code delta", impact: "UNKNOWN: completion cannot be established", counterargument: "NOT_APPLICABLE: no defect claim", counterargument_disproof: "NOT_APPLICABLE: no counterclaim", minimum_correction: "UNKNOWN: evidence must be supplied", severity: "NONE" })).disposition, "REVIEW_BLOCKED");
assert.equal(evaluateCandidate(candidate({ observed_delta: "PROCESS_GAP: required acceptance evidence is absent", governing_contract: "PROVEN: acceptance contract requires the evidence", prior_decision: "ACCEPTED_NO_COUNTEREVIDENCE: prior review accepted the state", current_head_evidence: "PROVEN: required artifact is absent", diff_causality: "UNRELATED: process evidence is not a code delta", impact: "NOT_APPLICABLE: completion evidence rather than product impact", counterargument: "NOT_APPLICABLE: no defect claim", counterargument_disproof: "NOT_APPLICABLE: no counterclaim", minimum_correction: "PROPOSED: provide the required artifact", severity: "NONE" })).disposition, "REVIEW_BLOCKED");
assert.equal(evaluateCandidate(candidate({ observed_delta: "PROCESS_GAP: required acceptance evidence is absent", governing_contract: "PROVEN: acceptance contract requires the evidence", base_state: "UNCHANGED: artifact was also absent in base", scope_relation: "OUT_OF_SCOPE: code ownership is unchanged", current_head_evidence: "PROVEN: required artifact is absent", diff_causality: "UNCHANGED: current diff did not change the artifact", impact: "NOT_APPLICABLE: completion evidence rather than product impact", counterargument: "NOT_APPLICABLE: no defect claim", counterargument_disproof: "NOT_APPLICABLE: no counterclaim", minimum_correction: "PROPOSED: provide the required artifact", severity: "NONE" })).disposition, "REVIEW_BLOCKED");
assert.equal(evaluateCandidate(candidate({ base_state: "UNCHANGED: same behavior in base", scope_relation: "OUT_OF_SCOPE: linked issue does not own it", diff_causality: "UNCHANGED: current diff did not worsen it" })).disposition, "DROP");
const reviewBlockedCandidate = evaluateCandidate(candidate({ authority: "SUBREVIEW", current_head_evidence: "UNKNOWN: conductor has not reproduced it" }));
assert.equal(reviewBlockedCandidate.disposition, "REVIEW_BLOCKED");
const provenSubreviewCandidate = evaluateCandidate(candidate({ authority: "SUBREVIEW" }));
assert.equal(provenSubreviewCandidate.disposition, "REVIEW_BLOCKED");
assert.equal(provenSubreviewCandidate.publication_eligible, false);
assert.throws(
  () => validateAdmissionRecord(candidate({ prior_decision: "ACCEPTED_NO_COUNTEREVIDENCE: accepted before the current regression", base_state: "WORSENED_OR_EXPOSED: current head expands exposure", diff_causality: "WORSENED: current diff worsens the accepted state" })),
  /accepted-no-counterevidence contradicts current-head worsening/,
);
assert.throws(
  () => validateAdmissionRecord(candidate({ prior_decision: "ACCEPTED_NO_COUNTEREVIDENCE: accepted trade-off", counterargument_disproof: "PROVEN: fresh evidence disproves the trade-off" })),
  /accepted-no-counterevidence contradicts proven counterevidence/,
);

const approved = aggregateReview({ lifecycle: "OPEN", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" });
assert.equal(approved.outcome, "APPROVE");
assert.equal(approved.reviewCompletionEligible, true);
assert.equal(Object.isFrozen(approved), true);
assert.equal(Object.isFrozen(approved.counts), true);
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PENDING" }).outcome, "BLOCKED");
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PENDING" }).reviewCompletionEligible, false);
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "FAIL" }).outcome, "BLOCKED");
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [blocking], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" }).outcome, "CHANGES_REQUESTED");
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [blocking], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PENDING" }).outcome, "BLOCKED");
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [blocking], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PENDING" }).reviewCompletionEligible, false);
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [reviewBlockedCandidate], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" }).counts.high, 0);
const reviewBlockedCandidate2 = evaluateCandidate(candidate({ candidate_id: "candidate-2", authority: "SUBREVIEW", current_head_evidence: "UNKNOWN: conductor has not reproduced it" }));
const reviewBlockedCandidate3 = evaluateCandidate(candidate({ candidate_id: "candidate-3", authority: "SUBREVIEW", current_head_evidence: "UNKNOWN: conductor has not reproduced it" }));
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [reviewBlockedCandidate, reviewBlockedCandidate2, reviewBlockedCandidate3], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" }).evidenceGapCount, 3);
assert.throws(
  () => aggregateReview({ lifecycle: "OPEN", candidates: [blocking, evaluateCandidate(candidate())], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" }),
  /duplicate candidate_id/,
);
assert.throws(
  () => aggregateReview({ lifecycle: "OPEN", candidates: [{ ...candidate({ current_head_evidence: "UNKNOWN: unavailable" }), disposition: "BLOCKING", publication_eligible: true }], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" }),
  /candidate lacks evaluator provenance/,
);
assert.throws(() => aggregateReview({ lifecycle: "OPEN", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "NOT_APPLICABLE" }), /checksJustification/);
assert.equal(aggregateReview({ lifecycle: "OPEN", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "NOT_APPLICABLE", checksJustification: "No executable checks apply to this documentation-only review." }).outcome, "APPROVE");
assert.equal(aggregateReview({ lifecycle: "MERGED", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" }).outcome, "NO_FOLLOW_UP");
assert.equal(aggregateReview({ lifecycle: "MERGED", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PENDING" }).outcome, "BLOCKED");
assert.equal(aggregateReview({ lifecycle: "CLOSED_UNMERGED", candidates: [], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" }).outcome, "NO_ACTION");

const noWrite = decidePublication({ aggregate: approved, writeAuthorized: false });
assert.equal(noWrite.publicationEligible, false);
assert.equal(decidePublication({ aggregate: approved, writeAuthorized: true }).publicationEligible, true);
assert.throws(
  () => decidePublication({ aggregate: { lifecycle: "OPEN", checksStatus: "PASS", outcome: "APPROVE", reviewCompletionEligible: true, counts: { critical: 0, high: 0, medium: 0, low: 0 }, blockingCount: 0, admittedFindingCount: 0, evidenceGapCount: 0 }, writeAuthorized: true }),
  /aggregate result lacks producer provenance/,
);
assert.throws(
  () => decidePublication({ aggregate: { ...approved, counts: { ...approved.counts, high: 1 } }, writeAuthorized: true }),
  /aggregate severity count does not match admitted findings/,
);
assert.throws(
  () => decidePublication({ aggregate: { ...approved, checksStatus: "FAIL" }, writeAuthorized: true }),
  /completion-eligible aggregate requires passing or not-applicable checks/,
);

const body = renderPublicReview({
  aggregate: approved,
  prNumber: 1,
  headSha: "0123456789abcdef0123456789abcdef01234567",
  evidenceGapCount: 0,
  reason: "필수 검증과 substantive review가 완료되었습니다.",
  nextAction: "none",
});
assert.equal(validatePublicReview(body).valid, true);
assert.throws(
  () => renderPublicReview({ aggregate: approved, prNumber: 1, headSha: "0123456789abcdef0123456789abcdef01234567", evidenceGapCount: 1, reason: "필수 검증이 완료되었습니다.", nextAction: "none" }),
  /evidenceGapCount does not match aggregate/,
);
assert.equal(body.includes("candidate_id"), false);
assert.equal(body.includes("Wiki Context Manifest"), false);
assert.throws(() => validatePublicReview(`${body}\nCandidate ledger`), /prohibited public token/);
assert.throws(
  () => renderPublicReview({ aggregate: approved, prNumber: 1, headSha: "0123456789abcdef0123456789abcdef01234567", evidenceGapCount: 0, reason: "/Users/example/private", nextAction: "none" }),
  /prohibited public pattern/,
);
assert.throws(
  () => renderPublicReview({ aggregate: approved, prNumber: 1, headSha: "0123456789abcdef0123456789abcdef01234567", evidenceGapCount: 0, reason: "x-api-key: live-secret-value", nextAction: "none" }),
  /prohibited public pattern/,
);
assert.throws(
  () => renderPublicReview({ aggregate: approved, prNumber: 1, headSha: "0123456789abcdef0123456789abcdef01234567", evidenceGapCount: 0, reason: "quality lens router passed.", nextAction: "none" }),
  /prohibited public token/,
);
for (const leakedValue of [
  "secret=synthetic-secret-value",
  ["gh", "p"].join("") + "_" + "a".repeat(30),
  "Cookie: session=synthetic-value",
  "session_id=synthetic-session-value",
  "session-id=synthetic-session-value",
  "sess ion-id=synthetic-session-value",
  "sess​ion-id=synthetic-session-value",
  "api key = synthetic-api-value",
  "Bearer synthetic-token-value",
  "ｓｅｓｓｉｏｎ－ｉｄ=synthetic-session-value",
  "session‐id=synthetic-session-value",
  "session‑id=synthetic-session-value",
  "session∕id=synthetic-session-value",
  "session⁓id=synthetic-session-value",
  "sessiońid=synthetic-session-value",
  "sessionͅid=synthetic-session-value",
  "sessioǹid＝synthetic-session-value",
  "sessiońid：synthetic-session-value",
  "session₨id⁼synthetic-session-value",
  "sessionͅid﹦synthetic-session-value",
  "/private/var/folders/aa/synthetic",
  "/var/folders/aa/synthetic",
  "/private/tmp/synthetic-review",
  "/tmp/synthetic-review",
  "/home/synthetic-user/private",
  "/Volumes/private-volume/synthetic",
  "~/private/synthetic",
  "C:\\Users\\synthetic-user\\private",
  "C:/Users/synthetic-user/private",
  "('/Users/synthetic-user/private')",
  "path=/private/tmp/synthetic-review",
  "'/root/synthetic-private'",
  "~root/synthetic-private",
  "~123user/synthetic-private",
  ".hermes/profiles/synthetic/config.yaml",
  "~synthetic‐admin/synthetic-private",
  "~root∕synthetic-private",
  "https://github.com/synthetic-private/repository/issues/1",
  "github.com/synthetic-private/repository/issues/1",
  "synthetic-private/repository#1",
  "synthetic‐private/repository#1",
  ":synthetic-private/repository#1",
  ",synthetic-private/repository#1",
  "[synthetic-private/repository#1]",
  "{synthetic-private/repository#1}",
  "git@github.com:synthetic-private/repository.git",
  "_github.com/synthetic-private/repository/issues/1",
  "_https://github.com/synthetic-private/repository/issues/1",
  "_git@github.com:synthetic-private/repository.git",
  "‿github.com/synthetic-private/repository/issues/1",
  "ͅgithub.com/synthetic-private/repository/issues/1",
  "ͅhttps://github.com/synthetic-private/repository/issues/1",
  "ͅgit@github.com:synthetic-private/repository.git",
]) {
  assert.throws(
    () => renderPublicReview({ aggregate: approved, prNumber: 1, headSha: "0123456789abcdef0123456789abcdef01234567", evidenceGapCount: 0, reason: leakedValue, nextAction: "none" }),
    /prohibited public pattern/,
    `public review leak was accepted: ${JSON.stringify(leakedValue)}`,
  );
}
assert.throws(() => validatePublicReview(`${body}\nqmd://wiki/private`), /prohibited public pattern/);
assert.throws(() => validatePublicReview(`${body}\nAuthorization: Bearer [REDACTED]`), /prohibited public pattern/);
assert.throws(
  () => validatePublicReview(body.replace("\n<!-- ddalggak-review-contract", "\nextra detail\n<!-- ddalggak-review-contract")),
  /review body must match the deterministic allowlist/,
);
assert.throws(() => validatePublicReview(body.replace("High 0", "High 1")), /review marker does not match public counts/);

const blockingAggregate = aggregateReview({ lifecycle: "OPEN", candidates: [blocking], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" });
const findingBody = renderPublicFinding({ aggregate: blockingAggregate, candidate: blocking });
assert.equal(validatePublicFinding(findingBody).valid, true);
const sessionLeakCandidate = evaluateCandidate(candidate({ candidate_id: "candidate-session-leak", current_head_evidence: "PROVEN: session-id=synthetic-session-value" }));
const sessionLeakAggregate = aggregateReview({ lifecycle: "OPEN", candidates: [sessionLeakCandidate], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" });
assert.throws(() => renderPublicFinding({ aggregate: sessionLeakAggregate, candidate: sessionLeakCandidate }), /prohibited public pattern/);
for (const [index, leakedValue] of [
  "sess ion-id=synthetic-session-value",
  "sess​ion-id=synthetic-session-value",
  "api key = synthetic-api-value",
  "Bearer synthetic-token-value",
  "session‐id=synthetic-session-value",
  "session‑id=synthetic-session-value",
  "session∕id=synthetic-session-value",
  "session⁓id=synthetic-session-value",
  "sessiońid=synthetic-session-value",
  "sessionͅid=synthetic-session-value",
  "sessioǹid＝synthetic-session-value",
  "sessiońid：synthetic-session-value",
  "session₨id⁼synthetic-session-value",
  "sessionͅid﹦synthetic-session-value",
  "~root/synthetic-private",
  "~123user/synthetic-private",
  ".hermes/profiles/synthetic/config.yaml",
  "~synthetic‐admin/synthetic-private",
  "~root∕synthetic-private",
  "github.com/synthetic-private/repository/issues/1",
  "synthetic-private/repository#1",
  "synthetic‐private/repository#1",
  ":synthetic-private/repository#1",
  ",synthetic-private/repository#1",
  "[synthetic-private/repository#1]",
  "{synthetic-private/repository#1}",
  "_github.com/synthetic-private/repository/issues/1",
  "_https://github.com/synthetic-private/repository/issues/1",
  "_git@github.com:synthetic-private/repository.git",
  "‿github.com/synthetic-private/repository/issues/1",
  "ͅgithub.com/synthetic-private/repository/issues/1",
  "ͅhttps://github.com/synthetic-private/repository/issues/1",
  "ͅgit@github.com:synthetic-private/repository.git",
].entries()) {
  const candidateWithLeak = evaluateCandidate(candidate({ candidate_id: `candidate-adjacent-leak-${index}`, current_head_evidence: `PROVEN: ${leakedValue}` }));
  const aggregateWithLeak = aggregateReview({ lifecycle: "OPEN", candidates: [candidateWithLeak], requiredEvidenceMissing: false, substantiveReview: true, checksStatus: "PASS" });
  assert.throws(() => renderPublicFinding({ aggregate: aggregateWithLeak, candidate: candidateWithLeak }), /prohibited public pattern/);
}
assert.throws(() => renderPublicFinding({ symptom: "fabricated", violatedContract: "fabricated", evidence: "fabricated", impact: "fabricated", smallestCorrection: "fabricated" }), /aggregate and candidate are required/);
assert.throws(() => renderPublicFinding({ aggregate: blockingAggregate, candidate: evaluateCandidate(candidate({ candidate_id: "candidate-unbound" })) }), /candidate is not a member of aggregate/);
assert.throws(() => validatePublicFinding(`${findingBody}\nextra detail`), /finding body must match the deterministic allowlist/);

console.log("[test-review-policy-layers] passed: schema, candidate, aggregate, publication, renderer");
