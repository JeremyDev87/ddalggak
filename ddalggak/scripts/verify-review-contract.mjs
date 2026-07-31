#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMISSION_FIELDS,
  ADMISSION_SCHEMA_VERSION,
  CHECK_EVIDENCE_FIELDS,
  COUNTEREXAMPLE_FIELDS,
  PUBLICATION_RECEIPT_FIELDS,
  REVIEW_EVIDENCE_FIELDS,
  SEMANTIC_COVERAGE_FIELDS,
  aggregateReview,
  decidePublication,
  evaluateCandidate,
  evaluateChecksEvidence,
  evaluatePublicationReceipt,
  evaluateReviewEvidence,
  renderPublicFinding,
  renderPublicReview,
  validateAdmissionRecord,
  validatePublicFinding,
  validatePublicReview,
} from "./review-contract-policy.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtures = JSON.parse(readFileSync(join(root, "references", "review-admission-fixtures.json"), "utf8"));
const contractFiles = [
  "SKILL.md",
  "references/cross-review-loop.md",
  "references/review-comment-style.md",
  "references/review-output-contract.md",
  "templates/review-brief.md",
];
const contract = contractFiles.map((path) => readFileSync(join(root, path), "utf8")).join("\n");
const errors = [];
const ids = new Set();

function addId(id, group) {
  if (!id || ids.has(id)) errors.push(`${group}: duplicate or missing id: ${id}`);
  ids.add(id);
}

function candidateInput(overrides = {}, lifecycle) {
  return { ...fixtures.baseCandidate, ...overrides, ...(lifecycle ? { lifecycle } : {}) };
}

function resolveCandidate(id, lifecycle) {
  const scenario = fixtures.candidateScenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`unknown candidate scenario: ${id}`);
  return evaluateCandidate(candidateInput(scenario.overrides, lifecycle));
}

function reviewEvidenceInput(overrides = {}) {
  return {
    ...fixtures.baseReviewEvidence,
    ...overrides,
    semantic_coverage: (overrides.semantic_coverage ?? fixtures.baseReviewEvidence.semantic_coverage).map((row) => ({ ...row })),
    counterexample: { ...fixtures.baseReviewEvidence.counterexample, ...(overrides.counterexample ?? {}) },
  };
}

function resolveReviewEvidence(id, lifecycle = "OPEN") {
  const scenario = fixtures.reviewEvidenceScenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`unknown review evidence scenario: ${id}`);
  return evaluateReviewEvidence(reviewEvidenceInput({ ...scenario.overrides, lifecycle }));
}

function publicationReceipt(aggregate, overrides = {}) {
  return evaluatePublicationReceipt({ pr_number: aggregate.prNumber, lifecycle: aggregate.lifecycle, base_sha: aggregate.baseSha, head_sha: aggregate.headSha, ...overrides });
}

function runAggregateScenario(scenario) {
  const input = scenario.input;
  const reviewEvidence = resolveReviewEvidence(input.reviewEvidenceId, input.reviewEvidenceLifecycle ?? input.lifecycle);
  const checksEvidence = evaluateChecksEvidence({ pr_number: reviewEvidence.pr_number, lifecycle: input.lifecycle, base_sha: reviewEvidence.base_sha, head_sha: reviewEvidence.head_sha, status: input.checksStatus, justification: input.checksJustification ?? "", ...(input.checksOverrides ?? {}) });
  return aggregateReview({ lifecycle: input.lifecycle, candidates: input.candidateIds.map((id) => resolveCandidate(id, input.lifecycle)), reviewEvidence, checksEvidence });
}

