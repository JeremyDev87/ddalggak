import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";
import { conditionalAssets } from "../core/conditional-assets.mjs";
import { formatReport, scoreComparison } from "./eval-model-migration/scorer.mjs";

const manifest = JSON.parse(readFileSync("evals/model-migration/cases.json", "utf8"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validResults(candidateManifest = manifest) {
  const runs = [];
  for (const variant of candidateManifest.matrix.variants) {
    for (const testCase of candidateManifest.cases) {
      runs.push({
        runId: `${variant.id}--${testCase.id}`,
        caseId: testCase.id,
        variantId: variant.id,
        controls: Object.fromEntries([
          "provider",
          "modelRole",
          "model",
          "reasoning",
          "harness",
          "promptRef",
          "toolsetRef",
          "runtimeRef",
          "captureSource",
        ].map((field) => [field, variant[field]])),
        observed: {
          outputSections: [...testCase.requiredOutputSections],
          completionSignal: testCase.allowedCompletionSignals[0],
          decision: testCase.allowedDecisions[0],
          mutationClasses: [...testCase.requiredMutationClasses],
          validationEvidence: [{ status: "pass", artifactRef: `evidence/${variant.id}/${testCase.id}.json` }],
          resumeStateFields: [...testCase.requiresResumeFields],
          loadedConditionalReferences: (testCase.conditionalReferences || []).map((entry) => entry.reference),
          skippedConditionalReferences: candidateManifest.conditionalReferenceUniverse.filter(
            (reference) => !(testCase.conditionalReferences || []).some((entry) => entry.reference === reference),
          ),
          metrics: {
            toolCalls: 3,
            retries: 0,
            latencyMs: 1200,
            inputTokens: 1200,
            outputTokens: 300,
            reasoningTokens: 200,
            cacheReadTokens: 500,
            cacheWriteTokens: 100,
            costUsd: 0.01,
          },
        },
      });
    }
  }
  return { version: 1, runs };
}

function attestedLiveManifest() {
  const candidateManifest = clone(manifest);
  candidateManifest.captureMode = "live";
  for (const variant of candidateManifest.matrix.variants) {
    variant.provider = variant.modelRole === "baseline" ? "baseline-provider" : "candidate-provider";
    variant.model = variant.modelRole === "baseline" ? "baseline-model" : "candidate-model";
    variant.promptRef = `sha256:${"a".repeat(64)}`;
    variant.toolsetRef = `sha256:${"b".repeat(64)}`;
    variant.runtimeRef = `git:${"c".repeat(40)}`;
    variant.captureSource = `attested:sha256:${"d".repeat(64)}`;
  }
  return candidateManifest;
}

function assertFailure(name, mutate, expected) {
  const results = validResults();
  mutate(results);
  const report = scoreComparison(manifest, results);
  assert.equal(report.pass, false, `${name}: expected hard-gate failure`);
  assert(report.hardGateFailures.some((failure) => failure.includes(expected)), `${name}: missing failure ${expected}\n${formatReport(report)}`);
  assert.equal(report.efficiencyWithheld, true, `${name}: efficiency must be withheld`);
  console.log(`[PASS] ${name}`);
}

function assertManifestFailure(name, mutate, expected) {
  const candidateManifest = clone(manifest);
  mutate(candidateManifest);
  const report = scoreComparison(candidateManifest, validResults(candidateManifest));
  assert.equal(report.pass, false, `${name}: expected manifest hard-gate failure`);
  assert(report.hardGateFailures.some((failure) => failure.includes(expected)), `${name}: missing failure ${expected}\n${formatReport(report)}`);
  assert.equal(report.promotionEligible, false, `${name}: invalid manifest cannot promote`);
  console.log(`[PASS] ${name}`);
}

{
  const report = scoreComparison(manifest, validResults());
  assert.equal(report.pass, true);
  assert.equal(report.efficiencyWithheld, false);
  assert.equal(report.efficiency.runCount, manifest.cases.length * manifest.matrix.variants.length);
  assert.equal(report.promotionEligible, false);
  assert(report.promotionWithheldReasons.some((reason) => reason.includes("synthetic template")));
  console.log("[PASS] complete controlled matrix passes and reports efficiency");
}

{
  const modelComparisons = manifest.matrix.comparisons.filter((entry) => entry.axis === "model");
  assert.equal(modelComparisons.length, 4);
  for (const comparison of modelComparisons) {
    const left = manifest.matrix.variants.find((entry) => entry.id === comparison.left);
    const right = manifest.matrix.variants.find((entry) => entry.id === comparison.right);
    assert.equal(left.modelRole, "baseline");
    assert.equal(right.modelRole, "candidate");
    assert.equal(left.reasoning, right.reasoning);
    assert.equal(left.harness, right.harness);
  }
  console.log("[PASS] model migration compares baseline/candidate under matched harness and reasoning controls");
}

assertManifestFailure("model comparison exact set cannot be reduced", (candidateManifest) => {
  candidateManifest.matrix.comparisons = candidateManifest.matrix.comparisons.filter(
    (entry) => entry.id !== "model-medium-lean",
  );
}, "must contain exactly 10 controlled pairs");

assertManifestFailure("canonical case set cannot be reduced with regenerated runs", (candidateManifest) => {
  candidateManifest.cases = candidateManifest.cases.filter((entry) => entry.id !== "conditional-reference-routing");
}, "must be the canonical ordered exact set");

assertManifestFailure("canonical case semantics cannot be weakened", (candidateManifest) => {
  candidateManifest.cases[0].allowedDecisions.push("raw-private-decision");
}, "must exactly match the canonical behavioral contracts");

assertManifestFailure("conditional universe cannot be reduced with regenerated runs", (candidateManifest) => {
  candidateManifest.conditionalReferenceUniverse = candidateManifest.conditionalReferenceUniverse.filter(
    (entry) => entry !== "deep-interview-readiness-gate.md",
  );
}, "must exactly match plan/start/review SSOT");

{
  const actualUniverse = [...new Set(
    loadCommandContracts(process.cwd())
      .filter((command) => ["plan", "start", "review"].includes(command.command))
      .flatMap((command) => conditionalAssets(command, "conditional_references").map((entry) => entry.asset)),
  )].sort();
  assert.deepEqual([...manifest.conditionalReferenceUniverse].sort(), actualUniverse);
  console.log("[PASS] conditional reference universe matches plan/start/review command SSOT");
}

{
  const liveManifest = clone(manifest);
  liveManifest.captureMode = "live";
  const report = scoreComparison(liveManifest, validResults());
  assert.equal(report.pass, false);
  assert(report.hardGateFailures.some((failure) => failure.includes("must be concrete")));
  assert(report.hardGateFailures.some((failure) => failure.includes("immutable hashes")));
  assert.equal(report.promotionEligible, false);
  console.log("[PASS] live migration claims reject placeholder identities and mutable references");
}

{
  const liveManifest = attestedLiveManifest();
  const report = scoreComparison(liveManifest, validResults(liveManifest));
  assert.equal(report.pass, true, formatReport(report));
  assert.equal(report.promotionEligible, true, "attested live matrix should be eligible");
  console.log("[PASS] attested live matrix can promote");
}

{
  const liveManifest = attestedLiveManifest();
  for (const variant of liveManifest.matrix.variants) variant.captureSource = "synthetic-fixture-v2";
  const report = scoreComparison(liveManifest, validResults(liveManifest));
  assert.equal(report.pass, false);
  assert(report.hardGateFailures.some((failure) => failure.includes("attested sha256 digest")));
  assert.equal(report.promotionEligible, false);
  console.log("[PASS] synthetic-like capture source cannot promote as live evidence");
}

{
  const liveManifest = attestedLiveManifest();
  const results = validResults(liveManifest);
  results.runs[0].observed.validationEvidence.push({ status: "fail", artifactRef: "evidence/baseline-high-full/failed-check.json" });
  const report = scoreComparison(liveManifest, results);
  assert.equal(report.pass, false);
  assert(report.hardGateFailures.some((failure) => failure.includes("validation evidence reported failure")));
  assert.equal(report.promotionEligible, false);
  console.log("[PASS] mixed pass/fail live evidence cannot promote");
}

assertFailure("no-op implementation cannot pass", (results) => {
  const run = results.runs.find((entry) => entry.caseId === "implementation-positive-mutation");
  run.observed.mutationClasses = [];
}, "required positive mutation source is missing");

assertFailure("forbidden mutation fails closed", (results) => {
  results.runs[0].observed.mutationClasses = ["github"];
}, "forbidden mutation github");

assertFailure("missing output section fails closed", (results) => {
  results.runs[0].observed.outputSections = [];
}, "missing required output section");

assertFailure("missing completion signal fails closed", (results) => {
  results.runs[0].observed.completionSignal = null;
}, "invalid or missing completion signal");

assertFailure("raw content fields are rejected", (results) => {
  results.runs[0].observed.rawOutput = "private model text";
}, "raw/private payload field is forbidden");

for (const [name, mutate, expected] of [
  ["unknown results field", (results) => { results.notes = "RAW MODEL OUTPUT STORED VERBATIM HERE"; }, "results: unknown field notes"],
  ["unknown run field", (results) => { results.runs[0].notes = "RAW MODEL OUTPUT STORED VERBATIM HERE"; }, ": unknown field notes"],
  ["unknown controls field", (results) => { results.runs[0].controls.notes = "RAW MODEL OUTPUT STORED VERBATIM HERE"; }, ".controls: unknown field notes"],
  ["unknown observed field", (results) => { results.runs[0].observed.notes = "RAW MODEL OUTPUT STORED VERBATIM HERE"; }, ".observed: unknown field notes"],
  ["unknown evidence field", (results) => { results.runs[0].observed.validationEvidence[0].notes = "RAW MODEL OUTPUT STORED VERBATIM HERE"; }, ".validationEvidence: unknown field notes"],
  ["unknown metrics field", (results) => { results.runs[0].observed.metrics.notes = 1; }, ".metrics: unknown field notes"],
]) {
  assertFailure(`${name} is rejected by exact-key schema`, mutate, expected);
}

for (const [name, mutate, expected] of [
  ["output section free text", (results) => { results.runs[0].observed.outputSections.push("raw private customer conversation"); }, "output sections must exactly match"],
  ["validation status free text", (results) => { results.runs[0].observed.validationEvidence[0].status = "raw private status"; }, "validation evidence status must be pass or fail"],
  ["resume field free text", (results) => { results.runs[0].observed.resumeStateFields.push("raw private resume payload"); }, "resume state fields must exactly match"],
  ["artifact filename free text", (results) => { results.runs[0].observed.validationEvidence[0].artifactRef = "evidence/raw private payload.json"; }, "artifactRef must be"],
  ["mutation class scalar free text", (results) => {
    results.runs.find((entry) => entry.caseId === "research-read-only").observed.mutationClasses = "raw private customer conversation";
  }, "mutationClasses must be a unique normalized string array"],
  ["mutation class duplicate", (results) => {
    results.runs.find((entry) => entry.caseId === "implementation-positive-mutation").observed.mutationClasses = ["source", "source"];
  }, "mutationClasses must be a unique normalized string array"],
  ["validation evidence scalar", (results) => { results.runs[0].observed.validationEvidence = "raw private evidence"; }, "validationEvidence must be an array"],
]) {
  assertFailure(`${name} is rejected in known normalized fields`, mutate, expected);
}

assertManifestFailure("variant identifiers cannot carry free text", (candidateManifest) => {
  candidateManifest.matrix.variants[0].provider = "raw private provider payload";
}, "provider/model/captureSource must be normalized identifiers");

assertFailure("token-like values are rejected", (results) => {
  results.runs[0].observed.note = ["github", "pat", "a".repeat(24)].join("_");
}, "token-like secret value is forbidden");

assertFailure("user-home artifact paths are rejected", (results) => {
  results.runs[0].observed.validationEvidence[0].artifactRef = "/Users/example/private.json";
}, "user-home absolute artifact paths are forbidden");

{
  const sensitiveManifest = clone(manifest);
  sensitiveManifest.matrix.variants[0].runtimeRef = "/Users/example/runtime";
  const report = scoreComparison(sensitiveManifest, validResults());
  assert.equal(report.pass, false, "manifest privacy boundary must fail closed");
  assert(report.hardGateFailures.some((failure) => failure.includes("user-home absolute")));
  console.log("[PASS] manifest content follows the same privacy boundary");
}

assertFailure("controlled matrix drift is named", (results) => {
  results.runs[0].controls.provider = "other-provider";
}, "controlled-matrix drift provider");

assertFailure("conditional activation must load its reference", (results) => {
  const run = results.runs.find((entry) => entry.caseId === "conditional-reference-routing");
  run.observed.loadedConditionalReferences = [];
}, "did not load security-posture-gate.md");

assertFailure("inactive conditional references cannot be loaded", (results) => {
  const run = results.runs.find((entry) => entry.caseId === "research-read-only");
  run.observed.loadedConditionalReferences = ["security-posture-gate.md"];
  run.observed.skippedConditionalReferences = run.observed.skippedConditionalReferences.filter(
    (reference) => reference !== "security-posture-gate.md",
  );
}, "inactive conditional reference loaded: security-posture-gate.md");

{
  const results = validResults();
  const run = results.runs.find((entry) => entry.caseId === "research-read-only");
  assert.deepEqual(run.observed.loadedConditionalReferences, []);
  assert.deepEqual(run.observed.skippedConditionalReferences, manifest.conditionalReferenceUniverse);
  assert.equal(scoreComparison(manifest, results).pass, true);
  console.log("[PASS] no-activation cases load none and name every skipped reference");
}

for (const [name, artifactRef] of [
  ["raw artifact text", "RAW MODEL OUTPUT STORED HERE"],
  ["artifact URL", "https://example.com/output.json"],
  ["artifact traversal", "evidence/../private.json"],
  ["artifact data URI", "data:application/json;base64,e30="],
]) {
  assertFailure(`${name} is rejected`, (results) => {
    results.runs[0].observed.validationEvidence[0].artifactRef = artifactRef;
  }, "artifactRef must be a traversal-free evidence/**/*.json relative path");
}

assertFailure("runId cannot carry arbitrary raw content", (results) => {
  results.runs[0].runId = "RAW MODEL OUTPUT STORED HERE";
}, "runId must equal");

{
  const results = validResults();
  results.runs[0].observed.metrics.cacheWriteTokens = null;
  const report = scoreComparison(manifest, results);
  assert.equal(report.pass, true, "nullable metrics are not invented hard failures");
  assert.equal(report.efficiencyWithheld, true);
  assert(report.efficiencyWithheldReasons.some((reason) => reason.includes("unavailable/null")));
  console.log("[PASS] unavailable metrics remain null and withhold efficiency");
}

{
  const results = validResults();
  results.runs[0].controls.runtimeRef = "git:DRIFT";
  const output = formatReport(scoreComparison(manifest, results));
  assert(output.includes("controlled-matrix drift runtimeRef"));
  console.log("[PASS] human report explains controlled drift");
}

console.log("\n[test:model-migration-eval] passed");
