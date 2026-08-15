#!/usr/bin/env node
import { readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { runNodeScript } from "./test-lib/process.mjs";
import { copyRepoWithoutGitAndNodeModules } from "./test-lib/repo-fixture.mjs";

const rootDir = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runVerifier(cwd) {
  return runNodeScript("scripts/verify-hermes-skill.mjs", [], { cwd });
}

function withRepo(run) {
  const tempDir = copyRepoWithoutGitAndNodeModules({
    rootDir,
    prefix: "ddalggak-hermes-skill-",
  });
  try {
    return run(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const tests = [
  {
    name: "accepts the shared Hermes skill payload",
    run() {
      withRepo((tempDir) => {
        const result = runVerifier(tempDir);
        assert(result.status === 0, `${result.stdout}\n${result.stderr}`);
        assert(result.stdout.includes("[verify:hermes-skill] passed"), result.stdout);
      });
    },
  },
  {
    name: "does not depend on non-contract frontmatter extensions",
    run() {
      withRepo((tempDir) => {
        const skillPath = path.join(tempDir, "ddalggak", "SKILL.md");
        const skill = readFileSync(skillPath, "utf8")
          .replace(/^argument-hint:.*\n/m, "")
          .replace(/^user-invocable:.*\n/m, "");
        writeFileSync(skillPath, skill, "utf8");
        const result = runVerifier(tempDir);
        assert(result.status === 0, `${result.stdout}\n${result.stderr}`);
      });
    },
  },
  {
    name: "rejects a missing required reference file",
    run() {
      withRepo((tempDir) => {
        unlinkSync(path.join(tempDir, "ddalggak", "references", "status.md"));
        const result = runVerifier(tempDir);
        const output = `${result.stdout}\n${result.stderr}`;
        assert(result.status === 1, output);
        assert(output.includes("Hermes support asset missing: ddalggak/references/status.md"), output);
      });
    },
  },
  {
    name: "rejects a command asset that is no longer linked from SKILL.md",
    run() {
      withRepo((tempDir) => {
        const skillPath = path.join(tempDir, "ddalggak", "SKILL.md");
        const skill = readFileSync(skillPath, "utf8").split("references/status.md").join("references/status-removed.md");
        writeFileSync(skillPath, skill, "utf8");
        const result = runVerifier(tempDir);
        const output = `${result.stdout}\n${result.stderr}`;
        assert(result.status === 1, output);
        assert(output.includes("does not link required asset for status: references/status.md"), output);
      });
    },
  },
  {
    name: "rejects prose that Hermes parses as a missing support path",
    run() {
      withRepo((tempDir) => {
        const skillPath = path.join(tempDir, "ddalggak", "SKILL.md");
        const skill = readFileSync(skillPath, "utf8").replace(
          "references, templates, scripts, eval 디렉터리로",
          "references/templates/scripts/eval로",
        );
        writeFileSync(skillPath, skill, "utf8");
        const result = runVerifier(tempDir);
        const output = `${result.stdout}\n${result.stderr}`;
        assert(result.status === 1, output);
        assert(
          output.includes("Hermes support asset missing: ddalggak/references/templates/scripts/eval로"),
          output,
        );
      });
    },
  },
  {
    name: "rejects npm artifacts that omit the shared Hermes payload",
    run() {
      withRepo((tempDir) => {
        const packagePath = path.join(tempDir, "package.json");
        const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
        pkg.files = pkg.files.filter((entry) => entry !== "ddalggak/");
        writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
        const result = runVerifier(tempDir);
        const output = `${result.stdout}\n${result.stderr}`;
        assert(result.status === 1, output);
        assert(output.includes("Hermes support asset missing from npm package: ddalggak/SKILL.md"), output);
      });
    },
  },
];

let passed = 0;
for (const test of tests) {
  test.run();
  passed += 1;
  console.log(`[PASS] ${test.name}`);
}
console.log(`[test:hermes-skill] passed: ${passed}/${tests.length}`);
