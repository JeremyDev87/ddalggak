import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

export function executableCandidates(command, { platform = process.platform, windowsCandidates } = {}) {
  if (platform !== "win32") return [command];
  return windowsCandidates || [`${command}.exe`, `${command}.cmd`, command];
}

export async function resolveExecutable(command, {
  pathValue = process.env.PATH || "",
  pathSeparator = process.platform === "win32" ? ";" : ":",
  candidates = executableCandidates(command),
  accessFn = access,
} = {}) {
  for (const dir of pathValue.split(pathSeparator)) {
    if (!dir) continue;
    for (const name of candidates) {
      const full = path.join(dir, name);
      try {
        await accessFn(full, constants.X_OK);
        return full;
      } catch {
        // Not present or not executable; keep searching PATH.
      }
    }
  }
  return null;
}
