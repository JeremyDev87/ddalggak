#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMISSION_FIELDS,
  ADMISSION_SCHEMA_VERSION,
  aggregateReview,
  decidePublication,
  evaluateCandidate,
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

function runAggregateScenario(scenario) {
  const input = scenario.input;
  return aggregateReview({
    lifecycle: input.lifecycle,
    candidates: input.candidateIds.map((id) => resolveCandidate(id, input.lifecycle)),
    requiredEvidenceMissing: input.requiredEvidenceMissing,
    substantiveReview: input.substantiveReview,
    checksStatus: input.checksStatus,
    ...(input.checksJustification ? { checksJustification: input.checksJustification } : {}),
  });
}

if (fixtures.version !== ADMISSION_SCHEMA_VERSION) errors.push(`fixture version ${fixtures.version} does not match schema ${ADMISSION_SCHEMA_VERSION}`);
if (JSON.stringify(Object.keys(fixtures.baseCandidate ?? {})) !== JSON.stringify(ADMISSION_FIELDS)) errors.push("baseCandidate schema/order does not match executable admission schema");
if (JSON.stringify(fixtures.requiredAdmissionFields ?? []) !== JSON.stringify(ADMISSION_FIELDS)) errors.push("requiredAdmissionFields does not match executable admission schema");
try { validateAdmissionRecord(fixtures.baseCandidate); } catch (error) { errors.push(`baseCandidate invalid: ${error.message}`); }

for (const field of fixtures.requiredAdmissionFields ?? []) {
  if (!contract.includes(`${field}:`)) errors.push(`admission field absent from contract: ${field}`);
}
for (const marker of fixtures.requiredContractMarkers ?? []) {
  if (!contract.includes(marker)) errors.push(`contract marker absent: ${marker}`);
}
for (const marker of fixtures.prohibitedContractMarkers ?? []) {
  if (contract.includes(marker)) errors.push(`prohibited contract marker present: ${marker}`);
}
for (const path of contractFiles) {
  const text = readFileSync(join(root, path), "utf8");
  if (!text.trim()) errors.push(`${path}: empty contract file`);
  const fenceCount = text.split("\n").filter((line) => /^\s*```/.test(line)).length;
  if (fenceCount % 2 !== 0) errors.push(`${path}: unbalanced Markdown fences`);
  if (text.includes("/Users/")) errors.push(`${path}: host path leaked into contract`);
}

if ((fixtures.candidateScenarios ?? []).length < 12) errors.push("expected at least 12 candidate scenarios");
if ((fixtures.negativeAdmissionScenarios ?? []).length < 1) errors.push("expected at least 1 negative admission scenario");
if ((fixtures.aggregateScenarios ?? []).length < 12) errors.push("expected at least 12 aggregate scenarios");
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

const aggregateResults = new Map();
for (const scenario of fixtures.aggregateScenarios ?? []) {
  addId(scenario.id, "aggregate");
  try {
    const actual = runAggregateScenario(scenario);
    aggregateResults.set(scenario.id, actual);
    for (const key of ["outcome", "reviewCompletionEligible"]) {
      if (actual[key] !== scenario.expected[key]) errors.push(`${scenario.id}: ${key} expected ${scenario.expected[key]} but got ${actual[key]}`);
    }
  } catch (error) {
    errors.push(`${scenario.id}: ${error.message}`);
  }
}

for (const scenario of fixtures.publicationScenarios ?? []) {
  addId(scenario.id, "publication");
  try {
    const aggregate = aggregateResults.get(scenario.aggregateId);
    if (!aggregate) throw new Error(`unknown aggregate scenario: ${scenario.aggregateId}`);
    const actual = decidePublication({ aggregate, writeAuthorized: scenario.writeAuthorized });
    if (actual.publicationEligible !== scenario.expected) errors.push(`${scenario.id}: publicationEligible expected ${scenario.expected} but got ${actual.publicationEligible}`);
  } catch (error) {
    errors.push(`${scenario.id}: ${error.message}`);
  }
}

for (const [index, scenario] of (fixtures.rendererScenarios ?? []).entries()) {
  addId(scenario.id, "renderer");
  try {
    const aggregate = aggregateResults.get(scenario.aggregateId);
    if (!aggregate) throw new Error(`unknown aggregate scenario: ${scenario.aggregateId}`);
    const body = renderPublicReview({
      aggregate,
      prNumber: index + 1,
      headSha: String(index + 1).padStart(40, "0"),
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
    const aggregate = aggregateReview({
      lifecycle: scenario.lifecycle,
      candidates: [candidate],
      requiredEvidenceMissing: false,
      substantiveReview: true,
      checksStatus: "PASS",
    });
    const body = renderPublicFinding({ aggregate, candidate });
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
console.log(`[verify-review-contract] passed: schema v${ADMISSION_SCHEMA_VERSION}, ${fixtures.candidateScenarios.length} candidate, ${fixtures.negativeAdmissionScenarios.length} negative admission, ${fixtures.aggregateScenarios.length} aggregate, ${fixtures.publicationScenarios.length} publication, ${fixtures.rendererScenarios.length} summary renderer, ${fixtures.findingRendererScenarios.length} finding renderer scenarios`);
