import { readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadCommandContracts as loadCoreCommandContracts } from "../../bin/lib/command-contracts.mjs";

export function fatal(message) {
  console.error(`[project-runtime-assets] ${message}`);
  process.exit(1);
}

export function createProjectRuntimeContext(rootDir = process.cwd()) {
  function readText(relativePath) {
    try {
      return readFileSync(path.join(rootDir, relativePath), "utf8");
    } catch (error) {
      fatal(`cannot read ${relativePath}: ${error.message}`);
    }
  }

  function writeText(relativePath, text) {
    try {
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
