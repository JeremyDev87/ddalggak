// ddalggak status --local — inspect source/Codex/installed skill parity and
// validate workspace session state (.ddalggak/session-state.json) against
// core/state/session-state.schema.json.
// Read-only diagnostics; never mutates the installed Claude skill.

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readAutoUpdateStatus } from "./auto-update.mjs";
import { collectInstallParity } from "./status/install-parity.mjs";
import { collectSessionStateEvidence } from "./status/session-state.mjs";

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

function resolveClaudeHome() {
  return resolve(
    process.env.CLAUDE_HOME && process.env.CLAUDE_HOME.length > 0
      ? process.env.CLAUDE_HOME
      : join(homedir(), ".claude"),
  );
}


export async function collectStatus() {
  const claudeHome = resolveClaudeHome();
  const installedClaudeSkillPath = join(claudeHome, "skills", "ddalggak");
  const [installParity, sessionState, autoUpdate] = await Promise.all([
    collectInstallParity({
      packageJsonPath: PKG_JSON,
      sourcePayloadRoot: SOURCE_PAYLOAD_ROOT,
      codexPayloadRoot: CODEX_PAYLOAD_ROOT,
      installedClaudeSkillPath,
      minimumNodeMajor: MINIMUM_NODE_MAJOR,
    }),
    collectSessionStateEvidence({ schemaPath: SESSION_STATE_SCHEMA_PATH }),
    readAutoUpdateStatus(),
  ]);

  return {
    ...installParity,
    sourcePayloadRoot: SOURCE_PAYLOAD_ROOT,
    codexPayloadRoot: CODEX_PAYLOAD_ROOT,
    installedClaudeSkillPath,
    sourceChecksum: installParity.sourceChecksum
      ? installParity.sourceChecksum.sha256
      : null,
    codexChecksum: installParity.codexChecksum
      ? installParity.codexChecksum.sha256
      : null,
    installedChecksum: installParity.installedChecksum
      ? installParity.installedChecksum.sha256
      : null,
    autoUpdate,
    sessionState,
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
  out(
    `GitHub master auto-update: ${status.autoUpdate.lastStatus} (${status.autoUpdate.activeSha || "no cached SHA"})`,
  );
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