if (fixtures.version !== ADMISSION_SCHEMA_VERSION) errors.push(`fixture version ${fixtures.version} does not match schema ${ADMISSION_SCHEMA_VERSION}`);
if (JSON.stringify(Object.keys(fixtures.baseCandidate ?? {})) !== JSON.stringify(ADMISSION_FIELDS)) errors.push("baseCandidate schema/order does not match executable admission schema");
if (JSON.stringify(fixtures.requiredAdmissionFields ?? []) !== JSON.stringify(ADMISSION_FIELDS)) errors.push("requiredAdmissionFields does not match executable admission schema");
if (JSON.stringify(fixtures.requiredReviewEvidenceFields ?? []) !== JSON.stringify(REVIEW_EVIDENCE_FIELDS)) errors.push("requiredReviewEvidenceFields does not match executable review evidence schema");
if (JSON.stringify(fixtures.requiredChecksEvidenceFields ?? []) !== JSON.stringify(CHECK_EVIDENCE_FIELDS)) errors.push("requiredChecksEvidenceFields does not match executable checks evidence schema");
if (JSON.stringify(fixtures.requiredPublicationReceiptFields ?? []) !== JSON.stringify(PUBLICATION_RECEIPT_FIELDS)) errors.push("requiredPublicationReceiptFields does not match executable publication receipt schema");
if (JSON.stringify(fixtures.requiredSemanticCoverageFields ?? []) !== JSON.stringify(SEMANTIC_COVERAGE_FIELDS)) errors.push("requiredSemanticCoverageFields does not match executable semantic coverage schema");
if (JSON.stringify(fixtures.requiredCounterexampleFields ?? []) !== JSON.stringify(COUNTEREXAMPLE_FIELDS)) errors.push("requiredCounterexampleFields does not match executable counterexample schema");
if (JSON.stringify(Object.keys(fixtures.baseReviewEvidence ?? {})) !== JSON.stringify(REVIEW_EVIDENCE_FIELDS)) errors.push("baseReviewEvidence schema/order does not match executable review evidence schema");
if (JSON.stringify(Object.keys(fixtures.baseReviewEvidence?.semantic_coverage?.[0] ?? {})) !== JSON.stringify(SEMANTIC_COVERAGE_FIELDS)) errors.push("base semantic coverage schema/order does not match executable schema");
if (JSON.stringify(Object.keys(fixtures.baseReviewEvidence?.counterexample ?? {})) !== JSON.stringify(COUNTEREXAMPLE_FIELDS)) errors.push("base counterexample schema/order does not match executable schema");
try { validateAdmissionRecord(fixtures.baseCandidate); } catch (error) { errors.push(`baseCandidate invalid: ${error.message}`); }
try { evaluateReviewEvidence(reviewEvidenceInput()); } catch (error) { errors.push(`baseReviewEvidence invalid: ${error.message}`); }

