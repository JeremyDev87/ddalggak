#!/usr/bin/env node
/**
 * test-verify-package.mjs
 *
 * Unit tests for scripts/verify-package.mjs (the npm verify pipeline entrypoint).
 *
 * verify-package.mjs is a cwd-based orchestration script, so these tests build
 * a temporary fixture package, copy the verifier into it verbatim, stub every
 * npm step it invokes with no-op scripts, and run it end-to-end against a real
 * `npm pack --dry-run`. The requiredArtifactPaths list and the npm run step
 * names are extracted from the verifier source so the fixture keeps following
 * the verifier when those lists change.
 */

import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const verifierPath = path.join(rootDir, "scripts", "verify-package.mjs");
const verifierSource = readFileSync(verifierPath, "utf8");

const tempRoots = [];

function cleanup() {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
}
process.on("exit", cleanup);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(value, needle, label = "value") {
  assert(
    value.includes(needle),
    `expected ${label} to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

function extractRequiredArtifactPaths(source) {
  const match = source.match(/const requiredArtifactPaths = \[([\s\S]*?)\];/);
  assert(match, "could not locate requiredArtifactPaths array in verify-package.mjs");
  const entries = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert(entries.length > 0, "requiredArtifactPaths parsed as empty");
  return entries;
}

function extractRunStepNames(source) {
  const names = [...source.matchAll(/"run",\s*"([^"]+)"/g)].map((m) => m[1]);
  assert(names.length > 0, "no npm run steps found in verify-package.mjs");
  return [...new Set(names)];
}

const requiredArtifactPaths = extractRequiredArtifactPaths(verifierSource);
const runStepNames = extractRunStepNames(verifierSource);
const manifestExtraPath = "manifest-extra/asset.txt";

/**
 * Build a temporary fixture package in which the copied verifier passes:
 * every required artifact path exists, every npm step is a no-op stub, and
 * the contract manifest stub adds one extra path to exercise the union branch.
 */
function makePackageFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-verify-package-"));
  tempRoots.push(root);

  for (const relPath of [...requiredArtifactPaths, manifestExtraPath]) {
    const absPath = path.join(root, relPath);
    mkdirSync(path.dirname(absPath), { recursive: true });
    writeFileSync(absPath, `placeholder for ${relPath}\n`, "utf8");
  }

  // The verifier under test is the real file, copied verbatim.
  copyFileSync(verifierPath, path.join(root, "scripts", "verify-package.mjs"));

  // Stub for the relative manifest import; one path beyond the static list
  // exercises the requiredArtifactPaths ∪ requiredPackageFiles union.
  writeFileSync(
    path.join(root, "core", "verification", "skill-contract-manifest.mjs"),
    `export const requiredPackageFiles = ["package.json", "${manifestExtraPath}"];\n`,
    "utf8",
  );

  // Invoked directly via process.execPath, not through an npm script.
  writeFileSync(
    path.join(root, "scripts", "project-runtime-assets.mjs"),
    "process.exit(0);\n",
    "utf8",
  );

  const scripts = { test: 'node -e "process.exit(0)"' };
  for (const name of runStepNames) {
    scripts[name] = 'node -e "process.exit(0)"';
  }

  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify(
      {
        name: "ddalggak-verify-package-fixture",
        version: "0.0.0",
        type: "module",
        private: true,
        scripts,
        files: [
          ".codex/",
          "ddalggak/",
          "bin/",
          "scripts/",
          "evals/",
          "templates/",
          "core/",
          "manifest-extra/",
          "README.md",
          "llms.txt",
          "LICENSE",
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return root;
}

function runVerifyPackage(root) {
  return spawnSync(
    process.execPath,
    [path.join(root, "scripts", "verify-package.mjs")],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

const tests = [
  {
    name: "extracts the verifier contracts needed to drive the fixture",
    run() {
      assertIncludes(requiredArtifactPaths, "package.json", "requiredArtifactPaths");
      assert(
        requiredArtifactPaths.length > 10,
        `expected a substantial required path list, got ${requiredArtifactPaths.length}`,
      );
      assertIncludes(runStepNames, "verify:issue-forms", "runStepNames");
      assertIncludes(runStepNames, "verify:workflow-boundary", "runStepNames");
    },
  },

  {
    name: "passes end-to-end when all steps succeed and all required paths are packed",
    run() {
      const root = makePackageFixture();
      const result = runVerifyPackage(root);
      assert(
        result.status === 0,
        `expected exit 0, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assertIncludes(result.stdout, "[verify-package] passed", "stdout");
      assertIncludes(result.stdout, "artifact ok", "stdout");
      assertIncludes(result.stdout, "missing-required: 0", "stdout");
      // Union branch: the manifest-only extra path is reported, not failed on.
      assertIncludes(result.stdout, "generated-manifest-only: 1", "stdout");
      assertIncludes(result.stdout, manifestExtraPath, "stdout");
    },
  },

  {
    name: "fails with a categorized report when a required runtime-surface path is missing",
    run() {
      const root = makePackageFixture();
      const victim = requiredArtifactPaths.find((p) => p.startsWith("bin/lib/"));
      assert(victim, "expected a bin/lib/ entry in requiredArtifactPaths");
      rmSync(path.join(root, victim));
      const result = runVerifyPackage(root);
      assert(
        result.status === 1,
        `expected exit 1, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assertIncludes(result.stderr, "missing required paths by category", "stderr");
      assertIncludes(result.stderr, "runtime-surface", "stderr");
      assertIncludes(result.stderr, victim, "stderr");
    },
  },

  {
    name: "propagates a failing pipeline step as a named failure",
    run() {
      const root = makePackageFixture();
      const pkgPath = path.join(root, "package.json");
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      pkg.scripts.test = 'node -e "process.exit(1)"';
      writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      const result = runVerifyPackage(root);
      assert(
        result.status === 1,
        `expected exit 1, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
      assertIncludes(result.stderr, "npm test failed with exit 1", "stderr");
    },
  },
];

let passed = 0;
const failures = [];

for (const test of tests) {
  try {
    test.run();
    passed++;
    console.log(`[PASS] ${test.name}`);
  } catch (error) {
    failures.push({ name: test.name, error });
    console.error(`[FAIL] ${test.name}`);
    console.error(error && error.stack ? error.stack : String(error));
  }
}

console.log(`\nSummary: ${passed}/${tests.length} verify-package cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
