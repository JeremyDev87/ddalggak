import { cpSync } from "node:fs";
import path from "node:path";

import { cleanupTempRoot, makeTempDir } from "./temp.mjs";

const DEFAULT_EXCLUDED_PARTS = new Set([".git", "node_modules"]);
const DEFAULT_EXCLUDED_NAMES = new Set(["npm-pack-dry-run.json"]);

export function copyRepoWithoutGitAndNodeModules({
  rootDir = process.cwd(),
  prefix = "ddalggak-repo-fixture-",
  excludedParts = DEFAULT_EXCLUDED_PARTS,
  excludedNames = DEFAULT_EXCLUDED_NAMES,
} = {}) {
  const tempDir = makeTempDir(prefix);
  cpSync(rootDir, tempDir, {
    recursive: true,
    filter: (source) => shouldCopyRepoPath(source, rootDir, { excludedParts, excludedNames }),
  });
  return tempDir;
}

export function shouldCopyRepoPath(source, rootDir, { excludedParts = DEFAULT_EXCLUDED_PARTS, excludedNames = DEFAULT_EXCLUDED_NAMES } = {}) {
  const relative = path.relative(rootDir, source);
  if (!relative) return true;
  const parts = relative.split(path.sep);
  return !parts.some((part) => excludedParts.has(part) || excludedNames.has(part));
}

export function withTempRepo(nameOrOptions, maybeFn) {
  const options = typeof nameOrOptions === "string" ? { name: nameOrOptions } : { ...(nameOrOptions || {}) };
  const fn = typeof nameOrOptions === "string" ? maybeFn : nameOrOptions?.run;
  if (typeof fn !== "function") {
    throw new TypeError("withTempRepo requires a callback");
  }
  const tempDir = copyRepoWithoutGitAndNodeModules(options);
  try {
    return fn(tempDir);
  } finally {
    cleanupTempRoot(tempDir);
  }
}
