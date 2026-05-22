// ddalggak status --local — inspect source/Codex/installed skill parity.
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

async function installedManifestChecksumMismatches(installedManifest, installedRoot) {
  if (!installedManifest) return [];
  const mismatches = [];
  for (const entry of installedManifest.files) {
    if (!entry || typeof entry.path !== "string") {
      mismatches.push("(invalid manifest file entry)");
      continue;
    }
    let actualSha256;
    try {
      actualSha256 = createHash("sha256")
        .update(await readFile(join(installedRoot, entry.path)))
        .digest("hex");
    } catch (error) {
      actualSha256 = "MISSING";
    }
    if (actualSha256 !== entry.sha256) {
      mismatches.push(entry.path);
    }
  }
  return mismatches;
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
  installedManifestChecksumMismatches,
}) {
  if (!installedExists) return "not-installed";
  if (installedManifestParseError) return "stale";
  if (installedVersion !== packageVersion) return "stale";
  if (installedManifestChecksumMismatches.length > 0) return "stale";
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

export async function collectStatus() {
  const packageVersion = readPackageVersion();
  const claudeHome = resolveClaudeHome();
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
  const manifestChecksumMismatches = await installedManifestChecksumMismatches(
    installedManifest,
    installedClaudeSkillPath,
  );
  const state = determineState({
    installedExists,
    packageVersion,
    installedVersion,
    sourceChecksum,
    installedChecksum,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
    installedManifestParseError: installedManifestResult.parseError,
    installedManifestChecksumMismatches: manifestChecksumMismatches,
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
    installedManifestChecksumMismatches: manifestChecksumMismatches,
    sourceChecksum: sourceChecksum ? sourceChecksum.sha256 : null,
    codexChecksum: codexChecksum ? codexChecksum.sha256 : null,
    installedChecksum: installedChecksum ? installedChecksum.sha256 : null,
    sourceFileCount: sourceChecksum ? sourceChecksum.files.length : 0,
    installedFileCount: installedFiles.length,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
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
  if (status.installedManifestChecksumMismatches.length > 0) {
    out("installed manifest checksum mismatches:");
    for (const relPath of status.installedManifestChecksumMismatches)
      out(`  - ${relPath}`);
  } else {
    out("installed manifest checksum mismatches: none");
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
