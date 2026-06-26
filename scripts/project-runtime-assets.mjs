#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { COMMAND_ORDER, loadCommandContracts as loadCoreCommandContracts } from "../bin/lib/command-contracts.mjs";
import { escapeRegExp } from "./lib/escape-regexp.mjs";
import {
  parseReferenceBudgetExemptions,
  parseSubcommandTokenBudgets,
  parseSubcommandTokenCeilings,
} from "./lib/token-budget-yaml.mjs";

const rootDir = process.cwd();

const usage = `Usage: node scripts/project-runtime-assets.mjs [--check|--write] [--report [--admission]]

Options:
  --check      Check generated runtime assets for drift (default unless --write is set).
  --write      Update generated runtime asset blocks.
  --report     Print token budget report instead of checking generated blocks.
  --admission  With --report, fail if token budget admission findings exist.
  --help       Show this help message.`;

function parseArgs(argv) {
  const options = {
    writeMode: false,
    reportMode: false,
    admissionMode: false,
    checkRequested: false,
  };

  for (const arg of argv) {
    if (arg === "--help") {
      console.log(usage);
      process.exit(0);
    } else if (arg === "--write") {
      options.writeMode = true;
    } else if (arg === "--report") {
      options.reportMode = true;
    } else if (arg === "--admission") {
      options.admissionMode = true;
    } else if (arg === "--check") {
      options.checkRequested = true;
    } else {
      console.error(`[project-runtime-assets] unknown option: ${arg}`);
      console.error(usage);
      process.exit(1);
    }
  }

  if (options.writeMode && options.checkRequested) {
    console.error("[project-runtime-assets] --write and --check cannot be used together");
    console.error(usage);
    process.exit(1);
  }

  return {
    writeMode: options.writeMode,
    reportMode: options.reportMode,
    admissionMode: options.admissionMode,
    checkMode: options.checkRequested || !options.writeMode,
  };
}

const { writeMode, reportMode, admissionMode, checkMode } = parseArgs(process.argv.slice(2));

const commandOrder = COMMAND_ORDER;

const allowedArtifactByCommand = {
  start: "worker agents may edit only files named in their brief",
  review: "author agents may apply accepted Critical/High review fixes only",
  prompt: "brief artifacts after explicit confirmation",
  tune: "goal-alignment brief artifacts only",
  forge: "acceptance-criteria artifacts only",
  spark: "runtime-goal sentence artifacts only",
  plan: "response output only unless the user separately asks to write a plan document",
  issue: "GitHub issues only",
  status: "response output only",
  check: "local review notes only; no repository edits",
  ship: "commit, push, and draft PR for existing changes only",
  clean: "local branch and worktree cleanup only after merge verification",
  retro: "retrospective notes and memory update request artifacts only",
  getwiki: "delegate to dedicated `/getwiki` read-only retrieval",
  setwiki: "delegate to dedicated `/setwiki` approval-gated write workflow",
};

// Parse and file-access failures are real failures (exit 1), but a raw stack
// trace is not a diagnostic: print the path/line context and fail closed (#265).
function fatal(message) {
  console.error(`[project-runtime-assets] ${message}`);
  process.exit(1);
}

function readText(relativePath) {
  try {
    return readFileSync(path.join(rootDir, relativePath), "utf8");
  } catch (error) {
    fatal(`cannot read ${relativePath}: ${error.message}`);
  }
}

function writeText(relativePath, text) {
  try {
    writeFileSync(path.join(rootDir, relativePath), text);
  } catch (error) {
    fatal(`cannot write ${relativePath}: ${error.message}`);
  }
}

function loadCommands() {
  try {
    return loadCoreCommandContracts(rootDir);
  } catch (error) {
    fatal(`cannot load command contracts: ${error.message}`);
  }
}

const commands = loadCommands();

function markerStart(id, relativePath = "") {
  const marker = `<!-- ddalggak:generated:start ${id} -->`;
  return relativePath.endsWith(".mjs") ? `// ${marker}` : marker;
}

function markerEnd(id, relativePath = "") {
  const marker = `<!-- ddalggak:generated:end ${id} -->`;
  return relativePath.endsWith(".mjs") ? `// ${marker}` : marker;
}

