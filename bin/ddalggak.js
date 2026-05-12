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
];

const HELP_TEXT = `ddalggak — Workflow skill for Claude Code

Usage:
  ddalggak <subcommand> [args]

Subcommands:
  setup                Install skill globally to ~/.claude/skills/ddalggak/
  start, review, status, plan, issue, clean, ship, retro, prompt, check
                       Dispatch to claude CLI as /ddalggak <subcommand>

Options:
  --help, -h           Show this help
  --version, -v        Print version

Examples:
  npx @jeremyfellaz/ddalggak setup
  npx @jeremyfellaz/ddalggak prompt "결제 재시도 로직"
  npx @jeremyfellaz/ddalggak status

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
  const pool = ["setup", ...SUBCOMMANDS];
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

  if (first === "--version" || first === "-v") {
    printVersion();
    return 0;
  }

  if (first === "setup") {
    const mod = await loadLib(
      "./lib/setup.mjs",
      "ddalggak setup: implementation not installed yet.\n(./bin/lib/setup.mjs is missing — this CLI is in active development.)"
    );
    const code = await mod.run(rest);
    return typeof code === "number" ? code : 0;
  }

  if (SUBCOMMANDS.includes(first)) {
    const mod = await loadLib(
      "./lib/dispatch.mjs",
      `ddalggak ${first}: dispatch implementation not installed yet.\n(./bin/lib/dispatch.mjs is missing — this CLI is in active development.)`
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
