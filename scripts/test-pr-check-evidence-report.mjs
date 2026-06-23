#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  formatMarkdown,
  normalizeChecks,
  normalizeState,
  sanitizeText,
  sanitizeUrl,
  summarizeChecks,
} from "./pr-check-evidence-report.mjs";
import { runNodeScript } from "./test-lib/process.mjs";
import { makeTempDir } from "./test-lib/temp.mjs";

const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "pr-check-evidence-report.mjs");
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

function runCli(input, args = []) {
  const dir = makeTempDir("ddalggak-pr-check-evidence-");
  const filePath = path.join(dir, "checks.json");
  writeFileSync(filePath, JSON.stringify(input, null, 2), "utf8");
  return runNodeScript(scriptPath, ["--input", filePath, ...args], { cwd: rootDir });
}

const cases = [
  {
    name: "normalizes success failure pending skipped and unknown states",
    run() {
      assert(normalizeState({ conclusion: "success" }) === "success", "success state");
      assert(normalizeState({ state: "FAILURE" }) === "failure", "failure state");
      assert(normalizeState({ status: "in_progress" }) === "pending", "pending state");
      assert(normalizeState({ conclusion: "skipped" }) === "skipped", "skipped state");
      assert(normalizeState({ status: "mystery" }) === "unknown", "unknown state");
    },
  },
  {
    name: "summarizes mixed matrix checks with content-light URLs",
    run() {
      const report = summarizeChecks([
        {
          workflow: "CI",
          name: "Verify package / Node 18",
          state: "SUCCESS",
          link: "https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/11",
          completedAt: "2026-05-24T12:00:00Z",
        },
        {
          workflow: "CI",
          name: "Verify package / Node 20",
          state: "FAILURE",
          link: "https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/12",
          description: "verify package failed",
        },
        {
          workflow: "CI",
          name: "Verify package / Node 22",
          status: "queued",
          link: "https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/13",
        },
        {
          workflow: "CI",
          name: "Verify package / Node 24",
          conclusion: "skipped",
          link: "https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/14",
        },
      ]);
      assert(report.counts.success === 1, "success count");
      assert(report.counts.failure === 1, "failure count");
      assert(report.counts.pending === 1, "pending count");
      assert(report.counts.skipped === 1, "skipped count");
      assert(report.failureTypes["test-failure"] === 1, "test failure classification");
      const markdown = formatMarkdown(report);
      assertIncludes(markdown, "CI / Verify package / Node 20 / Node 20: FAILURE; test-failure", "markdown");
      assertIncludes(markdown, "https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/12", "markdown");
      assertNotIncludes(markdown, "raw log body copied", "markdown");
    },
  },
  {
    name: "accepts REST check_runs and target URL field variants",
    run() {
      const restReport = summarizeChecks({
        total_count: 1,
        check_runs: [
          {
            name: "Verify package / Node 18",
            status: "completed",
            conclusion: "success",
            html_url: "https://github.com/example/repo/actions/runs/1/job/2",
          },
        ],
      });
      assert(restReport.checkCount === 1, "REST check_runs should be counted");
      assert(restReport.checks[0].detailsUrl === "https://github.com/example/repo/actions/runs/1/job/2", "REST html_url should be preserved");

      const statusChecks = normalizeChecks({
        nodes: [
          {
            context: "legacy status",
            state: "SUCCESS",
            targetUrl: "https://ci.example.test/build/42",
          },
          {
            context: "legacy snake status",
            state: "FAILURE",
            target_url: "https://ci.example.test/build/43",
          },
        ],
      });
      assert(statusChecks.length === 2, "status nodes should be counted");
      assert(statusChecks[0].detailsUrl === "https://ci.example.test/build/42", "targetUrl should be preserved");
      assert(statusChecks[1].detailsUrl === "https://ci.example.test/build/43", "target_url should be preserved");
    },
  },
  {
    name: "classifies infra and permission failures conservatively",
    run() {
      const report = summarizeChecks([
        {
          name: "Verify package / Node 20",
          state: "FAILURE",
          description: "runner startup failed with no logs because spending limit was reached",
        },
        {
          name: "Dependency Review",
          conclusion: "failure",
          description: "Resource not accessible by integration",
        },
        {
          name: "Unknown check",
          conclusion: "failure",
        },
      ]);
      assert(report.failureTypes["infra-failure"] === 1, "infra classification");
      assert(report.failureTypes["permission-auth-failure"] === 1, "permission classification");
      assert(report.failureTypes["unknown-failure"] === 1, "unknown classification");
    },
  },
  {
    name: "redacts token-like strings from names descriptions and URLs",
    run() {
      const secret = "ghp_abcdefghijklmnopqrstuvwxyz123456";
      const report = summarizeChecks([
        {
          workflow: `CI token=${secret}`,
          name: `Deploy ${secret}`,
          conclusion: "failure",
          detailsUrl: `https://example.test/job?token=${secret}&run=42`,
          description: `Authorization: Bearer ${secret}`,
        },
      ]);
      const serialized = JSON.stringify(report);
      assertNotIncludes(serialized, secret, "serialized report");
      assertIncludes(serialized, "[REDACTED]", "serialized report");
      assertIncludes(serialized, "token=%5BREDACTED%5D", "serialized report");
    },
  },
  {
    name: "CLI emits deterministic markdown and JSON",
    run() {
      const input = {
        checks: [
          {
            workflow: "CI",
            name: "Lint",
            conclusion: "success",
            details_url: "https://github.com/example/repo/actions/runs/1/job/2",
          },
        ],
      };
      const markdown = runCli(input);
      assert(markdown.status === 0, `markdown exit ${markdown.status}\n${markdown.stderr}`);
      assertIncludes(markdown.stdout, "# PR check evidence bundle", "markdown stdout");
      assertIncludes(markdown.stdout, "CI / Lint: SUCCESS", "markdown stdout");
      const json = runCli(input, ["--json"]);
      assert(json.status === 0, `json exit ${json.status}\n${json.stderr}`);
      const parsed = JSON.parse(json.stdout);
      assert(parsed.counts.success === 1, "json success count");
    },
  },
];

let failures = 0;
for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error instanceof Error ? error.stack : String(error));
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`[test-pr-check-evidence-report] passed ${cases.length} cases`);
}