function generatedBlock(id, body, relativePath) {
  return `${markerStart(id, relativePath)}\n${body.trimEnd()}\n${markerEnd(id, relativePath)}`;
}

function replaceGeneratedBlock(text, id, body, relativePath) {
  const start = markerStart(id, relativePath);
  const end = markerEnd(id, relativePath);
  const pattern = new RegExp(`${escapeRegExp(start)}\\n[\\s\\S]*?\\n${escapeRegExp(end)}`, "g");
  const matches = text.match(pattern) || [];
  if (matches.length !== 1) {
    throw new Error(`${relativePath}: expected exactly one generated block for ${id}, found ${matches.length}`);
  }
  return text.replace(pattern, generatedBlock(id, body, relativePath));
}

function mdList(items, prefix) {
  if (!items?.length) return "-";
  return items.map((item) => `\`${prefix}${item}\``).join(", ");
}

function purpose(doc) {
  return String(doc.purpose || "").replace(/\.$/, "");
}

function renderCodexCodePermissionTable() {
  const lines = [
    "| Subcommand | May modify source files | Allowed artifacts |",
    "| --- | --- | --- |",
  ];
  for (const doc of commands) {
    lines.push(
      `| \`${doc.command}\` | ${doc.source_edit_allowed ? "yes" : "no"} | ${allowedArtifactByCommand[doc.command] || "response output only"} |`,
    );
  }
  return lines.join("\n");
}

function renderClaudeCodePermissionTable() {
  const lines = [
    "| 서브커맨드 | 소스 코드 수정 | 작성 가능한 산출물 |",
    "|---|---|---|",
  ];
  for (const doc of commands) {
    const allowed = doc.source_edit_allowed ? "✅" : "❌";
    const artifact = allowedArtifactByCommand[doc.command] || "상태 보고";
    lines.push(`| \`${doc.command}\` | ${allowed} | ${artifact} |`);
  }
  return lines.join("\n");
}

function renderCodexSubcommandTable() {
  const lines = [
    "## Subcommand Contract Table",
    "",
    "| Subcommand | Mode | Show-doc heading | Purpose | Side effects | Stop condition | Required assets |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const doc of commands) {
    const refs = mdList(doc.required_references || [], "references/");
    const templates = mdList(doc.required_templates || [], "templates/");
    lines.push(`| \`${doc.command}\` | ${doc.mode || "read-only"} | ${doc.show_doc_heading} | ${purpose(doc)} | ${doc.write_side_effects || "response output only"} | ${doc.stop_condition || "Stop after reporting current state."} | refs: ${refs}; templates: ${templates} |`);
  }
  return lines.join("\n");
}

function renderClaudeSubcommandTable() {
  const lines = [
    "| subcommand | mode | show-doc heading | 목적 | side effects | stop condition | 상세 reference rule |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const doc of commands) {
    const refs = mdList(doc.required_references || [], "references/");
    const templates = mdList(doc.required_templates || [], "templates/");
    lines.push(`| \`${doc.command}\` | ${doc.mode || "read-only"} | ${doc.show_doc_heading} | ${purpose(doc)} | ${doc.write_side_effects || "response output only"} | ${doc.stop_condition || "Stop after reporting current state."} | refs: ${refs}; templates: ${templates} |`);
  }
  return lines.join("\n");
}

