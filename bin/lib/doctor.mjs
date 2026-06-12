// ddalggak doctor — repo-source health checks for the skill payload.
// Read-only diagnostics: doc reachability, dead pointers, completion-signal
// registry, and projection-root file existence parity. Zero npm deps, ESM
// only; command contracts are read with the same in-package simple-YAML
// parser as verify:projections so the two tools cannot disagree on what a
// contract says (#265).

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSimpleYaml } from "../../scripts/lib/parse-simple-yaml.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..", "..");

const HELP_TEXT = `ddalggak doctor — repo-source health checks for the skill payload

Usage:
  ddalggak doctor [--json] [--root <dir>]

Checks:
  layout           core/projections.yaml, source SKILL.md, and core/commands
                   contracts are present and parseable.
  reachability     references/templates unreachable from SKILL.md and
                   core/commands required_references/required_templates.
  dead-pointer     references/*.md and templates/*.md pointers (and
                   core/commands required entries) that do not exist.
  signal-registry  completion signals named in the SKILL.md naming-rules
                   section without a core/commands completion_signal or a
                   templates/*.md definition.
  root-parity      file existence diff between projection roots over the
                   shared skill surface (SKILL.md, references/, templates/).

Not checked (do not read a clean doctor run as proof of these):
  - projection-root content parity (bytes/checksums) — parity ledger scope.
  - runtime-specific assets outside the shared skill surface (e.g. agents/).
  - installed skill state under CLAUDE_HOME — use \`ddalggak status --local\`.
  - doctor never fixes anything; it only reports.

Options:
  --json         Print machine-readable JSON.
  --root <dir>   Repo root to inspect (defaults to this package checkout).
  --help, -h     Show this help and exit 0.

Exit codes:
  0  all checks passed
  1  findings detected
  2  usage error
`;

const NOT_CHECKED = [
  "projection-root content parity (bytes/checksums) — parity ledger scope, not doctor",
  "runtime-specific assets outside SKILL.md/references/templates (e.g. .codex agents/)",
  "installed skill state under CLAUDE_HOME — use `ddalggak status --local`",
  "doctor never fixes anything; it only reports",
];

const CHECK_ORDER = [
  "layout",
  "reachability",
  "dead-pointer",
  "signal-registry",
  "root-parity",
];

// Matches doc pointers like `references/start-workflow.md` and
// `templates/worker-brief.md` inside markdown bodies.
const DOC_LINK_PATTERN = /\b(references|templates)\/[A-Za-z0-9][A-Za-z0-9._-]*\.md\b/g;

// Matches completion-signal tokens in both spellings: the canonical underscore
// form ("ISSUE_PR_READY") and the legacy spaced form ("REVIEW DONE"). Both
// spellings are still DETECTED so a reintroduced spaced form is not silently
// dropped; the registry below keys on the raw spelling (no space->underscore
// normalization) so a spaced token no longer matches an underscore definition
// and surfaces as drift instead of being hidden (#280).
const SIGNAL_TOKEN_PATTERN = /\b[A-Z][A-Z_]*[ _](?:DONE|READY)\b/g;

const NAMING_SECTION_TITLE = "명명 규칙";

function out(message) {
  process.stdout.write(message.endsWith("\n") ? message : message + "\n");
}

function err(message) {
  process.stderr.write(message.endsWith("\n") ? message : message + "\n");
}

function parseArgs(args) {
  const opts = { json: false, help: false, root: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--root") {
      i += 1;
      if (i >= args.length) {
        return { error: "--root requires a directory argument" };
      }
      opts.root = args[i];
    } else {
      return { error: `Unknown option: ${arg}` };
    }
  }
  return { opts };
}

function isDirectory(targetPath) {
  const stats = statSync(targetPath, { throwIfNoEntry: false });
  return Boolean(stats && stats.isDirectory());
}

function isFile(targetPath) {
  const stats = statSync(targetPath, { throwIfNoEntry: false });
  return Boolean(stats && stats.isFile());
}

