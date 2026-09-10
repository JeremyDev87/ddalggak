// Committed rejection-behaviour regression for the token budget coverage / cap /
// ceiling gate (#283). The gate lives in scripts/project-runtime-assets.mjs and
// runs as `--report --admission` inside npm run verify. Each case copies the
// repo into a temp tree, mutates one input, runs the admission gate there, and
// asserts it fails closed with the expected reason — so a future refactor that
// drops a check is caught instead of silently degrading the gate to a no-op.
import assert from "node:assert/strict";
import { appendFileSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runNodeScript } from "./test-lib/process.mjs";
import { withTempRepo } from "./test-lib/repo-fixture.mjs";
import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";

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

const TOKEN_BUDGETS = "core/token-budgets.yaml";
const EXEMPTIONS_HEADER = "reference_budget_exemptions:\n";

function jsonReport(tempDir, admission = false) {
  const result = runNodeScript("scripts/project-runtime-assets.mjs", ["--report", "--json", ...(admission ? ["--admission"] : [])], { cwd: tempDir });
  assert.equal(result.error, undefined);
  if (!admission) assert.equal(result.status, 0, result.stderr);
  return { result, report: JSON.parse(result.stdout) };
}

// Independent file-based oracle: do not reuse the report's selector or estimator.
function exactRows(tempDir) {
  const { result, report } = jsonReport(tempDir);
  assert.equal(result.status, 0, result.stderr);
  const human = runNodeScript("scripts/project-runtime-assets.mjs", ["--report"], { cwd: tempDir });
  assert.equal(human.status, 0, human.stderr);
  const tables = human.stdout.split("\n").filter((line) => line.startsWith("| "));
  const commands = loadCommandContracts(tempDir);
  assert.equal(report.rows.length, 42);
  const estimate = (files) => Math.ceil(files.reduce((sum, file) => sum + Array.from(readFileSync(path.join(tempDir, file), "utf8"))
    .reduce((tokens, char) => tokens + (char.codePointAt(0) <= 127 ? 0.25 : 1.5), 0), 0));
  for (const [index, row] of report.rows.entries()) {
    const root = index < 21 ? "claude" : "codex";
    const base = root === "claude" ? "ddalggak" : ".codex/skills/ddalggak";
    const doc = commands[index % 21];
    const required = ["references", "templates"].flatMap((kind) => doc[`required_${kind}`].map((name) => `${base}/${kind}/${name}`));
    const conditional = [...new Set(["references", "templates"].flatMap((kind) => (doc[`conditional_${kind}`] || []).map((spec) => `${base}/${kind}/${spec.split("=")[1]}`)))];
    const files = { bootstrap: `${base}/SKILL.md`, command_doc: `${base}/references/command-${doc.command}.md`, required, conditional };
    const baseFiles = [files.bootstrap, files.command_doc, ...required];
    const declared = [...baseFiles, ...conditional];
    assert.equal(row.root, root);
    assert.equal(row.command, doc.command);
    assert.deepEqual(row.files, files);
    assert.equal(new Set(declared).size, declared.length);
    assert.equal(row.bootstrap_est_tokens, estimate([files.bootstrap]));
    assert.equal(row.command_doc_est_tokens, estimate([files.command_doc]));
    assert.equal(row.required_est_tokens, estimate(required));
    assert.equal(row.conditional_est_tokens, estimate(conditional));
    assert.equal(row.base_est_tokens, estimate(baseFiles));
    assert.equal(row.est_tokens, estimate(declared));
    assert.equal(row.conditional_delta_est_tokens, estimate(declared) - estimate(baseFiles));
    assert.equal(row.total_bytes, declared.reduce((sum, file) => sum + statSync(path.join(tempDir, file)).size, 0));
    const tableOffset = root === "claude" ? 0 : 23;
    const headings = tables[tableOffset].split("|").slice(1, -1).map((cell) => cell.trim());
    const cells = tables[tableOffset + 2 + index % 21].split("|").slice(1, -1).map((cell) => cell.trim());
    for (const [column, heading] of headings.entries()) {
      assert.equal(cells[column], String(row[heading] ?? "-"), `${root}/${doc.command}/${heading}`);
    }
  }
  const admitted = jsonReport(tempDir, true);
  assert.deepEqual(admitted.report.rows, report.rows);
  assert.equal(admitted.result.status, report.overBudget + report.missingBudget + report.extraFailures.length > 0 ? 1 : 0);
  assert.equal(report.extraFailures.length, 0, JSON.stringify(report.extraFailures));
  console.log("[PASS] 42 exact file sets, fractional sums, declared/base split, JSON/human/admission parity");
  return report;
}

withTempRepo("exact generated command accounting", (tempDir) => {
  assertPass("generate isolated command documents", runNodeScript("scripts/project-runtime-assets.mjs", ["--write"], { cwd: tempDir }));
  exactRows(tempDir);
  // Force quarter-token edges and same basename across kinds. All real command
  // contracts remain loaded; only review's assets are controlled here.
  const reviewPath = path.join(tempDir, "core/commands/review.yaml");
  replaceInFile(reviewPath, "  - code-shape=simplicity-deletability-gate.md", "  - code-shape=simplicity-deletability-gate.md\n  - another-shape=simplicity-deletability-gate.md");
  replaceInFile(reviewPath, "  - delegated-review=review-brief.md", "  - delegated-review=review-brief.md\n  - another-review=review-brief.md");
  replaceInFile(reviewPath, "required_templates:\n  []", "required_templates:\n  - review-quality-contract.md");
  for (const base of ["ddalggak", ".codex/skills/ddalggak"]) {
    writeFileSync(path.join(tempDir, base, "SKILL.md"), "a");
    writeFileSync(path.join(tempDir, base, "references/command-review.md"), "한😀a");
    const review = loadCommandContracts(tempDir).find((doc) => doc.command === "review");
    for (const kind of ["references", "templates"]) {
      for (const name of [...review[`required_${kind}`], ...(review[`conditional_${kind}`] || []).map((spec) => spec.split("=")[1])]) {
        writeFileSync(path.join(tempDir, base, kind, name), "a");
      }
    }
  }
  const report = exactRows(tempDir);
  for (const row of report.rows.filter((row) => row.command === "review")) {
    assert.equal(row.base_est_tokens, 6);
    assert.equal(row.est_tokens, 8);
    assert.equal(row.conditional_delta_est_tokens, 2);
    assert.equal(row.conditional_est_tokens, 3);
  }
  console.log("[PASS] OR assets counted once, kinds distinct, sum before ceil, delta is rounded declared minus base");
});