// Canonical grouping for the generated Required Reference Map (#379).
// The group is semantic, not filename-derived:
// - gates: preflight/admission/review/checklist gates that can block readiness or approval.
// - wiki: wiki/getwiki/setwiki authority and retrieval/write-boundary references.
// - workflow: procedural command workflows, shipping/status/cleanup/reporting steps, or support loops.
// Keep each reference in exactly one group so generated tables cannot classify the
// same reference differently across runtime surfaces.
const referenceGroupByName = new Map([
  ["agent-runtime-contract.md", "workflow"],
  ["ci-failure-triage-loop.md", "workflow"],
  ["core-invariants.md", "gates"],
  ["cross-review-loop.md", "workflow"],
  ["deep-interview-readiness-gate.md", "gates"],
  ["evidence-contract.md", "gates"],
  ["forge-goal.md", "workflow"],
  ["human-review-feedback-loop.md", "workflow"],
  ["issue-ready-plan.md", "workflow"],
  ["local-diff-check.md", "workflow"],
  ["merge-cleanup.md", "workflow"],
  ["plan-to-issues.md", "workflow"],
  ["pr-check-evidence-bundle.md", "workflow"],
  ["prompt-optimizer.md", "workflow"],
  ["prompt-skill-optimization-staging.md", "workflow"],
  ["quality-lens-router.md", "gates"],
  ["ralplan-critic-consensus.md", "gates"],
  ["regression-library.md", "gates"],
  ["retrospective-workflow.md", "workflow"],
  ["retrospective.md", "workflow"],
  ["security-posture-gate.md", "gates"],
  ["ship.md", "workflow"],
  ["simplicity-deletability-gate.md", "gates"],
  ["spark-goal.md", "workflow"],
  ["start-workflow.md", "workflow"],
  ["status.md", "workflow"],
  ["tune-goal.md", "workflow"],
  ["wiki-bridge.md", "wiki"],
  ["wiki-context-preflight.md", "wiki"],
  ["wiki-growth-triage.md", "workflow"],
  ["2026-06-04-brain-v0-wiki-authority-in-ddalggak.md", "wiki"],
]);

const referenceGroups = new Set(["workflow", "gates", "wiki"]);

function referenceGroupOf(ref) {
  const group = referenceGroupByName.get(ref);
  if (!group) {
    throw new Error(
      `unclassified required reference: ${ref}; add it to referenceGroupByName in scripts/project-runtime-assets.mjs`,
    );
  }
  if (!referenceGroups.has(group)) {
    throw new Error(`invalid reference group for ${ref}: ${group}`);
  }
  return group;
}

function splitReferencesByGroup(refs) {
  const groups = { workflow: [], gates: [], wiki: [] };
  for (const ref of refs || []) {
    groups[referenceGroupOf(ref)].push(ref);
  }
  return groups;
}

function renderRequiredReferenceMap() {
  const lines = [
    "| Subcommand | Workflow reference | Gate references | Wiki/meta references | Required templates |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const doc of commands) {
    const refs = splitReferencesByGroup(doc.required_references || []);
    lines.push(
      `| \`${doc.command}\` | ${mdList(refs.workflow, "references/")} | ${mdList(refs.gates, "references/")} | ${mdList(refs.wiki, "references/")} | ${mdList(doc.required_templates || [], "templates/")} |`,
    );
  }
  return lines.join("\n");
}

function completionSignalOf(doc) {
  const signal = doc.output_contract?.completion_signal;
  if (!signal) {
    fatal(`command contract missing output_contract.completion_signal: ${doc.command}`);
  }
  return signal;
}

function renderClaudeCompletionSignalTable() {
  const lines = ["| 서브커맨드 | 완료 신호 |", "|---|---|"];
  for (const doc of commands) {
    lines.push(`| \`${doc.command}\` | \`${completionSignalOf(doc)}\` |`);
  }
  return lines.join("\n");
}

function renderCodexCompletionSignalTable() {
  const lines = ["| Subcommand | Completion signal |", "| --- | --- |"];
  for (const doc of commands) {
    lines.push(`| \`${doc.command}\` | \`${completionSignalOf(doc)}\` |`);
  }
  return lines.join("\n");
}

function renderDocSectionMap() {
  const lines = ["const DOC_SECTION = {"];
  for (const doc of commands) {
    lines.push(`  ${doc.command}: ${JSON.stringify(doc.show_doc_heading)},`);
  }
  lines.push("};");
  return lines.join("\n");
}

function requiredPackageFiles() {
  const base = new Set([
    ".codex/skills/ddalggak/SKILL.md",
    ".codex/skills/ddalggak/agents/openai.yaml",
    "scripts/project-runtime-assets.mjs",
    "core/verification/side-effect-boundary-policy.mjs",
    "core/verification/skill-contract-manifest.mjs",
    "ddalggak/SKILL.md",
    "bin/ddalggak.js",
    "bin/lib/dispatch.mjs",
    "bin/lib/setup.mjs",
    "README.md",
    "llms.txt",
    "LICENSE",
  ]);
  for (const doc of commands) {
    for (const ref of doc.required_references || []) {
      base.add(`.codex/skills/ddalggak/references/${ref}`);
      base.add(`ddalggak/references/${ref}`);
    }
    for (const template of doc.required_templates || []) {
      base.add(`.codex/skills/ddalggak/templates/${template}`);
      base.add(`ddalggak/templates/${template}`);
    }
  }
  return [...base].sort();
}

