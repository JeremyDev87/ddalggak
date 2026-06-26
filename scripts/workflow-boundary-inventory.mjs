#!/usr/bin/env node
/**
 * workflow-boundary-inventory.mjs
 *
 * Parses .github/workflows/*.yml read-only to produce a content-light
 * trigger/permission/timeout/concurrency authority inventory per workflow.
 *
 * Non-goals:
 *   - Does NOT query GitHub API or repository settings
 *   - Does NOT print secret values, token values, or credential material
 *   - Does NOT replace static lint (#182), action pinning (#181),
 *     workflow command channel (#180), or release provenance (#178) gates
 *
 * Adjacent gates (out of scope here):
 *   - #178 release provenance attestation
 *   - #180 workflow command channel injection
 *   - #181 action pinning
 *   - #182 workflow static lint
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectWorkflowFiles } from "./lib/workflow-files.mjs";
import { extractTopLevelBlocks, indentOf } from "./lib/yaml-lines.mjs";

import {
  classifyDuplicateRunPolicy,
  classifyNextGate,
  classifyQueueHangNextGate,
  classifyWriteEscalation,
} from "./lib/workflow-boundary-rules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    format: "markdown",
    rootDir: defaultRoot,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--markdown") {
      options.format = "markdown";
    } else if (arg === "--root") {
      const value = argv[i + 1];
      if (!value) throw new Error("--root requires a directory path");
      options.rootDir = path.resolve(value);
      i += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

/**
 * Parse the `on:` trigger events from top-level block lines.
 * Events are the first-level children of `on:` at indent=2.
 * Inline list items at indent=2 (e.g. `- push`) are also recognized.
 * Sub-keys like `branches`, `tags`, `inputs`, and branch/tag values are ignored.
 */
function parseTriggerEvents(onLines) {
  if (!onLines || onLines.length === 0) return ["unknown"];

  // Determine the minimum indent of the first non-empty line — that's the event level
  let eventIndent = -1;
  for (const line of onLines) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    eventIndent = indentOf(line);
    break;
  }
  if (eventIndent < 0) return ["unknown"];

  const events = [];
  for (const line of onLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = indentOf(line);
    // Only process lines at the event level (first-level children of `on:`)
    if (indent !== eventIndent) continue;
    // Match `push:`, `pull_request:`, `workflow_dispatch:`, etc.
    const keyM = trimmed.match(/^([a-z_]+):/);
    if (keyM) {
      events.push(keyM[1]);
      continue;
    }
    // Inline list item at event level (e.g. `- push`)
    const listM = trimmed.match(/^-\s*([a-z_]+)\s*$/);
    if (listM) {
      events.push(listM[1]);
    }
  }

  return events.length > 0 ? events : ["unknown"];
}

/**
 * Parse `on:` inline value (e.g. `on: push` or `on: [push, pull_request]`).
 */
