import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import { loadCommandContracts } from "../../bin/lib/command-contracts.mjs";
import { conditionalAssets } from "../../core/conditional-assets.mjs";

const METRIC_FIELDS = Object.freeze([
  "toolCalls",
  "retries",
  "latencyMs",
  "inputTokens",
  "outputTokens",
  "reasoningTokens",
  "cacheReadTokens",
  "cacheWriteTokens",
  "costUsd",
]);

const CONTROL_FIELDS = Object.freeze([
  "modelRole",
  "provider",
  "model",
  "reasoning",
  "harness",
  "promptRef",
  "toolsetRef",
  "runtimeRef",
  "captureSource",
]);

const EXPECTED_COMPARISONS = Object.freeze([
  ["baseline-reasoning-full", "baseline-high-full", "baseline-medium-full", "reasoning"],
  ["baseline-harness-high", "baseline-high-full", "baseline-high-lean", "harness"],
  ["baseline-reasoning-lean", "baseline-high-lean", "baseline-medium-lean", "reasoning"],
  ["candidate-reasoning-full", "candidate-high-full", "candidate-medium-full", "reasoning"],
  ["candidate-harness-high", "candidate-high-full", "candidate-high-lean", "harness"],
  ["candidate-reasoning-lean", "candidate-high-lean", "candidate-medium-lean", "reasoning"],
  ["model-high-full", "baseline-high-full", "candidate-high-full", "model"],
  ["model-high-lean", "baseline-high-lean", "candidate-high-lean", "model"],
  ["model-medium-full", "baseline-medium-full", "candidate-medium-full", "model"],
  ["model-medium-lean", "baseline-medium-lean", "candidate-medium-lean", "model"],
]);

const MANIFEST_KEYS = new Set(["version", "captureMode", "conditionalReferenceUniverse", "matrix", "cases"]);
const MATRIX_KEYS = new Set(["variants", "comparisons"]);
const VARIANT_KEYS = new Set(["id", ...CONTROL_FIELDS]);
const COMPARISON_KEYS = new Set(["id", "left", "right", "axis"]);
const CASE_KEYS = new Set([
  "id", "taskClass", "requiredOutputSections", "allowedCompletionSignals", "allowedDecisions",
  "requiredMutationClasses", "allowedMutationClasses", "forbiddenMutationClasses",
  "requiresValidationEvidence", "requiresResumeFields", "conditionalReferences",
]);
const CONDITIONAL_REFERENCE_KEYS = new Set(["activation", "reference"]);
const RESULTS_KEYS = new Set(["version", "runs"]);
const RUN_KEYS = new Set(["runId", "caseId", "variantId", "controls", "observed"]);
const OBSERVED_KEYS = new Set([
  "outputSections", "completionSignal", "decision", "mutationClasses", "validationEvidence",
  "resumeStateFields", "loadedConditionalReferences", "skippedConditionalReferences", "metrics",
]);
const EVIDENCE_KEYS = new Set(["status", "artifactRef"]);
const EXPECTED_CASE_IDS = Object.freeze([
  "research-read-only",
  "plan-read-only",
  "implementation-positive-mutation",
  "review-evidence",
  "destructive-action-stop",
  "compaction-resume",
  "conditional-reference-routing",
]);
const EXPECTED_CASES_SHA256 = "b05150d2f15534a8be7b0c487b9b4936f062b0306dbe4e43b4d4571c5d0ef973";
const EVIDENCE_STATUSES = new Set(["pass", "fail"]);
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const EXPECTED_CONDITIONAL_REFERENCE_UNIVERSE = Object.freeze([...new Set(
  loadCommandContracts(REPO_ROOT)
    .filter((command) => ["plan", "start", "review"].includes(command.command))
    .flatMap((command) => conditionalAssets(command, "conditional_references").map((entry) => entry.asset)),
)].sort());

const FORBIDDEN_RAW_KEYS = new Set([
  "rawPrompt",
  "rawOutput",
  "prompt",
  "output",
  "messages",
  "message",
  "transcript",
  "content",
  "requestBody",
  "responseBody",
]);
const SECRET_KEY = /(api.?key|access.?token|refresh.?token|authorization|credential|password|secret)/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|bearer\s+[A-Za-z0-9._-]{12,})/i;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0) && new Set(value).size === value.length;
}

