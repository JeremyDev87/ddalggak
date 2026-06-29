import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { assertValidCommandContract } from "../../scripts/lib/command-contract-schema.mjs";
import { parseSimpleYaml } from "../../scripts/lib/parse-simple-yaml.mjs";

function formatContractError(message) {
  return `ddalggak command contract error: ${message}`;
}

function parseCommandOrder(doc, relativePath) {
  const raw = doc.command_order;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new Error(formatContractError(`${relativePath} must define numeric string command_order`));
  }
  return Number.parseInt(raw, 10);
}

export function loadCommandContracts(rootDir) {
  const commandDir = path.join(rootDir, "core", "commands");
  let names;
  try {
    names = readdirSync(commandDir).filter((entry) => entry.endsWith(".yaml"));
  } catch (error) {
    throw new Error(formatContractError(`cannot list core/commands: ${error.message}`));
  }

  const ordered = [];
  const orders = new Map();
  const commands = new Map();
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
    try {
      assertValidCommandContract(doc, relativePath);
    } catch (error) {
      throw new Error(formatContractError(error.message));
    }
    if (commands.has(doc.command)) {
      throw new Error(
        formatContractError(`duplicate command contract ${doc.command}: ${commands.get(doc.command)} and ${relativePath}`),
      );
    }
    commands.set(doc.command, relativePath);
    const commandOrder = parseCommandOrder(doc, relativePath);
    if (orders.has(commandOrder)) {
      throw new Error(
        formatContractError(
          `duplicate command_order ${String(commandOrder).padStart(3, "0")}: ${orders.get(commandOrder)} and ${relativePath}`,
        ),
      );
    }
    orders.set(commandOrder, relativePath);
    ordered.push({ order: commandOrder, doc });
  }

  return ordered
    .sort((left, right) => left.order - right.order)
    .map(({ doc }) => doc);
}

export function loadSubcommands(rootDir) {
  return loadCommandContracts(rootDir).map((contract) => contract.command);
}

export function loadShowDocHeadingMap(rootDir) {
  return Object.fromEntries(
    loadCommandContracts(rootDir).map((contract) => [
      contract.command,
      contract.show_doc_heading,
    ]),
  );
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
