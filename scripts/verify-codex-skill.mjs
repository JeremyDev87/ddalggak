import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { sideEffectBoundarySkillSemanticAnchorGuards } from "../core/verification/side-effect-boundary-policy.mjs";
import {
  requiredDisclosureAssetsBySubcommand,
  requiredIssueTemplateFields,
  requiredEpicTemplateFields,
  skillPayloadRoots,
  requiredPackageFiles,
  requiredReferenceAdmissionHeaderFields,
  modePermissionProfiles,
  subcommandExecutionContracts,
  forbiddenHotPathTemplateSentinels,
  requiredSubcommands,
  requiredClaudeHeadings,
  bannedTerms,
  requiredSkillHotPathAnchors,
  requiredClaudeSkillHotPathAnchors,
  requiredRouterGateFamilies,
  requiredRouterReferenceAnchors,
  requiredEvidenceReferenceAnchors,
  requiredSimplicityReferenceAnchors,
  requiredFrontendDesignReferenceAnchors,
  requiredVercelAgentSkillsReferenceAnchors,
  requiredRegressionLibraryReferenceAnchors,
  requiredRegressionLibraryClasses,
  requiredRegressionLibraryFields,
  requiredAgentRuntimeContractAnchors,
  requiredCoreInvariantReferenceAnchors,
  requiredPromptSafetyReferenceAnchors,
  requiredWikiBridgeReferenceAnchors,
  requiredReadmeQualityAnchors,
} from "../core/verification/skill-contract-manifest.mjs";
import { escapeRegExp } from "./lib/escape-regexp.mjs";
import { parseSimpleYaml } from "./lib/parse-simple-yaml.mjs";

const rootDir = process.cwd();
const skillDir = path.join(rootDir, ".codex", "skills", "ddalggak");
const skillPath = path.join(skillDir, "SKILL.md");
const claudeSkillPath = path.join(rootDir, "ddalggak", "SKILL.md");
const routerReferencePaths = [
  path.join(skillDir, "references", "quality-lens-router.md"),
  path.join(rootDir, "ddalggak", "references", "quality-lens-router.md"),
];
const evidenceReferencePaths = [
  path.join(skillDir, "references", "evidence-contract.md"),
  path.join(rootDir, "ddalggak", "references", "evidence-contract.md"),
];
const simplicityReferencePaths = [
  path.join(skillDir, "references", "simplicity-deletability-gate.md"),
  path.join(rootDir, "ddalggak", "references", "simplicity-deletability-gate.md"),
];
const frontendDesignReferencePaths = [
  path.join(skillDir, "references", "frontend-design-gate.md"),
  path.join(rootDir, "ddalggak", "references", "frontend-design-gate.md"),
];
const vercelAgentSkillsReferencePaths = [
  path.join(skillDir, "references", "vercel-agent-skills-gates.md"),
  path.join(rootDir, "ddalggak", "references", "vercel-agent-skills-gates.md"),
];
const regressionLibraryReferencePaths = [
  path.join(skillDir, "references", "regression-library.md"),
  path.join(rootDir, "ddalggak", "references", "regression-library.md"),
];
const agentRuntimeContractReferencePaths = [
  path.join(skillDir, "references", "agent-runtime-contract.md"),
  path.join(rootDir, "ddalggak", "references", "agent-runtime-contract.md"),
];
const coreInvariantReferencePaths = [
  path.join(skillDir, "references", "core-invariants.md"),
  path.join(rootDir, "ddalggak", "references", "core-invariants.md"),
];
const promptOptimizerReferencePaths = [
  path.join(skillDir, "references", "prompt-optimizer.md"),
  path.join(rootDir, "ddalggak", "references", "prompt-optimizer.md"),
];
const wikiBridgeReferencePaths = [
  path.join(skillDir, "references", "wiki-bridge.md"),
  path.join(rootDir, "ddalggak", "references", "wiki-bridge.md"),
];
const packagePath = path.join(rootDir, "package.json");
const readmePath = path.join(rootDir, "README.md");
const cliPath = path.join(rootDir, "bin", "ddalggak.js");
const dispatchPath = path.join(rootDir, "bin", "lib", "dispatch.mjs");
const skillBudgets = [
  {
    label: ".codex/skills/ddalggak/SKILL.md",
    filePath: skillPath,
    maxLines: 450,
    maxChars: 35_000,
    principleHeadings: ["Global Guardrails"],
    maxPrincipleBullets: 25,
    maxInlineSubcommandAnchors: 23,
  },
  {
    label: "ddalggak/SKILL.md",
    filePath: claudeSkillPath,
    maxLines: 700,
    maxChars: 45_000,
    principleHeadings: ["핵심 원칙", "myWiki-derived 운영 Guardrails"],
    maxPrincipleBullets: 30,
    maxInlineSubcommandAnchors: 60,
  },
];
const skillBudgetMetrics = [];

const failures = [];

const semanticAnchorGuards = sideEffectBoundarySkillSemanticAnchorGuards;

function fail(message) {
  failures.push(message);
}

function readText(filePath) {
  return readFileSync(filePath, "utf8");
}

function listFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    if (entry.isFile()) {
      return [entryPath];
    }
    return [];
  });
}

function getFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? match[1] : null;
}

function getFrontmatterValue(frontmatter, key) {
  const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m");
  const match = frontmatter.match(pattern);
  if (!match) {
    return null;
  }
  return match[1].replace(/^["']|["']$/g, "");
}

function extractCliHelpSubcommands(text) {
  const commands = [];
  let inSubcommands = false;
  for (const line of text.split("\n")) {
    if (line.trim() === "Subcommands:") {
      inSubcommands = true;
      continue;
    }
    if (inSubcommands && line.trim() === "") {
      break;
    }
    if (!inSubcommands) {
      continue;
    }
    const match = line.match(/^  ([a-z][a-z-]*)(?:\s|$)/);
    if (line.includes("--local")) {
      continue;
    }
    if (match && !["setup", "doctor", "profile"].includes(match[1])) {
      commands.push(match[1]);
    }
  }
  return commands;
}

function extractDocSectionMap(text) {
  const match = text.match(/const DOC_SECTION = \{([\s\S]*?)\};/);
  if (!match) {
    return null;
  }
  const entries = {};
  for (const item of match[1].matchAll(/\s*([a-z]+):\s*"([^"]+)"/g)) {
    entries[item[1]] = item[2];
  }
  return entries;
}

function arraysEqual(a, b) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function countOccurrences(text, term) {
  if (term.length === 0) {
    return 0;
  }

  let count = 0;
  let index = text.indexOf(term);
  while (index !== -1) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }
  return count;
}

function countLinesAndChars(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  return {
    lines: normalized.length === 0 ? 0 : normalized.replace(/\n$/, "").split("\n").length,
    chars: text.length,
  };
}

