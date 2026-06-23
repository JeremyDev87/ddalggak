// ddalggak setup — install the skill payload to <CLAUDE_HOME>/skills/ddalggak/
//
// Contract (called from bin/ddalggak.js):
//   export async function run(args) → number (exit code)
//
// args: tokens after "setup" (e.g. ["--dry-run"], ["--target", "/path"]).
//
// Behaviour summary:
//   - Resolves claudeHome: --target > $CLAUDE_HOME > $HOME/.claude.
//   - Source payload: <pkgRoot>/ddalggak/  (two levels up from this file).
//   - Destination:    <claudeHome>/skills/ddalggak/.
//   - Idempotent via <dst>/.installed-version (compared against package.json version).
//   - Atomic backup: rename <dst> → <dst>.bak.<YYYYMMDD-HHMMSS>[-rand6].
//   - Flags: --dry-run, --force, --no-backup, --target <path>, --help.
//   - path/realpath-based safety check; rejects system roots, descendants, and symlink escapes.
//   - Exit codes: 0 success/no-op, 1 IO failure, 2 argv error or safety failure.
//   - Zero external dependencies; ESM; Node standard library only.

import { randomBytes } from "node:crypto";
import {
  cp,
  mkdtemp,
  rename,
  rm,
  realpath,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { homedir } from "node:os";
import {
  buildInstalledManifest,
  pathExists,
  readInstalledVersion,
  readPackageVersion,
} from "./local-payload.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const SRC_DIR = join(PKG_ROOT, "ddalggak");
const PKG_JSON = join(PKG_ROOT, "package.json");

const HELP_TEXT = `ddalggak setup — install skill payload to <CLAUDE_HOME>/skills/ddalggak/

Usage:
  ddalggak setup [options]

Options:
  --dry-run         Print intended actions without touching the filesystem.
  --force           Overwrite existing installation without version comparison.
  --no-backup       Skip backup and remove existing target before copying.
  --target <path>   Install root (overrides $CLAUDE_HOME and ~/.claude).
  --help            Show this help and exit 0.

Path resolution priority:
  1. --target <path>
  2. $CLAUDE_HOME
  3. ~/.claude

Exit codes:
  0  success (including up-to-date no-op)
  1  IO failure
  2  argv error or safety check failure
`;

function err(msg) {
  process.stderr.write(msg.endsWith("\n") ? msg : msg + "\n");
}

function out(msg) {
  process.stdout.write(msg.endsWith("\n") ? msg : msg + "\n");
}

// --- argv parsing ---------------------------------------------------------

function parseArgs(args) {
  const opts = {
    dryRun: false,
    force: false,
    noBackup: false,
    target: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--force") {
      opts.force = true;
    } else if (a === "--no-backup") {
      opts.noBackup = true;
    } else if (a === "--target") {
      const next = args[i + 1];
      if (next === undefined || next.startsWith("--")) {
        return { error: "--target requires a path argument" };
      }
      opts.target = next;
      i += 1;
    } else if (a.startsWith("--target=")) {
      const v = a.slice("--target=".length);
      if (v.length === 0) {
        return { error: "--target requires a path argument" };
      }
      opts.target = v;
    } else if (a.startsWith("--")) {
      return { error: `Unknown option: ${a}` };
    } else if (a.startsWith("-") && a.length > 1) {
      return { error: `Unknown option: ${a}` };
    } else {
      return { error: `Unknown argument: ${a}` };
    }
  }

  return { opts };
}

// --- safety check ---------------------------------------------------------

// System-root children we never want as effective claudeHome.
const SYSTEM_ROOT_CHILDREN = new Set([
  "/",
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
  "/root",
  "/lib",
  "/lib64",
  "/opt",
  "/private/etc",
  "/private/var",
]);

function isAtFilesystemRoot(p) {
  return resolve(p) === resolve(p, "..");
}

