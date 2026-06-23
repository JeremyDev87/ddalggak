// Committed rejection-behaviour regression for the token budget coverage / cap /
// ceiling gate (#283). The gate lives in scripts/project-runtime-assets.mjs and
// runs as `--report --admission` inside npm run verify. Each case copies the
// repo into a temp tree, mutates one input, runs the admission gate there, and
// asserts it fails closed with the expected reason — so a future refactor that
// drops a check is caught instead of silently degrading the gate to a no-op.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runNodeScript } from "./test-lib/process.mjs";
import { withTempRepo } from "./test-lib/repo-fixture.mjs";

const rootDir = process.cwd();
function runAdmission(tempDir) {
  return runNodeScript("scripts/project-runtime-assets.mjs", ["--report", "--admission"], {
    cwd: tempDir,
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || path.join(os.tmpdir(), "ddalggak-npm-cache"),
    },
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
      `${name}: expected admission gate to pass, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

function assertFail(name, result, expectedMessage) {
  if (result.status === 0) {
    throw new Error(`${name}: expected admission gate to fail, but it passed\nstdout:\n${result.stdout}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(expectedMessage)) {
    throw new Error(
      `${name}: expected failure output to include ${JSON.stringify(expectedMessage)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

const PROJECTIONS = "core/projections.yaml";
const EXEMPTIONS_HEADER = "reference_budget_exemptions:\n";

// Baseline: an unmutated copy must pass so the failing cases prove the mutation,
// not a broken temp tree.
withTempRepo("baseline admission passes on an unmutated copy", (tempDir) => {
  assertPass("baseline admission passes on an unmutated copy", runAdmission(tempDir));
});

// Coverage: a reference that is neither measured nor exempt must fail. Removing
// common-rules.md's exemption leaves it reachable but unbudgeted.
withTempRepo("unmeasured + unexempt reference fails coverage", (tempDir) => {
  replaceInFile(
    path.join(tempDir, PROJECTIONS),
    "  - reference: common-rules.md\n" +
      "    max_tokens: 500\n" +
      "    reason: operational guardrail referenced from SKILL.md body pointer, not a per-subcommand required reference\n",
    "",
  );
  assertFail(
    "unmeasured + unexempt reference fails coverage",
    runAdmission(tempDir),
    "reference common-rules.md is neither measured",
  );
});

// Redundant exemption: a reference that is already measured must not also be
// exempt. core-invariants.md is in plan/start/review required_references.
withTempRepo("exemption of a measured reference fails as redundant", (tempDir) => {
  replaceInFile(
    path.join(tempDir, PROJECTIONS),
    EXEMPTIONS_HEADER,
    EXEMPTIONS_HEADER +
      "  - reference: core-invariants.md\n    max_tokens: 99999\n    reason: test redundant exemption\n",
  );
  assertFail(
    "exemption of a measured reference fails as redundant",
    runAdmission(tempDir),
    "reference core-invariants.md is both measured and listed in reference_budget_exemptions",
  );
});

// Stale exemption: an exemption for a non-existent reference must fail.
withTempRepo("exemption of a non-existent reference fails as stale", (tempDir) => {
  replaceInFile(
    path.join(tempDir, PROJECTIONS),
    EXEMPTIONS_HEADER,
    EXEMPTIONS_HEADER +
      "  - reference: __no-such-reference-probe.md\n    max_tokens: 100\n    reason: test stale exemption\n",
  );
  assertFail(
    "exemption of a non-existent reference fails as stale",
    runAdmission(tempDir),
    "ddalggak/references/__no-such-reference-probe.md does not exist",
  );
});

// Cap: growing a capped conditional gate past its max_tokens must fail — the
// vulnerability #283 names (frontend-design-gate +8000 chars previously passed).
withTempRepo("growing an exempt reference past its cap fails", (tempDir) => {
  const padding = "x".repeat(8000);
  for (const referenceRelativePath of [
    "ddalggak/references/frontend-design-gate.md",
    ".codex/skills/ddalggak/references/frontend-design-gate.md",
  ]) {
    appendFileSync(path.join(tempDir, referenceRelativePath), `\n${padding}\n`);
  }
  assertFail(
    "growing an exempt reference past its cap fails",
    runAdmission(tempDir),
    "reference frontend-design-gate.md ~",
  );
});

// Ceiling: a budget raised past its absolute ceiling must fail even though the
// content fits — this is the 2-PR ratchet bypass guard. claude plan
// budget 20000 has ceiling 30000.
withTempRepo("budget above its ceiling fails", (tempDir) => {
  replaceInFile(path.join(tempDir, PROJECTIONS), "    plan: 20000\n", "    plan: 40000\n");
  assertFail(
    "budget above its ceiling fails",
    runAdmission(tempDir),
    "budget 40000 exceeds ceiling 30000",
  );
});

console.log("\n[test:token-budget-coverage] passed");