function sectionByHeading(text, heading) {
  const lines = text.split("\n");
  const target = `## ${heading}`;
  const startIdx = lines.findIndex((line) => line.trim() === target);
  if (startIdx === -1) {
    return "";
  }

  let endIdx = lines.length;
  for (let index = startIdx + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      endIdx = index;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

function countPrincipleBullets(text, headings) {
  return headings
    .map((heading) => sectionByHeading(text, heading))
    .join("\n")
    .split("\n")
    .filter((line) => /^\s*-\s+/.test(line)).length;
}

function subcommandSections(text) {
  const lines = text.split("\n");
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("## ")) {
      continue;
    }
    const matchingSubcommand = requiredSubcommands.find((subcommand) => {
      const claudeHeading = requiredClaudeHeadings[subcommand];
      return line.trim() === `## ${claudeHeading}` || line.startsWith(`## \`${subcommand}\``);
    });
    if (!matchingSubcommand) {
      continue;
    }

    let endIdx = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      if (lines[cursor].startsWith("## ")) {
        endIdx = cursor;
        break;
      }
    }
    sections.push(lines.slice(index, endIdx).join("\n"));
  }
  return sections;
}

function countInlineSubcommandAnchors(text) {
  return subcommandSections(text)
    .join("\n")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("## ");
    }).length;
}

