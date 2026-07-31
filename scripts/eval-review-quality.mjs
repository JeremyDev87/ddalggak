#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

import { evaluateReviewQuality, parseReviewQualityJson } from "./eval-review-quality/scorer.mjs";

function usage() {
  return "Usage: node scripts/eval-review-quality.mjs [--fixture <path>] [--json] [--self-test]";
}

function parseArgs(argv) {
  const options = {
    fixture: path.join(process.cwd(), "evals", "review-quality", "cases.json"),
    json: false,
    selfTest: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--fixture") {
      const value = argv[index + 1];
      if (!value) throw new Error("--fixture requires a path");
      options.fixture = path.resolve(value);
      index += 1;
    } else if (arg === "--json") options.json = true;
    else if (arg === "--self-test") options.selfTest = true;
    else throw new Error(`unknown option: ${arg}`);
  }
  return options;
}

function loadFixture(fixturePath) {
  return parseReviewQualityJson(readFileSync(fixturePath, "utf8"));
}

function assertRejected(fixture, mutate, label) {
  const candidate = structuredClone(fixture);
  mutate(candidate);
  if (evaluateReviewQuality(candidate).pass) throw new Error(`self-test false pass: ${label}`);
}

function runSelfTest(fixture) {
  const baseline = evaluateReviewQuality(fixture);
  if (!baseline.pass) throw new Error(`baseline fixture failed:\n${baseline.failures.join("\n")}`);
  assertRejected(fixture, (candidate) => {
    candidate.cases[0].observed.reviewedHead = "f".repeat(40);
  }, "stale head");
  assertRejected(fixture, (candidate) => {
    candidate.cases.find((entry) => entry.kind === "seeded-defect").observed.findings = [];
  }, "missed defect");
  assertRejected(fixture, (candidate) => {
    candidate.cases.find((entry) => entry.kind === "clean-control").observed.findings.push({
      id: "invented",
      severity: "high",
      claim: "Invented blocker",
      path: "src/clean.js",
      line: 1,
      failingScenario: "No reproducible failure exists.",
      impact: "Would block valid code.",
      minimalFix: "None.",
      confidence: "low",
      counterevidenceChecked: "Clean-control evidence.",
    });
  }, "clean-control blocker");
  console.log("[eval:review-quality] self-test passed: baseline plus 3 fail-closed mutations");
}

try {
  const options = parseArgs(process.argv.slice(2));
  const fixture = loadFixture(options.fixture);
  if (options.selfTest) {
    runSelfTest(fixture);
    process.exit(0);
  }
  const result = evaluateReviewQuality(fixture);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`[eval:review-quality] ${result.pass ? "PASS" : "FAIL"}: ${result.metrics.totalCases} cases`);
    console.log(`[eval:review-quality] critical/high recall=${result.metrics.criticalHighRecall} clean-fpr=${result.metrics.cleanControlFalsePositiveRate} clean-blocker-fpr=${result.metrics.cleanControlBlockingFalsePositiveRate} actionable=${result.metrics.actionableFindingRate}`);
    result.failures.forEach((failure) => console.error(`- ${failure}`));
  }
  process.exit(result.pass ? 0 : 1);
} catch (error) {
  console.error(`[eval:review-quality] ${error.message}`);
  console.error(usage());
  process.exit(2);
}
