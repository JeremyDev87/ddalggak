// Adapter for the vendored MIT codex-ulw-loop runtime.
// Upstream: https://github.com/code-yeongyu/codex-ulw-loop
// Oracle revision: ee81ab7c5150fbe027b0b79b411093a30e1d7353
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { ulwLoopCommand } from "./vendor/dist/cli-commands.js";
import { runUlwLoopHookCli, runPreToolUseGoalBudgetGuardCli } from "./vendor/dist/codex-hook.js";
import { runStopResumeHookCli } from "./vendor/dist/stop-resume-hook.js";
import { runSpawnGuardCli } from "./vendor/dist/spawn-guard.js";

export const ULW_LOOP_RUNTIME_SUBCOMMANDS = Object.freeze([
  "help", "create-goals", "status", "complete-goals", "checkpoint", "steer",
  "add-goal", "criteria", "record-evidence", "record-review-blockers",
]);

async function checkedLstat(target) {
  return lstat(target).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
}

async function rejectSymlinksRecursively(target) {
  const st = await checkedLstat(target);
  if (!st) return;
  if (st.isSymbolicLink()) throw new Error(`[ulw-loop] refused symlinked state path: ${target}`);
  if (!st.isDirectory()) throw new Error(`[ulw-loop] state root is not a directory: ${target}`);
  for (const entry of await readdir(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`[ulw-loop] refused symlinked state path: ${child}`);
    if (entry.isDirectory()) await rejectSymlinksRecursively(child);
  }
}

async function assertWorkspaceConfinedState(cwd = process.cwd()) {
  const omo = path.join(cwd, ".omo");
  const omoState = await checkedLstat(omo);
  if (!omoState) return;
  if (omoState.isSymbolicLink() || !omoState.isDirectory()) throw new Error(`[ulw-loop] refused unsafe .omo root: ${omo}`);
  await rejectSymlinksRecursively(path.join(omo, "ulw-loop"));
  const evidenceState = await checkedLstat(path.join(omo, "evidence"));
  if (evidenceState?.isSymbolicLink() || (evidenceState && !evidenceState.isDirectory())) throw new Error(`[ulw-loop] refused unsafe evidence root: ${path.join(omo, "evidence")}`);
  await rejectSymlinksRecursively(path.join(omo, "evidence", "ulw"));
}

async function guardedHookInput(input = process.stdin) {
  const chunks = [];
  for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const raw = Buffer.concat(chunks);
  try {
    const payload = JSON.parse(raw.toString("utf8"));
    if (typeof payload?.cwd === "string" && payload.cwd.trim()) await assertWorkspaceConfinedState(path.resolve(payload.cwd));
  } catch (error) {
    if (error instanceof SyntaxError) return Readable.from([raw]);
    throw error;
  }
  return Readable.from([raw]);
}

export async function runUlwLoopRuntime(argv) {
  await assertWorkspaceConfinedState();
  if (argv[0] === "hook") {
    const hook = argv[1];
    if (!new Set(["user-prompt-submit", "pre-tool-use", "stop", "pre-tool-use-spawn"]).has(hook)) {
      process.stderr.write(`[ulw-loop] unknown hook subcommand: ${hook ?? "(none)"}\n`);
      return 1;
    }
    const input = await guardedHookInput();
    if (hook === "user-prompt-submit") {
      await runUlwLoopHookCli(input, process.stdout, { includeUltraworkDirective: argv.includes("--with-ultrawork") });
      return 0;
    }
    if (hook === "pre-tool-use") {
      await runPreToolUseGoalBudgetGuardCli(input, process.stdout);
      return 0;
    }
    if (hook === "stop") {
      await runStopResumeHookCli(input, process.stdout);
      return 0;
    }
    if (hook === "pre-tool-use-spawn") {
      await runSpawnGuardCli(input, process.stdout);
      return 0;
    }
  }
  return ulwLoopCommand(argv);
}
