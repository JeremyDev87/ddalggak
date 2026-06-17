import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { requiredReferenceAdmissionHeaderFields } from "../core/verification/skill-contract-manifest.mjs";
import { parseSimpleYaml } from "./lib/parse-simple-yaml.mjs";

const AGENTS_MD_REQUIRED_ANCHORS = [
  "Canonical owner",
  "Side-effect boundary",
  "No merge",
  "npm run verify",
];

// These sentinels are patterns that indicate granting prohibited authority or leaking secrets.
// They are precise enough to avoid false positives on boundary-description phrases in AGENTS.md itself.
const AGENTS_MD_FORBIDDEN_SENTINELS = [
  "enable auto-merge",
  "allow auto-merge",
  "auto-merge allowed",
  "force-push bypass",
  "force-push allowed",
  "ghp_",
  "npm_",
  "GITHUB_TOKEN =",
  "NPM_TOKEN =",
];

const AGENTS_MD_MAX_LINES = 100;

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
  "getwiki",
  "setwiki",
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

function parseDeclaredProjectionRoots(text) {
  const rootsByRuntime = new Map();
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf("projection_roots:");
  if (start === -1) {
    fail("core/projections.yaml must declare projection_roots");
    return rootsByRuntime;
  }

  let currentRuntime = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^[A-Za-z0-9_-]+:/.test(line)) break;

    const runtimeStart = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (runtimeStart) {
      currentRuntime = runtimeStart[1];
      rootsByRuntime.set(currentRuntime, null);
      continue;
    }

    const rootLine = line.match(/^ {4}root:\s*(\S+)\s*$/);
    if (rootLine && currentRuntime) {
      rootsByRuntime.set(currentRuntime, rootLine[1]);
    }
  }

  return rootsByRuntime;
}

function assertRuntimeProjectionContract(runtimeName, projectionsByRuntime) {
  const relativePath = `core/runtimes/${runtimeName}.yaml`;
  const runtime = parseSimpleYaml(readText(path.join(runtimeDir, `${runtimeName}.yaml`)), relativePath, {
    onError: fail,
  });

  if (runtime.kind !== "execution_projection") {
    fail(`${relativePath} must be kind: execution_projection`);
  }
  if (!Array.isArray(runtime.projection_roots) || runtime.projection_roots.length === 0) {
    fail(`${relativePath} must declare at least one projection_roots entry`);
    return;
  }

  const declaredRoots = new Set([...projectionsByRuntime.values()].filter(Boolean));
  for (const [index, runtimeRoot] of runtime.projection_roots.entries()) {
    if (!declaredRoots.has(runtimeRoot)) {
      fail(
        `${relativePath} projection_roots[${index}] (${runtimeRoot}) is not declared as a root in core/projections.yaml; use install_targets for install-only paths`,
      );
    }
  }

  if (runtimeName === "claude" && runtime.capabilities?.local_skill_install === true) {
    if (!Array.isArray(runtime.install_targets) || runtime.install_targets.length === 0) {
      fail(`${relativePath} must put install-only Claude paths in install_targets`);
    }
  }
}

const PARITY_LEDGER_CLASSES = new Set(["must-match", "may-localize", "root-specific"]);
const PARITY_LEDGER_ENTRY_FIELDS = new Set(["class", "root", "reason"]);
const parityRootsByKey = {
  claude: sourceSkillRoot,
  codex: codexSkillRoot,
};

function parseParityLedger(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf("parity_ledger:");
  if (start === -1) {
    fail("core/projections.yaml must declare a parity_ledger block");
    return null;
  }

  const entries = [];
  let current = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (/^[A-Za-z0-9_-]+:/.test(line)) break;

    const entryStart = line.match(/^ {2}- path:\s*(\S+)\s*$/);
    if (entryStart) {
      current = { path: entryStart[1], line: index + 1 };
      entries.push(current);
      continue;
    }

    const field = current && line.match(/^ {4}([A-Za-z_]+):\s*(.+?)\s*$/);
    if (field && PARITY_LEDGER_ENTRY_FIELDS.has(field[1])) {
      current[field[1]] = field[2];
      continue;
    }

    fail(`core/projections.yaml line ${index + 1}: unparseable parity_ledger line: ${line.trim()}`);
  }
  return entries;
}

function listParityFiles(dir, prefix = "") {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Skip OS metadata dotfiles (e.g. .DS_Store); instruction payloads are never dotfiles.
    if (entry.name.startsWith(".")) continue;
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listParityFiles(path.join(dir, entry.name), relPath));
    } else if (entry.isFile()) {
      files.push(relPath);
    }
  }
  return files.sort();
}

function admissionHeaderFieldLines(filePath) {
  const firstBlock = readText(filePath).split(/\n\n/)[0] || "";
  return firstBlock
    .split("\n")
    .filter((line) => requiredReferenceAdmissionHeaderFields.some((field) => line.startsWith(field)))
    .join("\n");
}