function renderRequiredPackageFiles() {
  return [
    "export const requiredPackageFiles = [",
    ...requiredPackageFiles().map((file) => `  ${JSON.stringify(file)},`),
    "];",
  ].join("\n");
}

function fileSize(relativePath) {
  try {
    return statSync(path.join(rootDir, relativePath)).size;
  } catch (error) {
    fatal(`cannot stat ${relativePath}: ${error.message}`);
  }
}

const tokenBudgetRoots = [
  { key: "claude", base: "ddalggak" },
  { key: "codex", base: ".codex/skills/ddalggak" },
];

// `bytes / 4` systematically undercounts multibyte content: a Hangul syllable
// is 3 UTF-8 bytes (~0.75 tokens under that rule) while real tokenizers spend
// ~1.5-2 tokens per syllable. Count ASCII at 4 chars per token and every
// non-ASCII code point (string iteration yields code points, so a 4-byte
// emoji counts once) at 1.5 tokens — a zero-dependency heuristic, not a
// tokenizer (#266).
function fileTokenEstimate(relativePath) {
  let asciiChars = 0;
  let multibyteChars = 0;
  for (const char of readText(relativePath)) {
    if (char.codePointAt(0) <= 0x7f) asciiChars += 1;
    else multibyteChars += 1;
  }
  return asciiChars / 4 + multibyteChars * 1.5;
}

function readProjectionsText() {
  return readText("core/projections.yaml");
}

function readSubcommandTokenBudgets() {
  return parseSubcommandTokenBudgets(readProjectionsText());
}

function readSubcommandTokenCeilings() {
  return parseSubcommandTokenCeilings(readProjectionsText());
}

function readReferenceBudgetExemptions() {
  return parseReferenceBudgetExemptions(readProjectionsText());
}

function runTokenBudgetReport() {
  const budgetsByRoot = readSubcommandTokenBudgets();
  const warnings = [];
  const allRows = [];
  for (const { key, base } of tokenBudgetRoots) {
    const budgets = budgetsByRoot.get(key) ?? new Map();
    const skillBytes = fileSize(`${base}/SKILL.md`);
    const skillTokens = fileTokenEstimate(`${base}/SKILL.md`);
    const rows = [];
    for (const doc of commands) {
      const referenceBytes = (doc.required_references || []).reduce(
        (sum, ref) => sum + fileSize(`${base}/references/${ref}`),
        0,
      );
      const referenceTokens = (doc.required_references || []).reduce(
        (sum, ref) => sum + fileTokenEstimate(`${base}/references/${ref}`),
        0,
      );
      const templateBytes = (doc.required_templates || []).reduce(
        (sum, template) => sum + fileSize(`${base}/templates/${template}`),
        0,
      );
      const templateTokens = (doc.required_templates || []).reduce(
        (sum, template) => sum + fileTokenEstimate(`${base}/templates/${template}`),
        0,
      );
      const totalBytes = skillBytes + referenceBytes + templateBytes;
      const estTokens = Math.ceil(skillTokens + referenceTokens + templateTokens);
      const budget = budgets.get(doc.command);
      let status = "ok";
      if (budget === undefined) {
        status = "no-budget";
        warnings.push(`${key}/${doc.command}: no budget declared in core/projections.yaml subcommand_token_budgets.${key}`);
      } else if (estTokens > budget) {
        status = "OVER";
        warnings.push(`${key}/${doc.command}: ~${estTokens} tokens exceeds budget ${budget}`);
      }
      rows.push({ root: key, command: doc.command, skillBytes, referenceBytes, templateBytes, totalBytes, estTokens, budget, status });
    }

    console.log(`[token-budget] per-subcommand effective load (root: ${base}/, est tokens = ceil(ascii_chars / 4 + multibyte_chars x 1.5))`);
    console.log("| subcommand | skill_md_bytes | reference_bytes | template_bytes | total_bytes | est_tokens | budget_tokens | status |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of rows) {
      console.log(
        `| ${row.command} | ${row.skillBytes} | ${row.referenceBytes} | ${row.templateBytes} | ${row.totalBytes} | ${row.estTokens} | ${row.budget ?? "-"} | ${row.status} |`,
      );
    }
    allRows.push(...rows);
  }
  for (const warning of warnings) {
    console.log(`[token-budget] warning: ${warning}`);
  }
  const overBudget = allRows.filter((row) => row.status === "OVER").length;
  const missingBudget = allRows.filter((row) => row.status === "no-budget").length;
  const maxRow = allRows.reduce((max, row) => (row.estTokens > max.estTokens ? row : max), allRows[0]);
  console.log(
    `[token-budget] summary: ${commands.length} subcommands x ${tokenBudgetRoots.length} roots, over-budget ${overBudget}, missing-budget ${missingBudget}, max ${maxRow.root}/${maxRow.command} ~${maxRow.estTokens} tokens`,
  );
  return { overBudget, missingBudget };
}

