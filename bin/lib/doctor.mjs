// ddalggak doctor — repo-source health checks for the skill payload.
// Read-only diagnostics: doc reachability, dead pointers, completion-signal
// registry, and projection-root file existence parity. Zero npm deps, ESM
// only; command contracts are read with the same in-package simple-YAML
// parser as verify:projections so the two tools cannot disagree on what a
// contract says (#265).

import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLayout } from "./doctor/layout.mjs";
import { checkDeadPointers, checkReachability } from "./doctor/reachability.mjs";
import { checkRootParity } from "./doctor/root-parity.mjs";
import { checkSignalRegistry } from "./doctor/signals.mjs";
import { checkWikiWiring } from "./doctor/wiki-wiring.mjs";
import { isDirectory } from "./doctor/lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(__dirname, "..", "..");

const HELP_TEXT = `ddalggak doctor — repo-source health checks for the skill payload

Usage:
  ddalggak doctor [--json] [--root <dir>]

Checks:
  layout           core/projections.yaml, source SKILL.md, and core/commands
                   contracts are present and parseable.
  reachability     references/templates unreachable from SKILL.md and
                   core/commands required_references/required_templates.
  dead-pointer     references/*.md and templates/*.md pointers (and
                   core/commands required entries) that do not exist.
  signal-registry  completion signals named in the SKILL.md naming-rules
                   section without a core/commands completion_signal or a
                   templates/*.md definition.
  root-parity      file existence diff between projection roots over the
                   shared skill surface (SKILL.md, references/, templates/).
  wiki-wiring      every core/commands contract lists
                   references/wiki-context-preflight.md so the mandatory wiki
                   preflight is wired for all subcommands.

Not checked (do not read a clean doctor run as proof of these):
  - projection-root content parity (bytes/checksums) — parity ledger scope.
  - runtime-specific assets outside the shared skill surface (e.g. agents/).
  - installed skill state under CLAUDE_HOME — use \`ddalggak status --local\`.
  - doctor never fixes anything; it only reports.

Options:
  --json         Print machine-readable JSON.
  --root <dir>   Repo root to inspect (defaults to this package checkout).
  --help, -h     Show this help and exit 0.

Exit codes:
  0  all checks passed
  1  findings detected
  2  usage error
`;

const NOT_CHECKED = [
  "projection-root content parity (bytes/checksums) — parity ledger scope, not doctor",
  "runtime-specific assets outside SKILL.md/references/templates (e.g. .codex agents/)",
  "installed skill state under CLAUDE_HOME — use `ddalggak status --local`",
  "doctor never fixes anything; it only reports",
];

const CHECK_ORDER = [
  "layout",
  "reachability",
  "dead-pointer",
  "signal-registry",
  "root-parity",
  "wiki-wiring",
];

function out(message) {
  process.stdout.write(message.endsWith("\n") ? message : message + "\n");
}

function err(message) {
  process.stderr.write(message.endsWith("\n") ? message : message + "\n");
}

function parseArgs(args) {
  const opts = { json: false, help: false, root: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json") {
      opts.json = true;
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--root") {
      i += 1;
      if (i >= args.length) {
        return { error: "--root requires a directory argument" };
      }
      opts.root = args[i];
    } else {
      return { error: `Unknown option: ${arg}` };
    }
  }
  return { opts };
}

function buildReport(rootDir) {
  const layout = loadLayout(rootDir);
  const results = {
    layout: { findings: layout.findings },
    reachability: checkReachability(layout),
    "dead-pointer": checkDeadPointers(layout),
    "signal-registry": checkSignalRegistry(layout),
    "root-parity": checkRootParity(layout),
    "wiki-wiring": checkWikiWiring(layout),
  };

  const checks = {};
  const findings = [];
  for (const name of CHECK_ORDER) {
    const checkFindings = results[name].findings;
    checks[name] = { ok: checkFindings.length === 0, findings: checkFindings };
    for (const message of checkFindings) {
      findings.push({ check: name, message });
    }
  }

  return {
    ok: findings.length === 0,
    root: rootDir,
    checks,
    findings,
    notChecked: NOT_CHECKED,
  };
}

function printHumanReport(report) {
  out(`ddalggak doctor — inspecting ${report.root}`);
  out("");
  for (const name of CHECK_ORDER) {
    const check = report.checks[name];
    if (check.ok) {
      out(`[ok]   ${name}`);
      continue;
    }
    out(`[FAIL] ${name} (${check.findings.length})`);
    for (const finding of check.findings) {
      out(`  - ${finding}`);
    }
  }
  out("");
  out("not checked (a clean run proves nothing about these):");
  for (const item of report.notChecked) {
    out(`  - ${item}`);
  }
  out("");
  if (report.ok) {
    out("doctor: all checks passed (0 findings).");
  } else {
    out(
      `doctor: ${report.findings.length} finding(s) across ${
        Object.values(report.checks).filter((check) => !check.ok).length
      } failing check(s).`,
    );
  }
}

export async function run(args) {
  const parsed = parseArgs(args || []);
  if (parsed.error) {
    err(parsed.error);
    err("Run `ddalggak doctor --help` for usage.");
    return 2;
  }
  if (parsed.opts.help) {
    out(HELP_TEXT);
    return 0;
  }

  const rootDir = path.resolve(parsed.opts.root || PKG_ROOT);
  if (!isDirectory(rootDir)) {
    err(`doctor: not a directory: ${rootDir}`);
    return 2;
  }

  const report = buildReport(rootDir);
  if (parsed.opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHumanReport(report);
  }
  return report.ok ? 0 : 1;
}
