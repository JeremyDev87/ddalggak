#!/usr/bin/env node
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { analyzeWorkflows, classifyActionRef } from "./security-posture-report.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function makeFixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-security-posture-"));
  const workflowDir = path.join(root, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(workflowDir, name), content, "utf8");
  }
  return root;
}

const tests = [
  {
    name: "classifies action refs by reproducibility policy",
    run() {
      assertEqual(classifyActionRef("9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f"), "sha-pinned", "sha");
      assertEqual(classifyActionRef("v4"), "major-tag", "major");
      assertEqual(classifyActionRef("v4.1.2"), "version-tag", "version");
      assertEqual(classifyActionRef("main"), "branch-or-floating", "branch");
    },
  },
  {
    name: "inventories permissions and missing official scan evidence without treating absence as safe",
    run() {
      const root = makeFixture({
        "ci.yml": `name: CI\non: [pull_request]\npermissions: read-all\njobs:\n  verify:\n    permissions: { contents: read }\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: owner/custom-action@9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f9f\n`,
      });
      try {
        const report = analyzeWorkflows(root);
        assertEqual(report.workflowCount, 1, "workflow count");
        assertEqual(report.securityScans.codeql, false, "codeql absent");
        assertEqual(report.securityScans.dependencyReview, false, "dependency review absent");
        assertEqual(report.securityScans.scorecard, false, "scorecard absent");
        assertEqual(report.actionPinSummary["major-tag"], 1, "major tag count");
        assertEqual(report.actionPinSummary["sha-pinned"], 1, "sha pinned count");
        assert(report.caveats.some((line) => line.includes("not a security guarantee")), "no-overclaim caveat");
        assertEqual(report.workflows[0].permissions[0].entries[0].text, "read-all", "workflow permission entry");
        assertEqual(report.workflows[0].permissions[1].entries[0].text, "{ contents: read }", "nested permission entry");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "detects security scan presence independently from static inventory",
    run() {
      const root = makeFixture({
        "security.yml": `name: Security\non: [pull_request]\npermissions:\n  contents: read\n  security-events: write\njobs:\n  codeql:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: github/codeql-action/init@v3\n      - uses: github/codeql-action/analyze@v3\n  deps:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/dependency-review-action@v4\n  scorecard:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: ossf/scorecard-action@0864cf19026789058feabb7e87baa5f140aac736\n`,
      });
      try {
        const report = analyzeWorkflows(root);
        assertEqual(report.securityScans.codeql, true, "codeql present");
        assertEqual(report.securityScans.dependencyReview, true, "dependency review present");
        assertEqual(report.securityScans.scorecard, true, "scorecard present");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "reports direct untrusted expression interpolation in shell blocks",
    run() {
      const root = makeFixture({
        "manual.yml": `name: Manual\non:\n  workflow_dispatch:\n    inputs:\n      target_ref:\n        required: true\npermissions:\n  contents: read\njobs:\n  run:\n    runs-on: ubuntu-latest\n    steps:\n      - run: |\n          echo "target=\${{ inputs.target_ref }}"\n          echo "event=\${{ github.event.inputs.target_ref }}"\n      - run: echo "ref=\${{ github.ref_name }}"\n`,
      });
      try {
        const report = analyzeWorkflows(root);
        const findings = report.workflows[0].untrustedShellInterpolations;
        assertEqual(findings.length, 3, "finding count");
        assert(findings[0].expressions[0].includes("inputs.target_ref"), "input expression recorded");
        assert(findings[2].expressions[0].includes("github.ref_name"), "inline run expression recorded");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
];

let passed = 0;
const failures = [];

for (const test of tests) {
  try {
    test.run();
    passed += 1;
    console.log(`[PASS] ${test.name}`);
  } catch (error) {
    failures.push({ name: test.name, error });
    console.error(`[FAIL] ${test.name}`);
    console.error(error && error.stack ? error.stack : String(error));
  }
}

console.log(`\nSummary: ${passed}/${tests.length} security posture cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
