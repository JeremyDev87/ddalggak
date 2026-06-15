#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, "..");

const SECURITY_SCAN_PATTERNS = {
  codeql: [/github\/codeql-action/i, /\bCodeQL\b/i],
  dependencyReview: [/actions\/dependency-review-action/i, /\bdependency-review\b/i],
  scorecard: [/ossf\/scorecard/i, /\bScorecard\b/i],
};

const UNTRUSTED_EXPRESSION_PATTERNS = [
  "inputs.",
  "github.event.",
  "github.actor",
  "github.ref",
  "github.ref_name",
  "github.head_ref",
  "github.base_ref",
];

const COMMAND_CHANNEL_PATTERNS = [
  { channel: "GITHUB_OUTPUT", pattern: />>\s*["']?\s*\$\{?GITHUB_OUTPUT\}?["']?/ },
  { channel: "GITHUB_STATE", pattern: />>\s*["']?\s*\$\{?GITHUB_STATE\}?["']?/ },
  { channel: "GITHUB_ENV", pattern: />>\s*["']?\s*\$\{?GITHUB_ENV\}?["']?/ },
  { channel: "GITHUB_STEP_SUMMARY", pattern: />>\s*["']?\s*\$\{?GITHUB_STEP_SUMMARY\}?["']?/ },
];

const UNTRUSTED_CONTEXT_PATTERN = /\$\{\{\s*(github\.event\.|github\.actor\b|inputs\.)/;

function parseArgs(argv) {
  const options = {
    format: "markdown",
    rootDir: defaultRoot,
    admission: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--markdown") {
      options.format = "markdown";
    } else if (arg === "--admission" || arg === "--fail" || arg === "--fail-on-findings") {
      options.admission = true;
    } else if (arg === "--root") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--root requires a directory path");
      }
      options.rootDir = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function walkYamlFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkYamlFiles(entryPath));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

function lineIndent(line) {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function stripComment(line) {
  const hashIndex = line.indexOf("#");
  return hashIndex === -1 ? line : line.slice(0, hashIndex);
}

function collectBlock(lines, startIndex) {
  const startIndent = lineIndent(lines[startIndex]);
  const entries = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const indent = lineIndent(line);
    if (indent <= startIndent) {
      break;
    }
    entries.push({ line: index + 1, text: trimmed });
  }
  return entries;
}

function detectPermissions(lines) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);
    const match = line.match(/^\s*permissions\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }

    const indent = lineIndent(lines[index]);
    const scope = indent === 0 ? "workflow" : "nested";
    const inlineValue = match[1].trim();
    blocks.push({
      line: index + 1,
      scope,
      entries: inlineValue ? [{ line: index + 1, text: inlineValue }] : collectBlock(lines, index),
    });
  }
  return blocks;
}

function classifyActionRef(ref) {
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    return "sha-pinned";
  }
  if (/^v?\d+(?:\.\d+){1,2}(?:[-+][0-9A-Za-z.-]+)?$/.test(ref)) {
    return "version-tag";
  }
  if (/^v\d+$/.test(ref)) {
    return "major-tag";
  }
  return "branch-or-floating";
}

// Exception ledger: explicit baseline registrations + policy for unregistered refs.
// Entries are keyed by action name + currentRef so admission mode can fail on
// newly introduced action refs without editing workflow YAML.
// "sha-pinned" entries provide immutability evidence only, not semantic safety.
const ACTION_PIN_EXCEPTION_LEDGER = {
  policy: "advisory-report-with-admission-fail",
  explicitExceptions: [
    {
      action: "actions/checkout",
      currentRef: "93cb6efe18208431cddfb8368fd83d5badbf9bfd",
      pinClass: "sha-pinned",
      reason: "Current baseline CI/security checkout pin; reviewed as existing workflow admission exception",
      status: "compliant",
    },
    {
      action: "actions/setup-node",
      currentRef: "48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
      pinClass: "sha-pinned",
      reason: "Current baseline CI checkout pin; reviewed as existing workflow admission exception",
      status: "compliant",
    },
    {
      action: "github/codeql-action/init",
      currentRef: "8aad20d150bbac5944a9f9d289da16a4b0d87c1e",
      pinClass: "sha-pinned",
      reason: "Current baseline CodeQL init pin; reviewed as existing workflow admission exception",
      status: "compliant",
    },
    {
      action: "github/codeql-action/analyze",
      currentRef: "8aad20d150bbac5944a9f9d289da16a4b0d87c1e",
      pinClass: "sha-pinned",
      reason: "Current baseline CodeQL analyze pin; reviewed as existing workflow admission exception",
      status: "compliant",
    },
    {
      action: "actions/dependency-review-action",
      currentRef: "a1d282b36b6f3519aa1f3fc636f609c47dddb294",
      pinClass: "sha-pinned",
      reason: "Current baseline dependency-review pin; reviewed as existing workflow admission exception",
      status: "compliant",
    },
    {
      action: "release-drafter/release-drafter",
      currentRef: "6db134d15f3909ccc9eefd369f02bd1e9cffdf97",
      pinClass: "sha-pinned",
      reason: "Third-party; already SHA-pinned",
      status: "compliant",
    },
    {
      action: "actions/checkout",
      currentRef: "93cb6efe18208431cddfb8368fd83d5badbf9bfd",
      pinClass: "sha-pinned",
      reason: "Official GitHub-maintained action pinned to the reviewed v5 tag commit for release-capable workflow admission",
      status: "compliant",
    },
    {
      action: "actions/setup-node",
      currentRef: "48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
      pinClass: "sha-pinned",
      reason: "Official GitHub-maintained action pinned to the reviewed v6 tag commit for release-capable workflow admission",
      status: "compliant",
    },
    {
      action: "actions/upload-artifact",
      currentRef: "ea165f8d65b6e75b540449e92b4886f43607fa02",
      pinClass: "sha-pinned",
      reason: "Official GitHub-maintained action pinned to the reviewed v4 tag commit for release artifact admission",
      status: "compliant",
    },
    {
      action: "actions/download-artifact",
      currentRef: "634f93cb2916e3fdff6788551b99b062d0335ce0",
      pinClass: "sha-pinned",
      reason: "Official GitHub-maintained action pinned to the reviewed v5 tag commit for release artifact admission",
      status: "compliant",
    },
  ],
  unregisteredActionRefs: "fail-in-admission",
  unregisteredTagRefs: "needs-review",
};

const WRITE_PERMISSION_EXCEPTION_LEDGER = [
  { workflow: ".github/workflows/codeql.yml", scope: "nested", permission: "security-events: write", reason: "CodeQL SARIF upload requires security-events write" },
  { workflow: ".github/workflows/manual-release-bump.yml", scope: "workflow", permission: "contents: write", reason: "Manual release bump creates release/version branch commits" },
  { workflow: ".github/workflows/manual-release-bump.yml", scope: "workflow", permission: "pull-requests: write", reason: "Manual release bump opens or updates release bump pull requests" },
  { workflow: ".github/workflows/release-drafter.yml", scope: "workflow", permission: "contents: write", reason: "Release Drafter maintains draft release notes" },
  { workflow: ".github/workflows/release-drafter.yml", scope: "workflow", permission: "pull-requests: write", reason: "Release Drafter reads and labels pull request metadata" },
  { workflow: ".github/workflows/release.yml", scope: "nested", permission: "id-token: write", reason: "Trusted publishing/provenance token for npm publish job" },
];

const RISKY_TRIGGER_EXCEPTION_LEDGER = [];

function findActionException(actionName, ref) {
  return ACTION_PIN_EXCEPTION_LEDGER.explicitExceptions.find(
    (entry) => entry.action === actionName && entry.currentRef === ref,
  );
}

function resolveExceptionStatus(actionName, ref, pinClass) {
  if (pinClass === "local-or-docker") {
    return "local-or-docker";
  }
  if (pinClass === "missing-ref") {
    return "missing-ref";
  }
  if (pinClass === "sha-pinned") {
    const match = findActionException(actionName, ref);
    return match ? match.status : "sha-pinned";
  }
  // For tag refs (version-tag, major-tag) or branch-or-floating:
  const match = findActionException(actionName, ref);
  if (match) {
    return match.status;
  }
  return ACTION_PIN_EXCEPTION_LEDGER.unregisteredTagRefs;
}

function buildActionPinPolicy(workflows) {
  const findings = [];
  for (const workflow of workflows) {
    for (const action of workflow.actions) {
      if (action.pin === "local-or-docker" || action.pin === "missing-ref") {
        continue;
      }
      const exceptionStatus = resolveExceptionStatus(action.name, action.ref, action.pin);
      findings.push({
        workflow: workflow.path,
        line: action.line,
        action: action.name,
        ref: action.ref,
        pinClass: action.pin,
        exceptionStatus,
      });
    }
  }

  const shaCount = findings.filter((f) => f.pinClass === "sha-pinned").length;
  const needsReviewCount = findings.filter((f) => f.exceptionStatus === "needs-review").length;
  const compliantCount = findings.filter((f) => f.exceptionStatus === "compliant").length;

  return {
    policy: ACTION_PIN_EXCEPTION_LEDGER.policy,
    unregisteredActionRefPolicy: ACTION_PIN_EXCEPTION_LEDGER.unregisteredActionRefs,
    unregisteredTagRefPolicy: ACTION_PIN_EXCEPTION_LEDGER.unregisteredTagRefs,
    summary: {
      total: findings.length,
      "sha-pinned": shaCount,
      compliant: compliantCount,
      "needs-review": needsReviewCount,
    },
    caveat:
      "SHA pinning provides immutability evidence (the ref cannot be repointed after pin), not semantic safety. A SHA-pinned action may still contain unsafe code. Official GitHub-maintained actions (actions/*) are not inherently unsafe because they publish moving major tags; current baseline action refs must still be explicit admission exceptions, while unregistered refs remain needs-review in advisory mode and fail in admission mode.",
    findings,
  };
}

function detectActionUses(lines) {
  const actions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);
    const match = line.match(/^\s*-?\s*uses\s*:\s*([^\s#]+)\s*$/);
    if (!match) {
      continue;
    }
    const spec = match[1].replace(/^['"]|['"]$/g, "");
    if (spec.startsWith("./") || spec.startsWith("docker://")) {
      actions.push({ line: index + 1, spec, owner: null, name: spec, ref: null, pin: "local-or-docker" });
      continue;
    }
    const atIndex = spec.lastIndexOf("@");
    if (atIndex === -1) {
      actions.push({ line: index + 1, spec, owner: null, name: spec, ref: null, pin: "missing-ref" });
      continue;
    }
    const name = spec.slice(0, atIndex);
    const ref = spec.slice(atIndex + 1);
    const owner = name.split("/")[0] || null;
    actions.push({ line: index + 1, spec, owner, name, ref, pin: classifyActionRef(ref) });
  }
  return actions;
}

function collectRunBlocks(lines) {
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!/^\s*-?\s*run\s*:\s*[|>]\s*$/.test(line)) {
      continue;
    }
    blocks.push({ line: index + 1, entries: collectBlock(lines, index) });
  }
  return blocks;
}

function findUntrustedExpressions(text, taintedOutputStepIds = new Set()) {
  return [...text.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((match) => match[1].trim())
    .filter((expression) =>
      UNTRUSTED_EXPRESSION_PATTERNS.some((pattern) => expression.includes(pattern))
        || /^steps\.([A-Za-z0-9_-]+)\.outputs\./.test(expression)
          && taintedOutputStepIds.has(expression.match(/^steps\.([A-Za-z0-9_-]+)\.outputs\./)?.[1]),
    );
}

function collectTaintedOutputStepIds(lines) {
  const stepIds = new Set();
  let currentStepId = null;

  for (const line of lines) {
    if (/^\s*-\s+name\s*:/.test(line) || /^\s*-\s+uses\s*:/.test(line) || /^\s*-\s+run\s*:/.test(line)) {
      currentStepId = null;
    }
    const idMatch = line.match(/^\s*(?:-\s+)?id\s*:\s*([A-Za-z0-9_-]+)\s*$/);
    if (idMatch) {
      currentStepId = idMatch[1];
    }
    if (currentStepId && COMMAND_CHANNEL_PATTERNS[0].pattern.test(line) && findUntrustedExpressions(line).length > 0) {
      stepIds.add(currentStepId);
    }
  }

  return stepIds;
}

function detectUntrustedInterpolations(lines) {
  const findings = [];
  const taintedOutputStepIds = collectTaintedOutputStepIds(lines);
  for (const block of collectRunBlocks(lines)) {
    for (const entry of block.entries) {
      const suspicious = findUntrustedExpressions(entry.text, taintedOutputStepIds);
      if (suspicious.length > 0) {
        findings.push({
          line: entry.line,
          runBlockLine: block.line,
          expressions: suspicious,
          snippet: entry.text,
        });
      }
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*-?\s*run\s*:\s*(.+)$/);
    if (!match || ["|", ">"].includes(match[1].trim())) {
      continue;
    }
    const snippet = match[1].trim().replace(/^['"]|['"]$/g, "");
    const suspicious = findUntrustedExpressions(snippet, taintedOutputStepIds);
    if (suspicious.length > 0) {
      findings.push({
        line: index + 1,
        runBlockLine: index + 1,
        expressions: suspicious,
        snippet,
      });
    }
  }
  return findings;
}

function classifySourceKind(snippet) {
  if (UNTRUSTED_CONTEXT_PATTERN.test(snippet)) {
    return "github-context";
  }
  if (/node\s+\S+\.m?js|bash\s+\S+\.sh|python\s+\S+\.py/.test(snippet)) {
    return "repo-script-output";
  }
  if (/\$\(/.test(snippet) || /`[^`]+`/.test(snippet)) {
    return "external-command-output";
  }
  if (/echo\s+["']?[A-Za-z0-9_-]+=/.test(snippet) || /^\s*\{/.test(snippet)) {
    return "literal";
  }
  return "unknown";
}

function classifyEncodingGuard(snippet) {
  if (/<<\s*['"]?EOF['"]?/.test(snippet) || /<<\s*['"]?HEREDOC['"]?/.test(snippet)) {
    return "multiline-delimiter";
  }
  if (/GITHUB_STEP_SUMMARY/.test(snippet) && /cat\s*>/.test(snippet)) {
    return "markdown-summary";
  }
  if (/>>["']\s*\$/.test(snippet)) {
    return "quoted-env-file";
  }
  return "unknown";
}

function detectWorkflowCommandWrites(lines) {
  const findings = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    for (const { channel, pattern } of COMMAND_CHANNEL_PATTERNS) {
      if (!pattern.test(line)) {
        continue;
      }

      const snippet = line.trim();
      const sourceKind = classifySourceKind(snippet);
      const encodingGuard = classifyEncodingGuard(snippet);

      let riskNote = null;
      if (sourceKind === "github-context") {
        riskNote = "untrusted context value written directly to channel";
      }

      findings.push({
        line: index + 1,
        channel,
        snippet,
        sourceKind,
        encodingGuard,
        riskNote,
      });
    }
  }

  return findings;
}


function isWritePermissionEntry(text) {
  return /(^|[,{}\s])[-A-Za-z0-9]+\s*:\s*write\b/.test(text) || /\bwrite-all\b/.test(text);
}

function findWritePermissionException(workflow, block, entry) {
  return WRITE_PERMISSION_EXCEPTION_LEDGER.find(
    (item) => item.workflow === workflow.path
      && item.scope === block.scope
      && item.permission === entry.text,
  );
}

function detectRiskyTriggers(lines) {
  const findings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripComment(lines[index]);
    if (/\bpull_request_target\s*:?(?:\s|$)/.test(line)) {
      findings.push({ line: index + 1, trigger: "pull_request_target", snippet: line.trim() });
    }
  }
  return findings;
}

function evaluateAdmission(report) {
  const unregisteredActionRefs = [];
  const unreportedWritePermissions = [];
  const riskyTriggers = [];
  const untrustedShellInterpolations = [];
  const riskyCommandWrites = [];

  for (const workflow of report.workflows) {
    for (const action of workflow.actions) {
      if (action.pin === "local-or-docker") {
        continue;
      }
      const registered = action.ref ? findActionException(action.name, action.ref) : null;
      if (!registered) {
        unregisteredActionRefs.push({
          workflow: workflow.path,
          line: action.line,
          action: action.name,
          ref: action.ref,
          pinClass: action.pin,
        });
      }
    }

    for (const block of workflow.permissions) {
      for (const entry of block.entries) {
        if (!isWritePermissionEntry(entry.text)) {
          continue;
        }
        const registered = findWritePermissionException(workflow, block, entry);
        if (!registered) {
          unreportedWritePermissions.push({
            workflow: workflow.path,
            line: entry.line,
            scope: block.scope,
            permission: entry.text,
          });
        }
      }
    }

    for (const trigger of workflow.riskyTriggers) {
      const registered = RISKY_TRIGGER_EXCEPTION_LEDGER.find(
        (item) => item.workflow === workflow.path && item.trigger === trigger.trigger,
      );
      if (!registered) {
        riskyTriggers.push({ workflow: workflow.path, ...trigger });
      }
    }

    for (const finding of workflow.untrustedShellInterpolations) {
      untrustedShellInterpolations.push({ workflow: workflow.path, ...finding });
    }

    for (const write of workflow.workflowCommandWrites) {
      if (write.riskNote) {
        riskyCommandWrites.push({ workflow: workflow.path, ...write });
      }
    }
  }

  const findingCount = unregisteredActionRefs.length
    + unreportedWritePermissions.length
    + riskyTriggers.length
    + untrustedShellInterpolations.length
    + riskyCommandWrites.length;

  return {
    mode: "fail",
    passed: findingCount === 0,
    findingCount,
    policy: {
      unregisteredActionRefs: "fail",
      unreportedWritePermissions: "fail",
      riskyTriggers: "fail",
      untrustedShellInterpolations: "fail",
      riskyCommandWrites: "fail",
    },
    findings: {
      unregisteredActionRefs,
      unreportedWritePermissions,
      riskyTriggers,
      untrustedShellInterpolations,
      riskyCommandWrites,
    },
  };
}

function detectSecurityScans(text) {
  return Object.fromEntries(
    Object.entries(SECURITY_SCAN_PATTERNS).map(([name, patterns]) => [
      name,
      patterns.some((pattern) => pattern.test(text)),
    ]),
  );
}

function summarizeActionPins(workflows) {
  const counts = {
    "sha-pinned": 0,
    "version-tag": 0,
    "major-tag": 0,
    "branch-or-floating": 0,
    "missing-ref": 0,
    "local-or-docker": 0,
  };
  for (const workflow of workflows) {
    for (const action of workflow.actions) {
      counts[action.pin] = (counts[action.pin] || 0) + 1;
    }
  }
  return counts;
}

function analyzeWorkflows(rootDir = defaultRoot) {
  const workflowDir = path.join(rootDir, ".github", "workflows");
  const workflowFiles = walkYamlFiles(workflowDir);
  const workflows = workflowFiles.map((filePath) => {
    const text = readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);
    const workflowPath = path.relative(rootDir, filePath).split(path.sep).join("/");
    const commandWrites = detectWorkflowCommandWrites(lines);
    return {
      path: workflowPath,
      bytes: statSync(filePath).size,
      permissions: detectPermissions(lines),
      actions: detectActionUses(lines),
      untrustedShellInterpolations: detectUntrustedInterpolations(lines),
      securityScans: detectSecurityScans(text),
      workflowCommandWrites: commandWrites,
      riskyTriggers: detectRiskyTriggers(lines),
    };
  });

  const allCommandWrites = workflows.flatMap((workflow) =>
    workflow.workflowCommandWrites.map((write) => ({ workflow: workflow.path, ...write })),
  );

  const report = {
    rootDir,
    workflowDir: path.relative(rootDir, workflowDir).split(path.sep).join("/"),
    workflowCount: workflows.length,
    securityScans: {
      codeql: workflows.some((workflow) => workflow.securityScans.codeql),
      dependencyReview: workflows.some((workflow) => workflow.securityScans.dependencyReview),
      scorecard: workflows.some((workflow) => workflow.securityScans.scorecard),
    },
    actionPinSummary: summarizeActionPins(workflows),
    actionPinPolicy: buildActionPinPolicy(workflows),
    workflowCommandWrites: allCommandWrites,
    workflows,
    caveats: [
      "This report is a read-only workflow inventory, not a security guarantee.",
      "Repository settings, branch protection, environments, and secret values are outside file-based evidence.",
      "Missing official Scorecard/CodeQL/Dependency Review evidence is reported separately from local static inventory.",
      "workflowCommandWrites is a static line-level inventory. Environment-file channel transition reduces deprecated stdout command-injection class but does not eliminate downstream authority risks from untrusted values.",
      "actionPinPolicy findings: sha-pinned = immutability evidence only, not semantic safety. needs-review = tag ref without explicit exception registration in advisory mode; unregistered refs fail in admission mode.",
    ],
  };
  report.admission = evaluateAdmission(report);
  return report;
}

function formatPermissions(blocks) {
  if (blocks.length === 0) {
    return "    - permissions blocks: none";
  }
  return blocks
    .map((block) => {
      const entries = block.entries.length === 0 ? "none" : block.entries.map((entry) => entry.text).join(", ");
      return `    - line ${block.line} (${block.scope}): ${entries}`;
    })
    .join("\n");
}

function formatMarkdown(report) {
  const lines = [];
  lines.push("# ddalggak security posture evidence report");
  lines.push("");
  lines.push(`- workflows scanned: ${report.workflowCount}`);
  lines.push(`- CodeQL workflow/action evidence: ${report.securityScans.codeql ? "present" : "missing optional evidence"}`);
  lines.push(`- Dependency Review evidence: ${report.securityScans.dependencyReview ? "present" : "missing optional evidence"}`);
  lines.push(`- OpenSSF Scorecard evidence: ${report.securityScans.scorecard ? "present" : "missing optional evidence"}`);
  lines.push(`- action pin summary: ${Object.entries(report.actionPinSummary).map(([key, value]) => `${key}=${value}`).join(", ")}`);
  if (report.actionPinPolicy) {
    const pol = report.actionPinPolicy;
    lines.push(`- action pin policy: ${pol.policy} | total=${pol.summary.total} sha-pinned=${pol.summary["sha-pinned"]} compliant=${pol.summary.compliant} needs-review=${pol.summary["needs-review"]}`);
  }
  if (report.admission) {
    lines.push(`- admission gate: ${report.admission.passed ? "pass" : "fail"} | findings=${report.admission.findingCount}`);
  }
  lines.push("");
  lines.push("## Caveats");
  for (const caveat of report.caveats) {
    lines.push(`- ${caveat}`);
  }
  lines.push("");

  const channelCounts = {};
  let riskCount = 0;
  for (const write of report.workflowCommandWrites) {
    channelCounts[write.channel] = (channelCounts[write.channel] || 0) + 1;
    if (write.riskNote) {
      riskCount += 1;
    }
  }
  lines.push("## Workflow command channel inventory");
  lines.push("");
  if (report.workflowCommandWrites.length === 0) {
    lines.push("- no GITHUB_OUTPUT/STATE/ENV/STEP_SUMMARY writes detected");
  } else {
    lines.push(`- total channel writes: ${report.workflowCommandWrites.length}`);
    for (const [channel, count] of Object.entries(channelCounts)) {
      lines.push(`  - ${channel}: ${count}`);
    }
    lines.push(`- risk findings (untrusted context interpolation): ${riskCount}`);
    lines.push("");
    lines.push("| workflow | line | channel | sourceKind | encodingGuard | riskNote |");
    lines.push("|---|---|---|---|---|---|");
    for (const write of report.workflowCommandWrites) {
      const risk = write.riskNote ?? "";
      lines.push(`| ${write.workflow} | ${write.line} | ${write.channel} | ${write.sourceKind} | ${write.encodingGuard} | ${risk} |`);
    }
  }
  lines.push("");
  lines.push("## Action pin policy");
  if (report.actionPinPolicy && report.actionPinPolicy.findings.length > 0) {
    const pol = report.actionPinPolicy;
    lines.push(`- policy: ${pol.policy}`);
    lines.push(`- unregistered action ref admission policy: ${pol.unregisteredActionRefPolicy}`);
    lines.push(`- unregistered tag ref advisory policy: ${pol.unregisteredTagRefPolicy}`);
    lines.push(`- caveat: ${pol.caveat}`);
    lines.push("");
    lines.push("| workflow | line | action | ref | pinClass | exceptionStatus |");
    lines.push("|---|---|---|---|---|---|");
    for (const finding of pol.findings) {
      lines.push(
        `| ${finding.workflow} | ${finding.line} | ${finding.action} | ${finding.ref} | ${finding.pinClass} | ${finding.exceptionStatus} |`,
      );
    }
  } else {
    lines.push("- no pinnable action refs detected");
  }
  lines.push("");
  lines.push("## Admission gate");
  if (report.admission.passed) {
    lines.push("- pass: no unregistered action refs, unreported write permissions, risky triggers, untrusted shell interpolations, or risky command-channel writes detected");
  } else {
    lines.push(`- fail findings: ${report.admission.findingCount}`);
    lines.push(`  - unregistered action refs: ${report.admission.findings.unregisteredActionRefs.length}`);
    lines.push(`  - unreported write permissions: ${report.admission.findings.unreportedWritePermissions.length}`);
    lines.push(`  - risky triggers: ${report.admission.findings.riskyTriggers.length}`);
    lines.push(`  - untrusted shell interpolations: ${report.admission.findings.untrustedShellInterpolations.length}`);
    lines.push(`  - risky command-channel writes: ${report.admission.findings.riskyCommandWrites.length}`);
  }
  lines.push("");
  lines.push("## Workflow inventory");
  for (const workflow of report.workflows) {
    lines.push(`### ${workflow.path}`);
    lines.push(formatPermissions(workflow.permissions));
    const actionSummary = workflow.actions.length === 0
      ? "    - actions: none"
      : workflow.actions.map((action) => `    - line ${action.line}: ${action.spec} (${action.pin})`).join("\n");
    lines.push(actionSummary);
    if (workflow.riskyTriggers.length === 0) {
      lines.push("    - risky triggers: none");
    } else {
      lines.push("    - risky triggers:");
      for (const trigger of workflow.riskyTriggers) {
        lines.push(`      - line ${trigger.line}: ${trigger.trigger}`);
      }
    }
    if (workflow.untrustedShellInterpolations.length === 0) {
      lines.push("    - untrusted shell interpolation candidates: none");
    } else {
      lines.push("    - untrusted shell interpolation candidates:");
      for (const finding of workflow.untrustedShellInterpolations) {
        lines.push(`      - line ${finding.line}: ${finding.expressions.join(", ")}`);
      }
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = analyzeWorkflows(options.rootDir);
  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatMarkdown(report));
  }
  if (options.admission && !report.admission.passed) {
    console.error(`[security-posture-report] admission gate failed with ${report.admission.findingCount} finding(s)`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(`[security-posture-report] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export { analyzeWorkflows, buildActionPinPolicy, classifyActionRef, detectRiskyTriggers, detectUntrustedInterpolations, detectWorkflowCommandWrites, evaluateAdmission, formatMarkdown, resolveExceptionStatus };
