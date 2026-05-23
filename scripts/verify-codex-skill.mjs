import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  requiredDisclosureAssetsBySubcommand,
  requiredIssueTemplateFields,
  requiredEpicTemplateFields,
  skillPayloadRoots,
  requiredPackageFiles,
  forbiddenHotPathTemplateSentinels,
  requiredSubcommands,
  requiredLegacyHeadings,
  bannedTerms,
  requiredSkillHotPathAnchors,
  requiredLegacySkillHotPathAnchors,
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
  requiredWikiBridgeReferenceAnchors,
  requiredReadmeQualityAnchors,
} from "../core/verification/skill-contract-manifest.mjs";
const rootDir = process.cwd();
const skillDir = path.join(rootDir, ".codex", "skills", "ddalggak");
const skillPath = path.join(skillDir, "SKILL.md");
const legacySkillPath = path.join(rootDir, "ddalggak", "SKILL.md");
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
    maxInlineSubcommandAnchors: 20,
  },
  {
    label: "ddalggak/SKILL.md",
    filePath: legacySkillPath,
    maxLines: 700,
    maxChars: 45_000,
    principleHeadings: ["핵심 원칙", "myWiki-derived 운영 Guardrails"],
    maxPrincipleBullets: 30,
    maxInlineSubcommandAnchors: 60,
  },
];
const skillBudgetMetrics = [];

