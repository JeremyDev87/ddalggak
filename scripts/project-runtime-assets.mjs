#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { escapeRegExp } from "./lib/escape-regexp.mjs";
import { parseSimpleYaml } from "./lib/parse-simple-yaml.mjs";

const rootDir = process.cwd();
const args = new Set(process.argv.slice(2));
const writeMode = args.has("--write");
const reportMode = args.has("--report");
const admissionMode = args.has("--admission");
const checkMode = args.has("--check") || !writeMode;

const commandOrder = [
  "start",
  "review",
  "status",
  "plan",
  "issue",
  "clean",
  "ship",
  "retro",
  "prompt",
  "check",
  "getwiki",
  "setwiki",
];

const allowedArtifactByCommand = {
  start: "worker agents may edit only files named in their brief",
  review: "author agents may apply accepted review fixes only",
  prompt: "brief artifacts after explicit confirmation",
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

function readText(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function writeText(relativePath, text) {
  writeFileSync(path.join(rootDir, relativePath), text);
}

function loadCommands() {
  const commandDir = path.join(rootDir, "core", "commands");
  const docs = new Map();
  for (const name of readdirSync(commandDir).filter((entry) => entry.endsWith(".yaml"))) {
    const doc = parseSimpleYaml(
      readFileSync(path.join(commandDir, name), "utf8"),
      `core/commands/${name}`,
    );
    if (doc.command) docs.set(doc.command, doc);
  }
  return commandOrder.map((command) => {
    const doc = docs.get(command);
    if (!doc) throw new Error(`core command contract missing: ${command}`);
    return doc;
  });
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

function renderLegacyCodePermissionTable() {
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

function renderLegacySubcommandTable() {
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

const gateReferences = new Set([
  "quality-lens-router.md",
  "evidence-contract.md",
  "simplicity-deletability-gate.md",
  "core-invariants.md",
  "regression-library.md",
]);

const wikiReferences = new Set(["wiki-context-preflight.md", "wiki-bridge.md", "2026-06-04-brain-v0-wiki-authority-in-ddalggak.md"]);

function splitReferencesByGroup(refs) {
  const groups = { workflow: [], gates: [], wiki: [] };
  for (const ref of refs || []) {
    if (gateReferences.has(ref)) groups.gates.push(ref);
    else if (wikiReferences.has(ref)) groups.wiki.push(ref);
    else groups.workflow.push(ref);
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
  return statSync(path.join(rootDir, relativePath)).size;
}

const tokenBudgetRoots = [
  { key: "claude_legacy", base: "ddalggak" },
  { key: "codex", base: ".codex/skills/ddalggak" },
];

function parseSubcommandTokenBudgets() {
  const lines = readText("core/projections.yaml").split(/\r?\n/);
  const start = lines.indexOf("subcommand_token_budgets:");
  const budgetsByRoot = new Map();
  if (start === -1) return budgetsByRoot;
  let currentRoot;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+#.*$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const rootEntry = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (rootEntry) {
      currentRoot = new Map();
      budgetsByRoot.set(rootEntry[1], currentRoot);
      continue;
    }
    const entry = line.match(/^ {4}([A-Za-z0-9_-]+):\s*(\d+)\s*$/);
    if (!entry || !currentRoot) break;
    currentRoot.set(entry[1], Number(entry[2]));
  }
  return budgetsByRoot;
}

function runTokenBudgetReport() {
  const budgetsByRoot = parseSubcommandTokenBudgets();
  const warnings = [];
  const allRows = [];
  for (const { key, base } of tokenBudgetRoots) {
    const budgets = budgetsByRoot.get(key) ?? new Map();
    const skillBytes = fileSize(`${base}/SKILL.md`);
    const rows = [];
    for (const doc of commands) {
      const referenceBytes = (doc.required_references || []).reduce(
        (sum, ref) => sum + fileSize(`${base}/references/${ref}`),
        0,
      );
      const templateBytes = (doc.required_templates || []).reduce(
        (sum, template) => sum + fileSize(`${base}/templates/${template}`),
        0,
      );
      const totalBytes = skillBytes + referenceBytes + templateBytes;
      const estTokens = Math.ceil(totalBytes / 4);
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

    console.log(`[token-budget] per-subcommand effective load (root: ${base}/, est tokens = ceil(bytes / 4))`);
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

if (reportMode) {
  const { overBudget, missingBudget } = runTokenBudgetReport();
  if (admissionMode) {
    if (overBudget + missingBudget > 0) {
      console.error(
        `[token-budget] admission gate: fail (over-budget ${overBudget}, missing-budget ${missingBudget}); adjust assets or budgets in core/projections.yaml subcommand_token_budgets`,
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
      ["code-permission-table", renderLegacyCodePermissionTable()],
      ["subcommand-table", renderLegacySubcommandTable()],
      ["required-reference-map", renderRequiredReferenceMap()],
    ],
  },
  {
    path: ".codex/skills/ddalggak/SKILL.md",
    blocks: [
      ["code-permission-table", renderCodexCodePermissionTable()],
      ["subcommand-table", renderCodexSubcommandTable()],
      ["required-reference-map", renderRequiredReferenceMap()],
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
