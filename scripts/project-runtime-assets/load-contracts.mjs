import { lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadCommandContracts as loadCoreCommandContracts } from "../../bin/lib/command-contracts.mjs";

export function fatal(message) {
  console.error(`[project-runtime-assets] ${message}`);
  process.exit(1);
}

export function createProjectRuntimeContext(rootDir = process.cwd()) {
  function readText(relativePath, { optional = false } = {}) {
    try {
      if (optional && !lstatSync(path.join(rootDir, relativePath)).isFile()) {
        throw new Error("output collision: expected a regular file, not a symlink or directory");
      }
      return readFileSync(path.join(rootDir, relativePath), "utf8");
    } catch (error) {
      if (optional && error.code === "ENOENT") return null;
      fatal(`cannot read ${relativePath}: ${error.message}`);
    }
  }

  function writeText(relativePath, text) {
    try {
      mkdirSync(path.dirname(path.join(rootDir, relativePath)), { recursive: true });
      writeFileSync(path.join(rootDir, relativePath), text);
    } catch (error) {
      fatal(`cannot write ${relativePath}: ${error.message}`);
    }
  }

  function fileSize(relativePath) {
    try {
      return statSync(path.join(rootDir, relativePath)).size;
    } catch (error) {
      fatal(`cannot stat ${relativePath}: ${error.message}`);
    }
  }

  function fileExists(relativePath) {
    try {
      statSync(path.join(rootDir, relativePath));
      return true;
    } catch {
      return false;
    }
  }

  function loadCommands() {
    try {
      return loadCoreCommandContracts(rootDir);
    } catch (error) {
      fatal(`cannot load command contracts: ${error.message}`);
    }
  }

  return {
    rootDir,
    commands: loadCommands(),
    readText,
    writeText,
    fileSize,
    fileExists,
  };
}
