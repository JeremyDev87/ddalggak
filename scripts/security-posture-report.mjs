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
  "github.ref",
  "github.ref_name",
  "github.head_ref",
  "github.base_ref",
];

function parseArgs(argv) {
  const options = {
    format: "markdown",
    rootDir: defaultRoot,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--markdown") {
      options.format = "markdown";
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

function findUntrustedExpressions(text) {
  return [...text.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((match) => match[1].trim())
    .filter((expression) =>
      UNTRUSTED_EXPRESSION_PATTERNS.some((pattern) => expression.includes(pattern)),
    );
}

function detectUntrustedInterpolations(lines) {
  const findings = [];
  for (const block of collectRunBlocks(lines)) {
    for (const entry of block.entries) {
      const suspicious = findUntrustedExpressions(entry.text);
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
    const suspicious = findUntrustedExpressions(snippet);
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
    return {
      path: path.relative(rootDir, filePath).split(path.sep).join("/"),
      bytes: statSync(filePath).size,
      permissions: detectPermissions(lines),
      actions: detectActionUses(lines),
      untrustedShellInterpolations: detectUntrustedInterpolations(lines),
      securityScans: detectSecurityScans(text),
    };
  });

  return {
    rootDir,
    workflowDir: path.relative(rootDir, workflowDir).split(path.sep).join("/"),
    workflowCount: workflows.length,
    securityScans: {
      codeql: workflows.some((workflow) => workflow.securityScans.codeql),
      dependencyReview: workflows.some((workflow) => workflow.securityScans.dependencyReview),
      scorecard: workflows.some((workflow) => workflow.securityScans.scorecard),
    },
    actionPinSummary: summarizeActionPins(workflows),
    workflows,
    caveats: [
      "This report is a read-only workflow inventory, not a security guarantee.",
      "Repository settings, branch protection, environments, and secret values are outside file-based evidence.",
      "Missing official Scorecard/CodeQL/Dependency Review evidence is reported separately from local static inventory.",
    ],
  };
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
  lines.push("");
  lines.push("## Caveats");
  for (const caveat of report.caveats) {
    lines.push(`- ${caveat}`);
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(`[security-posture-report] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export { analyzeWorkflows, classifyActionRef, detectUntrustedInterpolations, formatMarkdown };
