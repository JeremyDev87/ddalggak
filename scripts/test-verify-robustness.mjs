#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { escapeRegExp } from "./lib/escape-regexp.mjs";

const rootDir = process.cwd();
const fixtureDir = path.join(rootDir, "tests", "fixtures", "verify-robustness");
const nodeCommand = process.execPath;
const tempRoots = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertMatch(name, pattern, text, expected) {
  const match = text.match(pattern);
  assert(match?.[1] === expected, `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(match?.[1])}`);
}

function runProjectionVerifier(cwd) {
  return spawnSync(nodeCommand, ["scripts/verify-projections.mjs"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runRuntimeAssetGenerator(cwd) {
  return spawnSync(nodeCommand, ["scripts/project-runtime-assets.mjs", "--check"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runTokenBudgetReport(cwd, extraArgs = []) {
  return spawnSync(nodeCommand, ["scripts/project-runtime-assets.mjs", "--report", ...extraArgs], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function copyRepo() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-verify-robustness-"));
  tempRoots.push(tempDir);
  cpSync(rootDir, tempDir, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(rootDir, source);
      return !relative.split(path.sep).some((part) => part === ".git" || part === "node_modules");
    },
  });
  return tempDir;
}

function cleanup() {
  while (tempRoots.length > 0) rmSync(tempRoots.pop(), { recursive: true, force: true });
}
process.on("exit", cleanup);

const specialInputs = JSON.parse(readFileSync(path.join(fixtureDir, "special-regexp-inputs.json"), "utf8"));

{
  const frontmatter = `${specialInputs.frontmatterKey}: ddalggak\nnameXwithYspecial: wrong\n`;
  assertMatch(
    "frontmatter key regex escapes metacharacters",
    new RegExp(`^${escapeRegExp(specialInputs.frontmatterKey)}:\\s*(.+?)\\s*$`, "m"),
    frontmatter,
    "ddalggak",
  );

  const arrays = `const ${specialInputs.constName} = ["literal"];\nconst requiredXitems = ["wrong"];`;
  assertMatch(
    "const name regex escapes metacharacters",
    new RegExp(String.raw`const ${escapeRegExp(specialInputs.constName)} = \[([\s\S]*?)\];`),
    arrays,
    '"literal"',
  );

  const block = [
    `<!-- ddalggak:generated:start ${specialInputs.generatedBlockName} -->`,
    "body",
    `<!-- ddalggak:generated:end ${specialInputs.generatedBlockName} -->`,
  ].join("\n");
  assertMatch(
    "generated block name regex escapes metacharacters",
    new RegExp(
      `<!-- ddalggak:generated:start ${escapeRegExp(specialInputs.generatedBlockName)} -->\\n([\\s\\S]*?)\\n<!-- ddalggak:generated:end ${escapeRegExp(specialInputs.generatedBlockName)} -->`,
    ),
    block,
    "body",
  );

  const form = `id: ${specialInputs.fieldId}\nid: sourceXofYtruth`;
  assert(
    new RegExp(`\\bid:\\s*${escapeRegExp(specialInputs.fieldId)}\\b`).test(form),
    "field id regex escapes metacharacters",
  );

  const fixtureText = `{"value":"prefix ${specialInputs.rawPayloadPattern} suffix"}`;
  assert(
    new RegExp(`:\\s*"[^"]*${escapeRegExp(specialInputs.rawPayloadPattern)}[^"]*"`).test(fixtureText),
    "readiness pattern regex escapes metacharacters",
  );
}

{
  const tempDir = copyRepo();
  const result = runRuntimeAssetGenerator(tempDir);
  assert(
    result.status === 0,
    `generator --check on clean copy: expected exit 0, got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
}

for (const [fixtureName, expectedMessage] of [
  ["broken-duplicate-key.yaml", "duplicate key: command"],
  ["broken-list-indentation.yaml", "list indentation must be exactly two spaces"],
  ["broken-nested-structure.yaml", "unsupported indentation or nested mapping"],
]) {
  const tempDir = copyRepo();
  const fixtureText = readFileSync(path.join(fixtureDir, fixtureName), "utf8");
  writeFileSync(path.join(tempDir, "core", "commands", "start.yaml"), fixtureText, "utf8");
  const result = runProjectionVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `${fixtureName}: expected exit 1, got ${result.status}\n${output}`);
  assert(output.includes(expectedMessage), `${fixtureName}: expected output to include ${JSON.stringify(expectedMessage)}\n${output}`);

  const generatorResult = runRuntimeAssetGenerator(tempDir);
  const generatorOutput = `${generatorResult.stdout}\n${generatorResult.stderr}`;
  assert(
    generatorResult.status !== 0,
    `${fixtureName}: expected generator --check to fail closed, got exit ${generatorResult.status}\n${generatorOutput}`,
  );
  assert(
    generatorOutput.includes(expectedMessage),
    `${fixtureName}: expected generator output to include ${JSON.stringify(expectedMessage)}\n${generatorOutput}`,
  );
}

{
  const tempDir = copyRepo();
  const result = runTokenBudgetReport(tempDir, ["--admission"]);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 0, `token budget admission on clean copy: expected exit 0, got ${result.status}\n${output}`);
  assert(output.includes("(root: ddalggak/"), `token budget report must measure the claude_legacy root\n${output}`);
  assert(
    output.includes("(root: .codex/skills/ddalggak/"),
    `token budget report must measure the codex root\n${output}`,
  );
  assert(
    output.includes("over-budget 0, missing-budget 0"),
    `token budget admission on clean copy: expected zero findings\n${output}`,
  );
  assert(output.includes("[token-budget] admission gate: pass"), `expected admission pass line\n${output}`);
}

{
  const tempDir = copyRepo();
  const projectionsPath = path.join(tempDir, "core", "projections.yaml");
  const projections = readFileSync(projectionsPath, "utf8");
  const lowered = projections.replace(/^( {4}review:) \d+$/gm, "$1 1");
  assert(lowered !== projections, "fixture setup: expected to lower at least one review budget");
  writeFileSync(projectionsPath, lowered, "utf8");

  const advisory = runTokenBudgetReport(tempDir);
  const advisoryOutput = `${advisory.stdout}\n${advisory.stderr}`;
  assert(
    advisory.status === 0,
    `over-budget advisory report must stay exit 0, got ${advisory.status}\n${advisoryOutput}`,
  );
  assert(advisoryOutput.includes("exceeds budget 1"), `expected over-budget warning in advisory output\n${advisoryOutput}`);

  const admission = runTokenBudgetReport(tempDir, ["--admission"]);
  const admissionOutput = `${admission.stdout}\n${admission.stderr}`;
  assert(
    admission.status === 1,
    `over-budget admission gate must fail, got exit ${admission.status}\n${admissionOutput}`,
  );
  assert(admissionOutput.includes("exceeds budget 1"), `expected over-budget warning in admission output\n${admissionOutput}`);
  assert(
    admissionOutput.includes("[token-budget] admission gate: fail (over-budget 2"),
    `expected admission fail line counting both roots\n${admissionOutput}`,
  );
}

{
  const tempDir = copyRepo();
  const projectionsPath = path.join(tempDir, "core", "projections.yaml");
  const projections = readFileSync(projectionsPath, "utf8");
  const removed = projections.replace(/^ {4}start: \d+\n/m, "");
  assert(removed !== projections, "fixture setup: expected to remove one start budget line");
  writeFileSync(projectionsPath, removed, "utf8");

  const admission = runTokenBudgetReport(tempDir, ["--admission"]);
  const admissionOutput = `${admission.stdout}\n${admission.stderr}`;
  assert(
    admission.status === 1,
    `missing-budget admission gate must fail closed, got exit ${admission.status}\n${admissionOutput}`,
  );
  assert(
    admissionOutput.includes("no budget declared"),
    `expected missing-budget warning in admission output\n${admissionOutput}`,
  );
  assert(
    admissionOutput.includes("missing-budget 1"),
    `expected missing-budget count in summary\n${admissionOutput}`,
  );
}

console.log("[test:verify-robustness] passed");
