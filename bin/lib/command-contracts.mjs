import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseSimpleYaml } from "../../scripts/lib/parse-simple-yaml.mjs";

// Keep the human-facing order stable while reading the command metadata from
// core/commands/*.yaml. Issue #313 owns removing the remaining command-order
// registry duplication across all surfaces.
export const COMMAND_ORDER = [
  "start",
  "review",
  "status",
  "plan",
  "issue",
  "clean",
  "ship",
  "retro",
  "prompt",
  "tune",
  "forge",
  "spark",
  "check",
  "getwiki",
  "setwiki",
];

function formatContractError(message) {
  return `ddalggak command contract error: ${message}`;
}

export function loadCommandContracts(rootDir) {
  const commandDir = path.join(rootDir, "core", "commands");
  let names;
  try {
    names = readdirSync(commandDir).filter((entry) => entry.endsWith(".yaml"));
  } catch (error) {
    throw new Error(formatContractError(`cannot list core/commands: ${error.message}`));
  }

  const docs = new Map();
  for (const name of names) {
    const relativePath = `core/commands/${name}`;
    let doc;
    try {
      doc = parseSimpleYaml(
        readFileSync(path.join(commandDir, name), "utf8"),
        relativePath,
      );
    } catch (error) {
      throw new Error(formatContractError(error.message));
    }
    if (!doc.command) {
      throw new Error(formatContractError(`${relativePath} missing command`));
    }
    if (!doc.purpose) {
      throw new Error(formatContractError(`${relativePath} missing purpose`));
    }
    docs.set(doc.command, doc);
  }

  const contracts = COMMAND_ORDER.map((command) => {
    const doc = docs.get(command);
    if (!doc) {
      throw new Error(formatContractError(`core command contract missing: ${command}`));
    }
    return doc;
  });

  const extra = [...docs.keys()].filter((command) => !COMMAND_ORDER.includes(command));
  if (extra.length > 0) {
    throw new Error(formatContractError(`core command contract order missing: ${extra.join(", ")}`));
  }

  return contracts;
}

export function loadSubcommands(rootDir) {
  return loadCommandContracts(rootDir).map((contract) => contract.command);
}

function trimFinalPeriod(value) {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

function formatSubcommandLine(command, purpose) {
  return `  ${command.padEnd(20)} ${trimFinalPeriod(String(purpose))}`;
}

export function buildHelpText(rootDir) {
  const commandLines = loadCommandContracts(rootDir)
    .map((contract) => formatSubcommandLine(contract.command, contract.purpose))
    .join("\n");

  return `ddalggak - workflow skill for Codex App and Claude Code legacy

Usage:
  ddalggak <subcommand> [args]

Codex App:
  Skill source path: .codex/skills/ddalggak/
  Invocation name: ddalggak

Subcommands:
  setup                Install legacy Claude Code skill to ~/.claude/skills/ddalggak/
  doctor               Run repo-source health checks (reachability, dead pointers, signals, root parity)
${commandLines}
  status --local       Inspect local source/Codex/installed skill parity
  profile hermes       Propose a Hermes-style Claude global profile patch (dry-run only)

Claude Code legacy:
  Non-setup subcommands dispatch to claude CLI as /ddalggak <subcommand>.
  getwiki/setwiki delegate directly to /getwiki and /setwiki.
  Use --print to print the slash command without spawning claude CLI.

Options:
  --help, -h           Show this help
  --version, -v        Print version

Examples:
  ddalggak setup
  ddalggak plan --print "Split issue 22 into reviewable PR units"
  ddalggak spark --print "Draft the next runtime goal"
  ddalggak getwiki --print "workflow routing"
  ddalggak setwiki --print "review this lesson"
  ddalggak profile hermes --dry-run
  ddalggak status

More info: https://github.com/JeremyDev87/ddalggak
`;
}
