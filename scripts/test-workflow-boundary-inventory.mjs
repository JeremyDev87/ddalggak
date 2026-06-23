#!/usr/bin/env node
/**
 * test-workflow-boundary-inventory.mjs
 *
 * Unit tests for scripts/workflow-boundary-inventory.mjs.
 *
 * The inventory script supports --root and --json, so each case builds a
 * temporary .github/workflows/ fixture and asserts the produced boundary
 * fields: trigger classification, permissions, write escalation, secret/OIDC
 * surface (content-light), concurrency policy, and next_gate routing.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyDuplicateRunPolicy,
  classifyNextGate,
  classifyQueueHangNextGate,
  classifyWriteEscalation,
} from "./lib/workflow-boundary-rules.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const scriptPath = path.join(rootDir, "scripts", "workflow-boundary-inventory.mjs");

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

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function assertIncludes(value, needle, label = "value") {
  assert(
    value.includes(needle),
    `expected ${label} to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

function makeFixture(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-workflow-boundary-"));
  tempRoots.push(root);
  const workflowDir = path.join(root, ".github", "workflows");
  mkdirSync(workflowDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(workflowDir, name), content, "utf8");
  }
  return root;
}

function runInventory(root, args = ["--json"]) {
  return spawnSync(process.execPath, [scriptPath, "--root", root, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function inventoryOf(files) {
  const root = makeFixture(files);
  const result = runInventory(root);
  assert(
    result.status === 0,
    `expected exit 0, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return { report: JSON.parse(result.stdout), stdout: result.stdout };
}

function findWorkflow(report, fileName) {
  const wf = report.workflows.find(
    (entry) => path.basename(entry.workflow_path) === fileName,
  );
  assert(wf, `workflow ${fileName} missing from inventory`);
  return wf;
}

const TRUSTED_PUSH_CI = [
  "name: CI",
  "on:",
  "  push:",
  "    branches:",
  "      - master",
  "permissions:",
  "  contents: read",
  "jobs:",
  "  test:",
  "    runs-on: ubuntu-latest",
  "    timeout-minutes: 10",
  "    steps:",
  "      - run: echo ok",
].join("\n") + "\n";

const tests = [
  {
    name: "workflow boundary classifier rules are table-driven and exported",
    run() {
      assertEqual(
        classifyWriteEscalation({ contents: "write" }, {}, ".github/workflows/custom.yml"),
        "WARN: write permissions detected (contents) — explicit reason not documented in inventory",
        "undocumented write warning",
      );
      assertEqual(
        classifyWriteEscalation({}, { publish: { "id-token": "write" } }, ".github/workflows/release.yml"),
        "publish_to_npm job: id-token:write required for OIDC-based trusted npm provenance publishing",
        "release write reason",
      );
      assertEqual(
        classifyDuplicateRunPolicy({ cancel_in_progress: true, group: "release-publish-main" }, ["push"]),
        "WARN: cancel_in_progress=true on release lane — may cancel active evidence run",
        "release cancellation warning",
      );
      assertEqual(
        classifyQueueHangNextGate({ cancel_in_progress: false, group: "release-publish-main" }, ["push"], "serialize_runs"),
        "serialize_wait_for_prior_run",
        "release queue policy",
      );
      assertEqual(
        classifyNextGate(null, "serialize_runs", { "id-token": "write" }, false),
        "human-review",
        "id-token next gate",
      );
    },
  },
  {
    name: "classifies a read-only push-to-branch workflow as trusted and allow",
    run() {
      const { report } = inventoryOf({ "ci.yml": TRUSTED_PUSH_CI });
      assertEqual(report.workflows.length, 1, "workflow count");
      const wf = findWorkflow(report, "ci.yml");
      assertEqual(wf.workflow_path, ".github/workflows/ci.yml", "workflow_path");
      assertEqual(JSON.stringify(wf.trigger_events), '["push"]', "trigger_events");
      assertEqual(wf.trusted_ref_policy, "push_to_branch_trusted", "trusted_ref_policy");
      assertEqual(
        JSON.stringify(wf.token_permissions.workflow_level),
        '{"contents":"read"}',
        "workflow-level permissions",
      );
      assertEqual(wf.token_permissions.job_level_overrides, "none", "job overrides");
      assertEqual(wf.write_escalation_reason, null, "write_escalation_reason");
      assertEqual(
        JSON.stringify(wf.timeout_minutes),
        '{"declared":10}',
        "timeout_minutes",
      );
      assertEqual(wf.secret_or_oidc_surface, "none_detected", "secret surface");
      assertEqual(wf.cache_surface, "none_detected", "cache surface");
      assertEqual(wf.concurrency_group, null, "concurrency_group");
      assertEqual(wf.group_key_basis, "no_concurrency", "group_key_basis");
      assertEqual(
        wf.duplicate_run_policy,
        "no_concurrency_declared_parallel_allowed",
        "duplicate_run_policy",
      );
      assertEqual(wf.queue_or_hang_next_gate, "rerun", "queue_or_hang_next_gate");
      assertEqual(wf.environment_protection, "absent", "environment_protection");
      assertEqual(wf.next_gate, "allow", "next_gate");
      // Report envelope must stay non-overclaiming.
      assert(/^\d{4}-\d{2}-\d{2}$/.test(report.inventoryDate), "inventoryDate shape");
      assertIncludes(
        report.caveat,
        "Unknown fields are not promoted to pass",
        "caveat",
      );
      assert("#178" in report.adjacentGates, "adjacent gates listed");
    },
  },

  {
    name: "classifies pull_request trigger as untrusted head with default timeout",
    run() {
      const { report } = inventoryOf({
        "pr.yml": [
          "name: PR Check",
          "on:",
          "  pull_request:",
          "    branches:",
          "      - master",
          "permissions:",
          "  contents: read",
          "jobs:",
          "  check:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: echo check",
        ].join("\n") + "\n",
      });
      const wf = findWorkflow(report, "pr.yml");
      assertEqual(
        JSON.stringify(wf.trigger_events),
        '["pull_request"]',
        "trigger_events",
      );
      assertEqual(wf.trusted_ref_policy, "pr_untrusted_head", "trusted_ref_policy");
      assertEqual(
        wf.timeout_minutes,
        "none_declared_default_360",
        "timeout_minutes default",
      );
      assertIncludes(wf.timeout_reason, "360", "timeout_reason");
    },
  },

  {
    name: "parses inline on: [push, pull_request] event list",
    run() {
      const { report } = inventoryOf({
        "mixed.yml": [
          "name: Mixed",
          "on: [push, pull_request]",
          "permissions:",
          "  contents: read",
          "jobs:",
          "  ok:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: echo ok",
        ].join("\n") + "\n",
      });
      const wf = findWorkflow(report, "mixed.yml");
      assertEqual(
        JSON.stringify(wf.trigger_events),
        '["push","pull_request"]',
        "trigger_events",
      );
      assertEqual(wf.trusted_ref_policy, "pr_untrusted_head", "trusted_ref_policy");
    },
  },

  {
    name: "flags undocumented write permissions as WARN and next_gate warn",
    run() {
      const { report } = inventoryOf({
        "custom-deploy.yml": [
          "name: Custom Deploy",
          "on:",
          "  push:",
          "    branches:",
          "      - master",
          "permissions:",
          "  contents: write",
          "jobs:",
          "  deploy:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: echo deploy",
        ].join("\n") + "\n",
      });
      const wf = findWorkflow(report, "custom-deploy.yml");
      assert(
        typeof wf.write_escalation_reason === "string" &&
          wf.write_escalation_reason.startsWith("WARN:"),
        `expected WARN escalation, got ${JSON.stringify(wf.write_escalation_reason)}`,
      );
      assertIncludes(wf.write_escalation_reason, "contents", "escalation reason");
      assertEqual(wf.next_gate, "warn", "next_gate");
    },
  },

  {
    name: "release.yml job-level id-token write gets documented reason and human-review",
    run() {
      const { report } = inventoryOf({
        "release.yml": [
          "name: Release",
          "on:",
          "  release:",
          "    types:",
          "      - published",
          "permissions:",
          "  contents: read",
          "jobs:",
          "  publish_to_npm:",
          "    runs-on: ubuntu-latest",
          "    environment: npm-publish",
          "    permissions:",
          "      contents: read",
          "      id-token: write",
          "    steps:",
          "      - run: echo publish",
        ].join("\n") + "\n",
      });
      const wf = findWorkflow(report, "release.yml");
      assertEqual(
        wf.trusted_ref_policy,
        "release_event_tag_trusted",
        "trusted_ref_policy",
      );
      assertEqual(
        JSON.stringify(wf.token_permissions.job_level_overrides),
        '{"publish_to_npm":{"contents":"read","id-token":"write"}}',
        "job-level overrides",
      );
      assertIncludes(wf.write_escalation_reason, "OIDC", "escalation reason");
      assert(
        !wf.write_escalation_reason.startsWith("WARN:"),
        "documented escalation must not be a WARN",
      );
      assertEqual(
        wf.secret_or_oidc_surface["id-token"],
        "write (OIDC surface present)",
        "OIDC surface",
      );
      assertEqual(wf.environment_protection, "present", "environment_protection");
      assertEqual(wf.next_gate, "human-review", "next_gate");
    },
  },

  {
    name: "reports secret names only and never run-block content",
    run() {
      const marker = "BOUNDARY_CONTENT_MARKER_8347";
      const { report, stdout } = inventoryOf({
        "secrets.yml": [
          "name: Secrets",
          "on:",
          "  push:",
          "    branches:",
          "      - master",
          "permissions:",
          "  contents: read",
          "jobs:",
          "  use:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - env:",
          "          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}",
          "          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}",
          `        run: echo ${marker}`,
        ].join("\n") + "\n",
      });
      const wf = findWorkflow(report, "secrets.yml");
      assertEqual(wf.secret_or_oidc_surface.GITHUB_TOKEN, "present", "GITHUB_TOKEN");
      assertEqual(wf.secret_or_oidc_surface.NPM_TOKEN, "present", "NPM_TOKEN");
      assert(
        !stdout.includes(marker),
        "inventory output must not contain run-block content",
      );
    },
  },

  {
    name: "warns on cancel-in-progress release lane and routes to human_approval",
    run() {
      const { report } = inventoryOf({
        "release-publish.yml": [
          "name: Release Publish",
          "on:",
          "  release:",
          "    types:",
          "      - published",
          "permissions:",
          "  contents: read",
          "concurrency:",
          "  group: release-publish-${{ github.ref }}",
          "  cancel-in-progress: true",
          "jobs:",
          "  build:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: echo build",
        ].join("\n") + "\n",
      });
      const wf = findWorkflow(report, "release-publish.yml");
      assertEqual(wf.cancel_in_progress, true, "cancel_in_progress");
      assertEqual(wf.group_key_basis, "ref", "group_key_basis");
      assert(
        wf.duplicate_run_policy.startsWith("WARN: cancel_in_progress=true on release lane"),
        `expected release-lane WARN, got ${JSON.stringify(wf.duplicate_run_policy)}`,
      );
      assertEqual(wf.queue_or_hang_next_gate, "human_approval", "queue gate");
      assertEqual(wf.next_gate, "warn", "next_gate");
    },
  },

  {
    name: "classifies non-release concurrency policies and sorts workflows by file name",
    run() {
      const base = (name, cancel) =>
        [
          `name: ${name}`,
          "on:",
          "  push:",
          "    branches:",
          "      - master",
          "permissions:",
          "  contents: read",
          "concurrency:",
          "  group: lane-${{ github.ref }}",
          `  cancel-in-progress: ${cancel}`,
          "jobs:",
          "  run:",
          "    runs-on: ubuntu-latest",
          "    steps:",
          "      - run: echo ok",
        ].join("\n") + "\n";
      const { report } = inventoryOf({
        "b-serialize.yml": base("Serialize", "false"),
        "a-cancel.yml": base("Cancel", "true"),
      });
      assertEqual(
        path.basename(report.workflows[0].workflow_path),
        "a-cancel.yml",
        "sorted order",
      );
      const cancelWf = findWorkflow(report, "a-cancel.yml");
      assertEqual(cancelWf.duplicate_run_policy, "cancel_stale_runs", "cancel policy");
      assertEqual(
        cancelWf.queue_or_hang_next_gate,
        "cancel_stale_then_rerun",
        "cancel queue gate",
      );
      const serializeWf = findWorkflow(report, "b-serialize.yml");
      assertEqual(serializeWf.duplicate_run_policy, "serialize_runs", "serialize policy");
      assertEqual(
        serializeWf.queue_or_hang_next_gate,
        "wait_for_prior_run",
        "serialize queue gate",
      );
    },
  },

  {
    name: "markdown format emits inventory header, per-workflow table, and summary",
    run() {
      const root = makeFixture({ "ci.yml": TRUSTED_PUSH_CI });
      const result = runInventory(root, []);
      assertEqual(result.status, 0, "exit code");
      assertIncludes(
        result.stdout,
        "# Workflow Trigger/Permission Boundary Inventory",
        "stdout",
      );
      assertIncludes(result.stdout, "## `.github/workflows/ci.yml`", "stdout");
      assertIncludes(result.stdout, "**Caveat**", "stdout");
      assertIncludes(result.stdout, "## Summary", "stdout");
      assertIncludes(
        result.stdout,
        "| workflow | triggers | write? | next_gate |",
        "stdout",
      );
    },
  },

  {
    name: "empty workflows directory fails",
    run() {
      const root = makeFixture({});
      const result = runInventory(root);
      assertEqual(result.status, 1, "exit code");
      assertIncludes(result.stderr, "No workflow files found", "stderr");
    },
  },

  {
    name: "missing workflows directory fails",
    run() {
      const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-workflow-boundary-"));
      tempRoots.push(root);
      const result = runInventory(root);
      assertEqual(result.status, 1, "exit code");
      assertIncludes(result.stderr, "Cannot read workflows directory", "stderr");
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

console.log(
  `\nSummary: ${passed}/${tests.length} workflow boundary inventory cases passed.`,
);

if (failures.length > 0) {
  process.exitCode = 1;
}
