import { spawnSync } from "node:child_process";

export function runNodeScript(scriptPath, args = [], options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdio = ["ignore", "pipe", "pipe"],
    encoding = "utf8",
  } = options;

  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env,
    encoding,
    stdio,
  });
}
