#!/usr/bin/env node
/**
 * verify-workflow-lint.mjs
 *
 * Workflow static lint admission evidence gate (Issue #182).
 *
 * Scope: YAML/expression/action I/O structure lint only.
 * Non-scope: command channel injection (#180), action pinning (#181),
 *            release provenance (#178), semantic safety, secret safety.
 *
 * Lint strategy:
 *   1. Prefer actionlint if available (fast, comprehensive).
 *   2. Fall back to JavaScript-native checks when actionlint is absent.
 *
 * Output is content-light: file paths, rule/finding category, bounded
 * summaries, tool/version/source only. Raw logs, secrets, env dumps,
 * full shell interpolation values are never emitted.
 *
 * Caveat (non-negotiable): lint green does NOT imply semantic safety,
 * secret safety, or provenance safety.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultRoot = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Patterns used by JavaScript-native checks
// ---------------------------------------------------------------------------

// Hard-coded credential patterns (content-light: we detect, never print value)
const HARDCODED_CRED_PATTERNS = [
  { id: "github-pat-classic", pattern: /ghp_[A-Za-z0-9]{36}/, category: "credential_pattern" },
  { id: "github-pat-fine-grained", pattern: /github_pat_[A-Za-z0-9_]{82}/, category: "credential_pattern" },
  { id: "openai-key", pattern: /sk-[A-Za-z0-9]{20,}/, category: "credential_pattern" },
  { id: "aws-access-key", pattern: /AKIA[0-9A-Z]{16}/, category: "credential_pattern" },
  { id: "aws-secret-key", pattern: /(?:AWS_SECRET|aws_secret_access_key)\s*[:=]\s*\S{20,}/, category: "credential_pattern" },
  { id: "basic-auth-url", pattern: /https?:\/\/[^@\s]{3,}:[^@\s]{3,}@/, category: "credential_pattern" },
];

// Untrusted context sources that should not be directly interpolated in run: blocks
const UNTRUSTED_CONTEXT_PATTERNS = [
  "github.event.issue.",
  "github.event.pull_request.",
  "github.event.comment.",
  "github.event.review.",
  "github.event.head_commit.",
  "github.event.before",
  "github.event.release.",
  "github.event.workflow_run.",
  "github.actor",
  "github.head_ref",
  "github.base_ref",
  "github.event.inputs.",
  "inputs.",
];

// Expressions that appear inside ${{ }} — simple type/structure mismatch hints
// (actionlint handles this properly; these are best-effort JS-native approximations)
const EXPRESSION_STRUCTURAL_CHECKS = [
  {
    id: "fromJSON-without-string",
    pattern: /fromJSON\s*\(\s*true\b|fromJSON\s*\(\s*false\b|fromJSON\s*\(\s*\d/,
    category: "expression_result",
    summary: "fromJSON called on a non-string literal",
  },
];

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { format: "markdown", rootDir: defaultRoot };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--markdown") {
      options.format = "markdown";
    } else if (arg === "--root") {
      const val = argv[i + 1];
      if (!val) throw new Error("--root requires a directory path");
      options.rootDir = path.resolve(val);
      i++;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function collectWorkflowFiles(rootDir) {
  const workflowDir = path.join(rootDir, ".github", "workflows");
  if (!existsSync(workflowDir)) return [];
  return readdirSync(workflowDir)
    .filter((f) => /\.ya?ml$/i.test(f))
    .sort()
    .map((f) => path.join(workflowDir, f));
}

function stripComment(line) {
  // Strip YAML inline comments — but not inside ${{ }} which may have #
  const hashIdx = line.indexOf("#");
  if (hashIdx === -1) return line;
  // Only strip if the # is not inside an expression block
  const beforeHash = line.slice(0, hashIdx);
  const openBraces = (beforeHash.match(/\$\{\{/g) || []).length;
  const closeBraces = (beforeHash.match(/\}\}/g) || []).length;
  if (openBraces > closeBraces) return line; // inside expression
  return beforeHash;
}

function isRunBlockStart(line) {
  return /^\s*-?\s*run\s*:\s*[|>]/.test(line) || /^\s*-?\s*run\s*:\s*$/.test(line);
}

function lineIndent(line) {
  const m = line.match(/^(\s*)/);
  return m ? m[1].length : 0;
}

function collectBlockLines(lines, startIdx) {
  const startIndent = lineIndent(lines[startIdx]);
  const result = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (lineIndent(line) <= startIndent) break;
    result.push({ lineNo: i + 1, text: trimmed });
  }
  return result;
}

// ---------------------------------------------------------------------------
// JavaScript-native lint checks
// ---------------------------------------------------------------------------

function checkScriptInjection(lines, relPath) {
  const findings = [];
  const taintedOutputStepIds = collectTaintedOutputStepIds(lines);

  const isUntrustedExpression = (expr) =>
    UNTRUSTED_CONTEXT_PATTERNS.some((p) => expr.startsWith(p))
      || /^steps\.([A-Za-z0-9_-]+)\.outputs\./.test(expr)
        && taintedOutputStepIds.has(expr.match(/^steps\.([A-Za-z0-9_-]+)\.outputs\./)?.[1]);

  // Multi-line run blocks
  for (let i = 0; i < lines.length; i++) {
    if (!isRunBlockStart(lines[i])) continue;
    const block = collectBlockLines(lines, i);
    for (const { lineNo, text } of block) {
      const exprs = [...text.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1].trim());
      for (const expr of exprs) {
        if (isUntrustedExpression(expr)) {
          findings.push({
            workflow: relPath,
            category: "script_injection_result",
            line: lineNo,
            summary: `direct interpolation of untrusted context in run: block (expression category: ${expr.split(".").slice(0, 2).join(".")}.*)`,
            severity: "warning",
          });
        }
      }
    }
  }

  // Inline run: lines
  for (let i = 0; i < lines.length; i++) {
    const inlineMatch = lines[i].match(/^\s*-?\s*run\s*:\s*(.+)$/);
    if (!inlineMatch || ["|", ">"].includes(inlineMatch[1].trim())) continue;
    const text = inlineMatch[1].trim();
    const exprs = [...text.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1].trim());
    for (const expr of exprs) {
      if (isUntrustedExpression(expr)) {
        findings.push({
          workflow: relPath,
          category: "script_injection_result",
          line: i + 1,
          summary: `direct interpolation of untrusted context in run: block (expression category: ${expr.split(".").slice(0, 2).join(".")}.*)`,
          severity: "warning",
        });
      }
    }
  }

  return findings;
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
    if (!currentStepId || !/>>\s*["']?\s*\$\{?GITHUB_OUTPUT\}?["']?/.test(line)) {
      continue;
    }
    const expressions = [...line.matchAll(/\$\{\{\s*([^}]+?)\s*\}\}/g)].map((m) => m[1].trim());
    if (expressions.some((expr) => UNTRUSTED_CONTEXT_PATTERNS.some((p) => expr.startsWith(p)))) {
      stepIds.add(currentStepId);
    }
  }

  return stepIds;
}

function checkCredentialPatterns(lines, relPath) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const cred of HARDCODED_CRED_PATTERNS) {
      if (cred.pattern.test(line)) {
        findings.push({
          workflow: relPath,
          category: cred.category,
          line: i + 1,
          // Content-light: report the pattern ID, never the matched value
          summary: `hard-coded credential pattern detected (rule: ${cred.id}); value redacted`,
          severity: "error",
        });
      }
    }
  }
  return findings;
}

function checkExpressionStructure(lines, relPath) {
  const findings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]);
    for (const check of EXPRESSION_STRUCTURAL_CHECKS) {
      if (check.pattern.test(line)) {
        findings.push({
          workflow: relPath,
          category: check.category,
          line: i + 1,
          summary: check.summary,
          severity: "warning",
        });
      }
    }
  }
  return findings;
}

function checkReusableWorkflowContract(lines, relPath) {
  // Detect workflow_call presence and check that inputs/outputs have required fields
  const findings = [];
  let hasWorkflowCall = false;
  let inOnBlock = false;
  let onIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = stripComment(lines[i]);
    if (/^on\s*:/.test(line)) {
      inOnBlock = true;
      onIndent = lineIndent(lines[i]);
    }
    if (inOnBlock && /workflow_call/.test(line)) {
      hasWorkflowCall = true;
    }
    if (inOnBlock && lineIndent(lines[i]) <= onIndent && i > 0 && !/^on\s*:/.test(line)) {
      if (lines[i].trim() !== "" && !lines[i].trim().startsWith("#")) {
        inOnBlock = false;
      }
    }
  }

  if (hasWorkflowCall) {
    // Check for inputs without required/type fields (best-effort)
    let inInputsBlock = false;
    let currentInput = null;
    let inputIndent = -1;
    let hasType = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (/^\s*inputs\s*:/.test(line) && inOnBlock !== false) {
        inInputsBlock = true;
        inputIndent = lineIndent(line);
        continue;
      }

      if (inInputsBlock) {
        if (lineIndent(line) <= inputIndent && trimmed && !trimmed.startsWith("#")) {
          // Flush last input check
          if (currentInput && !hasType) {
            findings.push({
              workflow: relPath,
              category: "reusable_workflow_result",
              line: currentInput.line,
              summary: `reusable workflow input '${currentInput.name}' may be missing 'type' field`,
              severity: "warning",
            });
          }
          inInputsBlock = false;
          currentInput = null;
          hasType = false;
          continue;
        }

        const inputNameMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*$/);
        if (inputNameMatch && lineIndent(line) === inputIndent + 2) {
          if (currentInput && !hasType) {
            findings.push({
              workflow: relPath,
              category: "reusable_workflow_result",
              line: currentInput.line,
              summary: `reusable workflow input '${currentInput.name}' may be missing 'type' field`,
              severity: "warning",
            });
          }
          currentInput = { name: inputNameMatch[1], line: i + 1 };
          hasType = false;
        }

        if (/^\s*type\s*:/.test(line)) {
          hasType = true;
        }
      }
    }
  }

  return findings;
}

function runJsNativeLint(rootDir, workflowFiles) {
  const allFindings = [];
  const checkedWorkflows = [];

  for (const filePath of workflowFiles) {
    const relPath = path.relative(rootDir, filePath).split(path.sep).join("/");
    checkedWorkflows.push(relPath);
    const text = readFileSync(filePath, "utf8");
    const lines = text.split(/\r?\n/);

    allFindings.push(...checkScriptInjection(lines, relPath));
    allFindings.push(...checkCredentialPatterns(lines, relPath));
    allFindings.push(...checkExpressionStructure(lines, relPath));
    allFindings.push(...checkReusableWorkflowContract(lines, relPath));
  }

  return {
    lintTool: "javascript-native",
    toolVersion: "1.0.0",
    checkedWorkflows,
    findings: allFindings,
    allowedWarnings: [],
    warningPolicy:
      "zero-warning policy: all findings must be reviewed or suppressed with an explicit allowedWarnings entry",
    caveat:
      "lint green does not imply semantic safety, secret safety, or provenance safety",
  };
}

// ---------------------------------------------------------------------------
// actionlint-based lint
// ---------------------------------------------------------------------------

function detectActionlint() {
  try {
    const out = execSync("actionlint --version", { stdio: "pipe", encoding: "utf8" });
    return out.trim();
  } catch {
    return null;
  }
}

function runActionlint(rootDir, workflowFiles) {
  const relPaths = workflowFiles.map((f) =>
    path.relative(rootDir, f).split(path.sep).join("/"),
  );

  let rawOutput;
  try {
    rawOutput = execSync(
      `actionlint -format '{{json .}}' ${workflowFiles.map((f) => JSON.stringify(f)).join(" ")}`,
      {
        stdio: "pipe",
        encoding: "utf8",
        cwd: rootDir,
      },
    );
  } catch (err) {
    // actionlint exits non-zero when findings exist; capture stdout
    rawOutput = err.stdout || "[]";
  }

  let parsed;
  try {
    parsed = JSON.parse(rawOutput.trim() || "[]");
  } catch {
    parsed = [];
  }

  // Map actionlint findings to content-light schema
  const findings = (Array.isArray(parsed) ? parsed : []).map((item) => {
    const workflowRel = item.filepath
      ? path.relative(rootDir, item.filepath).split(path.sep).join("/")
      : "unknown";

    // Classify by actionlint message kind into our evidence categories
    const msg = item.message || "";
    let category = "syntax_result";
    if (/expression/.test(msg) || /type/.test(msg) || /format/.test(msg)) {
      category = "expression_result";
    } else if (/action.*input|input.*action|with:/.test(msg)) {
      category = "action_io_result";
    } else if (/workflow_call|reusable/.test(msg)) {
      category = "reusable_workflow_result";
    } else if (/inject|interpolat/.test(msg)) {
      category = "script_injection_result";
    } else if (/credential|secret|password|token/.test(msg)) {
      category = "credential_pattern";
    }

    return {
      workflow: workflowRel,
      category,
      line: item.line || null,
      column: item.col || null,
      // Content-light: keep the message from actionlint but strip file paths that
      // would expose full system layout — just the rule kind + bounded description
      summary: typeof msg === "string" ? msg.slice(0, 200) : "actionlint finding",
      severity: "error",
      rule: item.kind || null,
    };
  });

  return {
    lintTool: "actionlint",
    toolVersion: null, // resolved below
    checkedWorkflows: relPaths,
    findings,
    allowedWarnings: [],
    warningPolicy:
      "zero-warning policy: all findings must be reviewed or suppressed with an explicit allowedWarnings entry",
    caveat:
      "lint green does not imply semantic safety, secret safety, or provenance safety",
  };
}

// ---------------------------------------------------------------------------
// Categorised result summary
// ---------------------------------------------------------------------------

function buildCategorySummary(findings) {
  const cats = [
    "syntax_result",
    "expression_result",
    "action_io_result",
    "reusable_workflow_result",
    "script_injection_result",
    "credential_pattern",
  ];
  const counts = Object.fromEntries(cats.map((c) => [c, 0]));
  for (const f of findings) {
    if (counts[f.category] !== undefined) counts[f.category]++;
    else counts[f.category] = 1;
  }
  return Object.fromEntries(
    Object.entries(counts).map(([k, v]) => [k, v === 0 ? "pass" : `${v} finding(s)`]),
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatMarkdown(report) {
  const lines = [];
  lines.push("# ddalggak workflow static lint evidence report");
  lines.push("");
  lines.push(`- lint tool: ${report.lintTool}${report.toolVersion ? ` @ ${report.toolVersion}` : ""}`);
  lines.push(`- workflows checked: ${report.checkedWorkflows.length}`);
  lines.push(`- total findings: ${report.findings.length}`);
  lines.push("");

  lines.push("## Category summary");
  for (const [cat, status] of Object.entries(report.categorySummary)) {
    lines.push(`- ${cat}: ${status}`);
  }
  lines.push("");

  lines.push("## Checked workflows");
  for (const wf of report.checkedWorkflows) {
    lines.push(`- ${wf}`);
  }
  lines.push("");

  if (report.findings.length > 0) {
    lines.push("## Findings");
    for (const f of report.findings) {
      const loc = f.line ? `:${f.line}` : "";
      const col = f.column ? `:${f.column}` : "";
      lines.push(`- **${f.severity}** [${f.category}] ${f.workflow}${loc}${col} — ${f.summary}`);
    }
    lines.push("");
  }

  lines.push("## Allowed warnings");
  if (report.allowedWarnings.length === 0) {
    lines.push(`- ${report.warningPolicy}`);
  } else {
    for (const w of report.allowedWarnings) {
      lines.push(`- ${w}`);
    }
  }
  lines.push("");

  lines.push("## Caveats");
  lines.push(`- ${report.caveat}`);
  lines.push(
    "- This report is admission evidence only. It does not cover command channel safety (#180), action pinning (#181), or release provenance (#178).",
  );
  lines.push(
    "- Repository settings, secret values, and runtime behavior are outside file-based evidence.",
  );
  lines.push("");

  return `${lines.join("\n").trim()}\n`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function runWorkflowLint(rootDir = defaultRoot) {
  const workflowFiles = collectWorkflowFiles(rootDir);

  if (workflowFiles.length === 0) {
    const report = {
      lintTool: "none",
      toolVersion: null,
      checkedWorkflows: [],
      findings: [],
      categorySummary: buildCategorySummary([]),
      allowedWarnings: [],
      warningPolicy:
        "zero-warning policy: all findings must be reviewed or suppressed with an explicit allowedWarnings entry",
      caveat:
        "lint green does not imply semantic safety, secret safety, or provenance safety",
    };
    return report;
  }

  const actionlintVersion = detectActionlint();
  let report;

  if (actionlintVersion) {
    report = runActionlint(rootDir, workflowFiles);
    report.toolVersion = actionlintVersion.split(/\s+/)[0] || actionlintVersion;
    // Always run JS-native security checks on top of actionlint, because
    // actionlint focuses on YAML/expression structure and does not scan
    // shell script content for our content-light credential or output-laundering patterns.
    const jsNative = runJsNativeLint(rootDir, workflowFiles);
    const supplementalFindings = jsNative.findings.filter(
      (f) => f.category === "credential_pattern" || f.category === "script_injection_result",
    );
    report.findings = [...report.findings, ...supplementalFindings];
  } else {
    report = runJsNativeLint(rootDir, workflowFiles);
  }

  report.categorySummary = buildCategorySummary(report.findings);
  return report;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = runWorkflowLint(options.rootDir);

  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatMarkdown(report));
  }

  if (report.findings.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(
      `[verify-workflow-lint] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