function assertSkillBudget({
  label,
  filePath,
  maxLines,
  maxChars,
  principleHeadings = [],
  maxPrincipleBullets,
  maxInlineSubcommandAnchors,
}) {
  if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${label} must exist before budget verification.`);
    return;
  }

  const text = readText(filePath);
  const { lines, chars } = countLinesAndChars(text);
  const principleBullets = countPrincipleBullets(text, principleHeadings);
  const inlineSubcommandAnchors = countInlineSubcommandAnchors(text);
  skillBudgetMetrics.push({
    label,
    lines,
    maxLines,
    chars,
    maxChars,
    principleBullets,
    maxPrincipleBullets,
    inlineSubcommandAnchors,
    maxInlineSubcommandAnchors,
  });
  if (lines > maxLines || chars > maxChars) {
    fail(
      `${label} exceeds progressive-disclosure budget: ${lines}/${maxLines} lines, ${chars}/${maxChars} chars. Move low-frequency detail to references/ or templates/.`,
    );
  }
  if (maxPrincipleBullets !== undefined && principleBullets > maxPrincipleBullets) {
    fail(
      `${label} has too many hot-path principle bullets: ${principleBullets}/${maxPrincipleBullets}. Keep only non-negotiable invariants here and move explanatory guardrails to references/.`,
    );
  }
  if (maxInlineSubcommandAnchors !== undefined && inlineSubcommandAnchors > maxInlineSubcommandAnchors) {
    fail(
      `${label} has too many inline subcommand detail anchors: ${inlineSubcommandAnchors}/${maxInlineSubcommandAnchors}. Keep show-doc sections as execution-contract indexes and move low-frequency procedure to references/.`,
    );
  }
}

function requiredDisclosureAssetPaths() {
  const assets = new Set();
  const mappedSubcommands = Object.keys(requiredDisclosureAssetsBySubcommand);
  for (const subcommand of requiredSubcommands) {
    if (!mappedSubcommands.includes(subcommand)) {
      fail(`requiredDisclosureAssetsBySubcommand is missing required subcommand '${subcommand}'.`);
    }
  }
  for (const [subcommand, groups] of Object.entries(requiredDisclosureAssetsBySubcommand)) {
    if (!requiredSubcommands.includes(subcommand)) {
      fail(`requiredDisclosureAssetsBySubcommand contains unknown subcommand '${subcommand}'.`);
    }
    for (const reference of groups.references) {
      for (const root of skillPayloadRoots) {
        assets.add(`${root}/references/${reference}`);
      }
    }
    for (const template of groups.templates) {
      for (const root of skillPayloadRoots) {
        assets.add(`${root}/templates/${template}`);
      }
    }
  }
  return [...assets].sort();
}

function assertRequiredDisclosureAssetsExist() {
  for (const assetPath of requiredDisclosureAssetPaths()) {
    const absolutePath = path.join(rootDir, assetPath);
    if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
      fail(`required progressive-disclosure asset missing: ${assetPath}`);
    }
  }
}

// Header enforcement targets are derived from the canonical command contracts so a new
// required reference can never land without an admission header (fail-closed coverage; #264).
function commandContractDocsBySubcommand() {
  const commandDir = path.join(rootDir, "core", "commands");
  const docs = new Map();
  for (const name of readdirSync(commandDir).filter((entry) => entry.endsWith(".yaml")).sort()) {
    const doc = parseSimpleYaml(readText(path.join(commandDir, name)), `core/commands/${name}`, {
      onError: fail,
    });
    if (typeof doc.command !== "string" || doc.command.trim().length === 0) {
      fail(`core/commands/${name} must define a non-empty command field.`);
      continue;
    }
    if (docs.has(doc.command)) {
      fail(`duplicate core command contract for '${doc.command}'.`);
      continue;
    }
    docs.set(doc.command, doc);
  }
  return docs;
}

function requiredReferenceUnionFromCommandContracts() {
  const references = new Set();
  for (const doc of commandContractDocsBySubcommand().values()) {
    for (const reference of doc.required_references || []) {
      references.add(reference);
    }
  }
  if (references.size === 0) {
    fail(
      "required reference admission header coverage could not be derived: core/commands/*.yaml declared no required_references.",
    );
  }
  return [...references].sort();
}

function assertRequiredReferenceAdmissionHeaders() {
  for (const reference of requiredReferenceUnionFromCommandContracts()) {
    for (const root of skillPayloadRoots) {
      const relativePath = `${root}/references/${reference}`;
      const absolutePath = path.join(rootDir, relativePath);
      if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
        fail(`required reference admission header file missing: ${relativePath}`);
        continue;
      }
      const text = readText(absolutePath);
      const firstBlock = text.split(/\n\n/)[0] || "";
      const missingFields = requiredReferenceAdmissionHeaderFields.filter((field) => !firstBlock.includes(field));
      if (missingFields.length > 0) {
        fail(
          `${relativePath} missing required reference admission header fields:\n${formatAnchorList(missingFields)}`,
        );
      }
    }
  }
}

function assertSubcommandExecutionContracts() {
  const contractKeys = Object.keys(subcommandExecutionContracts);
  if (!arraysEqual(contractKeys, requiredSubcommands)) {
    fail(
      `subcommandExecutionContracts keys drifted. Expected ${requiredSubcommands.join(", ")}; got ${contractKeys.join(", ")}`,
    );
  }

  const commandDocs = commandContractDocsBySubcommand();
  for (const subcommand of requiredSubcommands) {
    const contract = subcommandExecutionContracts[subcommand];
    const commandDoc = commandDocs.get(subcommand);
    if (!contract || typeof contract !== "object") {
      fail(`subcommandExecutionContracts.${subcommand} must be an object.`);
      continue;
    }
    if (!commandDoc) {
      fail(`core/commands/${subcommand}.yaml missing or lacks command: ${subcommand}.`);
      continue;
    }

    for (const field of ["mode", "stopCondition", "completionSignal"]) {
      if (typeof contract[field] !== "string" || contract[field].trim().length === 0) {
        fail(`subcommandExecutionContracts.${subcommand}.${field} must be a non-empty string.`);
      }
    }
    for (const field of ["sourceEditAllowed", "githubWriteAllowed"]) {
      if (typeof contract[field] !== "boolean") {
        fail(`subcommandExecutionContracts.${subcommand}.${field} must be a boolean.`);
      }
    }
    if (!Array.isArray(contract.requiredReferences) || contract.requiredReferences.length === 0) {
      fail(`subcommandExecutionContracts.${subcommand}.requiredReferences must be a non-empty array.`);
    } else {
      for (const reference of contract.requiredReferences) {
        if (typeof reference !== "string" || !reference.endsWith(".md")) {
          fail(`subcommandExecutionContracts.${subcommand}.requiredReferences contains invalid reference '${reference}'.`);
          continue;
        }
        const existsInPayload = skillPayloadRoots.some((root) =>
          statSync(path.join(rootDir, root, "references", reference), { throwIfNoEntry: false })?.isFile(),
        );
        if (!existsInPayload) {
          fail(`subcommandExecutionContracts.${subcommand} references missing payload file '${reference}'.`);
        }
      }
    }

    const profile = modePermissionProfiles[contract.mode];
    if (!profile) {
      fail(`subcommandExecutionContracts.${subcommand}.mode '${contract.mode}' has no modePermissionProfiles entry.`);
    } else {
      for (const field of ["sourceEditAllowed", "githubWriteAllowed"]) {
        if (contract[field] !== profile[field]) {
          fail(
            `subcommandExecutionContracts.${subcommand}.${field} must derive from modePermissionProfiles['${contract.mode}']=${profile[field]}.`,
          );
        }
      }
    }

    if (contract.mode !== commandDoc.mode) {
      fail(
        `subcommandExecutionContracts.${subcommand}.mode drifted from core/commands/${subcommand}.yaml mode='${commandDoc.mode}'.`,
      );
    }
    if (contract.sourceEditAllowed !== commandDoc.source_edit_allowed) {
      fail(
        `subcommandExecutionContracts.${subcommand}.sourceEditAllowed drifted from core/commands/${subcommand}.yaml source_edit_allowed=${commandDoc.source_edit_allowed}.`,
      );
    }
    if (contract.githubWriteAllowed !== commandDoc.github_write_allowed) {
      fail(
        `subcommandExecutionContracts.${subcommand}.githubWriteAllowed drifted from core/commands/${subcommand}.yaml github_write_allowed=${commandDoc.github_write_allowed}.`,
      );
    }
    if (contract.stopCondition !== commandDoc.stop_condition) {
      fail(
        `subcommandExecutionContracts.${subcommand}.stopCondition drifted from core/commands/${subcommand}.yaml stop_condition.`,
      );
    }
    if (contract.completionSignal !== commandDoc.output_contract?.completion_signal) {
      fail(
        `subcommandExecutionContracts.${subcommand}.completionSignal drifted from core/commands/${subcommand}.yaml output_contract.completion_signal.`,
      );
    }
  }
}

function assertRenderedSubcommandContracts({ label, text }) {
  const permissionRows = parseCodePermissionRows(extractGeneratedBlock(text, "code-permission-table"));
  const contractRows = parseSubcommandContractRows(extractGeneratedBlock(text, "subcommand-table"));
  const allowedSourceEditors = new Set(["start", "review"]);
  const sourceEditAuthorityPatterns = [
    /\bmay edit source\b/i,
    /\bmay modify source\b/i,
    /\bsource edits are allowed\b/i,
    /Repo source edits/i,
    /accepted .* fixes may edit source/i,
  ];

  for (const subcommand of requiredSubcommands) {
    const manifestContract = subcommandExecutionContracts[subcommand];
    const permission = permissionRows.get(subcommand);
    const renderedContract = contractRows.get(subcommand);
    if (!permission) {
      fail(`${label} code permission table missing '${subcommand}'.`);
      continue;
    }
    if (!renderedContract) {
      fail(`${label} subcommand contract table missing '${subcommand}'.`);
      continue;
    }

    if (permission.mayModify !== manifestContract.sourceEditAllowed) {
      fail(
        `${label} code permission table for '${subcommand}' drifted from manifest sourceEditAllowed=${manifestContract.sourceEditAllowed}.`,
      );
    }
    if (!renderedContract.mode || renderedContract.mode !== manifestContract.mode) {
      fail(
        `${label} subcommand table mode for '${subcommand}' drifted. Expected '${manifestContract.mode}', got '${renderedContract.mode}'.`,
      );
    }
    if (!renderedContract.stopCondition) {
      fail(`${label} subcommand table stop condition for '${subcommand}' must be non-empty.`);
    } else if (renderedContract.stopCondition !== manifestContract.stopCondition) {
      fail(
        `${label} subcommand table stop condition for '${subcommand}' drifted. Expected '${manifestContract.stopCondition}', got '${renderedContract.stopCondition}'.`,
      );
    }
    for (const reference of manifestContract.requiredReferences) {
      if (!renderedContract.requiredReferences.includes(reference)) {
        fail(`${label} subcommand table for '${subcommand}' missing required reference '${reference}'.`);
      }
    }
    // Reverse direction: the rendered (yaml-derived) set must not exceed the
    // manifest either. Without this, a reference present in core/commands/*.yaml
    // but absent from the manifest is unguarded — it can be deleted from the
    // yaml and verify stays green (e.g. review's security-posture-gate.md).
    // Both loops together enforce yaml ↔ manifest set equality (#279).
    for (const reference of renderedContract.requiredReferences) {
      if (!manifestContract.requiredReferences.includes(reference)) {
        fail(
          `${label} subcommand table for '${subcommand}' lists required reference '${reference}' absent from skill-contract-manifest subcommandExecutionContracts.${subcommand}.requiredReferences; required_references must match the manifest exactly.`,
        );
      }
    }

    const renderedAuthorityText = `${permission.allowedArtifacts}\n${renderedContract.sideEffects}`;
    const grantsSourceAuthority = sourceEditAuthorityPatterns.some((pattern) => pattern.test(renderedAuthorityText));
    if (!allowedSourceEditors.has(subcommand) && grantsSourceAuthority) {
      fail(
        `${label} non-source-edit subcommand '${subcommand}' contains unnegated source-edit authority wording.`,
      );
    }
  }
}

function assertForbiddenHotPathTemplateSentinels({ label, text }) {
  for (const sentinel of forbiddenHotPathTemplateSentinels) {
    if (sentinel.pattern.test(text)) {
      fail(`${label} must not inline ${sentinel.description}; keep detail in references/ or templates/.`);
    }
  }
}

function assertTemplateRequiredFields({ label, relativePath, fields }) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${label} template missing: ${relativePath}`);
    return;
  }

  const text = readText(absolutePath);
  const missingFields = fields.filter((field) => !text.includes(field));
  if (missingFields.length > 0) {
    fail(
      `${label} template required fields missing from ${relativePath}:
${formatAnchorList(missingFields)}`,
    );
  }

  if (/\u[0-9a-fA-F]{4}/.test(text)) {
    fail(`${label} template must keep raw UTF-8 guidance; literal Unicode escape found in ${relativePath}.`);
  }
}

function parsePackJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    const startIndex = stdout.indexOf("[");
    const endIndex = stdout.lastIndexOf("]");
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
      throw new Error("could not locate JSON array in npm pack stdout");
    }
    return JSON.parse(stdout.slice(startIndex, endIndex + 1));
  }
}

function assertPackageArtifactIncludes() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(
    npmCommand,
    ["pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        npm_config_cache: process.env.npm_config_cache || path.join(os.tmpdir(), "ddalggak-npm-cache"),
      },
    },
  );
  if (result.status !== 0) {
    fail(`npm pack --dry-run --json --ignore-scripts failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
    return;
  }

  let packEntries;
  try {
    packEntries = parsePackJson(result.stdout);
  } catch (error) {
    fail(`npm pack --dry-run --json output was not valid JSON: ${error.message}`);
    return;
  }
  if (!Array.isArray(packEntries) || !Array.isArray(packEntries[0]?.files)) {
    fail("npm pack --dry-run --json output did not include a files array.");
    return;
  }
  const packedFiles = new Set(packEntries[0].files.map((file) => file.path));
  const expectedFiles = [...new Set([...requiredPackageFiles, ...requiredDisclosureAssetPaths()])].sort();
  const missingFiles = expectedFiles.filter((filePath) => !packedFiles.has(filePath));
  if (missingFiles.length > 0) {
    fail(
      `npm pack artifact missing required files:\n${missingFiles
        .map((filePath) => `  - ${filePath}`)
        .join("\n")}`,
    );
  }
}

function assertForbiddenTermsAbsent({ label, text, terms }) {
  for (const term of terms) {
    if (text.includes(term)) {
      fail(`${label} must not contain stale multi-PR/wave wording (${term}).`);
    }
  }
}

function extractClaudeSection(text, heading) {
  return extractMarkdownSection(text, heading);
}

function extractMarkdownSection(text, heading) {
  const lines = text.split("\n");
  const target = `## ${heading}`;
  const startIdx = lines.findIndex((line) => line.trim() === target);
  if (startIdx === -1) {
    return "";
  }

  let endIdx = lines.length;
  for (let index = startIdx + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      endIdx = index;
      break;
    }
  }

  return lines.slice(startIdx, endIdx).join("\n");
}

function extractGeneratedBlock(text, name) {
  const escapedName = escapeRegExp(name);
  const pattern = new RegExp(
    `<!-- ddalggak:generated:start ${escapedName} -->\\n([\\s\\S]*?)\\n<!-- ddalggak:generated:end ${escapedName} -->`,
  );
  const match = text.match(pattern);
  return match ? match[1] : "";
}

function parseMarkdownTableRows(block) {
  return block
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .slice(2)
    .map((line) => line.trim());
}

function parseCodePermissionRows(block) {
  const rows = new Map();
  for (const line of parseMarkdownTableRows(block)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const subcommand = cells[0]?.match(/`([^`]+)`/)?.[1];
    if (!subcommand) continue;
    const mayModify = /^(✅|yes)$/.test(cells[1]);
    rows.set(subcommand, { mayModify, allowedArtifacts: cells[2] || "" });
  }
  return rows;
}

function parseSubcommandContractRows(block) {
  const rows = new Map();
  for (const line of parseMarkdownTableRows(block)) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    const subcommand = cells[0]?.match(/`([^`]+)`/)?.[1];
    if (!subcommand) continue;
    const requiredReferences = [...(cells[6] || "").matchAll(/`references\/([^`]+\.md)`/g)].map(
      (match) => match[1],
    );
    rows.set(subcommand, {
      mode: cells[1] || "",
      sideEffects: cells[4] || "",
      stopCondition: cells[5] || "",
      requiredReferences,
    });
  }
  return rows;
}

function missingAnchors(text, anchors) {
  return anchors.filter((anchor) => !text.includes(anchor));
}

function linesContaining(text, anchor) {
  return text
    .split("\n")
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.includes(anchor));
}

function assertSemanticAnchorGuards({ label, text, anchors }) {
  const anchorSet = new Set(anchors);
  for (const guard of semanticAnchorGuards) {
    if (!anchorSet.has(guard.anchor)) {
      continue;
    }
    for (const { line, lineNumber } of linesContaining(text, guard.anchor)) {
      if (guard.invalidLinePattern.test(line)) {
        fail(
          `${label} semantic inversion near required anchor '${guard.anchor}' on line ${lineNumber}: ${guard.description}. Anchor presence alone is not enough when the same line negates or reverses the invariant.`,
        );
      }
    }
  }
}

function formatAnchorList(anchors) {
  return anchors.map((anchor) => `  - ${anchor}`).join("\n");
}

function verifySkillFile(filePath, { label, hotPathAnchors }) {
  if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${label} must exist.`);
    return;
  }

  const skillText = readText(filePath);
  const frontmatter = getFrontmatter(skillText);
  if (!frontmatter) {
    fail(`${label} must start with YAML frontmatter.`);
  } else if (getFrontmatterValue(frontmatter, "name") !== "ddalggak") {
    fail(`${label} frontmatter must include name: ddalggak.`);
  }

  const missingHotPathAnchors = missingAnchors(skillText, hotPathAnchors);
  if (missingHotPathAnchors.length > 0) {
    fail(
      `hot-path anchors missing from ${label}:\n${formatAnchorList(missingHotPathAnchors)}\n` +
        "These anchors must stay in SKILL.md because they are always-loaded router/core invariants. " +
        "Reference-only details should be preserved in references/* instead of re-expanded into SKILL.md.",
    );
  }
  assertSemanticAnchorGuards({ label, text: skillText, anchors: hotPathAnchors });
}

function assertReferenceAnchors({ label, text, anchors }) {
  const missingReferenceAnchors = missingAnchors(text, anchors);
  if (missingReferenceAnchors.length > 0) {
    fail(
      `${label} reference anchors missing; preserve these details in the appropriate references/* file instead of re-expanding SKILL.md:\n${formatAnchorList(missingReferenceAnchors)}`,
    );
  }
}

function parseMarkdownSections(text) {
  const lines = text.split("\n");
  const headings = [];
  let inFence = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      headings.push({ level: headingMatch[1].length, heading: headingMatch[2].trim(), lineIdx: index });
    }
  }
  return headings.map((entry, order) => {
    let endIdx = lines.length;
    for (let cursor = order + 1; cursor < headings.length; cursor += 1) {
      if (headings[cursor].level <= entry.level) {
        endIdx = headings[cursor].lineIdx;
        break;
      }
    }
    return {
      level: entry.level,
      heading: entry.heading,
      body: lines.slice(entry.lineIdx + 1, endIdx).join("\n"),
    };
  });
}

function substantiveBodyLength(body) {
  return body.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, "").length;
}

function assertSubstantiveSectionBodies({ label, fileName, text }) {
  for (const section of parseMarkdownSections(text)) {
    if (allowedEmptySectionBodies.has(`${fileName} :: ${section.heading}`)) {
      continue;
    }
    const bodyLength = substantiveBodyLength(section.body);
    if (bodyLength < minSubstantiveSectionBodyChars) {
      fail(
        `${label} section "${section.heading}" must keep a substantive body (>= ${minSubstantiveSectionBodyChars} non-whitespace chars excluding HTML comments); found ${bodyLength}. A heading without prose does not satisfy the prose gate.`,
      );
    }
  }
}

