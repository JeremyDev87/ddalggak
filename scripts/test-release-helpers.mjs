import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertReleaseUpgrade,
  classifyNpmLookupError,
  classifyNpmPublishError,
  compareReleaseVersions,
  resolveReleasePlan,
} from "./lib/release.mjs";

const rootDir = process.cwd();
const nodeCommand = process.execPath;
const tempRoots = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertThrows(fn, expectedMessage, message) {
  try {
    fn();
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    assert(text.includes(expectedMessage), `${message}: expected error to include ${JSON.stringify(expectedMessage)}, got ${JSON.stringify(text)}`);
    return;
  }
  throw new Error(`${message}: expected function to throw`);
}

function runScript(scriptPath, args = [], options = {}) {
  return spawnSync(nodeCommand, [scriptPath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
}

function assertExit(result, expected, label) {
  assert(
    result.status === expected,
    `${label}: expected exit ${expected}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function makeTempDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-release-helper-"));
  tempRoots.push(dir);
  return dir;
}

function cleanup() {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
}

process.on("exit", cleanup);

const tests = [
  {
    name: "stable release plan resolves latest release metadata",
    run() {
      const plan = resolveReleasePlan("v0.1.1");
      assertEqual(plan.tag, "v0.1.1", "tag");
      assertEqual(plan.version, "0.1.1", "version");
      assertEqual(plan.isPrerelease, false, "isPrerelease");
      assertEqual(plan.npmDistTag, "latest", "npmDistTag");
      assertEqual(plan.githubReleaseType, "release", "githubReleaseType");
    },
  },
  {
    name: "prerelease plan resolves next prerelease metadata",
    run() {
      const plan = resolveReleasePlan("v0.2.0-alpha.1");
      assertEqual(plan.version, "0.2.0-alpha.1", "version");
      assertEqual(plan.isPrerelease, true, "isPrerelease");
      assertEqual(plan.npmDistTag, "next", "npmDistTag");
      assertEqual(plan.githubReleaseType, "prerelease", "githubReleaseType");
    },
  },
  {
    name: "release plan rejects non-v tags",
    run() {
      assertThrows(() => resolveReleasePlan("0.1.1"), "Tag must look like", "non-v tag");
    },
  },
  {
    name: "release plan rejects malformed semver tags",
    run() {
      for (const tag of [
        "v01.2.3",
        "v1.02.3",
        "v1.2.03",
        "v1.2.3-alpha..1",
        "v1.2.3-alpha.01",
        "v1.2.3-alpha.",
      ]) {
        assertThrows(() => resolveReleasePlan(tag), "Tag must look like", `malformed tag ${tag}`);
      }
    },
  },
  {
    name: "version compare and upgrade assertion follow semver ordering",
    run() {
      assert(compareReleaseVersions("0.1.0", "0.1.1") < 0, "patch should increase");
      assert(compareReleaseVersions("0.2.0-alpha.1", "0.2.0-alpha.2") < 0, "prerelease numeric should increase");
      assert(compareReleaseVersions("0.2.0-alpha.2", "0.2.0") < 0, "stable should be greater than prerelease");
      assertReleaseUpgrade("0.1.0", "0.1.1");
      assertThrows(() => assertReleaseUpgrade("0.1.1", "0.1.1"), "must be greater", "same version");
      assertThrows(() => assertReleaseUpgrade("0.2.0", "0.2.0-alpha.1"), "must be greater", "downgrade to prerelease");
    },
  },
  {
    name: "release-plan CLI emits GitHub Actions key value lines",
    run() {
      const result = runScript("scripts/release-plan.mjs", ["v0.1.1"]);
      assertExit(result, 0, "release-plan v0.1.1");
      const lines = new Set(result.stdout.trim().split("\n"));
      for (const line of [
        "tag=v0.1.1",
        "version=0.1.1",
        "isPrerelease=false",
        "npmDistTag=latest",
        "githubReleaseType=release",
      ]) {
        assert(lines.has(line), `expected release-plan output to include ${line}`);
      }
    },
  },
  {
    name: "release-plan CLI rejects non-v tags",
    run() {
      const result = runScript("scripts/release-plan.mjs", ["0.1.1"]);
      assertExit(result, 1, "release-plan 0.1.1");
      assert(result.stderr.includes("Tag must look like"), `expected tag error, got ${result.stderr}`);
    },
  },
  {
    name: "bump-release-version updates only package version",
    run() {
      const dir = makeTempDir();
      const packagePath = path.join(dir, "package.json");
      writeFileSync(packagePath, JSON.stringify({ name: "fixture", version: "0.1.0", scripts: { test: "node ok.mjs" } }, null, 2) + "\n");
      const result = runScript("scripts/bump-release-version.mjs", ["v0.1.1", packagePath]);
      assertExit(result, 0, "bump v0.1.1");
      const updated = JSON.parse(readFileSync(packagePath, "utf8"));
      assertEqual(updated.version, "0.1.1", "updated version");
      assertEqual(updated.name, "fixture", "name preserved");
      assertEqual(updated.scripts.test, "node ok.mjs", "scripts preserved");
      assert(result.stdout.includes("version=0.1.1"), `expected stdout to include version, got ${result.stdout}`);
    },
  },
  {
    name: "bump-release-version rejects non-upgrades",
    run() {
      const dir = makeTempDir();
      const packagePath = path.join(dir, "package.json");
      writeFileSync(packagePath, JSON.stringify({ name: "fixture", version: "0.1.1" }, null, 2) + "\n");
      const result = runScript("scripts/bump-release-version.mjs", ["v0.1.1", packagePath]);
      assertExit(result, 1, "bump same version");
      assert(result.stderr.includes("must be greater"), `expected non-upgrade error, got ${result.stderr}`);
    },
  },
  {
    name: "npm lookup classifier maps 404 to not-found",
    run() {
      assertEqual(classifyNpmLookupError("npm ERR! code E404\n404 Not Found"), "not-found", "E404");
      assertEqual(classifyNpmLookupError("network timeout"), "unknown", "unknown lookup");
    },
  },
  {
    name: "npm publish classifier maps already published to already-published",
    run() {
      assertEqual(
        classifyNpmPublishError("You cannot publish over the previously published versions"),
        "already-published",
        "already published"
      );
      assertEqual(classifyNpmPublishError("npm ERR! code EOTP"), "unknown", "unknown publish");
    },
  },
  {
    name: "npm error classifier CLI supports lookup and publish modes",
    run() {
      const dir = makeTempDir();
      const stderrPath = path.join(dir, "npm-stderr.txt");

      writeFileSync(stderrPath, "npm ERR! code E404\n404 Not Found", "utf8");
      let result = runScript("scripts/classify-npm-error.mjs", ["--mode", "lookup", stderrPath]);
      assertExit(result, 0, "classify lookup");
      assertEqual(result.stdout.trim(), "not-found", "lookup classifier stdout");

      writeFileSync(stderrPath, "You cannot publish over the previously published versions", "utf8");
      result = runScript("scripts/classify-npm-error.mjs", ["--mode=publish", stderrPath]);
      assertExit(result, 0, "classify publish");
      assertEqual(result.stdout.trim(), "already-published", "publish classifier stdout");
    },
  },
  {
    name: "legacy npm classifier wrappers delegate to the shared CLI",
    run() {
      const dir = makeTempDir();
      const stderrPath = path.join(dir, "npm-stderr.txt");

      writeFileSync(stderrPath, "npm ERR! code E404\n404 Not Found", "utf8");
      let result = runScript("scripts/classify-npm-lookup-error.mjs", [stderrPath]);
      assertExit(result, 0, "legacy lookup wrapper");
      assertEqual(result.stdout.trim(), "not-found", "legacy lookup stdout");

      writeFileSync(stderrPath, "You cannot publish over the previously published versions", "utf8");
      result = runScript("scripts/classify-npm-publish-error.mjs", [stderrPath]);
      assertExit(result, 0, "legacy publish wrapper");
      assertEqual(result.stdout.trim(), "already-published", "legacy publish stdout");

      result = runScript("scripts/classify-npm-lookup-error.mjs", [path.join(dir, "missing.txt")]);
      assertExit(result, 1, "legacy lookup missing file");
      assert(
        result.stderr.includes("Usage: node scripts/classify-npm-error.mjs"),
        `missing file usage: stderr did not include shared usage\n${result.stderr}`,
      );
    },
  },
];

let passed = 0;
const failures = [];

for (const test of tests) {
  try {
    test.run();
    passed += 1;
    console.log(`[PASS] ${test.name}`);
  } catch (error) {
    failures.push({ name: test.name, error });
    console.error(`[FAIL] ${test.name}`);
    console.error(error && error.stack ? error.stack : String(error));
  }
}

console.log(`\nSummary: ${passed}/${tests.length} release helper cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
