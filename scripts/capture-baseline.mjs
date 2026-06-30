#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const baselineDir = path.join(rootDir, ".omo", "evidence", "ddalggak-refactor-roadmap", "baseline");
const includeFailureProbe = process.argv.includes("--include-failure-probe");

const commands = [
  { id: "verify-codex-skill", command: "npm", args: ["run", "verify:codex-skill"] },
  { id: "security-posture-json", command: "npm", args: ["run", "verify:security-posture", "--", "--json"] },
  { id: "workflow-lint-json", command: "npm", args: ["run", "verify:workflow-lint", "--", "--json"] },
  { id: "workflow-boundary-json", command: "npm", args: ["run", "verify:workflow-boundary", "--", "--json"] },
  { id: "eval-readiness", command: "npm", args: ["run", "eval:ddalggak-readiness"] },
  { id: "verify", command: "npm", args: ["run", "verify"] },
];

function runAndCapture({ id, command, args, cwd = rootDir }, dir = baselineDir) {
  mkdirSync(dir, { recursive: true });
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  writeFileSync(path.join(dir, `${id}.stdout`), result.stdout || "<empty stdout>\n", "utf8");
  writeFileSync(path.join(dir, `${id}.stderr`), result.stderr || "<empty stderr>\n", "utf8");
  writeFileSync(path.join(dir, `${id}.status`), `${result.status ?? 1}\n`, "utf8");
  writeFileSync(
    path.join(dir, `${id}.command.json`),
    `${JSON.stringify({ command, args, cwd, status: result.status ?? 1 }, null, 2)}\n`,
    "utf8",
  );
  return result.status ?? 1;
}

let failed = false;
for (const baselineCommand of commands) {
  if (runAndCapture(baselineCommand) !== 0) failed = true;
}

if (includeFailureProbe) {
  const probeDir = path.join(baselineDir, "failure-probe");
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-baseline-probe-"));
  writeFileSync(path.join(tempDir, "package.json"), `${JSON.stringify({ scripts: {} }, null, 2)}\n`, "utf8");
  const status = runAndCapture(
    { id: "unknown-command", command: "npm", args: ["run", "__ddalggak_missing_baseline_probe__"], cwd: tempDir },
    probeDir,
  );
  rmSync(tempDir, { recursive: true, force: true });
  writeFileSync(path.join(probeDir, "cleanup.txt"), `cleanup: rm -rf ${tempDir}; no runtime process spawned\n`, "utf8");
  if (status === 0) failed = true;
}

process.exit(failed ? 1 : 0);
