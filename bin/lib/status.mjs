// ddalggak status --local — inspect source/Codex/installed skill parity and
// validate workspace session state (.ddalggak/session-state.json) against
// core/state/session-state.schema.json.
// Read-only diagnostics; never mutates the installed Claude skill.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const PKG_JSON = join(PKG_ROOT, "package.json");
const SOURCE_PAYLOAD_ROOT = join(PKG_ROOT, "ddalggak");
const CODEX_PAYLOAD_ROOT = join(PKG_ROOT, ".codex", "skills", "ddalggak");
const SESSION_STATE_SCHEMA_PATH = join(
  PKG_ROOT,
  "core",
  "state",
  "session-state.schema.json",
);
const SESSION_STATE_RELATIVE_PATH = join(".ddalggak", "session-state.json");
const DEFAULT_SESSION_STALE_HOURS = 24;
const MINIMUM_NODE_MAJOR = 18;

const HELP_TEXT = `ddalggak status --local — inspect local skill installation parity

Usage:
  ddalggak status --local [--json]

Options:
  --json        Print machine-readable JSON.
  --help        Show this help and exit 0.

State values:
  ok            Installed Claude skill matches the source payload checksum.
  stale         Installed skill exists but version, checksum, or required files differ.
  not-installed No installed Claude skill was found under CLAUDE_HOME.

Session state evidence:
  When <workspace>/.ddalggak/session-state.json exists it is validated against
  core/state/session-state.schema.json and judged separately from the skill
  install state: absent, valid, malformed (not JSON), invalid (schema
  violation), or stale (updated_at older than the schema's
  x-ddalggak.staleAfterHours). Workspace root defaults to the current
  directory; override with DDALGGAK_WORKSPACE_ROOT.
`;

function out(message) {
  process.stdout.write(message.endsWith("\n") ? message : message + "\n");
}

function err(message) {
  process.stderr.write(message.endsWith("\n") ? message : message + "\n");
}

function parseArgs(args) {
  const opts = { json: false, help: false };
  for (const arg of args) {
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--local") {
      // Accepted for direct module tests; bin/ddalggak.js strips it.
    } else {
      return { error: `Unknown option: ${arg}` };
    }
  }
  return { opts };
}

function readPackageVersion() {
  return JSON.parse(readFileSync(PKG_JSON, "utf8")).version;
}

function resolveClaudeHome() {
  return resolve(
    process.env.CLAUDE_HOME && process.env.CLAUDE_HOME.length > 0
      ? process.env.CLAUDE_HOME
      : join(homedir(), ".claude"),
  );
}

function resolveWorkspaceRoot() {
  return resolve(
    process.env.DDALGGAK_WORKSPACE_ROOT &&
      process.env.DDALGGAK_WORKSPACE_ROOT.length > 0
      ? process.env.DDALGGAK_WORKSPACE_ROOT
      : process.cwd(),
  );
}

function typeOfValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOfValue(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return actual === expected;
}