function assertSectionScopedAnchors({ label, parsedSections, heading, anchors }) {
  const matchingSections = parsedSections.filter((section) => section.heading === heading);
  if (matchingSections.length === 0) {
    fail(`${label} required section heading missing: "${heading}". Section-scoped anchors need their owning heading.`);
    return;
  }
  const missingScopedAnchors = anchors.filter(
    (anchor) => !matchingSections.some((section) => section.body.includes(anchor)),
  );
  if (missingScopedAnchors.length > 0) {
    fail(
      `${label} section "${heading}" missing required anchors; each must appear under this heading, not just anywhere in the file:\n${formatAnchorList(missingScopedAnchors)}`,
    );
  }
}

for (const budget of skillBudgets) {
  assertSkillBudget(budget);
}
assertRequiredDisclosureAssetsExist();
assertRequiredReferenceAdmissionHeaders();
assertSubcommandExecutionContracts();
assertPackageArtifactIncludes();

for (const root of skillPayloadRoots) {
  assertTemplateRequiredFields({
    label: root,
    relativePath: `${root}/templates/issue-body.md`,
    fields: requiredIssueTemplateFields,
  });
  assertTemplateRequiredFields({
    label: root,
    relativePath: `${root}/templates/epic-body.md`,
    fields: requiredEpicTemplateFields,
  });
}

verifySkillFile(skillPath, {
  label: ".codex/skills/ddalggak/SKILL.md",
  hotPathAnchors: requiredSkillHotPathAnchors,
});

verifySkillFile(claudeSkillPath, {
  label: "ddalggak/SKILL.md",
  hotPathAnchors: requiredClaudeSkillHotPathAnchors,
});

assertForbiddenHotPathTemplateSentinels({
  label: ".codex/skills/ddalggak/SKILL.md",
  text: readText(skillPath),
});
assertForbiddenHotPathTemplateSentinels({
  label: "ddalggak/SKILL.md",
  text: readText(claudeSkillPath),
});

for (const referencePath of routerReferencePaths) {
  const label = path.relative(rootDir, referencePath);
  if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${label} must exist for Quality Lens Router parity.`);
    continue;
  }

  const referenceText = readText(referencePath);
  const missingGateFamilies = requiredRouterGateFamilies.filter(
    (gateFamily) => !referenceText.includes(`\`${gateFamily}\``),
  );
  if (missingGateFamilies.length > 0) {
    fail(
      `Quality Lens Router gate families missing from ${label}:\n${missingGateFamilies
        .map((gateFamily) => `  - ${gateFamily}`)
        .join("\n")}`,
    );
  }

  assertReferenceAnchors({
    label: `Quality Lens Router acceptance anchors missing from ${label}`,
    text: referenceText,
    anchors: requiredRouterReferenceAnchors,
  });
}