const failures = [];

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
  const pattern = new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m");
  const match = frontmatter.match(pattern);
  if (!match) {
    return null;
  }
  return match[1].replace(/^["']|["']$/g, "");
}

function extractStringArray(text, constName) {
  const pattern = new RegExp(String.raw`const ${constName} = \[([\s\S]*?)\];`);
  const match = text.match(pattern);
  if (!match) {
    return null;
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
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
      const legacyHeading = requiredLegacyHeadings[subcommand];
      return line.trim() === `## ${legacyHeading}` || line.startsWith(`## \`${subcommand}\``);
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

function extractLegacySection(text, heading) {
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

function missingAnchors(text, anchors) {
  return anchors.filter((anchor) => !text.includes(anchor));
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
}

function assertReferenceAnchors({ label, text, anchors }) {
  const missingReferenceAnchors = missingAnchors(text, anchors);
  if (missingReferenceAnchors.length > 0) {
    fail(
      `${label} reference anchors missing; preserve these details in the appropriate references/* file instead of re-expanding SKILL.md:\n${formatAnchorList(missingReferenceAnchors)}`,
    );
  }
}

for (const budget of skillBudgets) {
  assertSkillBudget(budget);
}
assertRequiredDisclosureAssetsExist();
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

verifySkillFile(legacySkillPath, {
  label: "ddalggak/SKILL.md",
  hotPathAnchors: requiredLegacySkillHotPathAnchors,
});

assertForbiddenHotPathTemplateSentinels({
  label: ".codex/skills/ddalggak/SKILL.md",
  text: readText(skillPath),
});
assertForbiddenHotPathTemplateSentinels({
  label: "ddalggak/SKILL.md",
  text: readText(legacySkillPath),
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

const [codexSimplicityPath, legacySimplicityPath] = simplicityReferencePaths;
const codexSimplicityExists = statSync(codexSimplicityPath, { throwIfNoEntry: false })?.isFile();
const legacySimplicityExists = statSync(legacySimplicityPath, { throwIfNoEntry: false })?.isFile();
if (!codexSimplicityExists) {
  fail(`${path.relative(rootDir, codexSimplicityPath)} must exist for Simplicity / Deletability Gate parity.`);
}
if (!legacySimplicityExists) {
  fail(`${path.relative(rootDir, legacySimplicityPath)} must exist for Simplicity / Deletability Gate parity.`);
}
if (codexSimplicityExists && legacySimplicityExists) {
  const codexSimplicityText = readText(codexSimplicityPath);
  const legacySimplicityText = readText(legacySimplicityPath);
  if (codexSimplicityText !== legacySimplicityText) {
    fail("Simplicity / Deletability Gate references must match between .codex and ddalggak directories.");
  }
  assertReferenceAnchors({
    label: "Simplicity / Deletability Gate anchors missing",
    text: codexSimplicityText,
    anchors: requiredSimplicityReferenceAnchors,
  });
}

const [codexFrontendDesignPath, legacyFrontendDesignPath] = frontendDesignReferencePaths;
const codexFrontendDesignExists = statSync(codexFrontendDesignPath, { throwIfNoEntry: false })?.isFile();
const legacyFrontendDesignExists = statSync(legacyFrontendDesignPath, { throwIfNoEntry: false })?.isFile();
if (!codexFrontendDesignExists) {
  fail(`${path.relative(rootDir, codexFrontendDesignPath)} must exist for Frontend Design Gate parity.`);
}
if (!legacyFrontendDesignExists) {
  fail(`${path.relative(rootDir, legacyFrontendDesignPath)} must exist for Frontend Design Gate parity.`);
}
if (codexFrontendDesignExists && legacyFrontendDesignExists) {
  const codexFrontendDesignText = readText(codexFrontendDesignPath);
  const legacyFrontendDesignText = readText(legacyFrontendDesignPath);
  if (codexFrontendDesignText !== legacyFrontendDesignText) {
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

const [codexVercelAgentSkillsPath, legacyVercelAgentSkillsPath] = vercelAgentSkillsReferencePaths;
const codexVercelAgentSkillsExists = statSync(codexVercelAgentSkillsPath, { throwIfNoEntry: false })?.isFile();
const legacyVercelAgentSkillsExists = statSync(legacyVercelAgentSkillsPath, { throwIfNoEntry: false })?.isFile();
if (!codexVercelAgentSkillsExists) {
  fail(`${path.relative(rootDir, codexVercelAgentSkillsPath)} must exist for Vercel Agent Skills Gate parity.`);
}
if (!legacyVercelAgentSkillsExists) {
  fail(`${path.relative(rootDir, legacyVercelAgentSkillsPath)} must exist for Vercel Agent Skills Gate parity.`);
}
if (codexVercelAgentSkillsExists && legacyVercelAgentSkillsExists) {
  const codexVercelAgentSkillsText = readText(codexVercelAgentSkillsPath);
  const legacyVercelAgentSkillsText = readText(legacyVercelAgentSkillsPath);
  if (codexVercelAgentSkillsText !== legacyVercelAgentSkillsText) {
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

const [codexRegressionLibraryPath, legacyRegressionLibraryPath] = regressionLibraryReferencePaths;
const codexRegressionLibraryExists = statSync(codexRegressionLibraryPath, { throwIfNoEntry: false })?.isFile();
const legacyRegressionLibraryExists = statSync(legacyRegressionLibraryPath, { throwIfNoEntry: false })?.isFile();
if (!codexRegressionLibraryExists) {
  fail(`${path.relative(rootDir, codexRegressionLibraryPath)} must exist for Continuous Regression Library parity.`);
}
if (!legacyRegressionLibraryExists) {
  fail(`${path.relative(rootDir, legacyRegressionLibraryPath)} must exist for Continuous Regression Library parity.`);
}
if (codexRegressionLibraryExists && legacyRegressionLibraryExists) {
  const codexRegressionLibraryText = readText(codexRegressionLibraryPath);
  const legacyRegressionLibraryText = readText(legacyRegressionLibraryPath);
  if (codexRegressionLibraryText !== legacyRegressionLibraryText) {
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

const [codexAgentRuntimePath, legacyAgentRuntimePath] = agentRuntimeContractReferencePaths;
const codexAgentRuntimeExists = statSync(codexAgentRuntimePath, { throwIfNoEntry: false })?.isFile();
const legacyAgentRuntimeExists = statSync(legacyAgentRuntimePath, { throwIfNoEntry: false })?.isFile();
if (!codexAgentRuntimeExists) {
  fail(`${path.relative(rootDir, codexAgentRuntimePath)} must exist for Agent Runtime Contract parity.`);
}
if (!legacyAgentRuntimeExists) {
  fail(`${path.relative(rootDir, legacyAgentRuntimePath)} must exist for Agent Runtime Contract parity.`);
}
if (codexAgentRuntimeExists && legacyAgentRuntimeExists) {
  const codexAgentRuntimeText = readText(codexAgentRuntimePath);
  const legacyAgentRuntimeText = readText(legacyAgentRuntimePath);
  if (codexAgentRuntimeText !== legacyAgentRuntimeText) {
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

const [codexCoreInvariantPath, legacyCoreInvariantPath] = coreInvariantReferencePaths;
const codexCoreInvariantExists = statSync(codexCoreInvariantPath, { throwIfNoEntry: false })?.isFile();
const legacyCoreInvariantExists = statSync(legacyCoreInvariantPath, { throwIfNoEntry: false })?.isFile();
if (!codexCoreInvariantExists) {
  fail(`${path.relative(rootDir, codexCoreInvariantPath)} must exist for Core Invariants parity.`);
}
if (!legacyCoreInvariantExists) {
  fail(`${path.relative(rootDir, legacyCoreInvariantPath)} must exist for Core Invariants parity.`);
}
if (codexCoreInvariantExists && legacyCoreInvariantExists) {
  const codexCoreInvariantText = readText(codexCoreInvariantPath);
  const legacyCoreInvariantText = readText(legacyCoreInvariantPath);
  if (codexCoreInvariantText !== legacyCoreInvariantText) {
    fail("Core Invariants references must match between .codex and ddalggak directories.");
  }
  assertReferenceAnchors({
    label: "Core Invariants anchors missing",
    text: codexCoreInvariantText,
    anchors: requiredCoreInvariantReferenceAnchors,
  });
}

const [codexWikiBridgePath, legacyWikiBridgePath] = wikiBridgeReferencePaths;
const codexWikiBridgeExists = statSync(codexWikiBridgePath, { throwIfNoEntry: false })?.isFile();
const legacyWikiBridgeExists = statSync(legacyWikiBridgePath, { throwIfNoEntry: false })?.isFile();
if (!codexWikiBridgeExists) {
  fail(`${path.relative(rootDir, codexWikiBridgePath)} must exist for Wiki Bridge parity.`);
}
if (!legacyWikiBridgeExists) {
  fail(`${path.relative(rootDir, legacyWikiBridgePath)} must exist for Wiki Bridge parity.`);
}
if (codexWikiBridgeExists && legacyWikiBridgeExists) {
  const codexWikiBridgeText = readText(codexWikiBridgePath);
  const legacyWikiBridgeText = readText(legacyWikiBridgePath);
  if (codexWikiBridgeText !== legacyWikiBridgeText) {
    fail("Wiki Bridge references must match between .codex and ddalggak directories.");
  }
  assertReferenceAnchors({
    label: "Wiki Bridge anchors missing",
    text: codexWikiBridgeText,
    anchors: requiredWikiBridgeReferenceAnchors,
  });
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
const cliSubcommands = extractStringArray(cliText, "SUBCOMMANDS");
if (!cliSubcommands) {
  fail("bin/ddalggak.js must define SUBCOMMANDS.");
} else if (!arraysEqual(cliSubcommands, requiredSubcommands)) {
  fail(
    `SUBCOMMANDS drifted. Expected ${requiredSubcommands.join(", ")}; got ${cliSubcommands.join(", ")}`
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
    if (docSectionMap[subcommand] !== requiredLegacyHeadings[subcommand]) {
      fail(
        `DOC_SECTION.${subcommand} must map to "${requiredLegacyHeadings[subcommand]}".`
      );
    }
  }
}

const legacySkillText = statSync(legacySkillPath, { throwIfNoEntry: false })?.isFile()
  ? readText(legacySkillPath)
  : "";
for (const [subcommand, heading] of Object.entries(requiredLegacyHeadings)) {
  if (!legacySkillText.includes(`## ${heading}`)) {
    fail(`ddalggak/SKILL.md must include ## ${heading} for '${subcommand}'.`);
  }
}

const compactShowDocContracts = {
  plan: [
    "Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`.",
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
    "Full procedure: `references/cross-review-loop.md`; reusable prompt: `templates/review-brief.md`.",
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
  const heading = requiredLegacyHeadings[subcommand];
  const section = extractLegacySection(legacySkillText, heading);
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
const codexCompactSubcommandContracts = {
  plan: [
    "Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`.",
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
    "Full procedure: `references/cross-review-loop.md`; reusable prompt: `templates/review-brief.md`.",
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

const issueSection = extractLegacySection(legacySkillText, requiredLegacyHeadings.issue);
for (const issueCommitLaneAnchor of ["Owned files", "Must not touch", "Parallelization note", "Commit lane suggestion", "Validation/evidence", "Dependencies / blocked by"]) {
  if (!issueSection.includes(issueCommitLaneAnchor)) {
    fail(`ddalggak issue --show-doc section must preserve commit-lane issue fields (${issueCommitLaneAnchor}).`);
  }
}

assertForbiddenTermsAbsent({
  label: "ddalggak start --show-doc section",
  text: extractLegacySection(legacySkillText, requiredLegacyHeadings.start),
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
  text: extractLegacySection(legacySkillText, requiredLegacyHeadings.plan),
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
  label: "ddalggak legacy skill unconditional lane-specific PR prohibition",
  text: legacySkillText,
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