function tryReadText(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function listMdFiles(dirPath) {
  if (!isDirectory(dirPath)) {
    return null;
  }
  return readdirSync(dirPath)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

function extractDocLinks(text) {
  const links = new Set();
  for (const match of text.matchAll(DOC_LINK_PATTERN)) {
    links.add(match[0]);
  }
  return [...links].sort();
}

function extractSignals(text) {
  // Key on the raw spelling so "REVIEW DONE" and "REVIEW_DONE" stay distinct;
  // collapsing them hid spelling drift the registry should flag (#280).
  const byRaw = new Map();
  for (const match of text.matchAll(SIGNAL_TOKEN_PATTERN)) {
    const raw = match[0];
    if (!byRaw.has(raw)) {
      byRaw.set(raw, { raw });
    }
  }
  return [...byRaw.values()];
}

// Extracts the body of the first "## <title>" section up to the next H2.
function extractSection(markdown, title) {
  const lines = markdown.split("\n");
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## ") && lines[i].slice(3).trim() === title) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    return null;
  }
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (lines[j].startsWith("## ")) {
      endIdx = j;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

// Minimal reader for core/projections.yaml: source_root, name/root pairs under
// projection_roots, and parity_ledger entries doctor needs to distinguish
// shared skill files from ledger-declared root-specific files. The file holds
// more sections than doctor consumes (parity targets, token budgets); those
// stay ignored, but unsupported structures inside the consumed sections are
// reported instead of silently dropped (#265).
function parseProjections(text) {
  const lines = text.split(/\r?\n/);
  let sourceRoot = null;
  const projectionRoots = [];
  const parityLedger = [];
  const errors = [];
  let inProjectionRoots = false;
  let inParityLedger = false;
  let currentName = null;
  let currentLedgerEntry = null;
  const malformed = (lineNumber, message) => {
    errors.push(`core/projections.yaml line ${lineNumber}: ${message}`);
  };
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].replace(/\s+#.*$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const topLevel = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (topLevel) {
      inProjectionRoots = topLevel[1] === "projection_roots";
      inParityLedger = topLevel[1] === "parity_ledger";
      if ((inProjectionRoots || inParityLedger) && topLevel[2].trim() !== "") {
        malformed(
          lineNumber,
          `unsupported inline structure for key: ${topLevel[1]}`,
        );
      }
      if (topLevel[1] === "source_root") {
        sourceRoot = topLevel[2].trim().replace(/^"|"$/g, "");
      }
      currentName = null;
      currentLedgerEntry = null;
      continue;
    }

    if (inParityLedger) {
      const itemLine = line.match(/^\s*-\s+path:\s*(.+)$/);
      if (itemLine) {
        currentLedgerEntry = {
          path: itemLine[1].trim().replace(/^"|"$/g, ""),
        };
        parityLedger.push(currentLedgerEntry);
        continue;
      }
      const fieldLine = line.match(/^\s{4,}([A-Za-z0-9_-]+):\s*(.+)$/);
      if (fieldLine && currentLedgerEntry) {
        currentLedgerEntry[fieldLine[1]] = fieldLine[2]
          .trim()
          .replace(/^"|"$/g, "");
        continue;
      }
      malformed(lineNumber, `unparseable parity_ledger line: ${line.trim()}`);
      continue;
    }

    if (!inProjectionRoots) continue;

    const nameLine = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (nameLine) {
      currentName = nameLine[1];
      continue;
    }
    const fieldLine = line.match(/^\s{4,}([A-Za-z0-9_-]+):\s*(.+)$/);
    if (fieldLine && currentName) {
      if (fieldLine[1] === "root") {
        projectionRoots.push({
          name: currentName,
          root: fieldLine[2].trim().replace(/^"|"$/g, ""),
        });
      }
      continue;
    }
    malformed(lineNumber, `unparseable projection_roots line: ${line.trim()}`);
  }
  return { sourceRoot, projectionRoots, parityLedger, errors };
}

// parseSimpleYaml accepts a scalar value for these keys; doctor needs lists,
// and silently coercing a scalar to [] would drop required assets from every
// downstream check — report it as malformed instead.
function contractRequiredList(doc, label, key, findings) {
  const value = doc[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  findings.push(`malformed command contract: ${label}: ${key} must be a list`);
  return [];
}

function loadLayout(rootDir) {
  const findings = [];

  const projectionsPath = path.join(rootDir, "core", "projections.yaml");
  const projectionsText = tryReadText(projectionsPath);
  let sourceRootRel = null;
  let projectionRoots = [];
  let parityLedger = [];
  if (projectionsText === null) {
    findings.push("missing core/projections.yaml (cannot resolve source/projection roots)");
  } else {
    const parsed = parseProjections(projectionsText);
    findings.push(...parsed.errors);
    sourceRootRel = parsed.sourceRoot;
    projectionRoots = parsed.projectionRoots.map((entry) => ({
      ...entry,
      abs: path.join(rootDir, entry.root),
    }));
    parityLedger = parsed.parityLedger;
    if (!sourceRootRel) {
      findings.push("core/projections.yaml has no source_root entry");
    }
    if (projectionRoots.length === 0) {
      findings.push("core/projections.yaml declares no projection_roots");
    }
  }

  const sourceRoot = sourceRootRel ? path.join(rootDir, sourceRootRel) : null;
  if (sourceRootRel && !isDirectory(sourceRoot)) {
    findings.push(`source root directory missing: ${sourceRootRel}/`);
  }

  let skillText = null;
  if (sourceRoot && isDirectory(sourceRoot)) {
    skillText = tryReadText(path.join(sourceRoot, "SKILL.md"));
    if (skillText === null) {
      findings.push(`missing ${sourceRootRel}/SKILL.md`);
    }
  }

  const commandsDir = path.join(rootDir, "core", "commands");
  const commands = [];
  if (!isDirectory(commandsDir)) {
    findings.push("missing core/commands/ directory");
  } else {
    const commandFiles = readdirSync(commandsDir)
      .filter((name) => name.endsWith(".yaml"))
      .sort();
    if (commandFiles.length === 0) {
      findings.push("core/commands/ contains no *.yaml command contracts");
    }
    for (const file of commandFiles) {
      const text = tryReadText(path.join(commandsDir, file));
      if (text === null) {
        findings.push(`unreadable command contract: core/commands/${file}`);
        continue;
      }
      const label = `core/commands/${file}`;
      const doc = parseSimpleYaml(text, label, {
        onError: (message) =>
          findings.push(`malformed command contract: ${message}`),
      });
      commands.push({
        file,
        requiredReferences: contractRequiredList(
          doc,
          label,
          "required_references",
          findings,
        ),
        requiredTemplates: contractRequiredList(
          doc,
          label,
          "required_templates",
          findings,
        ),
        completionSignal:
          typeof doc.output_contract?.completion_signal === "string"
            ? doc.output_contract.completion_signal
            : null,
      });
    }
  }

  const referenceFiles =
    (sourceRoot && listMdFiles(path.join(sourceRoot, "references"))) || [];
  const templateFiles =
    (sourceRoot && listMdFiles(path.join(sourceRoot, "templates"))) || [];

  return {
    rootDir,
    findings,
    sourceRoot,
    sourceRootRel,
    projectionRoots,
    parityLedger,
    commands,
    skillText,
    referenceFiles,
    templateFiles,
  };
}

function checkReachability(layout) {
  const findings = [];
  if (!layout.sourceRoot) {
    return { findings };
  }

  const reached = new Set();
  const queue = [];
  const seed = (key) => {
    if (!reached.has(key)) {
      reached.add(key);
      queue.push(key);
    }
  };

  if (layout.skillText !== null) {
    for (const link of extractDocLinks(layout.skillText)) seed(link);
  }
  for (const cmd of layout.commands) {
    for (const name of cmd.requiredReferences) seed(`references/${name}`);
    for (const name of cmd.requiredTemplates) seed(`templates/${name}`);
  }

  while (queue.length > 0) {
    const key = queue.pop();
    const text = tryReadText(path.join(layout.sourceRoot, key));
    if (text === null) continue; // dead-pointer check reports missing targets
    for (const link of extractDocLinks(text)) seed(link);
  }

  for (const name of layout.referenceFiles) {
    if (!reached.has(`references/${name}`)) {
      findings.push(
        `orphan reference: ${layout.sourceRootRel}/references/${name} (unreachable from SKILL.md or core/commands required_references)`,
      );
    }
  }
  for (const name of layout.templateFiles) {
    if (!reached.has(`templates/${name}`)) {
      findings.push(
        `orphan template: ${layout.sourceRootRel}/templates/${name} (unreachable from SKILL.md or core/commands required_templates)`,
      );
    }
  }
  return { findings };
}

function checkDeadPointers(layout) {
  const findings = [];
  if (!layout.sourceRoot) {
    return { findings };
  }

  const sources = [];
  if (layout.skillText !== null) {
    sources.push({
      label: `${layout.sourceRootRel}/SKILL.md`,
      text: layout.skillText,
    });
  }
  for (const name of layout.referenceFiles) {
    const text = tryReadText(path.join(layout.sourceRoot, "references", name));
    if (text !== null) {
      sources.push({
        label: `${layout.sourceRootRel}/references/${name}`,
        text,
      });
    }
  }
  for (const name of layout.templateFiles) {
    const text = tryReadText(path.join(layout.sourceRoot, "templates", name));
    if (text !== null) {
      sources.push({
        label: `${layout.sourceRootRel}/templates/${name}`,
        text,
      });
    }
  }

  for (const source of sources) {
    for (const link of extractDocLinks(source.text)) {
      if (!isFile(path.join(layout.sourceRoot, link))) {
        findings.push(
          `dead pointer: ${source.label} -> ${link} (not found under ${layout.sourceRootRel}/)`,
        );
      }
    }
  }

  for (const cmd of layout.commands) {
    for (const name of cmd.requiredReferences) {
      if (!isFile(path.join(layout.sourceRoot, "references", name))) {
        findings.push(
          `dead pointer: core/commands/${cmd.file} required_references -> references/${name} (not found under ${layout.sourceRootRel}/)`,
        );
      }
    }
    for (const name of cmd.requiredTemplates) {
      if (!isFile(path.join(layout.sourceRoot, "templates", name))) {
        findings.push(
          `dead pointer: core/commands/${cmd.file} required_templates -> templates/${name} (not found under ${layout.sourceRootRel}/)`,
        );
      }
    }
  }
  return { findings };
}

function checkSignalRegistry(layout) {
  const findings = [];
  if (!layout.sourceRoot || layout.skillText === null) {
    return { findings }; // layout check already reported the missing input
  }

  const section = extractSection(layout.skillText, NAMING_SECTION_TITLE);
  if (section === null) {
    findings.push(
      `signal registry: ${layout.sourceRootRel}/SKILL.md has no "## ${NAMING_SECTION_TITLE}" section to audit`,
    );
    return { findings };
  }

  const registry = new Set();
  for (const cmd of layout.commands) {
    if (cmd.completionSignal) registry.add(cmd.completionSignal);
  }
  for (const name of layout.templateFiles) {
    const text = tryReadText(path.join(layout.sourceRoot, "templates", name));
    if (text === null) continue;
    for (const signal of extractSignals(text)) {
      registry.add(signal.raw);
    }
  }

  for (const signal of extractSignals(section)) {
    if (!registry.has(signal.raw)) {
      findings.push(
        `undefined completion signal: "${signal.raw}" is named in SKILL.md ${NAMING_SECTION_TITLE} but has no core/commands completion_signal or templates/*.md definition (check space vs underscore spelling)`,
      );
    }
  }
  return { findings };
}

// Existence-only parity over the shared skill surface. Content parity is
// deliberately out of scope (parity ledger owns byte/checksum comparison).
function collectParitySurface(absRoot) {
  if (!isDirectory(absRoot)) {
    return null;
  }
  const surface = new Set();
  if (isFile(path.join(absRoot, "SKILL.md"))) {
    surface.add("SKILL.md");
  }
  for (const dir of ["references", "templates"]) {
    const names = listMdFiles(path.join(absRoot, dir));
    if (names === null) continue;
    for (const name of names) {
      surface.add(`${dir}/${name}`);
    }
  }
  return surface;
}

function checkRootParity(layout) {
  const findings = [];
  if (layout.projectionRoots.length < 2) {
    return { findings }; // nothing to compare; layout check reports empty roots
  }

  const surfaces = layout.projectionRoots.map((entry) => ({
    ...entry,
    files: collectParitySurface(entry.abs),
  }));

  for (const surface of surfaces) {
    if (surface.files === null) {
      findings.push(
        `projection root missing: ${surface.root}/ (declared as "${surface.name}" in core/projections.yaml)`,
      );
    }
  }

  const present = surfaces.filter((surface) => surface.files !== null);
  if (present.length < 2) {
    return { findings };
  }

  const union = new Set();
  for (const surface of present) {
    for (const file of surface.files) union.add(file);
  }
  const parityByPath = new Map(
    layout.parityLedger
      .filter((entry) => entry.path)
      .map((entry) => [entry.path, entry]),
  );
  for (const file of [...union].sort()) {
    const have = present.filter((surface) => surface.files.has(file));
    if (have.length === present.length) continue;
    const ledgerEntry = parityByPath.get(file);
    if (
      ledgerEntry?.class === "root-specific" &&
      have.length === 1 &&
      have[0].name === ledgerEntry.root
    ) {
      continue;
    }
    for (const missing of present.filter((surface) => !surface.files.has(file))) {
      findings.push(
        `missing in ${missing.root}: ${file} (present in ${have
          .map((surface) => surface.root)
          .join(", ")})`,
      );
    }
  }
  return { findings };
}

function buildReport(rootDir) {
  const layout = loadLayout(rootDir);
  const results = {
    layout: { findings: layout.findings },
    reachability: checkReachability(layout),
    "dead-pointer": checkDeadPointers(layout),
    "signal-registry": checkSignalRegistry(layout),
    "root-parity": checkRootParity(layout),
  };

  const checks = {};
  const findings = [];
  for (const name of CHECK_ORDER) {
    const checkFindings = results[name].findings;
    checks[name] = { ok: checkFindings.length === 0, findings: checkFindings };
    for (const message of checkFindings) {
      findings.push({ check: name, message });
    }
  }

  return {
    ok: findings.length === 0,
    root: rootDir,
    checks,
    findings,
    notChecked: NOT_CHECKED,
  };
}

function printHumanReport(report) {
  out(`ddalggak doctor — inspecting ${report.root}`);
  out("");
  for (const name of CHECK_ORDER) {
    const check = report.checks[name];
    if (check.ok) {
      out(`[ok]   ${name}`);
      continue;
    }
    out(`[FAIL] ${name} (${check.findings.length})`);
    for (const finding of check.findings) {
      out(`  - ${finding}`);
    }
  }
  out("");
  out("not checked (a clean run proves nothing about these):");
  for (const item of report.notChecked) {
    out(`  - ${item}`);
  }
  out("");
  if (report.ok) {
    out("doctor: all checks passed (0 findings).");
  } else {
    out(
      `doctor: ${report.findings.length} finding(s) across ${
        Object.values(report.checks).filter((check) => !check.ok).length
      } failing check(s).`,
    );
  }
}

export async function run(args) {
  const parsed = parseArgs(args || []);
  if (parsed.error) {
    err(parsed.error);
    err("Run `ddalggak doctor --help` for usage.");
    return 2;
  }
  if (parsed.opts.help) {
    out(HELP_TEXT);
    return 0;
  }

  const rootDir = path.resolve(parsed.opts.root || PKG_ROOT);
  if (!isDirectory(rootDir)) {
    err(`doctor: not a directory: ${rootDir}`);
    return 2;
  }

  const report = buildReport(rootDir);
  if (parsed.opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReport(report);
  }
  return report.ok ? 0 : 1;
}
