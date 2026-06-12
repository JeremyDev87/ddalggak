// Committed rejection-behaviour regression for the doctor signal-registry
// space/underscore hardening (#280). doctor previously normalized "REVIEW DONE"
// to "REVIEW_DONE" before matching, so a reintroduced spaced spelling was
// silently accepted and the drift it should flag stayed hidden. Each case copies
// the repo into a temp tree, optionally reintroduces a spaced signal in the
// SKILL.md naming section, runs `ddalggak doctor` there, and asserts the gate's
// pass/fail — so a refactor that re-collapses the spellings is caught instead of
// quietly degrading the registry check to a no-op.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = process.cwd();
const nodeCommand = process.execPath;

function copyRepo() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-doctor-signal-"));
  cpSync(rootDir, tempDir, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(rootDir, source);
      return !relative.split(path.sep).some((part) => part === ".git" || part === "node_modules");
    },
  });
  return tempDir;
}

function runDoctor(tempDir) {
  return spawnSync(nodeCommand, ["bin/ddalggak.js", "doctor"], {
    cwd: tempDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
}

function replaceInFile(filePath, from, to) {
  const text = readFileSync(filePath, "utf8");
  if (!text.includes(from)) {
    throw new Error(`${path.relative(rootDir, filePath)} did not contain expected probe text: ${from}`);
  }
  writeFileSync(filePath, text.split(from).join(to));
}

function assertPass(name, result) {
  if (result.status !== 0) {
    throw new Error(
      `${name}: expected doctor to pass, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

function assertFail(name, result, expectedMessage) {
  if (result.status === 0) {
    throw new Error(`${name}: expected doctor to fail, but it passed\nstdout:\n${result.stdout}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(expectedMessage)) {
    throw new Error(
      `${name}: expected failure output to include ${JSON.stringify(expectedMessage)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

function withTempRepo(name, fn) {
  const tempDir = copyRepo();
  try {
    fn(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const SKILL = "ddalggak/SKILL.md";

// Baseline: an unmutated copy must pass so the failing case proves the mutation,
// not a broken temp tree.
withTempRepo("baseline doctor passes on an unmutated copy", (tempDir) => {
  assertPass("baseline doctor passes on an unmutated copy", runDoctor(tempDir));
});

// Drift: reintroducing the legacy spaced spelling in the naming section must be
// flagged. Under the old normalizing behaviour "REVIEW DONE" collapsed to the
// defined "REVIEW_DONE" and passed silently; the hardening keeps them distinct.
withTempRepo("spaced completion signal in naming section is flagged", (tempDir) => {
  replaceInFile(
    path.join(tempDir, SKILL),
    "LANE_READY, REVIEW_DONE, and FIX_DONE",
    "LANE_READY, REVIEW DONE, and FIX_DONE",
  );
  assertFail(
    "spaced completion signal in naming section is flagged",
    runDoctor(tempDir),
    'undefined completion signal: "REVIEW DONE"',
  );
});

console.log("\n[test:doctor-signal-drift] passed");