function parseTriggerInline(onValue) {
  if (!onValue) return null;
  const trimmed = onValue.trim();
  if (trimmed.startsWith("[")) {
    return trimmed
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (trimmed) return [trimmed];
  return null;
}

/**
 * Parse permissions block lines into an object.
 * Lines are like `  contents: read`.
 */
function parsePermissionsLines(lines) {
  const perms = {};
  for (const line of lines) {
    const m = line.match(/^\s+([a-z-]+):\s*([a-z-]+)/);
    if (m) perms[m[1]] = m[2];
  }
  return Object.keys(perms).length > 0 ? perms : null;
}

/**
 * Find permissions: blocks inside jobs. Uses line-by-line scanning to avoid
 * catastrophic backtracking on large files.
 */
function parseJobPermissions(jobsLines) {
  if (!jobsLines || jobsLines.length === 0) return null;

  const jobPerms = {};
  let currentJobId = null;
  let inPermissions = false;
  let permLines = [];

  for (const line of jobsLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = indentOf(line);

    // Job id lines at indent 2 (jobs block is indented 2 from top, job id at 2)
    if (indent === 2) {
      // Save previous job's permissions
      if (currentJobId && inPermissions && permLines.length > 0) {
        const perms = parsePermissionsLines(permLines);
        if (perms) jobPerms[currentJobId] = perms;
      }
      const jobIdMatch = line.match(/^\s{2}([a-zA-Z0-9_-]+):/);
      if (jobIdMatch) {
        currentJobId = jobIdMatch[1];
        inPermissions = false;
        permLines = [];
      }
      continue;
    }

    // permissions: key at indent 4 under a job
    if (indent === 4 && trimmed === "permissions:") {
      inPermissions = true;
      permLines = [];
      continue;
    }

    // If we're in permissions and see indent 6+, collect perm lines
    if (inPermissions && indent >= 6) {
      permLines.push(line);
      continue;
    }

    // Any other key at indent 4 ends the permissions block
    if (inPermissions && indent === 4) {
      if (currentJobId && permLines.length > 0) {
        const perms = parsePermissionsLines(permLines);
        if (perms) jobPerms[currentJobId] = perms;
      }
      inPermissions = false;
      permLines = [];
    }
  }

  // Flush last job
  if (currentJobId && inPermissions && permLines.length > 0) {
    const perms = parsePermissionsLines(permLines);
    if (perms) jobPerms[currentJobId] = perms;
  }

  return Object.keys(jobPerms).length > 0 ? jobPerms : null;
}

/**
 * Parse concurrency block lines.
 */
function parseConcurrencyLines(concurrencyLines) {
  if (!concurrencyLines || concurrencyLines.length === 0) return null;

  const result = {};
  for (const line of concurrencyLines) {
    const trimmed = line.trim();
    const groupM = trimmed.match(/^group:\s*(.+)$/);
    if (groupM) {
      result.group = groupM[1].trim();
      continue;
    }
    const cancelM = trimmed.match(/^cancel-in-progress:\s*(true|false)/);
    if (cancelM) {
      result.cancel_in_progress = cancelM[1] === "true";
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Scan all lines for timeout-minutes declarations.
 */
function parseTimeoutMinutes(lines) {
  const timeouts = [];
  for (const line of lines) {
    const m = line.match(/timeout-minutes:\s*(\d+)/);
    if (m) timeouts.push(parseInt(m[1], 10));
  }
  if (timeouts.length === 0) return "none_declared_default_360";
  if (timeouts.length === 1) return { declared: timeouts[0] };
  return { declared: timeouts };
}

/**
 * Detect secret and OIDC surface (presence/kind only, never values).
 */
function detectSecretOidcSurface(allText) {
  const found = {};

  if (/secrets\.GITHUB_TOKEN/.test(allText)) {
    found.GITHUB_TOKEN = "present";
  }

  // Named secrets — extract key names only
  const namedRe = /\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g;
  let m;
  while ((m = namedRe.exec(allText)) !== null) {
    const name = m[1];
    if (name !== "GITHUB_TOKEN") {
      found[name] = "present";
    }
  }

  if (/id-token:\s*write/.test(allText)) {
    found["id-token"] = "write (OIDC surface present)";
  }

  return Object.keys(found).length > 0 ? found : "none_detected";
}

/**
 * Detect cache surface (presence only).
 */
function detectCacheSurface(allText) {
  if (/uses:\s*actions\/cache/.test(allText)) {
    return "actions/cache: present (key source and fork visibility: unknown without runtime context)";
  }
  return "none_detected";
}

/**
 * Classify the trusted ref policy.
 */
function classifyTrustedRefPolicy(events, allText) {
  const hasPR = events.includes("pull_request");
  const hasDispatch = events.includes("workflow_dispatch");
  const hasRelease = events.includes("release");

  // Check for tag push and branch push by scanning lines
  let hasTagPush = false;
  let hasBranchPush = false;

  const lines = allText.split("\n");
  let inPushBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "push:" || trimmed.startsWith("push:")) {
      inPushBlock = true;
      continue;
    }
    if (inPushBlock) {
      if (trimmed === "tags:" || trimmed.startsWith("tags:")) {
        hasTagPush = true;
      }
      if (trimmed === "branches:" || trimmed.startsWith("branches:")) {
        hasBranchPush = true;
      }
      // End of push sub-block
      const indent = indentOf(line);
      if (indent === 0 && trimmed && !trimmed.startsWith("#")) {
        inPushBlock = false;
      }
    }
  }

  const trusted = [];
  const untrusted = [];

  if (hasBranchPush) trusted.push("push_to_branch");
  if (hasTagPush) trusted.push("push_to_tag");
  if (hasRelease) trusted.push("release_event_tag");
  if (hasPR) untrusted.push("pr_untrusted_head");
  if (hasDispatch) untrusted.push("manual_dispatch_input_ref");

  if (trusted.length > 0 && untrusted.length > 0) return "mixed_trusted_and_untrusted";
  if (untrusted.length > 0 && trusted.length === 0) {
    if (hasPR && !hasDispatch) return "pr_untrusted_head";
    if (hasDispatch && !hasPR) return "manual_dispatch_input_ref";
    return "pr_or_manual_dispatch_untrusted";
  }
  if (trusted.length > 0 && untrusted.length === 0) {
    if (hasTagPush) return "push_to_tag_trusted";
    if (hasBranchPush) return "push_to_branch_trusted";
    if (hasRelease) return "release_event_tag_trusted";
  }
  // Pure workflow_dispatch (no push, no PR, no release in events list at all)
  if (hasDispatch && !hasBranchPush && !hasTagPush && !hasPR && !hasRelease) {
    return "manual_dispatch_input_ref";
  }
  return "unknown";
}

/**
 * Infer concurrency group key basis.
 */
function inferGroupKeyBasis(groupExpr) {
  if (!groupExpr) return "unknown";
  const bases = [];
  if (/github\.ref[^_]/.test(groupExpr)) bases.push("ref");
  if (/github\.sha/.test(groupExpr)) bases.push("sha");
  if (/inputs\./.test(groupExpr)) bases.push("workflow_input");
  if (/github\.ref_name/.test(groupExpr)) bases.push("ref_name");
  if (/github\.event_name/.test(groupExpr)) bases.push("event_name");
  if (/github\.event\.release/.test(groupExpr)) bases.push("release_tag");
  return bases.length > 0 ? bases.join("+") : "static_or_expression";
}

/**
 * Parse a single workflow file into a boundary inventory row.
 */
function parseWorkflowBoundary(yamlText, filePath) {
  const relativePath = filePath.replace(/.*\.github\//, ".github/");
  const lines = yamlText.split("\n");

  // Build top-level block map
  const blocks = extractTopLevelBlocks(lines);

  // Trigger events
  let events;
  const onBlock = blocks.get("on");
  if (onBlock) {
    // Check if `on:` line had an inline value (must be on the same line, no newline)
    // Match `on: push` or `on: [push, pull_request]` — NOT `on:\n  push:`
    const onLineMatch = yamlText.match(/^on:[ \t]+(\S[^\n]*)$/m);
    if (onLineMatch && onLineMatch[1].trim()) {
      const inline = parseTriggerInline(onLineMatch[1]);
      events = inline || parseTriggerEvents(onBlock);
    } else {
      events = parseTriggerEvents(onBlock);
    }
  } else {
    events = ["unknown"];
  }

  // Workflow-level permissions
  const permBlock = blocks.get("permissions");
  const workflowPerms = permBlock ? parsePermissionsLines(permBlock.map((l) => "  " + l.trim())) : null;

  // Job-level permissions (scan jobs block)
  const jobsBlock = blocks.get("jobs");
  const jobPermsMap = jobsBlock ? parseJobPermissions(jobsBlock) : null;

  // Concurrency
  const concurrencyBlock = blocks.get("concurrency");
  const concurrency = concurrencyBlock ? parseConcurrencyLines(concurrencyBlock) : null;

  // Timeout
  const timeoutMinutes = parseTimeoutMinutes(lines);

  // Secret / OIDC surface
  const secretOidcSurface = detectSecretOidcSurface(yamlText);

  // Cache surface
  const cacheSurface = detectCacheSurface(yamlText);

  // Trusted ref policy
  const trustedRefPolicy = classifyTrustedRefPolicy(events, yamlText);

  // Write escalation
  const writeEscalation = classifyWriteEscalation(workflowPerms, jobPermsMap, filePath);

  // Duplicate run policy
  const duplicateRunPolicy = classifyDuplicateRunPolicy(concurrency, events);

  // Queue/hang gate
  const queueHangNextGate = classifyQueueHangNextGate(concurrency, events, duplicateRunPolicy);

  // All top-level perms for next_gate
  const allTopLevelPerms = { ...(workflowPerms || {}) };
  const hasJobLevelIdToken = jobPermsMap
    ? Object.values(jobPermsMap).some((p) => p["id-token"] === "write")
    : false;

  const nextGate = classifyNextGate(writeEscalation, duplicateRunPolicy, allTopLevelPerms, hasJobLevelIdToken);

  // Environment protection (job-level `environment:` key)
  const environmentProtection = /^    environment:/m.test(yamlText) ? "present" : "absent";

  return {
    workflow_path: relativePath,
    trigger_events: events,
    trusted_ref_policy: trustedRefPolicy,
    token_permissions: {
      workflow_level: workflowPerms || "not_declared",
      job_level_overrides: jobPermsMap || "none",
    },
    write_escalation_reason: writeEscalation,
    secret_or_oidc_surface: secretOidcSurface,
    cache_surface: cacheSurface,
    timeout_minutes: timeoutMinutes,
    timeout_reason:
      timeoutMinutes === "none_declared_default_360"
        ? "default/unknown — no explicit timeout declared; GitHub default is 360 min"
        : "explicit timeout declared; see workflow file for job-level semantics",
    concurrency_group: concurrency ? (concurrency.group || null) : null,
    group_key_basis: concurrency ? inferGroupKeyBasis(concurrency.group || "") : "no_concurrency",
    cancel_in_progress: concurrency ? (concurrency.cancel_in_progress ?? null) : null,
    duplicate_run_policy: duplicateRunPolicy,
    queue_or_hang_next_gate: queueHangNextGate,
    environment_protection: environmentProtection,
    next_gate: nextGate,
  };
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatMarkdown(result) {
  const lines = [];
  lines.push("# Workflow Trigger/Permission Boundary Inventory");
  lines.push("");
  lines.push(`**Inventory date**: ${result.inventoryDate}`);
  lines.push("");
  lines.push(`> **Caveat**: ${result.caveat}`);
  lines.push("");
  lines.push(
    "Adjacent gates (out of scope): #178 release provenance · #180 command channel · #181 action pinning · #182 static lint"
  );
  lines.push("");

  for (const wf of result.workflows) {
    lines.push(`## \`${wf.workflow_path}\``);
    lines.push("");
    lines.push("| Field | Value |");
    lines.push("|---|---|");
    lines.push(`| trigger_events | ${wf.trigger_events.join(", ")} |`);
    lines.push(`| trusted_ref_policy | ${wf.trusted_ref_policy} |`);
    lines.push(`| token_permissions (workflow) | \`${JSON.stringify(wf.token_permissions.workflow_level)}\` |`);
    lines.push(`| token_permissions (job overrides) | \`${JSON.stringify(wf.token_permissions.job_level_overrides)}\` |`);
    lines.push(`| write_escalation_reason | ${wf.write_escalation_reason || "none"} |`);
    lines.push(`| secret_or_oidc_surface | \`${JSON.stringify(wf.secret_or_oidc_surface)}\` |`);
    lines.push(`| cache_surface | ${wf.cache_surface} |`);
    lines.push(`| timeout_minutes | \`${JSON.stringify(wf.timeout_minutes)}\` |`);
    lines.push(`| timeout_reason | ${wf.timeout_reason} |`);
    lines.push(`| concurrency_group | ${wf.concurrency_group || "none"} |`);
    lines.push(`| group_key_basis | ${wf.group_key_basis} |`);
    lines.push(`| cancel_in_progress | ${wf.cancel_in_progress === null ? "not_declared" : wf.cancel_in_progress} |`);
    lines.push(`| duplicate_run_policy | ${wf.duplicate_run_policy} |`);
    lines.push(`| queue_or_hang_next_gate | ${wf.queue_or_hang_next_gate} |`);
    lines.push(`| environment_protection | ${wf.environment_protection} |`);
    lines.push(`| **next_gate** | **${wf.next_gate}** |`);
    lines.push("");
  }

  lines.push("## Summary");
  lines.push("");
  lines.push("| workflow | triggers | write? | next_gate |");
  lines.push("|---|---|---|---|");
  for (const wf of result.workflows) {
    const hasWrite = wf.write_escalation_reason ? "yes" : "no";
    const name = path.basename(wf.workflow_path);
    lines.push(
      `| \`${name}\` | ${wf.trigger_events.join(", ")} | ${hasWrite} | ${wf.next_gate} |`
    );
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function run() {
  const options = parseArgs(process.argv.slice(2));
  const workflowsDir = path.join(options.rootDir, ".github", "workflows");

  if (!existsSync(workflowsDir)) {
    process.stderr.write(`Cannot read workflows directory: ${workflowsDir}\n`);
    process.exit(1);
  }

  const workflowFiles = collectWorkflowFiles(options.rootDir);

  if (workflowFiles.length === 0) {
    process.stderr.write(`No workflow files found in ${workflowsDir}\n`);
    process.exit(1);
  }

  const workflows = workflowFiles.map((filePath) => {
    const content = readFileSync(filePath, "utf8");
    return parseWorkflowBoundary(content, filePath);
  });

  const result = {
    inventoryDate: new Date().toISOString().split("T")[0],
    adjacentGates: {
      "#178": "release provenance attestation (not owned here)",
      "#180": "workflow command channel injection (not owned here)",
      "#181": "action pinning (not owned here)",
      "#182": "workflow static lint (not owned here)",
    },
    workflows,
    caveat:
      "This inventory is based on local YAML read-only parsing only. " +
      "Repository settings, protected environment rules, actual secret/OIDC " +
      "availability, branch protection, and live workflow queue state may differ " +
      "and remain unknown. Unknown fields are not promoted to pass.",
  };

  if (options.format === "json") {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(formatMarkdown(result));
  }
}

run();
