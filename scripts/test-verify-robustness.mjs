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
}

console.log("[test:verify-robustness] passed");
