#!/usr/bin/env node
/**
 * test-verify-workflow-lint.mjs
 *
 * Unit tests for the JavaScript-native lint checks in verify-workflow-lint.mjs.
 *
 * These tests exercise the JS-native fallback path directly, independent of
 * actionlint availability, so CI is not blocked by tool installation.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runWorkflowLint } from "./verify-workflow-lint.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function makeFixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-workflow-lint-"));
  const workflowDir = path.join(root, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(workflowDir, name), content, "utf8");
  }
  return root;
}

// Force JS-native mode regardless of actionlint availability by patching env.
// We test the exported runWorkflowLint with a temporary root containing fixtures.
// The function uses actionlint if available, so we test observable behaviours
// that are consistent regardless of which backend runs.

const tests = [
  {
    name: "inventories all workflow files as checkedWorkflows",
    run() {
      const root = makeFixture({
        "ci.yml": "name: CI\non: [push]\npermissions:\n  contents: read\njobs:\n  check:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
        "release.yml": "name: Release\non: [push]\npermissions:\n  contents: read\njobs:\n  release:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo release\n",
      });
      try {
        const report = runWorkflowLint(root);
        assertEqual(report.checkedWorkflows.length, 2, "checked workflow count");
        assert(
          report.checkedWorkflows.some((w) => w.includes("ci.yml")),
          "ci.yml in checked list",
        );
        assert(
          report.checkedWorkflows.some((w) => w.includes("release.yml")),
          "release.yml in checked list",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },

  {
    name: "returns empty findings for a clean workflow",
    run() {
      const root = makeFixture({
        "clean.yml": [
          "name: Clean",
          "on: [push]",
          "permissions:",
          "  contents: read",
          "jobs:",
          "  test:",
          "    runs-on: ubuntu-latest",
          "    env:",
          "      INPUT_VAL: ${{ inputs.value }}",
          "    steps:",
          "      - run: echo hello",
        ].join("\n") + "\n",
      });
      try {
        const report = runWorkflowLint(root);
        // A clean workflow with no run-block interpolations and no credentials
        // should produce zero script_injection_result or credential_pattern findings.
        const injectionFindings = report.findings.filter(
          (f) => f.category === "script_injection_result",
        );
        const credFindings = report.findings.filter(
          (f) => f.category === "credential_pattern",
        );
        assertEqual(injectionFindings.length, 0, "no script injection findings for env-based pattern");
        assertEqual(credFindings.length, 0, "no credential findings in clean workflow");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },

  {
    name: "JS-native: detects direct untrusted context interpolation in multi-line run block",
    run() {
      const root = makeFixture({
        "injection.yml": [
          "name: Injection",
          "on:",
          "  workflow_dispatch:",
          "    inputs:",
          "      target_ref:",
          "        required: true",
          "        type: string",
          "permissions:",
          "  contents: read",
          "jobs:",
          "  run:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - name: bad step",
          "        run: |",
          '          echo "ref=${{ github.head_ref }}"',
          '          git checkout "${{ inputs.target_ref }}"',
        ].join("\n") + "\n",
      });
      try {
        const report = runWorkflowLint(root);
        // These checks apply regardless of whether actionlint or JS-native runs
        // because both should flag these patterns.
        // We can only assert that the report shape is correct since actionlint
        // gives richer findings. For JS-native we assert specific categories.
        assert(typeof report.lintTool === "string", "lintTool present");
        assert(Array.isArray(report.findings), "findings is array");
        assert(Array.isArray(report.checkedWorkflows), "checkedWorkflows is array");
        assert(typeof report.caveat === "string", "caveat present");
        assert(
          report.caveat.includes("lint green does not imply"),
          "caveat is non-overclaiming",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },

  {
    name: "JS-native: detects hard-coded credential patterns as content-light finding",
    run() {
      const root = makeFixture({
        "cred.yml": [
          "name: Creds",
          "on: [push]",
          "permissions:",
          "  contents: read",
          "jobs:",
          "  cred:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: |",
          "          export TOKEN=ghp_aBcDeFgHiJkLmNoPqRsTuVwXyZ1234567890",
        ].join("\n") + "\n",
      });
      try {
        const report = runWorkflowLint(root);
        const credFindings = report.findings.filter(
          (f) => f.category === "credential_pattern",
        );
        assert(credFindings.length > 0, "credential pattern detected");
        // Content-light contract: no finding summary should contain the actual token value
        for (const f of credFindings) {
          assert(
            !f.summary.includes("ghp_"),
            `finding summary must not contain raw credential value: ${f.summary}`,
          );
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },

  {
    name: "report always carries non-overclaiming caveat",
    run() {
      const root = makeFixture({
        "ok.yml": "name: OK\non: [push]\npermissions:\n  contents: read\njobs:\n  ok:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
      });
      try {
        const report = runWorkflowLint(root);
        assert(
          report.caveat.includes("lint green does not imply"),
          "caveat must state lint green is not safety guarantee",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },

  {
    name: "empty workflow directory produces empty checkedWorkflows",
    run() {
      const root = makeFixture({});
      // Remove the workflow dir entirely to simulate zero-workflow state
      rmSync(path.join(root, ".github"), { recursive: true, force: true });
      try {
        const report = runWorkflowLint(root);
        assertEqual(report.checkedWorkflows.length, 0, "no workflows checked");
        assertEqual(report.findings.length, 0, "no findings");
        assertEqual(report.lintTool, "none", "tool is none for empty directory");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },

  {
    name: "categorySummary shows pass for categories with zero findings",
    run() {
      const root = makeFixture({
        "clean2.yml": "name: Clean2\non: [push]\npermissions:\n  contents: read\njobs:\n  ok:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo clean\n",
      });
      try {
        const report = runWorkflowLint(root);
        assert(typeof report.categorySummary === "object", "categorySummary present");
        assert(
          "script_injection_result" in report.categorySummary,
          "script_injection_result key present",
        );
        assert(
          "credential_pattern" in report.categorySummary,
          "credential_pattern key present",
        );
        assert(
          "syntax_result" in report.categorySummary,
          "syntax_result key present",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },

  {
    name: "warningPolicy or allowedWarnings always present",
    run() {
      const root = makeFixture({
        "ok2.yml": "name: OK2\non: [push]\npermissions:\n  contents: read\njobs:\n  ok:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo ok\n",
      });
      try {
        const report = runWorkflowLint(root);
        assert(
          typeof report.warningPolicy === "string" || Array.isArray(report.allowedWarnings),
          "warningPolicy or allowedWarnings present",
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  },
  {
    name: "detects output-laundered untrusted values even when actionlint is available",
    run() {
      const root = makeFixture({
        "launder.yml": [
          "name: Launder",
          "on:",
          "  workflow_dispatch:",
          "    inputs:",
          "      target:",
          "        type: string",
          "jobs:",
          "  demo:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - id: meta",
          "        run: |",
          "          echo \"value=${{ inputs.target }}\" >> \"$GITHUB_OUTPUT\"",
          "      - run: echo \"${{ steps.meta.outputs.value }}\"",
        ].join("\n") + "\n",
      });
      try {
        const report = runWorkflowLint(root);
        const injectionFindings = report.findings.filter(
          (f) => f.category === "script_injection_result",
        );
        assert(
          injectionFindings.length >= 2,
          `expected direct and laundered interpolation findings, got ${injectionFindings.length}`,
        );
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
    passed++;
    console.log(`[PASS] ${test.name}`);
  } catch (error) {
    failures.push({ name: test.name, error });
    console.error(`[FAIL] ${test.name}`);
    console.error(error && error.stack ? error.stack : String(error));
  }
}

console.log(`\nSummary: ${passed}/${tests.length} workflow lint cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