const admissionSection = readFileSync(join(root, "references", "cross-review-loop.md"), "utf8").match(/## Finding admission record\n([\s\S]*?)(?=\n## )/)?.[1] ?? "";
for (const field of ADMISSION_FIELDS) if (!admissionSection.includes(`${field}:`)) errors.push(`admission field absent from finding-admission section: ${field}`);
for (const marker of fixtures.requiredContractMarkers ?? []) {
  if (!contract.includes(marker)) errors.push(`contract marker absent: ${marker}`);
}
for (const marker of fixtures.prohibitedContractMarkers ?? []) {
  if (contract.includes(marker)) errors.push(`prohibited contract marker present: ${marker}`);
}
for (const [path, markers] of Object.entries(fixtures.requiredContractMarkersByFile ?? {})) {
  const text = readFileSync(join(root, path), "utf8");
  for (const marker of markers) {
    if (!text.includes(marker)) errors.push(`${path}: required file-local marker absent: ${marker}`);
  }
}
for (const path of contractFiles) {
  const text = readFileSync(join(root, path), "utf8");
  if (!text.trim()) errors.push(`${path}: empty contract file`);
  const fenceCount = text.split("\n").filter((line) => /^\s*```/.test(line)).length;
  if (fenceCount % 2 !== 0) errors.push(`${path}: unbalanced Markdown fences`);
  if (text.includes("/Users/")) errors.push(`${path}: host path leaked into contract`);
}

if ((fixtures.candidateScenarios ?? []).length < 18) errors.push("expected at least 18 candidate scenarios");
if ((fixtures.negativeAdmissionScenarios ?? []).length < 1) errors.push("expected at least 1 negative admission scenario");
if ((fixtures.reviewEvidenceScenarios ?? []).length < 5) errors.push("expected at least 5 review evidence scenarios");
if ((fixtures.aggregateScenarios ?? []).length < 19) errors.push("expected at least 19 aggregate scenarios");
if ((fixtures.publicationScenarios ?? []).length < 5) errors.push("expected at least 5 publication scenarios");
if ((fixtures.rendererScenarios ?? []).length < 3) errors.push("expected at least 3 renderer scenarios");
if ((fixtures.findingRendererScenarios ?? []).length < 1) errors.push("expected at least 1 finding renderer scenario");

for (const scenario of fixtures.candidateScenarios ?? []) {
  addId(scenario.id, "candidate");
  try {
    const actual = evaluateCandidate(candidateInput(scenario.overrides));
    for (const key of ["disposition", "publication_eligible"]) {
      if (actual[key] !== scenario.expected[key]) errors.push(`${scenario.id}: ${key} expected ${scenario.expected[key]} but got ${actual[key]}`);
    }
  } catch (error) {
    errors.push(`${scenario.id}: ${error.message}`);
  }
}

for (const scenario of fixtures.negativeAdmissionScenarios ?? []) {
  addId(scenario.id, "negative-admission");
  try {
    validateAdmissionRecord(candidateInput(scenario.overrides));
    errors.push(`${scenario.id}: expected validation failure`);
  } catch (error) {
    if (!String(error.message).includes(scenario.expectedError)) errors.push(`${scenario.id}: wrong validation failure: ${error.message}`);
  }
}

for (const scenario of fixtures.reviewEvidenceScenarios ?? []) {
  addId(scenario.id, "review-evidence");
  try {
    const actual = evaluateReviewEvidence(reviewEvidenceInput(scenario.overrides));
    for (const key of ["requiredEvidenceMissing", "evidenceGapCount"]) {
      if (actual[key] !== scenario.expected[key]) errors.push(`${scenario.id}: ${key} expected ${scenario.expected[key]} but got ${actual[key]}`);
    }
  } catch (error) {
    errors.push(`${scenario.id}: ${error.message}`);
  }
}

const aggregateResults = new Map();
for (const scenario of fixtures.aggregateScenarios ?? []) {
  addId(scenario.id, "aggregate");
  try {
    const actual = runAggregateScenario(scenario);
    if (scenario.expectedError) {
      errors.push(`${scenario.id}: expected error containing ${scenario.expectedError}`);
      continue;
    }
    aggregateResults.set(scenario.id, actual);
    for (const key of ["outcome", "reviewCompletionEligible"]) {
      if (actual[key] !== scenario.expected[key]) errors.push(`${scenario.id}: ${key} expected ${scenario.expected[key]} but got ${actual[key]}`);
    }
  } catch (error) {
    if (!scenario.expectedError || !String(error.message).includes(scenario.expectedError)) errors.push(`${scenario.id}: ${error.message}`);
  }
}

for (const scenario of fixtures.publicationScenarios ?? []) {
  addId(scenario.id, "publication");
  try {
    const aggregate = aggregateResults.get(scenario.aggregateId);
    if (!aggregate) throw new Error(`unknown aggregate scenario: ${scenario.aggregateId}`);
    const actual = decidePublication({ aggregate, publicationReceipt: publicationReceipt(aggregate, scenario.receiptOverrides), writeAuthorized: scenario.writeAuthorized });
    if (scenario.expectedError) { errors.push(`${scenario.id}: expected error containing ${scenario.expectedError}`); continue; }
    if (actual.publicationEligible !== scenario.expected) errors.push(`${scenario.id}: publicationEligible expected ${scenario.expected} but got ${actual.publicationEligible}`);
  } catch (error) {
    if (!scenario.expectedError || !String(error.message).includes(scenario.expectedError)) errors.push(`${scenario.id}: ${error.message}`);
  }
}

for (const scenario of fixtures.rendererScenarios ?? []) {
  addId(scenario.id, "renderer");
  try {
    const aggregate = aggregateResults.get(scenario.aggregateId);
    if (!aggregate) throw new Error(`unknown aggregate scenario: ${scenario.aggregateId}`);
    const publicationDecision = decidePublication({ aggregate, publicationReceipt: publicationReceipt(aggregate), writeAuthorized: true });
    const body = renderPublicReview({
      publicationDecision,
      evidenceGapCount: aggregate.evidenceGapCount,
      reason: "검증된 공개 결론입니다.",
      nextAction: "none",
    });
    const validation = validatePublicReview(body);
    if (!validation.valid) errors.push(`${scenario.id}: renderer validation did not pass`);
  } catch (error) {
    errors.push(`${scenario.id}: ${error.message}`);
  }
}

for (const scenario of fixtures.findingRendererScenarios ?? []) {
  addId(scenario.id, "finding-renderer");
  try {
    const candidate = resolveCandidate(scenario.candidateId, scenario.lifecycle);
    const reviewEvidence = resolveReviewEvidence("complete", scenario.lifecycle);
    const aggregate = aggregateReview({ lifecycle: scenario.lifecycle, candidates: [candidate], reviewEvidence, checksEvidence: evaluateChecksEvidence({ pr_number: reviewEvidence.pr_number, lifecycle: scenario.lifecycle, base_sha: reviewEvidence.base_sha, head_sha: reviewEvidence.head_sha, status: "PASS", justification: "" }) });
    const publicationDecision = decidePublication({ aggregate, publicationReceipt: publicationReceipt(aggregate), writeAuthorized: true });
    const body = renderPublicFinding({ publicationDecision, candidate });
    const validation = validatePublicFinding(body);
    if (!validation.valid) errors.push(`${scenario.id}: finding renderer validation did not pass`);
  } catch (error) {
    errors.push(`${scenario.id}: ${error.message}`);
  }
}

try {
  validateAdmissionRecord(candidateInput({ authority: "unknown" }));
  errors.push("unknown authority did not fail closed");
} catch (error) {
  if (!String(error.message).includes("unknown authority")) errors.push(`unknown authority failed for wrong reason: ${error.message}`);
}

if (errors.length) {
  console.error("[verify-review-contract] failed");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`[verify-review-contract] passed: schema v${ADMISSION_SCHEMA_VERSION}, ${fixtures.candidateScenarios.length} candidate, ${fixtures.negativeAdmissionScenarios.length} negative admission, ${fixtures.reviewEvidenceScenarios.length} review evidence, ${fixtures.aggregateScenarios.length} aggregate, ${fixtures.publicationScenarios.length} publication, ${fixtures.rendererScenarios.length} summary renderer, ${fixtures.findingRendererScenarios.length} finding renderer scenarios`);
