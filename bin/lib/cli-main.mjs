import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildHelpText, loadSubcommands } from "./command-contracts.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..", "..");

const SUBCOMMANDS = loadSubcommands(rootDir);
const HELP_TEXT = buildHelpText(rootDir);

function printHelp() {
  process.stdout.write(HELP_TEXT);
}

function printVersion() {
  const pkgPath = join(rootDir, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  console.log(pkg.version);
}

function printSkillDocSummary() {
  const skillPath = join(rootDir, "ddalggak", "SKILL.md");
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

function normalizeExitCode(code) {
  return typeof code === "number" ? code : 0;
}

async function runModule(route, first, rest) {
  const mod = await loadLib(route.module, route.missingHint(first));
  const args = route.argsTransform ? route.argsTransform(first, rest) : rest;
  const code = await mod.run(...args);
  return normalizeExitCode(code);
}

const COMMAND_ROUTES = [
  {
    name: "setup",
    module: "./setup.mjs",
    matches: (first) => first === "setup",
    argsTransform: (_first, rest) => [rest],
    missingHint: () =>
      "ddalggak setup: implementation not installed yet.\n(./bin/lib/setup.mjs is missing - this CLI is in active development.)",
  },
  {
    name: "doctor",
    module: "./doctor.mjs",
    matches: (first) => first === "doctor",
    argsTransform: (_first, rest) => [rest],
    missingHint: () =>
      "ddalggak doctor: implementation not installed yet.\n(./bin/lib/doctor.mjs is missing - this CLI is in active development.)",
  },
  {
    name: "status-local",
    module: "./status.mjs",
    matches: (first, rest) => first === "status" && hasLocalStatusFlag(rest),
    argsTransform: (_first, rest) => [removeFirstLocalStatusFlag(rest)],
    missingHint: () =>
      "ddalggak status --local: implementation not installed yet.\n(./bin/lib/status.mjs is missing - this CLI is in active development.)",
  },
  {
    name: "profile",
    module: "./profile.mjs",
    matches: (first) => first === "profile",
    argsTransform: (_first, rest) => [rest],
    missingHint: () =>
      "ddalggak profile: implementation not installed yet.\n(./bin/lib/profile.mjs is missing - this CLI is in active development.)",
  },
  {
    name: "slash-dispatch",
    module: "./dispatch.mjs",
    matches: (first) => SUBCOMMANDS.includes(first),
    argsTransform: (first, rest) => [first, rest],
    missingHint: (first) =>
      `ddalggak ${first}: dispatch implementation not installed yet.\n(./bin/lib/dispatch.mjs is missing - this CLI is in active development.)`,
  },
];

export async function runCli(argv = process.argv.slice(2)) {

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

  const route = COMMAND_ROUTES.find((candidate) => candidate.matches(first, rest));
  if (route) {
    return runModule(route, first, rest);
  }

  // Unknown command
  process.stderr.write(`Unknown command: ${first}\n`);
  const suggestion = suggestCandidate(first);
  if (suggestion) {
    process.stderr.write(`Did you mean: ${suggestion}?\n`);
  }
  return 2;
}
