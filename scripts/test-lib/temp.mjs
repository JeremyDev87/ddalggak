import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tempRoots = new Set();
let handlersRegistered = false;
let cleaning = false;

function cleanupAndExit(signal) {
  cleanupTempRoots();
  const exitCode = signal === "SIGINT" ? 130 : 143;
  process.exit(exitCode);
}

function ensureCleanupHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  process.once("exit", cleanupTempRoots);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => cleanupAndExit(signal));
  }
}

export function registerCleanup(root) {
  ensureCleanupHandlers();
  tempRoots.add(root);
  return root;
}

export function makeTempDir(prefix) {
  return registerCleanup(mkdtempSync(path.join(os.tmpdir(), prefix)));
}

export function cleanupTempRoots() {
  if (cleaning) return;
  cleaning = true;
  try {
    for (const root of Array.from(tempRoots).reverse()) {
      tempRoots.delete(root);
      rmSync(root, { recursive: true, force: true });
    }
  } finally {
    cleaning = false;
  }
}
