#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUBCOMMANDS = [
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

const HELP_TEXT = `ddalggak - workflow skill for Codex App and Claude Code legacy

Usage:
  ddalggak <subcommand> [args]

Codex App:
  Skill source path: .codex/skills/ddalggak/
  Invocation name: ddalggak

Subcommands:
  setup                Install legacy Claude Code skill to ~/.claude/skills/ddalggak/
  doctor               Run repo-source health checks (reachability, dead pointers, signals, root parity)
  start                Run issue-based implementation lanes
  review               Run independent review and accepted-fix loops
  status               Inspect current lane, worktree, and PR state
  status --local        Inspect local source/Codex/installed skill parity
  plan                 Create an issue-ready implementation plan
  issue                Convert a plan into GitHub issues
  clean                Clean local state after merge verification
  ship                 Commit, push, and open a draft PR for existing lane changes
  retro                Write a workflow retrospective
  prompt               Improve lane or review briefs
  check                Run a local diff check
  getwiki              Delegate read-only wiki retrieval to /getwiki
  setwiki              Delegate approval-gated wiki write workflow to /setwiki
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
  ddalggak getwiki --print "workflow routing"
  ddalggak setwiki --print "review this lesson"
  ddalggak profile hermes --dry-run
  ddalggak status

More info: https://github.com/JeremyDev87/ddalggak
`;

function printHelp() {
  process.stdout.write(HELP_TEXT);
}

function printVersion() {
  const pkgPath = join(__dirname, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  console.log(pkg.version);
}

function printSkillDocSummary() {
  const skillPath = join(__dirname, "..", "ddalggak", "SKILL.md");
  const body = readFileSync(skillPath, "utf8");
  const lines = body.split("\n");
  const startIdx = lines.findIndex((line) => line.trim() === "## 서브커맨드 분기");
  if (startIdx === -1) {
    process.stderr.write("ddalggak contract section not found in SKILL.md\n");
    return 1;
  }
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (lines[i].startsWith("## Start Workflow")) {
      endIdx = i;
      break;
    }
  }
  const section = lines.slice(startIdx, endIdx).join("\n").trimEnd();
  process.stdout.write(section + "\n");
  return 0;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      if (a.charCodeAt(i - 1) === b.charCodeAt(j - 1)) {
        dp[j] = prev;
      } else {
        dp[j] = 1 + Math.min(prev, dp[j - 1], dp[j]);
      }
      prev = tmp;
    }
  }
  return dp[n];
}

function suggestCandidate(input) {
  const pool = ["setup", "doctor", ...SUBCOMMANDS];
  let best = null;
  let bestDist = Infinity;
  for (const cand of pool) {
    const d = levenshtein(input, cand);
    if (d < bestDist) {
      bestDist = d;
      best = cand;
    }
  }
  return bestDist <= 1 ? best : null;
}

function hasLocalStatusFlag(args) {
  for (const arg of args) {
    if (arg === "--") return false;
    if (arg === "--local") return true;
  }
  return false;
}

function removeFirstLocalStatusFlag(args) {
  const result = [];
  let removed = false;
  for (const arg of args) {
    if (!removed && arg === "--local") {
      removed = true;
      continue;
    }
    result.push(arg);
  }
  return result;
}

async function loadLib(relPath, missingHint) {
  try {
    return await import(relPath);
  } catch (err) {
    const code = err && err.code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      process.stderr.write(missingHint + "\n");
      process.exit(1);
    }
    throw err;
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    printHelp();
    return 0;
  }

  const first = argv[0];
  const rest = argv.slice(1);

  if (first === "--help" || first === "-h") {
    printHelp();
    return 0;
  }

  if (first === "--show-doc") {
    return printSkillDocSummary();
  }

  if (first === "--version" || first === "-v") {
    printVersion();
    return 0;
  }

  if (first === "setup") {
    const mod = await loadLib(
      "./lib/setup.mjs",
      "ddalggak setup: implementation not installed yet.\n(./bin/lib/setup.mjs is missing - this CLI is in active development.)"
    );
    const code = await mod.run(rest);
    return typeof code === "number" ? code : 0;
  }

  if (first === "doctor") {
    const mod = await loadLib(
      "./lib/doctor.mjs",
      "ddalggak doctor: implementation not installed yet.\n(./bin/lib/doctor.mjs is missing - this CLI is in active development.)"
    );
    const code = await mod.run(rest);
    return typeof code === "number" ? code : 0;
  }

  if (first === "status" && hasLocalStatusFlag(rest)) {
    const mod = await loadLib(
      "./lib/status.mjs",
      "ddalggak status --local: implementation not installed yet.\n(./bin/lib/status.mjs is missing - this CLI is in active development.)"
    );
    const code = await mod.run(removeFirstLocalStatusFlag(rest));
    return typeof code === "number" ? code : 0;
  }

  if (first === "profile") {
    const mod = await loadLib(
      "./lib/profile.mjs",
      "ddalggak profile: implementation not installed yet.\n(./bin/lib/profile.mjs is missing - this CLI is in active development.)"
    );
    const code = await mod.run(rest);
    return typeof code === "number" ? code : 0;
  }

  if (SUBCOMMANDS.includes(first)) {
    const mod = await loadLib(
      "./lib/dispatch.mjs",
      `ddalggak ${first}: dispatch implementation not installed yet.\n(./bin/lib/dispatch.mjs is missing - this CLI is in active development.)`
    );
    const code = await mod.run(first, rest);
    return typeof code === "number" ? code : 0;
  }

  // Unknown command
  process.stderr.write(`Unknown command: ${first}\n`);
  const suggestion = suggestCandidate(first);
  if (suggestion) {
    process.stderr.write(`Did you mean: ${suggestion}?\n`);
  }
  return 2;
}

main()
  .then((code) => {
    process.exit(typeof code === "number" ? code : 0);
  })
  .catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
