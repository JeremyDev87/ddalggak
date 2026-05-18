import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

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
const packagePath = path.join(rootDir, "package.json");
const cliPath = path.join(rootDir, "bin", "ddalggak.js");
const dispatchPath = path.join(rootDir, "bin", "lib", "dispatch.mjs");
const requiredSubcommands = [
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
];
const requiredLegacyHeadings = {
  start: "Start Workflow",
  review: "Cross-Review Loop",
  status: "Status",
  plan: "Issue-Ready Plan",
  issue: "Plan to Issues",
  clean: "Merge Cleanup",
  ship: "Ship",
  retro: "Retrospective",
  prompt: "Prompt Optimizer",
  check: "Local Diff Check",
};
const bannedTerms = [
  "TeamCreate",
  "SendMessage",
  "TaskList",
  "TaskGet",
  "TaskOutput",
  "ScheduleWakeup",
  "AskUserQuestion",
  ".claude",
  "CLAUDE.md",
  "teammate",
];
const requiredSkillAnchors = [
  "knowledge extraction",
  "harness-engineering/*",
  "principles/*",
  "frontend/*",
  "llm-wiki/*",
  "rendered evidence",
  "route evidence",
  "viewport evidence",
  "rendered DOM evidence",
  "screenshot evidence",
  "fallback evidence",
  "contract graph evidence",
  "not-applicable",
  "Analytics privacy",
  "raw search terms",
  "prompt titles",
  "full query strings",
  "Transitive rendered fallback",
  "PR numbers",
  "commit SHAs",
  "single-session completion logs",
  "incident records",
  "durable reusable knowledge",
  "Self-created complexity is a defect",
  "forced modularization",
  "Client-side patches",
  "mock-only tests",
  "Quality Lens Router",
  "Quality Lens Router Output",
  "Applicable gate families",
  "Skipped gates",
  "Repo/product conventions",
  "frontend-design",
  "backend-only",
  "Evidence Contract",
  "references/evidence-contract.md",
  "Blocking evidence gaps",
  "No evidence, no readiness or approval",
  "Simplicity / Deletability Gate",
  "references/simplicity-deletability-gate.md",
  "small direct change first",
  "why any proposed abstraction is necessary",
  "one-off abstraction",
  "human readability",
  "SOLID",
];
const requiredLegacySkillAnchors = [
  "Rendered evidence gate",
  "route evidence",
  "viewport evidence",
  "rendered DOM evidence",
  "screenshot evidence",
  "fallback evidence",
  "contract graph evidence",
  "Transitive rendered fallback audit",
  "list/detail surface",
  "shared card/media primitive",
  "Analytics/privacy allowlist·denylist",
  "raw search terms",
  "prompt titles/bodies",
  "full query strings",
  "harness-engineering/*",
  "principles/*",
  "frontend/*",
  "llm-wiki/*",
  "PR numbers",
  "commit SHAs",
  "single-session completion logs",
  "incident records",
  "durable reusable knowledge",
  "Self-created complexity is a defect",
  "forced modularization",
  "client-side patch",
  "mock-only tests",
  "Quality Lens Router",
  "Quality Lens Router Output",
  "Applicable gate families",
  "Skipped gates",
  "Repo/product conventions",
  "frontend-design",
  "backend-only",
  "Evidence Contract",
  "references/evidence-contract.md",
  "Blocking evidence gaps",
  "PR ready/APPROVE",
  "Simplicity / Deletability Gate",
  "references/simplicity-deletability-gate.md",
  "small direct change first",
  "why is this abstraction necessary?",
  "one-off abstraction",
  "human readability/deletability",
  "SOLID",
];