// Minimal zero-dependency JSON Schema subset validator. Supports exactly the
// keywords core/state/session-state.schema.json uses: type, const, enum,
// required, properties, items, and format "date-time". Unknown keywords are
// ignored, matching JSON Schema annotation semantics.
function collectSchemaViolations(schema, value, path, violations) {
  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    violations.push(
      `${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`,
    );
    return;
  }
  if (Object.hasOwn(schema, "enum") && !schema.enum.includes(value)) {
    violations.push(
      `${path}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`,
    );
    return;
  }
  if (Object.hasOwn(schema, "type")) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((expected) => matchesType(value, expected))) {
      violations.push(
        `${path}: expected type ${allowed.join("|")}, got ${typeOfValue(value)}`,
      );
      return;
    }
  }
  if (
    schema.format === "date-time" &&
    typeof value === "string" &&
    Number.isNaN(Date.parse(value))
  ) {
    violations.push(
      `${path}: expected ISO-8601 date-time, got ${JSON.stringify(value)}`,
    );
    return;
  }
  if (typeOfValue(value) === "object") {
    for (const requiredKey of schema.required || []) {
      if (!Object.hasOwn(value, requiredKey)) {
        violations.push(`${path}: missing required field "${requiredKey}"`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) {
        collectSchemaViolations(
          childSchema,
          value[key],
          `${path}.${key}`,
          violations,
        );
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      collectSchemaViolations(
        schema.items,
        value[index],
        `${path}[${index}]`,
        violations,
      );
    }
  }
}

// Judges the workspace session state file independently from the installed
// skill state so the parity contract above stays deterministic regardless of
// what .ddalggak/ holds in the current workspace.
async function collectSessionStateEvidence() {
  const sessionStatePath = join(
    resolveWorkspaceRoot(),
    SESSION_STATE_RELATIVE_PATH,
  );
  const evidence = {
    path: sessionStatePath,
    schemaPath: SESSION_STATE_SCHEMA_PATH,
    status: "absent",
    updatedAt: null,
    ageHours: null,
    staleAfterHours: DEFAULT_SESSION_STALE_HOURS,
    violations: [],
    action: "No session state file found; nothing to validate.",
  };
  if (!(await pathExists(sessionStatePath))) return evidence;

  let state;
  try {
    state = JSON.parse(await readFile(sessionStatePath, "utf8"));
  } catch (error) {
    evidence.status = "malformed";
    evidence.violations = [
      `$: ${error && error.message ? error.message : String(error)}`,
    ];
    evidence.action =
      "Rewrite .ddalggak/session-state.json as valid JSON before trusting resume state.";
    return evidence;
  }

  let schema;
  try {
    schema = JSON.parse(await readFile(SESSION_STATE_SCHEMA_PATH, "utf8"));
  } catch (error) {
    evidence.status = "schema-unavailable";
    evidence.violations = [
      `schema: ${error && error.message ? error.message : String(error)}`,
    ];
    evidence.action =
      "Reinstall the ddalggak package; core/state/session-state.schema.json is missing or unreadable.";
    return evidence;
  }
  const staleAfterHours = schema["x-ddalggak"]?.staleAfterHours;
  if (typeof staleAfterHours === "number" && staleAfterHours > 0) {
    evidence.staleAfterHours = staleAfterHours;
  }

  const violations = [];
  collectSchemaViolations(schema, state, "$", violations);
  if (violations.length > 0) {
    evidence.status = "invalid";
    evidence.violations = violations;
    evidence.action =
      "Fix the schema violations before trusting resume state; see core/state/session-state.schema.json.";
    return evidence;
  }

  evidence.updatedAt = state.updated_at;
  const ageMs = Date.now() - Date.parse(state.updated_at);
  evidence.ageHours = Math.round((ageMs / 36e5) * 100) / 100;
  if (ageMs > evidence.staleAfterHours * 36e5) {
    evidence.status = "stale";
    evidence.action = `Session state is older than ${evidence.staleAfterHours}h; rebuild it from live git/GitHub state before resuming.`;
    return evidence;
  }
  evidence.status = "valid";
  evidence.action =
    "Session state matches the schema and is fresh enough to trust for resume.";
  return evidence;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function listFiles(root) {
  const files = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error && error.code === "ENOENT") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(abs);
      } else if (entry.isFile()) {
        files.push(relative(root, abs).replaceAll("\\", "/"));
      }
    }
  }
  await visit(root);
  return files;
}

async function payloadChecksum(root, expectedFiles = null) {
  if (!(await pathExists(root))) return null;
  const files = expectedFiles || (await listFiles(root));
  const aggregate = createHash("sha256");
  for (const relPath of files) {
    let fileHash;
    try {
      const bytes = await readFile(join(root, relPath));
      fileHash = createHash("sha256").update(bytes).digest("hex");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        fileHash = "MISSING";
      } else {
        throw error;
      }
    }
    aggregate.update(relPath);
    aggregate.update("\0");
    aggregate.update(fileHash);
    aggregate.update("\0");
  }
  return { sha256: aggregate.digest("hex"), files };
}

