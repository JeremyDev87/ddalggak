#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /sk-[A-Za-z0-9]{20,}/g,
  /(?:bearer|token|secret|password|authorization)\s*[:=]\s*[^\s,)]+/gi,
  /[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|AUTHORIZATION)[A-Z0-9_]*\s*[:=]\s*[^\s,)]+/g,
];
const SECRET_QUERY_KEYS = /(?:token|secret|password|authorization|signature|sig|key|access_token|client_secret)/i;

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

function sanitizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  let text = String(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[REDACTED]");
  }
  return text;
}

function sanitizeUrl(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const original = String(value);
  try {
    const url = new URL(original);
    url.username = sanitizeText(url.username) || "";
    url.password = url.password ? "[REDACTED]" : "";
    url.pathname = sanitizeText(url.pathname) || "";
    for (const [key, paramValue] of [...url.searchParams.entries()]) {
      if (SECRET_QUERY_KEYS.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      } else {
        url.searchParams.set(key, sanitizeText(paramValue) || "");
      }
    }
    return url.toString();
  } catch {
    return sanitizeText(original);
  }
}

function normalizeState(check) {
  const rawValues = [
    check.bucket,
    check.conclusion,
    check.state,
    check.status,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const raw = rawValues.join(" ");

  if (/\b(success|successful|pass|passed|completed_success)\b/.test(raw)) {
    return "success";
  }
  if (/\b(skip|skipped|neutral)\b/.test(raw)) {
    return "skipped";
  }
  if (/\b(fail|failed|failure|error|timed_out|cancelled|canceled)\b/.test(raw)) {
    return "failure";
  }
  if (/\b(pending|queued|in_progress|waiting|requested|expected|startup|action_required)\b/.test(raw)) {
    return "pending";
  }
  return "unknown";
}

function matrixAxisFromName(name) {
  const text = String(name || "");
  const node = text.match(/\bNode\s*(\d+(?:\.\d+)*)\b/i);
  if (node) {
    return `Node ${node[1]}`;
  }
  const py = text.match(/\bPython\s*(\d+(?:\.\d+)*)\b/i);
  if (py) {
    return `Python ${py[1]}`;
  }
  return null;
}

function classifyFailure(check, normalizedState) {
  if (normalizedState !== "failure") {
    return "not-failure";
  }
  const haystack = [check.name, check.workflow, check.description, check.event]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(auth|permission|forbidden|403|unauthori[sz]ed|resource not accessible|approval required|action_required)\b/.test(haystack)) {
    return "permission-auth-failure";
  }
  if (/\b(runner|billing|spending|quota|capacity|startup|no logs?|platform|infrastructure|infra)\b/.test(haystack)) {
    return "infra-failure";
  }
  if (/\b(test|spec|lint|typecheck|build|verify|package|compile)\b/.test(haystack)) {
    return "test-failure";
  }
  return "unknown-failure";
}

function normalizeCheck(check, index) {
  const state = normalizeState(check);
  const name = sanitizeText(check.name || check.context || `check-${index + 1}`);
  const workflow = sanitizeText(check.workflow || check.workflowName || check.app?.name || null);
  const detailsUrl = sanitizeUrl(
    check.link
      || check.detailsUrl
      || check.details_url
      || check.targetUrl
      || check.target_url
      || check.html_url
      || check.url
      || null,
  );
  const description = sanitizeText(check.description || check.summary || null);
  const normalized = {
    name,
    workflow,
    state,
    failureType: classifyFailure({ ...check, name, workflow, description }, state),
    detailsUrl,
    startedAt: sanitizeText(check.startedAt || check.started_at || null),
    completedAt: sanitizeText(check.completedAt || check.completed_at || null),
    matrixAxis: matrixAxisFromName(name),
  };
  return normalized;
}

function normalizeChecks(input) {
  const checks = Array.isArray(input)
    ? input
    : Array.isArray(input?.checks)
      ? input.checks
      : Array.isArray(input?.check_runs)
        ? input.check_runs
        : Array.isArray(input?.statusCheckRollup)
          ? input.statusCheckRollup
          : Array.isArray(input?.nodes)
            ? input.nodes
            : [];

  return checks.map((check, index) => normalizeCheck(check, index));
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
  lines.push(`- states: success=${report.counts.success}, failure=${report.counts.failure}, pending=${report.counts.pending}, skipped=${report.counts.skipped}, unknown=${report.counts.unknown}`);
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
  return `${lines.join("\n").trim()}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const report = summarizeChecks(input);
  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatMarkdown(report));
  }
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