const requiredRouterGateFamilies = [
  "frontend-design",
  "vercel-agent-skills",
  "react-next-boundary-performance",
  "composition-api",
  "motion-meaning",
  "web-design-a11y-evidence",
  "deploy-token-safety",
  "react-native-expo",
  "tdd-systematic-debugging",
  "simplicity-deletability",
  "evidence-contract",
  "regression-library",
];
const requiredRouterReferenceAnchors = [
  "behavior/type tests",
  "concrete usage evidence",
  "internal plumbing",
];
const requiredEvidenceReferenceAnchors = [
  "Evidence Contract",
  "UI/design/frontend",
  "Deploy/release/env",
  "Performance",
  "Bugfix/regression",
  "Security/auth/privacy",
  "Data/API/backend",
  "not-applicable: <reason>",
  "High",
  "APPROVE",
];
const requiredSimplicityReferenceAnchors = [
  "Simplicity / Deletability Gate",
  "small direct change first",
  "Why is this abstraction necessary?",
  "one-off abstraction",
  "default severity: High",
  "human readability",
  "SOLID",
  "do not outrank human readability",
  "client-side patch",
  "Non-Goals",
];

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


function extractLegacySection(text, heading) {
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

function verifySkillFile(filePath, { label, requiredAnchors }) {
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

  const missingAnchors = requiredAnchors.filter(
    (anchor) => !skillText.includes(anchor),
  );
  if (missingAnchors.length > 0) {
    fail(
      `guardrail anchors missing from ${label}:\n${missingAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
}

verifySkillFile(skillPath, {
  label: ".codex/skills/ddalggak/SKILL.md",
  requiredAnchors: requiredSkillAnchors,
});

verifySkillFile(legacySkillPath, {
  label: "ddalggak/SKILL.md",
  requiredAnchors: requiredLegacySkillAnchors,
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

  const missingReferenceAnchors = requiredRouterReferenceAnchors.filter(
    (anchor) => !referenceText.includes(anchor),
  );
  if (missingReferenceAnchors.length > 0) {
    fail(
      `Quality Lens Router acceptance anchors missing from ${label}:\n${missingReferenceAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
}

for (const referencePath of evidenceReferencePaths) {
  const label = path.relative(rootDir, referencePath);
  if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`${label} must exist for Evidence Contract parity.`);
    continue;
  }

  const referenceText = readText(referencePath);
  const missingEvidenceAnchors = requiredEvidenceReferenceAnchors.filter(
    (anchor) => !referenceText.includes(anchor),
  );
  if (missingEvidenceAnchors.length > 0) {
    fail(
      `Evidence Contract anchors missing from ${label}:\n${missingEvidenceAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
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
  const missingSimplicityAnchors = requiredSimplicityReferenceAnchors.filter(
    (anchor) => !codexSimplicityText.includes(anchor),
  );
  if (missingSimplicityAnchors.length > 0) {
    fail(
      `Simplicity / Deletability Gate anchors missing:\n${missingSimplicityAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }
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

const requiredRouterSubcommands = ["plan", "start", "review"];
for (const subcommand of requiredRouterSubcommands) {
  const heading = requiredLegacyHeadings[subcommand];
  const section = extractLegacySection(legacySkillText, heading);
  if (!section.includes("Quality Lens Router Output")) {
    fail(`ddalggak ${subcommand} --show-doc section must expose Quality Lens Router Output.`);
  }
  if (!section.includes("Evidence Contract")) {
    fail(`ddalggak ${subcommand} --show-doc section must expose Evidence Contract.`);
  }
  if (!section.includes("Simplicity / Deletability")) {
    fail(`ddalggak ${subcommand} --show-doc section must expose Simplicity / Deletability Gate.`);
  }
  if (subcommand === "plan" && !section.includes("why is this abstraction necessary?")) {
    fail("ddalggak plan --show-doc section must expose the abstraction necessity question.");
  }
  if (subcommand === "start" && !section.includes("small direct change first")) {
    fail("ddalggak start --show-doc section must expose small direct change first.");
  }
  if (subcommand === "review") {
    for (const reviewAnchor of ["one-off abstraction", "human readability"]) {
      if (!section.includes(reviewAnchor)) {
        fail(`ddalggak review --show-doc section must expose ${reviewAnchor}.`);
      }
    }
  }
}

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

if (failures.length > 0) {
  console.error("[verify:codex-skill] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("[verify:codex-skill] passed");