function runParityLedgerCheck(projectionsText) {
  const entries = parseParityLedger(projectionsText);
  if (entries === null) return 0;

  const ledger = new Map();
  for (const entry of entries) {
    if (ledger.has(entry.path)) {
      fail(`core/projections.yaml line ${entry.line}: duplicate parity_ledger path: ${entry.path}`);
      continue;
    }
    ledger.set(entry.path, entry);

    if (!PARITY_LEDGER_CLASSES.has(entry.class)) {
      fail(
        `core/projections.yaml line ${entry.line}: ${entry.path} has unknown parity class: ${entry.class ?? "(missing)"}`,
      );
      continue;
    }
    if (entry.class === "root-specific") {
      if (!Object.hasOwn(parityRootsByKey, entry.root ?? "")) {
        fail(
          `core/projections.yaml line ${entry.line}: ${entry.path} root-specific entry needs root: codex or claude`,
        );
      }
      if (!entry.reason) {
        fail(`core/projections.yaml line ${entry.line}: ${entry.path} root-specific entry needs a reason`);
      }
    } else if (entry.root) {
      fail(`core/projections.yaml line ${entry.line}: ${entry.path} only root-specific entries may declare root`);
    }
  }

  for (const entry of ledger.values()) {
    const claudeFile = path.join(parityRootsByKey.claude, entry.path);
    const codexFile = path.join(parityRootsByKey.codex, entry.path);

    if (entry.class === "must-match" || entry.class === "may-localize") {
      const claudeExists = exists(claudeFile);
      const codexExists = exists(codexFile);
      if (!claudeExists) fail(`parity ledger (${entry.class}): ddalggak/${entry.path} missing`);
      if (!codexExists) fail(`parity ledger (${entry.class}): .codex/skills/ddalggak/${entry.path} missing`);
      if (!claudeExists || !codexExists) continue;

      if (entry.class === "must-match") {
        if (!readFileSync(claudeFile).equals(readFileSync(codexFile))) {
          fail(
            `parity ledger (must-match): ${entry.path} differs between ddalggak/ and .codex/skills/ddalggak/`,
          );
        }
      } else if (admissionHeaderFieldLines(claudeFile) !== admissionHeaderFieldLines(codexFile)) {
        fail(`parity ledger (may-localize): ${entry.path} admission header fields differ between roots`);
      }
      continue;
    }

    if (entry.class === "root-specific" && Object.hasOwn(parityRootsByKey, entry.root ?? "")) {
      const otherRootKey = entry.root === "codex" ? "claude" : "codex";
      const ownRootFile = entry.root === "codex" ? codexFile : claudeFile;
      const otherRootFile = entry.root === "codex" ? claudeFile : codexFile;
      if (!exists(ownRootFile)) {
        fail(`parity ledger (root-specific): ${entry.path} missing from its declared root ${entry.root}`);
      }
      if (exists(otherRootFile)) {
        fail(
          `parity ledger (root-specific): ${entry.path} is declared ${entry.root}-only but also exists in the ${otherRootKey} root`,
        );
      }
    }
  }

  for (const [rootKey, rootDirPath] of Object.entries(parityRootsByKey)) {
    for (const relPath of listParityFiles(rootDirPath)) {
      if (!ledger.has(relPath)) {
        fail(
          `parity ledger: ${path.relative(rootDir, rootDirPath)}/${relPath} (${rootKey}) is not registered in core/projections.yaml parity_ledger`,
        );
      }
    }
  }

  return ledger.size;
}

function runProjectionArtifactGuard() {
  const agentsMdPath = path.join(rootDir, "AGENTS.md");
  if (!exists(agentsMdPath)) {
    fail("AGENTS.md missing: projection artifact guard requires root AGENTS.md");
    return;
  }

  const text = readText(agentsMdPath);
  if (!text) return;

  const lineCount = text.split(/\r?\n/).length;
  if (lineCount > AGENTS_MD_MAX_LINES) {
    fail(
      `AGENTS.md is ${lineCount} lines (max ${AGENTS_MD_MAX_LINES}): thin adapter must not duplicate long policy from canonical sources`,
    );
  }

  for (const anchor of AGENTS_MD_REQUIRED_ANCHORS) {
    if (!text.includes(anchor)) {
      fail(`AGENTS.md missing required anchor: "${anchor}"`);
    }
  }

  for (const sentinel of AGENTS_MD_FORBIDDEN_SENTINELS) {
    if (text.includes(sentinel)) {
      fail(`AGENTS.md contains forbidden sentinel: "${sentinel}"`);
    }
  }
}

runGeneratedBlockCheck();
runProjectionArtifactGuard();

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

const parityLedgerEntryCount = runParityLedgerCheck(projectionsText);
const projectionsByRuntime = parseDeclaredProjectionRoots(projectionsText);

const runtimeFiles = readdirSync(runtimeDir).filter((name) => name.endsWith(".yaml"));
for (const runtimeName of ["claude.yaml", "codex.yaml", "hermes.yaml"]) {
  if (!runtimeFiles.includes(runtimeName)) {
    fail(`core/runtimes/${runtimeName} missing`);
  }
}
for (const runtimeName of ["claude", "codex"]) {
  assertRuntimeProjectionContract(runtimeName, projectionsByRuntime);
}
const hermesRuntime = parseSimpleYaml(
  readText(path.join(runtimeDir, "hermes.yaml")),
  "core/runtimes/hermes.yaml",
  { onError: fail },
);
if (hermesRuntime.execution_runtime !== false) {
  fail("core/runtimes/hermes.yaml must set execution_runtime: false");
}
if (hermesRuntime.kind !== "parity_target_contract") {
  fail("core/runtimes/hermes.yaml must be kind: parity_target_contract");
}

const commandFiles = readdirSync(commandDir).filter((name) => name.endsWith(".yaml"));
const commandDocs = new Map();
for (const name of commandFiles) {
  const doc = parseSimpleYaml(
    readText(path.join(commandDir, name)),
    `core/commands/${name}`,
    { onError: fail },
  );
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
  `[verify:projections] passed: ${requiredCommands.length} command contracts, ${runtimeFiles.length} runtimes, 2 projection roots, ${parityLedgerEntryCount} parity ledger entries, AGENTS.md projection artifact guard`
);