for (const referencePath of evidenceReferencePaths) {
  const label = path.relative(rootDir, referencePath);
  if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${label} must exist for Evidence Contract parity.`);
    continue;
  }

  const referenceText = readText(referencePath);
  assertReferenceAnchors({
    label: `Evidence Contract anchors missing from ${label}`,
    text: referenceText,
    anchors: requiredEvidenceReferenceAnchors,
  });
}

const [codexSimplicityPath, claudeSimplicityPath] = simplicityReferencePaths;
const codexSimplicityExists = statSync(codexSimplicityPath, { throwIfNoEntry: false })?.isFile();
const claudeSimplicityExists = statSync(claudeSimplicityPath, { throwIfNoEntry: false })?.isFile();
if (!codexSimplicityExists) {
  fail(`${path.relative(rootDir, codexSimplicityPath)} must exist for Simplicity / Deletability Gate parity.`);
}
if (!claudeSimplicityExists) {
  fail(`${path.relative(rootDir, claudeSimplicityPath)} must exist for Simplicity / Deletability Gate parity.`);
}
if (codexSimplicityExists && claudeSimplicityExists) {
  const codexSimplicityText = readText(codexSimplicityPath);
  const claudeSimplicityText = readText(claudeSimplicityPath);
  if (codexSimplicityText !== claudeSimplicityText) {
    fail("Simplicity / Deletability Gate references must match between .codex and ddalggak directories.");
  }
  assertReferenceAnchors({
    label: "Simplicity / Deletability Gate anchors missing",
    text: codexSimplicityText,
    anchors: requiredSimplicityReferenceAnchors,
  });
}

const [codexFrontendDesignPath, claudeFrontendDesignPath] = frontendDesignReferencePaths;
const codexFrontendDesignExists = statSync(codexFrontendDesignPath, { throwIfNoEntry: false })?.isFile();
const claudeFrontendDesignExists = statSync(claudeFrontendDesignPath, { throwIfNoEntry: false })?.isFile();
if (!codexFrontendDesignExists) {
  fail(`${path.relative(rootDir, codexFrontendDesignPath)} must exist for Frontend Design Gate parity.`);
}
if (!claudeFrontendDesignExists) {
  fail(`${path.relative(rootDir, claudeFrontendDesignPath)} must exist for Frontend Design Gate parity.`);
}
if (codexFrontendDesignExists && claudeFrontendDesignExists) {
  const codexFrontendDesignText = readText(codexFrontendDesignPath);
  const claudeFrontendDesignText = readText(claudeFrontendDesignPath);
  if (codexFrontendDesignText !== claudeFrontendDesignText) {
    fail("Frontend Design Gate references must match between .codex and ddalggak directories.");
  }
  const missingFrontendDesignAnchors = requiredFrontendDesignReferenceAnchors.filter(
    (anchor) => !codexFrontendDesignText.includes(anchor),
  );
  if (missingFrontendDesignAnchors.length > 0) {
    fail(
      `Frontend Design Gate anchors missing:\n${missingFrontendDesignAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
}

const [codexVercelAgentSkillsPath, claudeVercelAgentSkillsPath] = vercelAgentSkillsReferencePaths;
const codexVercelAgentSkillsExists = statSync(codexVercelAgentSkillsPath, { throwIfNoEntry: false })?.isFile();
const claudeVercelAgentSkillsExists = statSync(claudeVercelAgentSkillsPath, { throwIfNoEntry: false })?.isFile();
if (!codexVercelAgentSkillsExists) {
  fail(`${path.relative(rootDir, codexVercelAgentSkillsPath)} must exist for Vercel Agent Skills Gate parity.`);
}
if (!claudeVercelAgentSkillsExists) {
  fail(`${path.relative(rootDir, claudeVercelAgentSkillsPath)} must exist for Vercel Agent Skills Gate parity.`);
}
if (codexVercelAgentSkillsExists && claudeVercelAgentSkillsExists) {
  const codexVercelAgentSkillsText = readText(codexVercelAgentSkillsPath);
  const claudeVercelAgentSkillsText = readText(claudeVercelAgentSkillsPath);
  if (codexVercelAgentSkillsText !== claudeVercelAgentSkillsText) {
    fail("Vercel Agent Skills Gate references must match between .codex and ddalggak directories.");
  }
  const missingVercelAgentSkillsAnchors = requiredVercelAgentSkillsReferenceAnchors.filter(
    (anchor) => !codexVercelAgentSkillsText.includes(anchor),
  );
  if (missingVercelAgentSkillsAnchors.length > 0) {
    fail(
      `Vercel Agent Skills Gate anchors missing:\n${missingVercelAgentSkillsAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
}

const [codexRegressionLibraryPath, claudeRegressionLibraryPath] = regressionLibraryReferencePaths;
const codexRegressionLibraryExists = statSync(codexRegressionLibraryPath, { throwIfNoEntry: false })?.isFile();
const claudeRegressionLibraryExists = statSync(claudeRegressionLibraryPath, { throwIfNoEntry: false })?.isFile();
if (!codexRegressionLibraryExists) {
  fail(`${path.relative(rootDir, codexRegressionLibraryPath)} must exist for Continuous Regression Library parity.`);
}
if (!claudeRegressionLibraryExists) {
  fail(`${path.relative(rootDir, claudeRegressionLibraryPath)} must exist for Continuous Regression Library parity.`);
}
if (codexRegressionLibraryExists && claudeRegressionLibraryExists) {
  const codexRegressionLibraryText = readText(codexRegressionLibraryPath);
  const claudeRegressionLibraryText = readText(claudeRegressionLibraryPath);
  if (codexRegressionLibraryText !== claudeRegressionLibraryText) {
    fail("Continuous Regression Library references must match between .codex and ddalggak directories.");
  }
  const missingRegressionLibraryAnchors = requiredRegressionLibraryReferenceAnchors.filter(
    (anchor) => !codexRegressionLibraryText.includes(anchor),
  );
  if (missingRegressionLibraryAnchors.length > 0) {
    fail(
      `Continuous Regression Library anchors missing:\n${missingRegressionLibraryAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
  for (const className of requiredRegressionLibraryClasses) {
    const section = extractMarkdownSection(codexRegressionLibraryText, className);
    if (!section) {
      fail(`Continuous Regression Library class missing: ${className}`);
      continue;
    }
    const missingFields = requiredRegressionLibraryFields.filter(
      (field) => !section.includes(`- ${field}`),
    );
    if (missingFields.length > 0) {
      fail(
        `Continuous Regression Library class ${className} missing fields:\n${missingFields
          .map((field) => `  - ${field}`)
          .join("\n")}`,
      );
    }
  }
}

const [codexAgentRuntimePath, claudeAgentRuntimePath] = agentRuntimeContractReferencePaths;
const codexAgentRuntimeExists = statSync(codexAgentRuntimePath, { throwIfNoEntry: false })?.isFile();
const claudeAgentRuntimeExists = statSync(claudeAgentRuntimePath, { throwIfNoEntry: false })?.isFile();
if (!codexAgentRuntimeExists) {
  fail(`${path.relative(rootDir, codexAgentRuntimePath)} must exist for Agent Runtime Contract parity.`);
}
if (!claudeAgentRuntimeExists) {
  fail(`${path.relative(rootDir, claudeAgentRuntimePath)} must exist for Agent Runtime Contract parity.`);
}
if (codexAgentRuntimeExists && claudeAgentRuntimeExists) {
  const codexAgentRuntimeText = readText(codexAgentRuntimePath);
  const claudeAgentRuntimeText = readText(claudeAgentRuntimePath);
  if (codexAgentRuntimeText !== claudeAgentRuntimeText) {
    fail("Agent Runtime Contract references must match between .codex and ddalggak directories.");
  }
  const missingAgentRuntimeAnchors = requiredAgentRuntimeContractAnchors.filter(
    (anchor) => !codexAgentRuntimeText.includes(anchor),
  );
  if (missingAgentRuntimeAnchors.length > 0) {
    fail(
      `Agent Runtime Contract anchors missing:\n${missingAgentRuntimeAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
}

const [codexCoreInvariantPath, claudeCoreInvariantPath] = coreInvariantReferencePaths;
const codexCoreInvariantExists = statSync(codexCoreInvariantPath, { throwIfNoEntry: false })?.isFile();
const claudeCoreInvariantExists = statSync(claudeCoreInvariantPath, { throwIfNoEntry: false })?.isFile();
if (!codexCoreInvariantExists) {
  fail(`${path.relative(rootDir, codexCoreInvariantPath)} must exist for Core Invariants parity.`);
}
if (!claudeCoreInvariantExists) {
  fail(`${path.relative(rootDir, claudeCoreInvariantPath)} must exist for Core Invariants parity.`);
}
if (codexCoreInvariantExists && claudeCoreInvariantExists) {
  const codexCoreInvariantText = readText(codexCoreInvariantPath);
  const claudeCoreInvariantText = readText(claudeCoreInvariantPath);
  if (codexCoreInvariantText !== claudeCoreInvariantText) {
    fail("Core Invariants references must match between .codex and ddalggak directories.");
  }
  assertReferenceAnchors({
    label: "Core Invariants anchors missing",
    text: codexCoreInvariantText,
    anchors: requiredCoreInvariantReferenceAnchors,
  });
}

for (const referencePath of promptOptimizerReferencePaths) {
  const label = path.relative(rootDir, referencePath);
  if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${label} must exist for Prompt Safety / Brief Compiler parity.`);
    continue;
  }

  const referenceText = readText(referencePath);
  assertReferenceAnchors({
    label: `Prompt Safety / Brief Compiler anchors missing from ${label}`,
    text: referenceText,
    anchors: requiredPromptSafetyReferenceAnchors,
  });
}

const [codexWikiBridgePath, claudeWikiBridgePath] = wikiBridgeReferencePaths;
const codexWikiBridgeExists = statSync(codexWikiBridgePath, { throwIfNoEntry: false })?.isFile();
const claudeWikiBridgeExists = statSync(claudeWikiBridgePath, { throwIfNoEntry: false })?.isFile();
if (!codexWikiBridgeExists) {
  fail(`${path.relative(rootDir, codexWikiBridgePath)} must exist for Wiki Bridge parity.`);
}
if (!claudeWikiBridgeExists) {
  fail(`${path.relative(rootDir, claudeWikiBridgePath)} must exist for Wiki Bridge parity.`);
}
if (codexWikiBridgeExists && claudeWikiBridgeExists) {
  const codexWikiBridgeText = readText(codexWikiBridgePath);
  const claudeWikiBridgeText = readText(claudeWikiBridgePath);
  if (codexWikiBridgeText !== claudeWikiBridgeText) {
    fail("Wiki Bridge references must match between .codex and ddalggak directories.");
  }
  assertReferenceAnchors({
    label: "Wiki Bridge anchors missing",
    text: codexWikiBridgeText,
    anchors: requiredWikiBridgeReferenceAnchors,
  });
}

const minSubstantiveSectionBodyChars = 40;
// Known pre-existing index-style heading with an intentionally empty body (#214 audit finding).
// The document itself is must-not-touch in #214; do not extend this list without an issue reference.
const allowedEmptySectionBodies = new Set(["regression-library.md :: Existing failure classes"]);
const substantiveSectionReferencePaths = [
  ...new Set([
    ...requiredDisclosureAssetPaths()
      .filter((assetPath) => assetPath.includes("/references/"))
      .map((assetPath) => path.join(rootDir, assetPath)),
    ...routerReferencePaths,
    ...evidenceReferencePaths,
    ...simplicityReferencePaths,
    ...frontendDesignReferencePaths,
    ...vercelAgentSkillsReferencePaths,
    ...regressionLibraryReferencePaths,
    ...agentRuntimeContractReferencePaths,
    ...coreInvariantReferencePaths,
    ...promptOptimizerReferencePaths,
    ...wikiBridgeReferencePaths,
  ]),
];
for (const referencePath of substantiveSectionReferencePaths) {
  // Missing required files are already reported by the existence checks above.
  if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
    continue;
  }
  assertSubstantiveSectionBodies({
    label: path.relative(rootDir, referencePath),
    fileName: path.basename(referencePath),
    text: readText(referencePath),
  });
}

// Section-scoped anchor contracts: the heading must exist and the anchor must live under it.
// A matching string elsewhere in the file must not satisfy these. Manifest arrays stay file-wide
// for backward compatibility; this layer pins the anchors that are only meaningful inside their section.
const referenceSectionAnchorContracts = [
  {
    referencePaths: routerReferencePaths,
    sections: [
      {
        heading: "Gate Families",
        anchors: requiredRouterGateFamilies.map((gateFamily) => `\`${gateFamily}\``),
      },
      {
        heading: "Required Reference Mapping",
        anchors: [
          "`references/frontend-design-gate.md`",
          "`references/react-code-quality-harness.md`",
          "`references/vercel-agent-skills-gates.md`",
          "`references/simplicity-deletability-gate.md`",
          "`references/evidence-contract.md`",
          "`references/regression-library.md`",
        ],
      },
      {
        heading: "Priority Order",
        anchors: ["This priority is exact"],
      },
    ],
  },
  {
    referencePaths: evidenceReferencePaths,
    sections: [
      {
        heading: "Evidence Templates",
        anchors: [
          "UI/design/frontend",
          "Deploy/release/env",
          "Performance",
          "Bugfix/regression",
          "Security/auth/privacy",
          "Data/API/backend",
        ],
      },
      {
        heading: "Missing Evidence Severity",
        anchors: ["not-applicable: <reason>", "High"],
      },
      {
        heading: "Approval Rule",
        anchors: ["APPROVE", "not-applicable: <reason>"],
      },
    ],
  },
];
for (const { referencePaths, sections } of referenceSectionAnchorContracts) {
  for (const referencePath of referencePaths) {
    if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
      continue;
    }
    const label = path.relative(rootDir, referencePath);
    const parsedSections = parseMarkdownSections(readText(referencePath));
    for (const { heading, anchors } of sections) {
      assertSectionScopedAnchors({ label, parsedSections, heading, anchors });
    }
  }
}

const readmeText = readText(readmePath);
const missingReadmeQualityAnchors = requiredReadmeQualityAnchors.filter(
  (anchor) => !readmeText.includes(anchor),
);
if (missingReadmeQualityAnchors.length > 0) {
  fail(
    `README Quality Defaults anchors missing:\n${missingReadmeQualityAnchors
      .map((anchor) => `  - ${anchor}`)
      .join("\n")}`,
  );
}

const packageJson = JSON.parse(readText(packagePath));
const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
if (!packageFiles.includes(".codex/")) {
  fail('package.json files must include ".codex/".');
}

const cliText = readText(cliPath);
const helpResult = spawnSync(process.execPath, [cliPath, "--help"], {
  cwd: rootDir,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
});
if (helpResult.status !== 0) {
  fail(`bin/ddalggak.js --help must run successfully. stderr:\n${helpResult.stderr}`);
}
const cliSubcommands = extractCliHelpSubcommands(helpResult.stdout);
if (!arraysEqual(cliSubcommands, requiredSubcommands)) {
  fail(
    `CLI help subcommands drifted. Expected ${requiredSubcommands.join(", ")}; got ${cliSubcommands.join(", ")}`
  );
}

const dispatchText = readText(dispatchPath);
const docSectionMap = extractDocSectionMap(dispatchText);
if (!docSectionMap) {
  fail("bin/lib/dispatch.mjs must define DOC_SECTION.");
} else {
  const docSectionKeys = Object.keys(docSectionMap);
  if (!arraysEqual(docSectionKeys, requiredSubcommands)) {
    fail(
      `DOC_SECTION keys drifted. Expected ${requiredSubcommands.join(", ")}; got ${docSectionKeys.join(", ")}`
    );
  }
  for (const subcommand of requiredSubcommands) {
    if (docSectionMap[subcommand] !== requiredClaudeHeadings[subcommand]) {
      fail(
        `DOC_SECTION.${subcommand} must map to "${requiredClaudeHeadings[subcommand]}".`
      );
    }
  }
}

const claudeSkillText = statSync(claudeSkillPath, { throwIfNoEntry: false })?.isFile()
  ? readText(claudeSkillPath)
  : "";
for (const [subcommand, heading] of Object.entries(requiredClaudeHeadings)) {
  if (!claudeSkillText.includes(`## ${heading}`)) {
    fail(`ddalggak/SKILL.md must include ## ${heading} for '${subcommand}'.`);
  }
}

const compactShowDocContracts = {
  plan: [
    "Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.",
    "references/wiki-bridge.md",
    "Execution contract index:",
    "Quality Lens Router Output",
    "Evidence Contract",
    "Simplicity / Deletability Gate",
    "Frontend/Vercel/Regression details only when applicable",
    "one PR per issue by default",
    "conflict fallback only with proof",
    "Parallelization Decision",
    "Must not touch",
    "evidence",
    "commit message",
  ],
  start: [
    "Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.",
    "Execution contract index:",
    "Quality Lens Router",
    "Evidence Contract",
    "Simplicity / Deletability",
    "Core Invariants",
    "frontend/vercel/regression only when applicable",
    "allowed, forbidden, inspect-only, Must not touch",
    "one issue PR by default",
    "hard-conflict fallback only with reason",
    "commit/push/PR/evidence/blocking gaps",
  ],
  review: [
    "Full procedure: `references/cross-review-loop.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; reusable prompt: `templates/review-brief.md`.",
    "Execution contract index:",
    "live PR state",
    "diff/files/checks",
    "linked issue",
    "current head SHA",
    "wiki-context preflight",
    "Quality Lens Router",
    "Evidence Contract",
    "Simplicity / Deletability",
    "Core Invariants",
    "conditional frontend/vercel/regression gates",
    "top-level comment with SHA",
    "validation",
    "conclusion",
  ],
};
for (const [subcommand, anchors] of Object.entries(compactShowDocContracts)) {
  const heading = requiredClaudeHeadings[subcommand];
  const section = extractClaudeSection(claudeSkillText, heading);
  for (const anchor of anchors) {
    if (!section.includes(anchor)) {
      fail(`ddalggak ${subcommand} --show-doc compact contract missing anchor: ${anchor}`);
    }
  }
  for (const forbiddenHeading of [
    "### Quality Lens Router Output",
    "### Evidence Contract",
    "### Frontend Design Brief",
    "### Vercel Agent Skills Gate",
  ]) {
    if (section.includes(forbiddenHeading)) {
      fail(`ddalggak ${subcommand} --show-doc must keep ${forbiddenHeading} detail in references/templates, not inline.`);
    }
  }
}

const codexSkillText = statSync(skillPath, { throwIfNoEntry: false })?.isFile()
  ? readText(skillPath)
  : "";
assertRenderedSubcommandContracts({
  label: ".codex/skills/ddalggak/SKILL.md",
  text: codexSkillText,
});
assertRenderedSubcommandContracts({
  label: "ddalggak/SKILL.md",
  text: claudeSkillText,
});
const codexCompactSubcommandContracts = {
  plan: [
    "Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.",
    "references/wiki-bridge.md",
    "Execution contract index:",
    "Quality Lens Router Output",
    "Evidence Contract",
    "Simplicity / Deletability Gate",
    "one issue PR by default",
    "conflict fallback only with proof",
    "Parallelization Decision",
    "Must not touch",
  ],
  start: [
    "Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.",
    "Execution contract index:",
    "Quality Lens Router Output",
    "Evidence Contract",
    "Simplicity / Deletability Gate",
    "allowed/forbidden/inspect-only/Must not touch",
    "one issue PR by default",
    "hard-conflict fallback only with reason",
    "validation/PR evidence",
  ],
  review: [
    "Full procedure: `references/cross-review-loop.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; reusable prompt: `templates/review-brief.md`.",
    "Execution contract index:",
    "live PR/diff/files/checks/issue/head SHA",
    "Wiki Context Preflight",
    "Quality Lens Router Output",
    "Evidence Contract",
    "Simplicity / Deletability Gate",
    "conditional frontend/Vercel/regression gates",
    "top-level conclusion comment",
  ],
};
const codexCompactHeadings = {
  plan: "`plan` - Issue-Ready Plan",
  start: "`start` - Issue-Based Implementation",
  review: "`review` - Cross-Review Loop",
};
for (const [subcommand, anchors] of Object.entries(codexCompactSubcommandContracts)) {
  const section = extractMarkdownSection(codexSkillText, codexCompactHeadings[subcommand]);
  for (const anchor of anchors) {
    if (!section.includes(anchor)) {
      fail(`.codex/skills/ddalggak/SKILL.md ${subcommand} compact contract missing anchor: ${anchor}`);
    }
  }
}

const issueSection = extractClaudeSection(claudeSkillText, requiredClaudeHeadings.issue);
for (const issueCommitLaneAnchor of ["Owned files", "Must not touch", "Parallelization note", "Commit lane suggestion", "Validation/evidence", "Dependencies / blocked by"]) {
  if (!issueSection.includes(issueCommitLaneAnchor)) {
    fail(`ddalggak issue --show-doc section must preserve commit-lane issue fields (${issueCommitLaneAnchor}).`);
  }
}

assertForbiddenTermsAbsent({
  label: "ddalggak start --show-doc section",
  text: extractClaudeSection(claudeSkillText, requiredClaudeHeadings.start),
  terms: [
    "PUSHED:",
    "PR URL 출력",
    "git add → commit → push → gh pr create",
    "commit/push/draft PR까지 완료",
    "PR 링크 요약",
    "PR이 열렸으면",
    "push/PR만 빠진 경우",
    "gh pr create --draft --base",
    "Wave",
    "wave",
    "복수 PR merge",
  ],
});

assertForbiddenTermsAbsent({
  label: "ddalggak plan --show-doc section",
  text: extractClaudeSection(claudeSkillText, requiredClaudeHeadings.plan),
  terms: [
    "Wave",
    "wave",
    "복수 PR merge",
    "별도 wave",
    "같은 wave",
  ],
});

assertForbiddenTermsAbsent({
  label: "ddalggak issue --show-doc section",
  text: issueSection,
  terms: [
    "Wave",
    "wave",
    "Wave 1",
    "Wave 2",
    "Wave 단위",
    "모든 sub-issue merge",
    "/multi-issue-executor",
    "복수 PR merge",
    "| # | 제목 | 파일 | Wave | Blockers | 상태 |",
  ],
});

assertForbiddenTermsAbsent({
  label: "Codex skill",
  text: readText(skillPath),
  terms: [
    "PRs in the same wave",
    "tests, commit, push, draft PR",
    "worker repeatedly idles after commit without push or PR",
    '"phase": "wave-1"',
    '"pr_url"',
    "`pr_opened`",
    "`pr_review_approved`",
    "merge-order context",
    "one PR per lane unless",
    "do not create stacked PRs, branch matrices, or lane-specific PRs",
    "Lane-specific/per-issue PRs are required",
    "without creating lane PRs",
  ],
});

assertForbiddenTermsAbsent({
  label: "ddalggak Claude skill unconditional lane-specific PR prohibition",
  text: claudeSkillText,
  terms: [
    "Worker는 lane-specific PR을 만들지 않는다.",
    "content=\"BRIEF.md(.worktrees/<branch>/BRIEF.md)를 읽고 지시된 대로 구현해. 완료 후 한 줄: LANE_READY: Phase Y W<번호> <patch-or-commit> <validation>\"",
    "모든 워커가 `LANE_READY:` 출력 나오면 lane 초안 수집 완료",
  ],
});

if (statSync(skillDir, { throwIfNoEntry: false })?.isDirectory()) {
  const bannedHits = [];
  for (const filePath of listFiles(skillDir)) {
    const text = readText(filePath);
    for (const term of bannedTerms) {
      const count = countOccurrences(text, term);
      if (count > 0) {
        bannedHits.push({
          file: path.relative(rootDir, filePath),
          term,
          count,
        });
      }
    }
  }

  if (bannedHits.length > 0) {
    const details = bannedHits
      .map((hit) => `${hit.file}: ${hit.term} x${hit.count}`)
      .join("\n");
    fail(`banned Claude primitive leftovers must be zero:\n${details}`);
  }
}

const projectionVerifier = spawnSync(process.execPath, ["scripts/verify-projections.mjs"], {
  cwd: rootDir,
  encoding: "utf8",
});
if (projectionVerifier.status !== 0) {
  fail(
    `projection-aware verifier failed with exit ${projectionVerifier.status}:\n${projectionVerifier.stdout || ""}${projectionVerifier.stderr || ""}`,
  );
} else if (projectionVerifier.stdout) {
  process.stdout.write(projectionVerifier.stdout);
}

if (failures.length > 0) {
  console.error("[verify:codex-skill] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

for (const metric of skillBudgetMetrics) {
  console.log(
    `[verify:codex-skill] budget ${metric.label}: lines ${metric.lines}/${metric.maxLines}, chars ${metric.chars}/${metric.maxChars}, principle bullets ${metric.principleBullets}/${metric.maxPrincipleBullets}, inline subcommand anchors ${metric.inlineSubcommandAnchors}/${metric.maxInlineSubcommandAnchors}`,
  );
}
console.log("[verify:codex-skill] passed");
