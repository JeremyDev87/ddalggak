import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const skillDir = path.join(rootDir, ".codex", "skills", "ddalggak");
const skillPath = path.join(skillDir, "SKILL.md");
const legacySkillPath = path.join(rootDir, "ddalggak", "SKILL.md");
const packagePath = path.join(rootDir, "package.json");
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

const packageJson = JSON.parse(readText(packagePath));
const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
if (!packageFiles.includes(".codex/")) {
  fail('package.json files must include ".codex/".');
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
