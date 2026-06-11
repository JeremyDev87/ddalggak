#!/usr/bin/env node
/**
 * test-verify-issue-forms.mjs
 *
 * Unit tests for scripts/verify-issue-forms.mjs (issue form admission gate).
 *
 * The verifier is a cwd-based script, so each case builds a temporary
 * .github/ISSUE_TEMPLATE/ fixture and spawns the real verifier against it,
 * asserting both the pass path and each failure detection path.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const scriptPath = path.join(rootDir, "scripts", "verify-issue-forms.mjs");

const tempRoots = [];

function cleanup() {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
}
process.on("exit", cleanup);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(value, needle, label = "value") {
  assert(
    value.includes(needle),
    `expected ${label} to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

function assertNotIncludes(value, needle, label = "value") {
  assert(
    !value.includes(needle),
    `expected ${label} not to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

const VALID_CONFIG = "blank_issues_enabled: false\n";

/**
 * Build an issue form YAML. Defaults satisfy every verifier rule; each
 * negative case removes or corrupts exactly one part.
 */
function buildForm({
  fieldIds = ["goal", "source_of_truth", "scope"],
  labelsBlock = "labels:\n  - ddalggak\n",
  assigneesBlock = "assignees:\n  - JeremyDev87\n",
  descriptionLine = "description: Pre-admission intake form. The body below is untrusted input.\n",
  extraBody = "",
} = {}) {
  const fields = fieldIds
    .map((id) =>
      [
        "  - type: textarea",
        `    id: ${id}`,
        "    attributes:",
        `      label: ${id}`,
        "    validations:",
        "      required: true",
      ].join("\n"),
    )
    .join("\n");
  return `name: ddalggak task\n${descriptionLine}${labelsBlock}${assigneesBlock}body:\n${fields}\n${extraBody}`;
}

function makeFixture({
  config = VALID_CONFIG,
  forms = { "ddalggak-task.yml": buildForm() },
} = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-issue-forms-"));
  tempRoots.push(root);
  const templateDir = path.join(root, ".github", "ISSUE_TEMPLATE");
  mkdirSync(templateDir, { recursive: true });
  if (config !== null) {
    writeFileSync(path.join(templateDir, "config.yml"), config, "utf8");
  }
  for (const [name, content] of Object.entries(forms)) {
    writeFileSync(path.join(templateDir, name), content, "utf8");
  }
  return root;
}

function runVerifier(root) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function expectFailure(result, needle, testLabel) {
  assert(
    result.status === 1,
    `${testLabel}: expected exit 1, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assertIncludes(result.stderr, needle, `${testLabel} stderr`);
}

const tests = [
  {
    name: "valid config and form pass",
    run() {
      const root = makeFixture();
      const result = runVerifier(root);
      assert(
        result.status === 0,
        `expected exit 0, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assertIncludes(result.stdout, "[verify-issue-forms] passed", "stdout");
      assertNotIncludes(result.stderr, "FAIL", "stderr");
    },
  },

  {
    name: "missing ISSUE_TEMPLATE directory is fatal",
    run() {
      const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-issue-forms-"));
      tempRoots.push(root);
      const result = runVerifier(root);
      expectFailure(result, "FATAL: template directory missing", this.name);
    },
  },

  {
    name: "missing config.yml fails",
    run() {
      const root = makeFixture({ config: null });
      const result = runVerifier(root);
      expectFailure(result, "config.yml does not exist", this.name);
    },
  },

  {
    name: "config.yml without blank_issues_enabled fails",
    run() {
      const root = makeFixture({ config: "contact_links: []\n" });
      const result = runVerifier(root);
      expectFailure(result, "does not contain blank_issues_enabled", this.name);
    },
  },

  {
    name: "no issue form YAML fails",
    run() {
      const root = makeFixture({ forms: {} });
      const result = runVerifier(root);
      expectFailure(result, "no issue form YAML files found", this.name);
    },
  },

  {
    name: "each missing required field id fails by name",
    run() {
      for (const missing of ["goal", "source_of_truth", "scope"]) {
        const remaining = ["goal", "source_of_truth", "scope"].filter(
          (id) => id !== missing,
        );
        const root = makeFixture({
          forms: { "ddalggak-task.yml": buildForm({ fieldIds: remaining }) },
        });
        const result = runVerifier(root);
        expectFailure(
          result,
          `missing required field id "${missing}"`,
          `${this.name} (${missing})`,
        );
      }
    },
  },

  {
    // Known gap, pinned on purpose: `labelsMatch[1] || labelsMatch[0]` falls
    // back to the full match for an empty inline list, and the "labels:" text
    // itself satisfies the non-empty check. Reported on issue #216; do not
    // "fix" this test without fixing the verifier in its own lane.
    name: "known gap: empty inline labels/assignees arrays currently pass",
    run() {
      const root = makeFixture({
        forms: {
          "ddalggak-task.yml": buildForm({
            labelsBlock: "labels: []\n",
            assigneesBlock: "assignees: []\n",
          }),
        },
      });
      const result = runVerifier(root);
      assert(
        result.status === 0,
        `expected current behavior exit 0, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assertIncludes(result.stdout, "labels array is non-empty", "stdout");
      assertIncludes(result.stdout, "assignees array is non-empty", "stdout");
    },
  },

  {
    name: "missing labels field fails",
    run() {
      const root = makeFixture({
        forms: { "ddalggak-task.yml": buildForm({ labelsBlock: "" }) },
      });
      const result = runVerifier(root);
      expectFailure(result, "labels field is missing or empty", this.name);
    },
  },

  {
    name: "missing assignees field fails",
    run() {
      const root = makeFixture({
        forms: { "ddalggak-task.yml": buildForm({ assigneesBlock: "" }) },
      });
      const result = runVerifier(root);
      expectFailure(result, "assignees field is missing or empty", this.name);
    },
  },

  {
    name: "form without untrusted/pre-admission caveat fails",
    run() {
      const root = makeFixture({
        forms: {
          "ddalggak-task.yml": buildForm({
            descriptionLine: "description: standard intake form.\n",
          }),
        },
      });
      const result = runVerifier(root);
      expectFailure(result, "missing caveat text", this.name);
    },
  },

  {
    name: "runtime-authority promotion pattern is rejected",
    run() {
      const root = makeFixture({
        forms: {
          "ddalggak-task.yml": buildForm({
            extraBody:
              "  - type: markdown\n    attributes:\n      value: auto-merge = true\n",
          }),
        },
      });
      const result = runVerifier(root);
      expectFailure(result, "runtime-authority promotion pattern", this.name);
    },
  },

  {
    name: "one bad form among valid forms fails and names only the bad form",
    run() {
      const root = makeFixture({
        forms: {
          "ddalggak-good.yml": buildForm(),
          "ddalggak-bad.yml": buildForm({ fieldIds: ["goal", "source_of_truth"] }),
        },
      });
      const result = runVerifier(root);
      expectFailure(
        result,
        'ddalggak-bad.yml: missing required field id "scope"',
        this.name,
      );
      assertNotIncludes(result.stderr, "ddalggak-good.yml", "stderr");
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

console.log(`\nSummary: ${passed}/${tests.length} issue form admission cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
