import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const commandDir = path.join(rootDir, "core", "commands");
const runtimeDir = path.join(rootDir, "core", "runtimes");
const projectionPath = path.join(rootDir, "core", "projections.yaml");
const dispatchPath = path.join(rootDir, "bin", "lib", "dispatch.mjs");
const sourceSkillRoot = path.join(rootDir, "ddalggak");
const codexSkillRoot = path.join(rootDir, ".codex", "skills", "ddalggak");

const requiredCommands = [
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

const failures = [];

function runGeneratedBlockCheck() {
  const result = spawnSync(
    process.execPath,
    ["scripts/project-runtime-assets.mjs", "--check"],
    {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    fail(
      `generated runtime asset projection drift detected:\n${result.stdout}${result.stderr}`.trimEnd(),
    );
  }
}

function fail(message) {
  failures.push(message);
}

function exists(filePath) {
  return Boolean(statSync(filePath, { throwIfNoEntry: false }));
}

function readText(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`missing or unreadable: ${path.relative(rootDir, filePath)} (${error.message})`);
    return "";
  }
}

function parseSimpleYaml(text) {
  const doc = {};
  let activeList = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      activeList = null;
      const [, key, rawValue] = top;
      const value = rawValue.trim();
      if (value === "") {
        doc[key] = [];
        activeList = key;
      } else if (value === "[]") {
        doc[key] = [];
      } else if (value === "true" || value === "false") {
        doc[key] = value === "true";
      } else {
        doc[key] = value.replace(/^"|"$/g, "");
      }
      continue;
    }

    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && activeList) {
      doc[activeList].push(listItem[1].trim().replace(/^"|"$/g, ""));
    }
  }
  return doc;
}

function extractDispatchSections() {
  const dispatchText = readText(dispatchPath);
  const mapMatch = dispatchText.match(/const DOC_SECTION = \{([\s\S]*?)\n\};/);
  if (!mapMatch) {
    fail("bin/lib/dispatch.mjs: DOC_SECTION map not found");
    return new Map();
  }

  const sections = new Map();
  const entryPattern = /([A-Za-z0-9_-]+):\s*"([^"]+)"/g;
  for (const match of mapMatch[1].matchAll(entryPattern)) {
    sections.set(match[1], match[2]);
  }
  return sections;
}

function assertSkillPayload(root, label, commandDoc) {
  if (!exists(path.join(root, "SKILL.md"))) {
    fail(`${label}: SKILL.md missing`);
  }

  for (const ref of commandDoc.required_references || []) {
    const refPath = path.join(root, "references", ref);
    if (!exists(refPath)) {
      fail(`${label}: required reference missing for ${commandDoc.command}: references/${ref}`);
    }
  }

  for (const template of commandDoc.required_templates || []) {
    const templatePath = path.join(root, "templates", template);
    if (!exists(templatePath)) {
      fail(`${label}: required template missing for ${commandDoc.command}: templates/${template}`);
    }
  }
}

runGeneratedBlockCheck();

const projectionsText = readText(projectionPath);
if (!projectionsText.includes("source_root: ddalggak")) {
  fail("core/projections.yaml must name ddalggak as source_root");
}
if (!projectionsText.includes(".codex/skills/ddalggak")) {
  fail("core/projections.yaml must include Codex skill projection root");
}
if (!projectionsText.includes("execution_runtime: false")) {
  fail("core/projections.yaml must mark Hermes parity target as non-execution runtime");
}

const runtimeFiles = readdirSync(runtimeDir).filter((name) => name.endsWith(".yaml"));
for (const runtimeName of ["claude.yaml", "codex.yaml", "hermes.yaml"]) {
  if (!runtimeFiles.includes(runtimeName)) {
    fail(`core/runtimes/${runtimeName} missing`);
  }
}
const hermesRuntime = parseSimpleYaml(readText(path.join(runtimeDir, "hermes.yaml")));
if (hermesRuntime.execution_runtime !== false) {
  fail("core/runtimes/hermes.yaml must set execution_runtime: false");
}
if (hermesRuntime.kind !== "parity_target_contract") {
  fail("core/runtimes/hermes.yaml must be kind: parity_target_contract");
}

const commandFiles = readdirSync(commandDir).filter((name) => name.endsWith(".yaml"));
const commandDocs = new Map();
for (const name of commandFiles) {
  const doc = parseSimpleYaml(readText(path.join(commandDir, name)));
  if (doc.command) commandDocs.set(doc.command, doc);
}

const dispatchSections = extractDispatchSections();
for (const command of requiredCommands) {
  const doc = commandDocs.get(command);
  if (!doc) {
    fail(`core/commands/${command}.yaml missing or lacks command: ${command}`);
    continue;
  }

  if (!Object.hasOwn(doc, "source_edit_allowed")) {
    fail(`core/commands/${command}.yaml must define source_edit_allowed`);
  }

  const expectedHeading = dispatchSections.get(command);
  if (!expectedHeading) {
    fail(`bin/lib/dispatch.mjs DOC_SECTION lacks ${command}`);
  } else if (doc.show_doc_heading !== expectedHeading) {
    fail(
      `show-doc drift for ${command}: core has ${doc.show_doc_heading}, dispatch has ${expectedHeading}`
    );
  }

  assertSkillPayload(sourceSkillRoot, "ddalggak", doc);
  assertSkillPayload(codexSkillRoot, ".codex/skills/ddalggak", doc);
}

if (failures.length > 0) {
  console.error("[verify:projections] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `[verify:projections] passed: ${requiredCommands.length} command contracts, ${runtimeFiles.length} runtimes, 2 projection roots`
);
