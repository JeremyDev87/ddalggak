import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const RESULT_RELATIVE_PATH = path.join(
  ".ddalggak",
  "heimdall-readiness",
  "result.txt",
);

export function runReadinessAdapter({
  rootDir = process.cwd(),
  fixturePath,
  runProcess = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const resultPath = path.join(rootDir, RESULT_RELATIVE_PATH);
  rmSync(resultPath, { force: true });

  const args = ["scripts/eval-ddalggak-readiness.mjs"];
  if (fixturePath) args.push(fixturePath);

  const result = runProcess(process.execPath, args, {
    cwd: rootDir,
    env: { ...process.env, DDALGGAK_NO_UPDATE: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.stdout) stdout.write(result.stdout);
  if (result.stderr) stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    return Number.isInteger(result.status) ? result.status : 1;
  }

  mkdirSync(path.dirname(resultPath), { recursive: true });
  writeFileSync(resultPath, "ok\n", "utf8");
  return 0;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    process.exitCode = runReadinessAdapter({ fixturePath: process.argv[2] });
  } catch (error) {
    console.error(
      `[heimdall-readiness] launch failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  }
}