function sameStringSet(actual, expected) {
  return uniqueStrings(actual)
    && actual.length === expected.length
    && expected.every((entry) => actual.includes(entry));
}

function isNormalizedIdentifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/.test(value);
}

function isControlledRef(value, kind) {
  const immutable = kind === "git" ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/;
  const placeholder = /^[A-Z][A-Z0-9_]*$/;
  if (typeof value !== "string" || !value.startsWith(`${kind}:`)) return false;
  const suffix = value.slice(kind.length + 1);
  return immutable.test(suffix) || placeholder.test(suffix);
}

function rejectUnknownKeys(value, allowed, path, failures) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) failures.push(`${path}: unknown field ${key}`);
  }
}

function requireExactKeys(value, expected, path, failures) {
  if (!isObject(value)) return;
  rejectUnknownKeys(value, expected, path, failures);
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) failures.push(`${path}: missing field ${key}`);
  }
}

function isRelativeArtifactRef(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240) return false;
  if (!/^evidence\/[a-z0-9][a-z0-9._/-]*\.json$/.test(value)) return false;
  if (value.includes("://") || value.startsWith("data:")) return false;
  if (value.includes("\\") || value.includes(":")) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== ".." && /^[A-Za-z0-9._-]+$/.test(segment));
}

function scanSensitive(value, path = "$", failures = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSensitive(entry, `${path}[${index}]`, failures));
    return failures;
  }
  if (!isObject(value)) {
    if (typeof value === "string") {
      if (SECRET_VALUE.test(value)) failures.push(`${path}: token-like secret value is forbidden`);
      if (/^(?:\/Users\/|~\/)/.test(value)) failures.push(`${path}: user-home absolute artifact paths are forbidden`);
    }
    return failures;
  }
  for (const [key, entry] of Object.entries(value)) {
    const next = `${path}.${key}`;
    if (FORBIDDEN_RAW_KEYS.has(key)) failures.push(`${next}: raw/private payload field is forbidden`);
    if (SECRET_KEY.test(key)) failures.push(`${next}: secret-bearing field is forbidden`);
    scanSensitive(entry, next, failures);
  }
  return failures;
}

