#!/usr/bin/env node
/**
 * test-check-budget-isolation.mjs
 *
 * Both-sides tests for scripts/check-budget-isolation.mjs (#267) against a
 * hermetic temporary git repository, so the gate can be exercised without a
 * PR context and without touching the real repository history.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checkScript = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "check-budget-isolation.mjs",
);

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: os.devNull,
  GIT_CONFIG_SYSTEM: os.devNull,
  GIT_AUTHOR_NAME: "budget-isolation-test",
  GIT_AUTHOR_EMAIL: "budget-isolation-test@example.com",
  GIT_COMMITTER_NAME: "budget-isolation-test",
  GIT_COMMITTER_EMAIL: "budget-isolation-test@example.com",
};

function git(repoDir, args) {
  const result = spawnSync("git", args, { cwd: repoDir, encoding: "utf8", env: gitEnv });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

function writeRepoFile(repoDir, relPath, content) {
  const filePath = path.join(repoDir, relPath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function editRepoFile(repoDir, relPath, search, replacement) {
  const filePath = path.join(repoDir, relPath);
  const current = readFileSync(filePath, "utf8");
  if (!current.includes(search)) {
    throw new Error(`fixture edit target not found in ${relPath}: ${search}`);
  }
  writeFileSync(filePath, current.replace(search, replacement), "utf8");
}

function commitAll(repoDir, message) {
  git(repoDir, ["add", "-A"]);
  git(repoDir, ["commit", "-q", "-m", message]);
  return git(repoDir, ["rev-parse", "HEAD"]);
}

const baseProjections = `source_root: ddalggak
parity_ledger:
  - path: SKILL.md
    class: must-match
# claude_legacy values: #224 baseline.
subcommand_token_budgets:
  claude_legacy:
    start: 19500
    review: 20000
  codex:
    start: 23000
    review: 26500
`;

function makeFixtureRepo() {
  const repoDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-budget-isolation-"));
  git(repoDir, ["init", "-q"]);
  writeRepoFile(repoDir, "core/projections.yaml", baseProjections);
  writeRepoFile(repoDir, "core/commands/start.yaml", "command: start\n");
  writeRepoFile(repoDir, "ddalggak/SKILL.md", "skill body v1\n");
  writeRepoFile(repoDir, ".codex/skills/ddalggak/SKILL.md", "codex skill body v1\n");
  writeRepoFile(repoDir, "scripts/project-runtime-assets.mjs", "// estimation formula v1\n");
  writeRepoFile(repoDir, "README.md", "readme v1\n");
  const baseSha = commitAll(repoDir, "base");
  return { repoDir, baseSha };
}

function runCheck(repoDir, baseRef, headRef) {
  return spawnSync(
    process.execPath,
    [checkScript, "--base", baseRef, "--head", headRef],
    { cwd: repoDir, encoding: "utf8", env: gitEnv },
  );
}

function assertExit(name, result, expectedExit) {
  if (result.status !== expectedExit) {
    throw new Error(
      `${name}: expected exit ${expectedExit}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

const tests = [
  {
    name: "violation: budget change + ddalggak measured content fails",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-violation-legacy", baseSha]);
      editRepoFile(repoDir, "core/projections.yaml", "start: 19500", "start: 21000");
      editRepoFile(repoDir, "ddalggak/SKILL.md", "skill body v1", "skill body v2 grown");
      const headSha = commitAll(repoDir, "grow content and raise budget");
      const result = runCheck(repoDir, baseSha, headSha);
      assertExit(this.name, result, 1);
      if (!result.stderr.includes("ddalggak/SKILL.md")) {
        throw new Error(`${this.name}: offending file missing from output:\n${result.stderr}`);
      }
    },
  },
  {
    name: "violation: budget change + core/commands contract change fails",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-violation-commands", baseSha]);
      editRepoFile(repoDir, "core/projections.yaml", "review: 26500", "review: 28000");
      editRepoFile(repoDir, "core/commands/start.yaml", "command: start", "command: start\nrequired_references: more");
      const headSha = commitAll(repoDir, "change contract and raise budget");
      assertExit(this.name, runCheck(repoDir, baseSha, headSha), 1);
    },
  },
  {
    name: "budget-only PR passes",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-budget-only", baseSha]);
      editRepoFile(repoDir, "core/projections.yaml", "start: 19500", "start: 21000");
      const headSha = commitAll(repoDir, "raise budget only");
      assertExit(this.name, runCheck(repoDir, baseSha, headSha), 0);
    },
  },
  {
    name: "content-only PR passes",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-content-only", baseSha]);
      editRepoFile(repoDir, ".codex/skills/ddalggak/SKILL.md", "codex skill body v1", "codex skill body v2");
      const headSha = commitAll(repoDir, "grow content only");
      assertExit(this.name, runCheck(repoDir, baseSha, headSha), 0);
    },
  },
  {
    name: "parity_ledger-only projections change is not a budget change",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-parity-ledger", baseSha]);
      editRepoFile(repoDir, "core/projections.yaml", "class: must-match", "class: may-localize");
      editRepoFile(repoDir, "ddalggak/SKILL.md", "skill body v1", "skill body v2");
      const headSha = commitAll(repoDir, "parity ledger + content, budgets untouched");
      assertExit(this.name, runCheck(repoDir, baseSha, headSha), 0);
    },
  },
  {
    name: "calibration PR (budget + non-measured formula file) passes",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-calibration", baseSha]);
      editRepoFile(repoDir, "core/projections.yaml", "start: 23000", "start: 24500");
      editRepoFile(repoDir, "scripts/project-runtime-assets.mjs", "formula v1", "formula v2");
      const headSha = commitAll(repoDir, "calibrate formula and budgets");
      assertExit(this.name, runCheck(repoDir, baseSha, headSha), 0);
    },
  },
  {
    name: "merge-base: content landed on base branch does not flag a budget-only PR",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-advanced-base", baseSha]);
      editRepoFile(repoDir, "ddalggak/SKILL.md", "skill body v1", "skill body advanced on base");
      const advancedBaseSha = commitAll(repoDir, "unrelated content change on base branch");
      git(repoDir, ["checkout", "-q", "-b", "case-budget-pr", baseSha]);
      editRepoFile(repoDir, "core/projections.yaml", "review: 20000", "review: 22000");
      const headSha = commitAll(repoDir, "raise budget only");
      assertExit(this.name, runCheck(repoDir, advancedBaseSha, headSha), 0);
    },
  },
  {
    name: "violation: budget change + rename out of measured path fails",
    run({ repoDir, baseSha }) {
      git(repoDir, ["checkout", "-q", "-b", "case-rename-out", baseSha]);
      editRepoFile(repoDir, "core/projections.yaml", "review: 20000", "review: 21500");
      git(repoDir, ["mv", "ddalggak/SKILL.md", "docs-moved-skill.md"]);
      const headSha = commitAll(repoDir, "move skill out of measured tree and raise budget");
      const result = runCheck(repoDir, baseSha, headSha);
      assertExit(this.name, result, 1);
      if (!result.stderr.includes("ddalggak/SKILL.md")) {
        throw new Error(`${this.name}: renamed-away source path missing from output:\n${result.stderr}`);
      }
    },
  },
  {
    name: "missing --base/--head arguments exit 2",
    run({ repoDir, baseSha }) {
      const result = spawnSync(process.execPath, [checkScript, "--base", baseSha], {
        cwd: repoDir,
        encoding: "utf8",
        env: gitEnv,
      });
      assertExit(this.name, result, 2);
    },
  },
];

let failures = 0;
const fixture = makeFixtureRepo();
try {
  for (const test of tests) {
    try {
      test.run(fixture);
      console.log(`ok - ${test.name}`);
    } catch (error) {
      failures += 1;
      console.error(`not ok - ${test.name}\n${error.message}`);
    }
  }
} finally {
  rmSync(fixture.repoDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.error(`[test-check-budget-isolation] ${failures} test(s) failed`);
  process.exit(1);
}
console.log(`[test-check-budget-isolation] ${tests.length} tests passed`);