function fileExists(relativePath) {
  try {
    statSync(path.join(rootDir, relativePath));
    return true;
  } catch {
    return false;
  }
}

// Coverage + per-reference cap invariant (#283): every ddalggak/references/*.md
// file must be EITHER measured (named in some command's required_references, so
// it counts against that subcommand's budget) OR exempt (registered in
// reference_budget_exemptions with a positive max_tokens cap). Neither leaves a
// reference unbudgeted; both is a redundant exemption. Exempted references are
// still bounded by their cap on each root where the file exists, so a
// conditional gate reachable only via the always-loaded quality-lens-router
// cannot grow without bound.
function runReferenceCoverageChecks() {
  const failures = [];
  const measured = new Set();
  for (const doc of commands) {
    for (const ref of doc.required_references || []) measured.add(ref);
  }

  const exemptions = readReferenceBudgetExemptions();
  const exemptByRef = new Map();
  for (const exemption of exemptions) {
    if (exemptByRef.has(exemption.reference)) {
      failures.push(`reference_budget_exemptions has a duplicate entry for '${exemption.reference}'`);
    }
    exemptByRef.set(exemption.reference, exemption);
  }

  const referenceDir = path.join(rootDir, "ddalggak", "references");
  let referenceFiles;
  try {
    referenceFiles = readdirSync(referenceDir).filter((name) => name.endsWith(".md"));
  } catch (error) {
    fatal(`cannot list ddalggak/references: ${error.message}`);
  }
  const referenceSet = new Set(referenceFiles);

  for (const file of referenceFiles) {
    const isMeasured = measured.has(file);
    const isExempt = exemptByRef.has(file);
    if (!isMeasured && !isExempt) {
      failures.push(
        `reference ${file} is neither measured (in any command required_references) nor exempt (reference_budget_exemptions); add it to a required_references list or register an exemption with a max_tokens cap`,
      );
    } else if (isMeasured && isExempt) {
      failures.push(
        `reference ${file} is both measured and listed in reference_budget_exemptions; remove the redundant exemption`,
      );
    }
  }

  for (const exemption of exemptions) {
    if (!referenceSet.has(exemption.reference)) {
      failures.push(
        `reference_budget_exemptions lists '${exemption.reference}' but ddalggak/references/${exemption.reference} does not exist; remove the stale exemption`,
      );
      continue;
    }
    if (!Number.isInteger(exemption.maxTokens) || exemption.maxTokens <= 0) {
      failures.push(
        `reference_budget_exemptions entry '${exemption.reference}' is missing a positive integer max_tokens cap`,
      );
      continue;
    }
    for (const { key, base } of tokenBudgetRoots) {
      const relativePath = `${base}/references/${exemption.reference}`;
      if (!fileExists(relativePath)) continue; // root-specific reference absent on this root
      const estTokens = Math.ceil(fileTokenEstimate(relativePath));
      if (estTokens > exemption.maxTokens) {
        failures.push(
          `${key}: reference ${exemption.reference} ~${estTokens} tokens exceeds its exemption cap ${exemption.maxTokens}; reduce the reference or raise max_tokens in core/projections.yaml reference_budget_exemptions`,
        );
      }
    }
  }

  return failures;
}