// Baseline: an unmutated copy must pass so the failing cases prove the mutation,
// not a broken temp tree.
withTempRepo("baseline admission passes on an unmutated copy", (tempDir) => {
  assertPass("baseline admission passes on an unmutated copy", runAdmission(tempDir));
});

// Coverage: a reference that is neither measured nor exempt must fail. Removing
// common-rules.md's exemption leaves it reachable but unbudgeted.
withTempRepo("unmeasured + unexempt reference fails coverage", (tempDir) => {
  replaceInFile(
    path.join(tempDir, TOKEN_BUDGETS),
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
    path.join(tempDir, TOKEN_BUDGETS),
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
    path.join(tempDir, TOKEN_BUDGETS),
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
  replaceInFile(path.join(tempDir, TOKEN_BUDGETS), "    plan: 20000\n", "    plan: 40000\n");
  assertFail(
    "budget above its ceiling fails",
    runAdmission(tempDir),
    "budget 40000 exceeds ceiling 30000",
  );
});

const rejectionCases = [
  ["missing budget", (dir) => replaceInFile(path.join(dir, TOKEN_BUDGETS), "    status: 10500\n", ""), "claude/status: no budget declared"],
  ["malformed budget", (dir) => replaceInFile(path.join(dir, TOKEN_BUDGETS), "    status: 10500\n", "    status: invalid\n"), "claude/status: no budget declared"],
  ["missing ceiling", (dir) => replaceInFile(path.join(dir, TOKEN_BUDGETS), "    start: 34500\n", ""), "claude/start: no ceiling declared"],
  ["malformed exemption cap", (dir) => replaceInFile(path.join(dir, TOKEN_BUDGETS), "    max_tokens: 2100\n", "    max_tokens: invalid\n"), "missing a positive integer max_tokens cap"],
  ["duplicate exemption", (dir) => replaceInFile(path.join(dir, TOKEN_BUDGETS), EXEMPTIONS_HEADER, `${EXEMPTIONS_HEADER}  - reference: common-rules.md\n    max_tokens: 500\n`), "duplicate entry for 'common-rules.md'"],
  ...["review-output-contract.md", "review-comment-style.md", "command-review.md"].map((reference) => [
    `redundant exemption for ${reference}`,
    (dir) => replaceInFile(path.join(dir, TOKEN_BUDGETS), EXEMPTIONS_HEADER, `${EXEMPTIONS_HEADER}  - reference: ${reference}\n    max_tokens: 2200\n`),
    `reference ${reference} is both measured`,
  ]),
  ...["ddalggak", ".codex/skills/ddalggak"].flatMap((base) => [
    [`missing ${base} command document`, (dir) => unlinkSync(path.join(dir, base, "references/command-review.md")), `${base}/references/command-review.md`],
    [`missing ${base} conditional asset`, (dir) => unlinkSync(path.join(dir, base, "references/review-output-contract.md")), `${base}/references/review-output-contract.md`],
    [`over-budget ${base} selected document`, (dir) => appendFileSync(path.join(dir, base, "references/command-review.md"), "x".repeat(160000)), "exceeds budget"],
    [`over-cap ${base} exemption`, (dir) => appendFileSync(path.join(dir, base, "references/frontend-design-gate.md"), "x".repeat(8000)), "exceeds its exemption cap 2100"],
  ]),
  ["command document in required assets", (dir) => replaceInFile(path.join(dir, "core/commands/review.yaml"), "required_references:\n", "required_references:\n  - command-review.md\n"), "owned by its command base"],
  ["malformed conditional declaration", (dir) => replaceInFile(path.join(dir, "core/commands/review.yaml"), "public-body=review-output-contract.md", "public-body=../review-output-contract.md"), "traversal-free Markdown basename"],
];
for (const [name, mutate, reason] of rejectionCases) {
  withTempRepo(name, (tempDir) => {
    mutate(tempDir);
    assertFail(name, runAdmission(tempDir), reason);
    const result = runNodeScript("scripts/project-runtime-assets.mjs", ["--report", "--json", "--admission"], { cwd: tempDir });
    assertFail(`${name} JSON`, result, reason);
    if (result.stdout) {
      const report = JSON.parse(result.stdout);
      assert.equal(report.rows.length, 42);
      assert(report.overBudget + report.missingBudget + report.extraFailures.length > 0);
    }
  });
}
withTempRepo("JSON without report fails without writing", (tempDir) => {
  const before = readFileSync(path.join(tempDir, "ddalggak/SKILL.md"));
  assertFail("JSON requires report", runNodeScript("scripts/project-runtime-assets.mjs", ["--json", "--write"], { cwd: tempDir }), "--json requires --report");
  assert.deepEqual(readFileSync(path.join(tempDir, "ddalggak/SKILL.md")), before);
});

console.log("\n[test:token-budget-coverage] passed");