function validateManifest(manifest) {
  const failures = [];
  if (!isObject(manifest) || manifest.version !== 1) return ["manifest.version must equal 1"];
  requireExactKeys(manifest, MANIFEST_KEYS, "manifest", failures);
  if (!uniqueStrings(manifest.conditionalReferenceUniverse)) {
    failures.push("manifest.conditionalReferenceUniverse must be a unique string list");
  }
  if (!sameStringSet(manifest.conditionalReferenceUniverse, EXPECTED_CONDITIONAL_REFERENCE_UNIVERSE)) {
    failures.push(`manifest.conditionalReferenceUniverse must exactly match plan/start/review SSOT: ${EXPECTED_CONDITIONAL_REFERENCE_UNIVERSE.join(", ")}`);
  }
  const conditionalReferenceUniverse = new Set(array(manifest.conditionalReferenceUniverse));
  if (!["synthetic-template", "live"].includes(manifest.captureMode)) {
    failures.push("manifest.captureMode must be synthetic-template or live");
  }
  if (!isObject(manifest.matrix) || !Array.isArray(manifest.matrix.variants) || manifest.matrix.variants.length !== 8) {
    failures.push("manifest.matrix.variants must contain exactly eight baseline/candidate variants");
  }
  requireExactKeys(manifest.matrix, MATRIX_KEYS, "manifest.matrix", failures);
  const variantIds = new Set();
  for (const variant of array(manifest.matrix?.variants)) {
    if (!isObject(variant) || typeof variant.id !== "string" || variant.id.length === 0) {
      failures.push("every matrix variant needs a non-empty id");
      continue;
    }
    if (variantIds.has(variant.id)) failures.push(`duplicate matrix variant id: ${variant.id}`);
    variantIds.add(variant.id);
    requireExactKeys(variant, VARIANT_KEYS, `variant ${variant.id}`, failures);
    for (const field of CONTROL_FIELDS) {
      if (typeof variant[field] !== "string" || variant[field].length === 0) failures.push(`variant ${variant.id}: ${field} must be a non-empty string`);
    }
    const [expectedRole, expectedReasoning, expectedHarness] = variant.id.split("-");
    if (variant.modelRole !== expectedRole || variant.reasoning !== expectedReasoning || variant.harness !== expectedHarness) {
      failures.push(`variant ${variant.id}: modelRole/reasoning/harness must match its canonical id`);
    }
    if (!isNormalizedIdentifier(variant.provider) || !isNormalizedIdentifier(variant.model) || !isNormalizedIdentifier(variant.captureSource)) {
      failures.push(`variant ${variant.id}: provider/model/captureSource must be normalized identifiers`);
    }
    if (!isControlledRef(variant.promptRef, "sha256") || !isControlledRef(variant.toolsetRef, "sha256") || !isControlledRef(variant.runtimeRef, "git")) {
      failures.push(`variant ${variant.id}: prompt/tool/runtime refs must be immutable hashes or uppercase synthetic placeholders`);
    }
    if (!["baseline", "candidate"].includes(variant.modelRole)) failures.push(`variant ${variant.id}: modelRole must be baseline or candidate`);
    if (manifest.captureMode === "live") {
      if (/^(?:replace:|.*(?:PLACEHOLDER|PINNED|_PROMPT|_TOOLSET).*)/i.test(variant.provider) || /^(?:replace:|.*(?:PLACEHOLDER|BASELINE_MODEL|CANDIDATE_MODEL).*)/i.test(variant.model)) {
        failures.push(`variant ${variant.id}: live provider/model identifiers must be concrete`);
      }
      if (!/^sha256:[a-f0-9]{64}$/.test(variant.promptRef) || !/^sha256:[a-f0-9]{64}$/.test(variant.toolsetRef) || !/^git:[a-f0-9]{40}$/.test(variant.runtimeRef)) {
        failures.push(`variant ${variant.id}: live prompt/tool/runtime references must be immutable hashes`);
      }
      if (!/^attested:sha256:[a-f0-9]{64}$/.test(variant.captureSource)) {
        failures.push(`variant ${variant.id}: live captureSource must be an attested sha256 digest`);
      }
    } else if (variant.captureSource !== "synthetic-fixture-v1") {
      failures.push(`variant ${variant.id}: synthetic captureSource must be synthetic-fixture-v1`);
    }
  }
  const expectedOrder = [
    "baseline-high-full", "baseline-medium-full", "baseline-high-lean", "baseline-medium-lean",
    "candidate-high-full", "candidate-medium-full", "candidate-high-lean", "candidate-medium-lean",
  ];
  const actualOrder = array(manifest.matrix?.variants).map((variant) => variant.id);
  if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) failures.push(`matrix variants must be ordered ${expectedOrder.join(" -> ")}`);

  const comparisons = array(manifest.matrix?.comparisons);
  if (comparisons.length !== EXPECTED_COMPARISONS.length) {
    failures.push(`manifest.matrix.comparisons must contain exactly ${EXPECTED_COMPARISONS.length} controlled pairs`);
  }
  for (const [index, comparison] of comparisons.entries()) {
    requireExactKeys(comparison, COMPARISON_KEYS, `comparison ${comparison?.id || index}`, failures);
    if (!variantIds.has(comparison.left) || !variantIds.has(comparison.right)) failures.push(`comparison ${comparison.id || "<missing>"}: unknown variant`);
    if (!["reasoning", "harness", "model"].includes(comparison.axis)) failures.push(`comparison ${comparison.id || "<missing>"}: axis must be reasoning, harness, or model`);
    const expected = EXPECTED_COMPARISONS[index];
    if (expected && JSON.stringify([comparison.id, comparison.left, comparison.right, comparison.axis]) !== JSON.stringify(expected)) {
      failures.push(`comparison ${index}: expected controlled pair ${expected.join(" | ")}`);
    }
  }

  if (!Array.isArray(manifest.cases)) failures.push("manifest.cases must be an array");
  const actualCaseIds = array(manifest.cases).map((entry) => entry?.id);
  if (JSON.stringify(actualCaseIds) !== JSON.stringify(EXPECTED_CASE_IDS)) {
    failures.push(`manifest.cases must be the canonical ordered exact set: ${EXPECTED_CASE_IDS.join(" -> ")}`);
  }
  const casesSha256 = createHash("sha256").update(JSON.stringify(array(manifest.cases))).digest("hex");
  if (casesSha256 !== EXPECTED_CASES_SHA256) {
    failures.push("manifest.cases must exactly match the canonical behavioral contracts");
  }
  const caseIds = new Set();
  for (const testCase of array(manifest.cases)) {
    if (!isObject(testCase) || typeof testCase.id !== "string" || testCase.id.length === 0) {
      failures.push("every case needs a non-empty id");
      continue;
    }
    if (caseIds.has(testCase.id)) failures.push(`duplicate case id: ${testCase.id}`);
    caseIds.add(testCase.id);
    rejectUnknownKeys(testCase, CASE_KEYS, `case ${testCase.id}`, failures);
    for (const field of ["requiredOutputSections", "allowedCompletionSignals", "allowedDecisions", "requiredMutationClasses", "allowedMutationClasses", "forbiddenMutationClasses", "requiresResumeFields"]) {
      if (!uniqueStrings(testCase[field])) failures.push(`case ${testCase.id}: ${field} must be a unique string list`);
    }
    if (typeof testCase.requiresValidationEvidence !== "boolean") failures.push(`case ${testCase.id}: requiresValidationEvidence must be boolean`);
    for (const entry of array(testCase.conditionalReferences)) {
      requireExactKeys(entry, CONDITIONAL_REFERENCE_KEYS, `case ${testCase.id} conditional reference`, failures);
      if (!isObject(entry) || typeof entry.activation !== "string" || !conditionalReferenceUniverse.has(entry.reference)) {
        failures.push(`case ${testCase.id}: conditional reference must name an activation and a reference from the universe`);
      }
    }
  }
  return failures;
}

