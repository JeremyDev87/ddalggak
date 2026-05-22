import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, "..", "..");
const TEMPLATE_PATH = join(PKG_ROOT, "templates", "claude-profile-hermes.md");
const PROFILE_START = "<!-- ddalggak:claude-profile-hermes:start -->";
const PROFILE_END = "<!-- ddalggak:claude-profile-hermes:end -->";

const HELP_TEXT = `ddalggak profile — dry-run global Claude profile proposals

Usage:
  ddalggak profile hermes [--dry-run]
  ddalggak profile hermes --print-claude-md-patch

Options:
  --dry-run                  Print the proposed profile patch without changing files. This is the default.
  --print-claude-md-patch    Print only a unified diff proposal for CLAUDE.md.
  --help, -h                 Show this help.

Safety contract:
  This command never writes ~/.claude/CLAUDE.md or ~/.claude/settings.json.
  There is intentionally no --apply mode.
`;

function out(message) {
  process.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
}

function err(message) {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
}

function parseArgs(args) {
  const opts = {
    profile: null,
    dryRun: false,
    printPatch: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--print-claude-md-patch") {
      opts.printPatch = true;
    } else if (arg === "--apply") {
      return { error: "--apply is intentionally not supported; profile changes are dry-run patch proposals only" };
    } else if (arg.startsWith("--")) {
      return { error: `Unknown option: ${arg}` };
    } else if (opts.profile === null) {
      opts.profile = arg;
    } else {
      return { error: `Unknown argument: ${arg}` };
    }
  }

  if (!opts.help && opts.profile !== "hermes") {
    return { error: opts.profile ? `Unknown profile: ${opts.profile}` : "Missing profile name: expected hermes" };
  }

  if (!opts.dryRun && !opts.printPatch) {
    opts.dryRun = true;
  }

  return { opts };
}

function claudeHome() {
  return resolve(process.env.CLAUDE_HOME && process.env.CLAUDE_HOME.length > 0 ? process.env.CLAUDE_HOME : join(homedir(), ".claude"));
}

async function readExisting(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function readTemplate() {
  return readFileSync(TEMPLATE_PATH, "utf8").trimEnd() + "\n";
}

function appendText(existing, template) {
  if (existing === null || existing.length === 0) return template;
  const separator = existing.endsWith("\n") ? "\n" : "\n\n";
  return `${existing}${separator}${template}`;
}

function lineCount(value) {
  if (value.length === 0) return 0;
  return value.endsWith("\n") ? value.slice(0, -1).split("\n").length : value.split("\n").length;
}

function addedLines(text) {
  return text
    .split("\n")
    .slice(0, -1)
    .map((line) => `+${line}`)
    .join("\n");
}

function buildAppendPatch({ existing, targetPath, template }) {
  if (existing && existing.includes(PROFILE_START) && existing.includes(PROFILE_END)) {
    return `# ddalggak Hermes profile block already exists in ${targetPath}; no patch proposed.\n`;
  }

  const proposed = appendText(existing, template);
  if (existing === null || existing.length === 0) {
    const count = lineCount(proposed);
    return [`--- /dev/null`, `+++ ${targetPath}`, `@@ -0,0 +1,${count} @@`, addedLines(proposed), ""].join("\n");
  }

  const addition = proposed.slice(existing.length);
  const existingLines = lineCount(existing);
  const startLine = existingLines + 1;
  const addCount = lineCount(addition);
  return [
    `--- ${targetPath}`,
    `+++ ${targetPath}`,
    `@@ -${existingLines},0 +${startLine},${addCount} @@`,
    addedLines(addition),
    "",
  ].join("\n");
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

  const home = claudeHome();
  const targetPath = join(home, "CLAUDE.md");
  const settingsPath = join(home, "settings.json");

  let existing;
  let template;
  try {
    existing = await readExisting(targetPath);
    template = readTemplate();
  } catch (error) {
    err(`failed to prepare profile proposal: ${error && error.message ? error.message : error}`);
    return 1;
  }

  const patch = buildAppendPatch({ existing, targetPath, template });

  if (opts.printPatch) {
    process.stdout.write(patch);
    return 0;
  }

  out("ddalggak profile hermes dry-run");
  out(`Target CLAUDE.md: ${targetPath}`);
  out(`Existing CLAUDE.md: ${existsSync(targetPath) ? "yes (read-only)" : "no (proposal creates file)"}`);
  out(`Settings file: ${settingsPath} (not read or modified)`);
  out("No files were written. Review and apply the patch manually if desired.");
  out("");
  process.stdout.write(patch);
  return 0;
}
