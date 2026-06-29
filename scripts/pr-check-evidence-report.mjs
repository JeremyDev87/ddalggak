#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

import { classifyFailure, normalizeChecks, normalizeState } from "./lib/check-evidence.mjs";
import { countSummary, emitReport, finishMarkdown } from "./lib/reporting.mjs";
import { sanitizeText, sanitizeUrl } from "./lib/secret-scrub.mjs";

function parseArgs(argv) {
  const options = {
    input: null,
    format: "markdown",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--input requires a JSON file path");
      }
      options.input = value;
      index += 1;
    } else if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--markdown") {
      options.format = "markdown";
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (!options.input) {
    throw new Error("--input is required");
  }

  return options;
}

function summarizeChecks(input) {
  const checks = normalizeChecks(input);
  const counts = {
    success: 0,
    failure: 0,
    pending: 0,
    skipped: 0,
    unknown: 0,
  };
  const failureTypes = {
    "infra-failure": 0,
    "test-failure": 0,
    "permission-auth-failure": 0,
    "unknown-failure": 0,
  };

  for (const check of checks) {
    counts[check.state] = (counts[check.state] || 0) + 1;
    if (check.state === "failure") {
      failureTypes[check.failureType] = (failureTypes[check.failureType] || 0) + 1;
    }
  }

  return {
    checkCount: checks.length,
    counts,
    failureTypes,
    checks,
    caveats: [
      "raw CI logs/stdout/stderr are intentionally excluded",
      "details URLs and check metadata are evidence pointers, not root-cause proof",
      "failure classification is deterministic and conservative; unknown means manual inspection is still needed",
    ],
  };
}

function formatLine(check) {
  const workflow = check.workflow ? `${check.workflow} / ` : "";
  const axis = check.matrixAxis ? ` / ${check.matrixAxis}` : "";
  const detail = check.detailsUrl ? ` (${check.detailsUrl})` : "";
  const failureType = check.state === "failure" ? `; ${check.failureType}` : "";
  return `- ${workflow}${check.name}${axis}: ${check.state.toUpperCase()}${failureType}${detail}`;
}

function formatMarkdown(report) {
  const lines = [];
  lines.push("# PR check evidence bundle");
  lines.push("");
  lines.push(`- checks: ${report.checkCount}`);
  lines.push(`- states: ${countSummary(report.counts, ["success", "failure", "pending", "skipped", "unknown"])}`);
  lines.push(`- failure classes: infra=${report.failureTypes["infra-failure"]}, test=${report.failureTypes["test-failure"]}, permission/auth=${report.failureTypes["permission-auth-failure"]}, unknown=${report.failureTypes["unknown-failure"]}`);
  lines.push("");
  lines.push("## Checks");
  if (report.checks.length === 0) {
    lines.push("- no checks supplied");
  } else {
    for (const check of report.checks) {
      lines.push(formatLine(check));
    }
  }
  lines.push("");
  lines.push("## Caveats");
  for (const caveat of report.caveats) {
    lines.push(`- ${caveat}`);
  }
  return finishMarkdown(lines);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const report = summarizeChecks(input);
  emitReport({ format: options.format, report, formatMarkdown });
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(`[pr-check-evidence-report] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export {
  classifyFailure,
  formatMarkdown,
  normalizeChecks,
  normalizeState,
  sanitizeText,
  sanitizeUrl,
  summarizeChecks,
};