async function readInstalledVersion(installedRoot) {
  try {
    return (
      (
        await readFile(join(installedRoot, ".installed-version"), "utf8")
      ).trim() || null
    );
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function readInstalledManifest(installedRoot) {
  try {
    const manifest = JSON.parse(
      await readFile(join(installedRoot, ".installed-manifest.json"), "utf8"),
    );
    if (
      !manifest ||
      typeof manifest !== "object" ||
      !Array.isArray(manifest.files)
    ) {
      return { manifest: null, parseError: "unexpected manifest shape" };
    }
    return { manifest, parseError: null };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { manifest: null, parseError: null };
    }
    return {
      manifest: null,
      parseError: error && error.message ? error.message : String(error),
    };
  }
}

function requiredReferencePaths(sourceFiles) {
  return sourceFiles.filter(
    (file) =>
      file === "SKILL.md" ||
      file.startsWith("references/") ||
      file.startsWith("templates/"),
  );
}

async function missingPaths(root, requiredPaths) {
  const missing = [];
  for (const relPath of requiredPaths) {
    if (!(await pathExists(join(root, relPath)))) missing.push(relPath);
  }
  return missing;
}

function extraInstalledPaths(installedFiles, sourceFiles) {
  const allowedExtra = new Set([
    ".installed-version",
    ".installed-manifest.json",
  ]);
  const sourceSet = new Set(sourceFiles);
  return installedFiles.filter(
    (file) => !sourceSet.has(file) && !allowedExtra.has(file),
  );
}

function determineState({
  installedExists,
  packageVersion,
  installedVersion,
  sourceChecksum,
  installedChecksum,
  missingRequiredPaths,
  extraInstalledPaths,
  installedManifestParseError,
  installedManifestMissing,
}) {
  if (!installedExists) return "not-installed";
  if (installedManifestParseError) return "stale";
  if (installedManifestMissing) return "stale";
  if (installedVersion !== packageVersion) return "stale";
  if (
    !installedChecksum ||
    !sourceChecksum ||
    installedChecksum.sha256 !== sourceChecksum.sha256
  )
    return "stale";
  if (missingRequiredPaths.length > 0) return "stale";
  if (extraInstalledPaths.length > 0) return "stale";
  return "ok";
}

function runtimeEvidence() {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  const supported = Number.isFinite(nodeMajor) && nodeMajor >= MINIMUM_NODE_MAJOR;
  return {
    status: supported ? "ok" : "unsupported",
    nodeVersion: process.versions.node,
    minimumNodeVersion: `>=${MINIMUM_NODE_MAJOR}`,
    platform: process.platform,
    arch: process.arch,
    action: supported
      ? "Runtime satisfies ddalggak package requirements."
      : `Use Node.js ${MINIMUM_NODE_MAJOR} or newer before running setup/status again.`,
  };
}

function manifestEvidenceStatus({
  installedExists,
  installedManifest,
  installedManifestParseError,
  packageVersion,
}) {
  if (!installedExists) return "not-installed";
  if (installedManifestParseError) return "malformed";
  if (!installedManifest) return "absent";
  if (installedManifest.packageVersion !== packageVersion) return "stale";
  return "present";
}

function nextEvidenceAction({
  state,
  runtime,
  manifestStatus,
  missingRequiredPaths,
  extraInstalledPaths,
  checksumsMatch,
}) {
  if (runtime.status !== "ok") return runtime.action;
  if (state === "not-installed") return "Run `ddalggak setup` to install the local Claude skill.";
  if (manifestStatus === "malformed") return "Run `ddalggak setup` to rewrite the malformed installed manifest.";
  if (manifestStatus === "absent") return "Run `ddalggak setup` to backfill the missing installed manifest.";
  if (manifestStatus === "stale") return "Run `ddalggak setup` to refresh stale package manifest evidence.";
  if (missingRequiredPaths.length > 0) return "Run `ddalggak setup` to restore missing required references/templates.";
  if (extraInstalledPaths.length > 0) return "Remove extra installed payload files or run `ddalggak setup` to replace the skill.";
  if (!checksumsMatch) return "Run `ddalggak setup` to sync the installed payload with the package payload.";
  return "No action needed; runtime, package manifest, and payload evidence are current.";
}

function buildEvidence({
  state,
  packageVersion,
  installedVersion,
  installedExists,
  installedManifest,
  installedManifestParseError,
  sourceChecksum,
  installedChecksum,
  sourceFiles,
  installedFiles,
  missingRequiredPaths,
  extraInstalledPaths,
}) {
  const runtime = runtimeEvidence();
  const manifestStatus = manifestEvidenceStatus({
    installedExists,
    installedManifest,
    installedManifestParseError,
    packageVersion,
  });
  const checksumsMatch = Boolean(
    sourceChecksum &&
      installedChecksum &&
      sourceChecksum.sha256 === installedChecksum.sha256,
  );
  const packageEvidence = {
    status: state,
    packageVersion,
    installedVersion,
    manifest: {
      status: manifestStatus,
      packageVersion: installedManifest?.packageVersion || null,
      installedAt: installedManifest?.installedAt || null,
      fileCount: installedManifest?.files?.length || 0,
      parseError: installedManifestParseError ? true : false,
    },
    payload: {
      sourceFileCount: sourceFiles.length,
      installedFileCount: installedFiles.length,
      checksumsMatch,
      missingRequiredCount: missingRequiredPaths.length,
      extraInstalledCount: extraInstalledPaths.length,
    },
  };
  const nextAction = nextEvidenceAction({
    state,
    runtime,
    manifestStatus,
    missingRequiredPaths,
    extraInstalledPaths,
    checksumsMatch,
  });
  return {
    runtime,
    package: packageEvidence,
    nextAction,
  };
}

export async function collectStatus() {
  const packageVersion = readPackageVersion();
  const claudeHome = resolveClaudeHome();
  const sessionState = await collectSessionStateEvidence();
  const installedClaudeSkillPath = join(claudeHome, "skills", "ddalggak");
  const installedExists = await pathExists(installedClaudeSkillPath);
  const sourceChecksum = await payloadChecksum(SOURCE_PAYLOAD_ROOT);
  const sourceFiles = sourceChecksum ? sourceChecksum.files : [];
  const codexChecksum = await payloadChecksum(CODEX_PAYLOAD_ROOT, sourceFiles);
  const installedFiles = installedExists
    ? await listFiles(installedClaudeSkillPath)
    : [];
  const installedManifestResult = installedExists
    ? await readInstalledManifest(installedClaudeSkillPath)
    : { manifest: null, parseError: null };
  const installedManifest = installedManifestResult.manifest;
  const extraPaths = installedExists
    ? extraInstalledPaths(installedFiles, sourceFiles)
    : [];
  const installedChecksum = installedExists
    ? await payloadChecksum(installedClaudeSkillPath, sourceFiles)
    : null;
  const missingRequiredPaths = installedExists
    ? await missingPaths(
        installedClaudeSkillPath,
        requiredReferencePaths(sourceFiles),
      )
    : requiredReferencePaths(sourceFiles);
  const installedVersion =
    installedManifest?.packageVersion ||
    (installedExists
      ? await readInstalledVersion(installedClaudeSkillPath)
      : null);
  const state = determineState({
    installedExists,
    packageVersion,
    installedVersion,
    sourceChecksum,
    installedChecksum,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
    installedManifestParseError: installedManifestResult.parseError,
    installedManifestMissing: installedExists && !installedManifest && !installedManifestResult.parseError,
  });
  const evidence = buildEvidence({
    state,
    packageVersion,
    installedVersion,
    installedExists,
    installedManifest,
    installedManifestParseError: installedManifestResult.parseError,
    sourceChecksum,
    installedChecksum,
    sourceFiles,
    installedFiles,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
  });

  return {
    ok: state === "ok",
    state,
    packageVersion,
    sourcePayloadRoot: SOURCE_PAYLOAD_ROOT,
    codexPayloadRoot: CODEX_PAYLOAD_ROOT,
    installedClaudeSkillPath,
    installedVersion,
    installedManifest: installedManifest
      ? {
          packageVersion: installedManifest.packageVersion || null,
          installedAt: installedManifest.installedAt || null,
          sourceRoot: installedManifest.sourceRoot || null,
          fileCount: installedManifest.files.length,
        }
      : null,
    installedManifestParseError: installedManifestResult.parseError,
    sourceChecksum: sourceChecksum ? sourceChecksum.sha256 : null,
    codexChecksum: codexChecksum ? codexChecksum.sha256 : null,
    installedChecksum: installedChecksum ? installedChecksum.sha256 : null,
    sourceFileCount: sourceChecksum ? sourceChecksum.files.length : 0,
    installedFileCount: installedFiles.length,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
    sessionState,
    evidence,
  };
}

function printHuman(status) {
  out(`ddalggak local status: ${status.state}`);
  out(`package version: ${status.packageVersion}`);
  out(`source payload root: ${status.sourcePayloadRoot}`);
  out(`Codex payload root: ${status.codexPayloadRoot}`);
  out(`installed Claude skill path: ${status.installedClaudeSkillPath}`);
  out(`installed version: ${status.installedVersion || "(none)"}`);
  if (status.installedManifest) {
    out(
      `installed manifest: ${status.installedManifest.fileCount} files from ${status.installedManifest.sourceRoot || "(unknown source)"}`,
    );
  } else if (status.installedManifestParseError) {
    out(`installed manifest: invalid (${status.installedManifestParseError})`);
  } else {
    out("installed manifest: (none)");
  }
  out(`source checksum: ${status.sourceChecksum || "(missing)"}`);
  out(`installed checksum: ${status.installedChecksum || "(missing)"}`);
  if (status.missingRequiredPaths.length > 0) {
    out("missing required references/templates:");
    for (const relPath of status.missingRequiredPaths) out(`  - ${relPath}`);
  } else {
    out("missing required references/templates: none");
  }
  if (status.extraInstalledPaths.length > 0) {
    out("extra installed payload files:");
    for (const relPath of status.extraInstalledPaths) out(`  - ${relPath}`);
  } else {
    out("extra installed payload files: none");
  }
  out(`session state file: ${status.sessionState.path}`);
  out(`session state: ${status.sessionState.status}`);
  if (status.sessionState.updatedAt) {
    out(
      `session state updated_at: ${status.sessionState.updatedAt} (age ${status.sessionState.ageHours}h, stale after ${status.sessionState.staleAfterHours}h)`,
    );
  }
  if (status.sessionState.violations.length > 0) {
    out("session state violations:");
    for (const violation of status.sessionState.violations) {
      out(`  - ${violation}`);
    }
  }
  out("evidence:");
  out(
    `  runtime: ${status.evidence.runtime.status} (node ${status.evidence.runtime.nodeVersion}, requires ${status.evidence.runtime.minimumNodeVersion})`,
  );
  out(`  package manifest: ${status.evidence.package.manifest.status}`);
  out(
    `  package payload: ${status.evidence.package.payload.checksumsMatch ? "matched" : "needs sync"}`,
  );
  out(`  session state: ${status.sessionState.status}`);
  out(`  session next: ${status.sessionState.action}`);
  out(`  next: ${status.evidence.nextAction}`);
}

export async function run(args) {
  const parsed = parseArgs(args || []);
  if (parsed.error) {
    err(parsed.error);
    return 2;
  }
  const opts = parsed.opts;
  if (opts.help) {
    out(HELP_TEXT);
    return 0;
  }

  try {
    const status = await collectStatus();
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
    } else {
      printHuman(status);
    }
    return 0;
  } catch (error) {
    err(`status failed: ${error && error.message ? error.message : error}`);
    return 1;
  }
}