function diffControl(run, variant) {
  const failures = [];
  if (!isObject(run.controls)) return [`run ${run.runId || "<missing>"}: controls must be an object`];
  requireExactKeys(run.controls, new Set(CONTROL_FIELDS), `run ${run.runId}.controls`, failures);
  for (const field of CONTROL_FIELDS) {
    if (run.controls[field] !== variant[field]) failures.push(`run ${run.runId}: controlled-matrix drift ${field}: expected ${JSON.stringify(variant[field])}, got ${JSON.stringify(run.controls[field])}`);
  }
  return failures;
}

function scoreRun(run, testCase, variant) {
  const failures = [...diffControl(run, variant)];
  requireExactKeys(run, RUN_KEYS, `run ${run.runId || "<missing>"}`, failures);
  const expectedRunId = `${variant.id}--${testCase.id}`;
  if (run.runId !== expectedRunId) failures.push(`run ${run.runId || "<missing>"}: runId must equal ${expectedRunId}`);
  const observed = isObject(run.observed) ? run.observed : {};
  requireExactKeys(run.observed, OBSERVED_KEYS, `run ${run.runId}.observed`, failures);
  const outputSections = new Set(array(observed.outputSections));
  if (!sameStringSet(observed.outputSections, testCase.requiredOutputSections)) {
    failures.push(`run ${run.runId}: output sections must exactly match the canonical required set`);
  }
  for (const section of testCase.requiredOutputSections) {
    if (!outputSections.has(section)) failures.push(`run ${run.runId}: missing required output section ${section}`);
  }
  if (!testCase.allowedCompletionSignals.includes(observed.completionSignal)) failures.push(`run ${run.runId}: invalid or missing completion signal`);
  if (!testCase.allowedDecisions.includes(observed.decision)) failures.push(`run ${run.runId}: invalid or missing decision`);

  if (!uniqueStrings(observed.mutationClasses)) {
    failures.push(`run ${run.runId}: mutationClasses must be a unique normalized string array`);
  }
  const mutations = new Set(array(observed.mutationClasses));
  for (const required of testCase.requiredMutationClasses) {
    if (!mutations.has(required)) failures.push(`run ${run.runId}: required positive mutation ${required} is missing`);
  }
  for (const mutation of mutations) {
    if (!testCase.allowedMutationClasses.includes(mutation)) failures.push(`run ${run.runId}: mutation ${mutation} is not allowed`);
    if (testCase.forbiddenMutationClasses.includes(mutation)) failures.push(`run ${run.runId}: forbidden mutation ${mutation}`);
  }
  if (!Array.isArray(observed.validationEvidence)) {
    failures.push(`run ${run.runId}: validationEvidence must be an array`);
  }
  const evidence = array(observed.validationEvidence);
  for (const entry of evidence) {
    requireExactKeys(entry, EVIDENCE_KEYS, `run ${run.runId}.validationEvidence`, failures);
    if (!isObject(entry) || !EVIDENCE_STATUSES.has(entry.status)) {
      failures.push(`run ${run.runId}: validation evidence status must be pass or fail`);
    } else if (entry.status === "fail") {
      failures.push(`run ${run.runId}: validation evidence reported failure`);
    }
    if (!isObject(entry) || !isRelativeArtifactRef(entry.artifactRef)) {
      failures.push(`run ${run.runId}: artifactRef must be a traversal-free evidence/**/*.json relative path`);
    }
  }
  if (testCase.requiresValidationEvidence
    && !evidence.some((entry) => isObject(entry) && entry.status === "pass" && isRelativeArtifactRef(entry.artifactRef))) {
    failures.push(`run ${run.runId}: passing validation evidence with artifactRef is required`);
  }
  const resumeFields = new Set(array(observed.resumeStateFields));
  if (!sameStringSet(observed.resumeStateFields, testCase.requiresResumeFields)) {
    failures.push(`run ${run.runId}: resume state fields must exactly match the canonical required set`);
  }
  for (const field of testCase.requiresResumeFields) {
    if (!resumeFields.has(field)) failures.push(`run ${run.runId}: missing resume state field ${field}`);
  }
  const universe = array(testCase._conditionalReferenceUniverse);
  const expectedReferences = array(testCase.conditionalReferences).map((entry) => entry.reference);
  const expectedSet = new Set(expectedReferences);
  const expectedSkipped = universe.filter((reference) => !expectedSet.has(reference));
  const loaded = array(observed.loadedConditionalReferences);
  const skipped = array(observed.skippedConditionalReferences);
  if (!uniqueStrings(loaded)) failures.push(`run ${run.runId}: loaded conditional references must be unique strings`);
  if (!uniqueStrings(skipped)) failures.push(`run ${run.runId}: skipped conditional references must be unique strings`);
  for (const expected of array(testCase.conditionalReferences)) {
    if (!loaded.includes(expected.reference)) failures.push(`run ${run.runId}: activation ${expected.activation} did not load ${expected.reference}`);
  }
  for (const reference of loaded) {
    if (!expectedSet.has(reference)) failures.push(`run ${run.runId}: inactive conditional reference loaded: ${reference}`);
  }
  for (const reference of expectedSkipped) {
    if (!skipped.includes(reference)) failures.push(`run ${run.runId}: inactive conditional reference not recorded as skipped: ${reference}`);
  }
  for (const reference of skipped) {
    if (!expectedSkipped.includes(reference)) failures.push(`run ${run.runId}: active or unknown conditional reference recorded as skipped: ${reference}`);
  }
  if (!isObject(observed.metrics)) failures.push(`run ${run.runId}: metrics must be an object with nullable fields`);
  else {
    requireExactKeys(observed.metrics, new Set(METRIC_FIELDS), `run ${run.runId}.metrics`, failures);
    for (const field of METRIC_FIELDS) {
      const value = observed.metrics[field];
      if (!(value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0))) failures.push(`run ${run.runId}: metric ${field} must be a non-negative number or null`);
    }
  }
  return failures;
}