// Absolute-ceiling invariant (#283): every declared budget must be <= its
// declared ceiling. A budget-only PR passes check-budget-isolation, so without
// this a budget could be ratcheted up indefinitely across PRs; the ceiling is a
// frozen constant that caps how high the working budget may go.
function runCeilingChecks() {
  const failures = [];
  const budgetsByRoot = readSubcommandTokenBudgets();
  const ceilingsByRoot = readSubcommandTokenCeilings();
  for (const { key } of tokenBudgetRoots) {
    const budgets = budgetsByRoot.get(key) ?? new Map();
    const ceilings = ceilingsByRoot.get(key) ?? new Map();
    for (const doc of commands) {
      const budget = budgets.get(doc.command);
      if (budget === undefined) continue; // missing-budget already reported by runTokenBudgetReport
      const ceiling = ceilings.get(doc.command);
      if (ceiling === undefined) {
        failures.push(`${key}/${doc.command}: no ceiling declared in core/projections.yaml subcommand_token_ceilings.${key}`);
        continue;
      }
      if (budget > ceiling) {
        failures.push(
          `${key}/${doc.command}: budget ${budget} exceeds ceiling ${ceiling}; a budget must not be ratcheted past its absolute ceiling (subcommand_token_ceilings)`,
        );
      }
    }
  }
  return failures;
}

if (reportMode) {
  const { overBudget, missingBudget } = runTokenBudgetReport();
  const extraFailures = [...runReferenceCoverageChecks(), ...runCeilingChecks()];
  for (const failure of extraFailures) {
    console.log(`[token-budget] warning: ${failure}`);
  }
  if (admissionMode) {
    if (overBudget + missingBudget + extraFailures.length > 0) {
      console.error(
        `[token-budget] admission gate: fail (over-budget ${overBudget}, missing-budget ${missingBudget}, coverage/cap/ceiling ${extraFailures.length}); adjust assets, budgets, ceilings, or exemptions in core/projections.yaml`,
      );
      process.exit(1);
    }
    console.log("[token-budget] admission gate: pass");
  }
  process.exit(0);
}

const projections = [
  {
    path: "ddalggak/SKILL.md",
    blocks: [
      ["code-permission-table", renderClaudeCodePermissionTable()],
      ["subcommand-table", renderClaudeSubcommandTable()],
      ["required-reference-map", renderRequiredReferenceMap()],
      ["completion-signal-table", renderClaudeCompletionSignalTable()],
    ],
  },
  {
    path: ".codex/skills/ddalggak/SKILL.md",
    blocks: [
      ["code-permission-table", renderCodexCodePermissionTable()],
      ["subcommand-table", renderCodexSubcommandTable()],
      ["required-reference-map", renderRequiredReferenceMap()],
      ["completion-signal-table", renderCodexCompletionSignalTable()],
    ],
  },
  {
    path: "bin/lib/dispatch.mjs",
    blocks: [["show-doc-heading-map", renderDocSectionMap()]],
  },
  {
    path: "core/verification/skill-contract-manifest.mjs",
    blocks: [["package-required-asset-list", renderRequiredPackageFiles()]],
  },
];

const drift = [];
for (const projection of projections) {
  const current = readText(projection.path);
  let next = current;
  for (const [id, body] of projection.blocks) {
    next = replaceGeneratedBlock(next, id, body, projection.path);
  }
  if (next !== current) {
    drift.push(projection.path);
    if (writeMode) writeText(projection.path, next);
  }
}

if (drift.length > 0 && checkMode) {
  console.error("[project-runtime-assets] generated block drift detected:");
  for (const file of drift) console.error(`- ${file}`);
  console.error("Run: node scripts/project-runtime-assets.mjs --write");
  process.exit(1);
}

if (writeMode) {
  console.log(`[project-runtime-assets] updated ${drift.length} file(s)`);
} else {
  console.log("[project-runtime-assets] generated blocks are up to date");
}