function isSameOrDescendant(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function systemPathMatch(candidate) {
  for (const systemPath of SYSTEM_ROOT_CHILDREN) {
    if (systemPath === "/" || systemPath === "/var" || systemPath === "/private/var") {
      if (candidate === systemPath) return systemPath;
      continue;
    }
    if (isSameOrDescendant(systemPath, candidate)) return systemPath;
  }
  return null;
}

async function resolvePhysicalPath(p) {
  const absolutePath = resolve(p);
  let probe = absolutePath;

  while (true) {
    try {
      const physicalProbe = await realpath(probe);
      const rel = relative(probe, absolutePath);
      return rel ? resolve(physicalProbe, rel) : physicalProbe;
    } catch (e) {
      if (e && e.code === "ENOENT") {
        const parent = resolve(probe, "..");
        if (parent === probe) return absolutePath;
        probe = parent;
        continue;
      }
      throw e;
    }
  }
}

function safetyCheck(claudeHomeInput, claudeHomeResolved, dstResolved) {
  // 1) dst must live under resolved claudeHome.
  const rel = relative(claudeHomeResolved, dstResolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return "target escapes CLAUDE_HOME";
  }

  // 2) Refuse filesystem root, system directories and their descendants, or HOME itself.
  if (isAtFilesystemRoot(claudeHomeResolved)) {
    return `CLAUDE_HOME resolves to filesystem root (${claudeHomeResolved})`;
  }
  if (claudeHomeResolved === resolve(homedir())) {
    return `CLAUDE_HOME resolves to user home directory (${claudeHomeResolved})`;
  }
  const systemPath = systemPathMatch(claudeHomeResolved);
  if (systemPath) {
    return `CLAUDE_HOME resolves under system directory (${systemPath}): ${claudeHomeResolved}`;
  }

  // 3) If the original input contained ".." segments and resolution traversed
  //    into a system-root child, reject. This covers CLAUDE_HOME=/tmp/evil/../etc.
  const hasDotDot = claudeHomeInput.split(/[\\/]/).some((seg) => seg === "..");
  if (hasDotDot) {
    // Check the resolved path and every ancestor up to root for system-root match.
    let probe = claudeHomeResolved;
    while (true) {
      if (systemPathMatch(probe)) {
        return `CLAUDE_HOME traverses into system directory via "..": ${claudeHomeInput} → ${claudeHomeResolved}`;
      }
      const parent = resolve(probe, "..");
      if (parent === probe) break;
      probe = parent;
    }
  }

  return null;
}

// --- helpers --------------------------------------------------------------

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "-" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

async function chooseBackupName(dstDir) {
  const base = `${dstDir}.bak.${timestamp()}`;
  if (!(await pathExists(base))) return base;
  // collision → append random suffix
  const suffix = randomBytes(3).toString("hex"); // 6 hex chars
  return `${base}-${suffix}`;
}

// --- main flow ------------------------------------------------------------

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

  // Resolve claudeHome: --target > CLAUDE_HOME > ~/.claude
  let claudeHomeInput;
  if (opts.target !== null) {
    claudeHomeInput = opts.target;
  } else if (process.env.CLAUDE_HOME && process.env.CLAUDE_HOME.length > 0) {
    claudeHomeInput = process.env.CLAUDE_HOME;
  } else {
    claudeHomeInput = join(homedir(), ".claude");
  }

  const claudeHomeResolved = await resolvePhysicalPath(claudeHomeInput);
  const dstDir = resolve(claudeHomeResolved, "skills", "ddalggak");

  const safetyError = safetyCheck(claudeHomeInput, claudeHomeResolved, dstDir);
  if (safetyError) {
    err(`safety check failed: ${safetyError}`);
    return 2;
  }

  let version;
  try {
    version = readPackageVersion(PKG_JSON);
  } catch (e) {
    err(`failed to read package.json: ${e && e.message ? e.message : e}`);
    return 1;
  }

  // Verify source payload exists (helps surface packaging mistakes early).
  if (!(await pathExists(SRC_DIR))) {
    err(`source payload missing: ${SRC_DIR}`);
    return 1;
  }

  // --- dry-run ------------------------------------------------------------
  if (opts.dryRun) {
    out(`Would resolve claudeHome → ${claudeHomeResolved}`);
    out(`Would resolve target dir → ${dstDir}`);
    const installed = (await pathExists(dstDir))
      ? await readInstalledVersion(dstDir)
      : null;
    if (installed !== null && installed === version && !opts.force) {
      out(`Would skip: already up to date at ${version}`);
      return 0;
    }
    if (installed !== null) {
      if (opts.noBackup) {
        out(`Would remove existing ${dstDir} (--no-backup)`);
      } else {
        out(`Would rename ${dstDir} → ${dstDir}.bak.<timestamp>`);
      }
    }
    out(`Would copy ${SRC_DIR} → ${dstDir}`);
    out(`Would write .installed-version with ${version}`);
    out("Would write .installed-manifest.json with file sha256 inventory");
    return 0;
  }

  // --- real install -------------------------------------------------------
  try {
    const dstExists = await pathExists(dstDir);
    const installed = dstExists ? await readInstalledVersion(dstDir) : null;

    if (dstExists && !opts.force && installed === version) {
      if (!(await pathExists(join(dstDir, ".installed-manifest.json")))) {
        const installedManifest = await buildInstalledManifest({
          sourceRoot: SRC_DIR,
          installedRoot: dstDir,
          version,
        });
        await writeFile(
          join(dstDir, ".installed-manifest.json"),
          `${JSON.stringify(installedManifest, null, 2)}\n`,
          "utf8",
        );
        out(
          `Wrote missing installed manifest → ${join(dstDir, ".installed-manifest.json")}`,
        );
      }
      out(`Already up to date (v${version}) at ${dstDir}`);
      return 0;
    }

    // Ensure parent directory exists (skills/) for first-time installs.
    const dstParent = resolve(dstDir, "..");
    await mkdir(dstParent, { recursive: true });

    const stagedDir = await mkdtemp(join(dstParent, ".ddalggak-install-"));
    await cp(SRC_DIR, stagedDir, { recursive: true, force: true });
    await writeFile(join(stagedDir, ".installed-version"), version + "\n", "utf8");
    const installedManifest = await buildInstalledManifest({
      sourceRoot: SRC_DIR,
      installedRoot: stagedDir,
      version,
    });
    await writeFile(
      join(stagedDir, ".installed-manifest.json"),
      `${JSON.stringify(installedManifest, null, 2)}\n`,
      "utf8",
    );

    if (dstExists) {
      if (opts.noBackup) {
        const trashName = await mkdtemp(join(dstParent, ".ddalggak-replace-"));
        await rm(trashName, { recursive: true, force: true });
        await rename(dstDir, trashName);
        try {
          await rename(stagedDir, dstDir);
          await rm(trashName, { recursive: true, force: true });
        } catch (e) {
          if (!(await pathExists(dstDir)) && (await pathExists(trashName))) {
            await rename(trashName, dstDir);
          }
          throw e;
        }
      } else {
        const backupName = await chooseBackupName(dstDir);
        await rename(dstDir, backupName);
        try {
          await rename(stagedDir, dstDir);
        } catch (e) {
          if (!(await pathExists(dstDir)) && (await pathExists(backupName))) {
            await rename(backupName, dstDir);
          }
          throw e;
        }
        out(`Backed up existing install → ${backupName}`);
      }
    } else {
      await rename(stagedDir, dstDir);
    }

    out(`✓ Installed ddalggak v${version} → ${dstDir}`);
    out("");
    out("Next step:");
    out(
      "  Claude Code에서 /ddalggak 또는 npx @jeremyfellaz/ddalggak <subcommand>를 사용하세요.",
    );
    return 0;
  } catch (e) {
    err(`install failed: ${e && e.message ? e.message : e}`);
    return 1;
  }
}
