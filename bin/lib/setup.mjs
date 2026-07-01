// ddalggak setup — install Claude Code skill payloads to <CLAUDE_HOME>/skills/
//
// Contract (called from bin/ddalggak.js):
//   export async function run(args) → number (exit code)
//
// args: tokens after "setup" (e.g. ["--dry-run"], ["--target", "/path"]).
//
// Behaviour summary:
//   - Resolves claudeHome: --target > $CLAUDE_HOME > $HOME/.claude.
//   - Source payloads: <pkgRoot>/ddalggak/ and <pkgRoot>/claude-skills/*/.
//   - Destination:     <claudeHome>/skills/<name>/.
//   - Idempotent via <dst>/.installed-version (compared against package.json version).
//   - Atomic backup: rename <dst> → <dst>.bak.<YYYYMMDD-HHMMSS>[-rand6].
//   - Flags: --dry-run, --force, --no-backup, --target <path>, --help.
//   - path/realpath-based safety check; rejects system roots, descendants, and symlink escapes.
//   - Exit codes: 0 success/no-op, 1 IO failure, 2 argv error or safety failure.
//   - Zero external dependencies; ESM; Node standard library only.

import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import {
  pathExists,
  readInstalledVersion,
  readPackageVersion,
} from "./local-payload.mjs";
import { installSkillPayload } from "./setup/install-transaction.mjs";
import { resolvePhysicalPath, safetyCheck } from "./setup/path-safety.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const SOURCE_SKILLS = [
  { name: "ddalggak", sourceRoot: join(PKG_ROOT, "ddalggak") },
  { name: "omo-ulw", sourceRoot: join(PKG_ROOT, "claude-skills", "omo-ulw") },
];
const PKG_JSON = join(PKG_ROOT, "package.json");

const HELP_TEXT = `ddalggak setup — install Claude Code skills to <CLAUDE_HOME>/skills/

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

  let claudeHomeInput;
  if (opts.target !== null) {
    claudeHomeInput = opts.target;
  } else if (process.env.CLAUDE_HOME && process.env.CLAUDE_HOME.length > 0) {
    claudeHomeInput = process.env.CLAUDE_HOME;
  } else {
    claudeHomeInput = join(homedir(), ".claude");
  }

  const claudeHomeResolved = await resolvePhysicalPath(claudeHomeInput);
  const skillPayloads = SOURCE_SKILLS.map((skill) => ({
    ...skill,
    dstDir: resolve(claudeHomeResolved, "skills", skill.name),
  }));

  const safetyError = safetyCheck(
    claudeHomeInput,
    claudeHomeResolved,
    resolve(claudeHomeResolved, "skills", "ddalggak"),
  );
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

  for (const skill of skillPayloads) {
    if (!(await pathExists(skill.sourceRoot))) {
      err(`source payload missing: ${skill.sourceRoot}`);
      return 1;
    }
  }

  if (opts.dryRun) {
    out(`Would resolve claudeHome → ${claudeHomeResolved}`);
    for (const skill of skillPayloads) {
      out(`Would resolve target dir → ${skill.dstDir}`);
      const installed = (await pathExists(skill.dstDir))
        ? await readInstalledVersion(skill.dstDir)
        : null;
      if (installed !== null && installed === version && !opts.force) {
        out(`Would skip ${skill.name}: already up to date at ${version}`);
        continue;
      }
      if (installed !== null) {
        if (opts.noBackup) {
          out(`Would remove existing ${skill.dstDir} (--no-backup)`);
        } else {
          out(`Would rename ${skill.dstDir} → ${skill.dstDir}.bak.<timestamp>`);
        }
      }
      out(`Would copy ${skill.sourceRoot} → ${skill.dstDir}`);
      out(`Would write ${skill.name} .installed-version with ${version}`);
      out(
        `Would write ${skill.name} .installed-manifest.json with file sha256 inventory`,
      );
    }
    return 0;
  }

  try {
    for (const skill of skillPayloads) {
      await installSkillPayload({
        sourceRoot: skill.sourceRoot,
        dstDir: skill.dstDir,
        version,
        force: opts.force,
        noBackup: opts.noBackup,
        out,
      });
    }

    out(
      `✓ Installed Claude Code skills v${version} → ${resolve(claudeHomeResolved, "skills")}`,
    );
    out("");
    out("Next step:");
    out(
      "  Claude Code에서 /ddalggak 또는 /omo-ulw를 사용하세요.",
    );
    return 0;
  } catch (e) {
    err(`install failed: ${e && e.message ? e.message : e}`);
    return 1;
  }
}