function checkComparisonAxes(manifest) {
  const failures = [];
  const variants = new Map(manifest.matrix.variants.map((variant) => [variant.id, variant]));
  for (const comparison of array(manifest.matrix.comparisons)) {
    const left = variants.get(comparison.left);
    const right = variants.get(comparison.right);
    if (!left || !right) continue;
    const allowed = comparison.axis === "reasoning"
      ? new Set(["reasoning"])
      : comparison.axis === "harness"
        ? new Set(["harness", "promptRef", "toolsetRef"])
        : new Set(["modelRole", "provider", "model"]);
    for (const field of CONTROL_FIELDS) {
      if (!allowed.has(field) && left[field] !== right[field]) failures.push(`comparison ${comparison.id}: top-level controlled drift ${field}`);
    }
    if (comparison.axis === "reasoning" && left.reasoning === right.reasoning) failures.push(`comparison ${comparison.id}: reasoning axis did not change`);
    if (comparison.axis === "harness" && left.harness === right.harness) failures.push(`comparison ${comparison.id}: harness axis did not change`);
    if (comparison.axis === "model" && (left.modelRole === right.modelRole || left.model === right.model)) failures.push(`comparison ${comparison.id}: model axis did not change baseline/candidate identity`);
  }
  return failures;
}

export function scoreComparison(manifest, results) {
  const failures = [
    ...validateManifest(manifest),
    ...scanSensitive(manifest),
    ...scanSensitive(results),
  ];
  if (!isObject(results) || results.version !== 1 || !Array.isArray(results.runs)) {
    failures.push("results.version must equal 1 and results.runs must be an array");
    return { pass: false, hardGateFailures: failures, efficiency: null, efficiencyWithheld: true, efficiencyWithheldReasons: ["invalid result schema"], promotionEligible: false, promotionWithheldReasons: ["invalid result schema"] };
  }
  requireExactKeys(results, RESULTS_KEYS, "results", failures);
  if (failures.length === 0) failures.push(...checkComparisonAxes(manifest));
  const cases = new Map(array(manifest.cases).map((entry) => [entry.id, entry]));
  const variants = new Map(array(manifest.matrix?.variants).map((entry) => [entry.id, entry]));
  const seen = new Set();
  const runReports = [];
  for (const run of results.runs) {
    if (!isObject(run)) {
      failures.push("every result run must be an object");
      continue;
    }
    const key = `${run.caseId}::${run.variantId}`;
    if (seen.has(key)) failures.push(`duplicate run for ${key}`);
    seen.add(key);
    const testCase = cases.get(run.caseId);
    const variant = variants.get(run.variantId);
    if (!testCase || !variant) {
      const message = `run ${run.runId || "<missing>"}: unknown case or variant`;
      failures.push(message);
      runReports.push({ runId: run.runId, pass: false, failures: [message] });
      continue;
    }
    const runFailures = scoreRun(
      run,
      { ...testCase, _conditionalReferenceUniverse: array(manifest.conditionalReferenceUniverse) },
      variant,
    );
    failures.push(...runFailures);
    runReports.push({ runId: run.runId, caseId: run.caseId, variantId: run.variantId, pass: runFailures.length === 0, failures: runFailures });
  }

  const expected = cases.size * variants.size;
  if (results.runs.length !== expected) failures.push(`matrix coverage incomplete: expected ${expected} runs, got ${results.runs.length}`);

  const metricGap = results.runs.some((run) => METRIC_FIELDS.some((field) => run?.observed?.metrics?.[field] == null));
  const efficiencyWithheld = failures.length > 0 || metricGap;
  const reasons = [];
  if (failures.length > 0) reasons.push("one or more hard gates failed");
  if (metricGap) reasons.push("one or more efficiency metrics are unavailable/null");
  let efficiency = null;
  if (!efficiencyWithheld) {
    const totals = Object.fromEntries(METRIC_FIELDS.map((field) => [field, 0]));
    for (const run of results.runs) for (const field of METRIC_FIELDS) totals[field] += run.observed.metrics[field];
    efficiency = {
      runCount: results.runs.length,
      averages: Object.fromEntries(METRIC_FIELDS.map((field) => [field, totals[field] / results.runs.length])),
      costPerSuccessfulTaskUsd: totals.costUsd / results.runs.length,
    };
  }
  const promotionEligible = failures.length === 0 && manifest.captureMode === "live";
  const promotionWithheldReasons = [];
  if (failures.length > 0) promotionWithheldReasons.push("one or more hard gates failed");
  if (manifest.captureMode !== "live") promotionWithheldReasons.push("synthetic template cannot support model-migration promotion");
  return { pass: failures.length === 0, hardGateFailures: failures, runReports, efficiency, efficiencyWithheld, efficiencyWithheldReasons: reasons, promotionEligible, promotionWithheldReasons };
}

export function formatReport(report) {
  const lines = [`MODEL_MIGRATION_EVAL ${report.pass ? "PASS" : "FAIL"}`];
  if (report.hardGateFailures.length > 0) {
    lines.push("Hard gate failures:");
    for (const failure of report.hardGateFailures) lines.push(`- ${failure}`);
  }
  lines.push(`Efficiency: ${report.efficiencyWithheld ? "WITHHELD" : "AVAILABLE"}`);
  for (const reason of report.efficiencyWithheldReasons || []) lines.push(`- ${reason}`);
  lines.push(`Promotion: ${report.promotionEligible ? "ELIGIBLE" : "WITHHELD"}`);
  for (const reason of report.promotionWithheldReasons || []) lines.push(`- ${reason}`);
  return lines.join("\n");
}

export { CONTROL_FIELDS, METRIC_FIELDS };
