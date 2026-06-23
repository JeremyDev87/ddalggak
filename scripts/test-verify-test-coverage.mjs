#!/usr/bin/env node
// Meta-test: every scripts/test-*.mjs must be executed by at least one
// automated gate — the `npm run verify` chain (scripts/verify-package.mjs) or
// a GitHub Actions workflow. A fail-closed rejection test that is defined but
// wired into no gate degrades to a no-op: the verifier it guards could rot to
// green and nothing would notice (#284).
//
// Coverage model (corpus = verify-package.mjs source + all workflow ymls):
//   a test-*.mjs file is COVERED when
//     (a) the corpus executes it directly (`node scripts/test-X.mjs`, e.g. a
//         ci.yml step), or
//     (b) it is the target of a package.json npm script whose name the corpus
//         invokes (`npm run <name>` or a spawn array `"run", "<name>"`).
// verify-package.mjs is flattened into the corpus, so a test reached only via
// `npm run verify` -> verify-package.mjs -> `npm run test:X` still counts.
// (a) matches the execution form only, never a bare path mention:
// verify-package.mjs lists test paths as packaging data in requiredArtifactPaths,
// and that data must not be misread as "executed".
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { escapeRegExp } from "./lib/escape-regexp.mjs";
import { verifyPipelineNpmScriptNames } from "../core/verification/verify-pipeline.mjs";

const rootDir = process.cwd();
const scriptsDir = path.join(rootDir, "scripts");
const workflowsDir = path.join(rootDir, ".github", "workflows");

function read(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), "utf8");
}

function buildCorpus() {
  const parts = [read("scripts/verify-package.mjs"), read("core/verification/verify-pipeline.mjs")];
  let workflowNames = [];
  try {
    workflowNames = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/.test(name));
  } catch {
    workflowNames = [];
  }
  for (const name of workflowNames) {
    parts.push(readFileSync(path.join(workflowsDir, name), "utf8"));
  }
  return parts.join("\n");
}

// An npm script `name` is invoked by the corpus if it appears either as a
// quoted spawn token (verify-package.mjs uses `["run", "<name>"]` / `["test"]`)
// or as a shell `npm run <name>` (workflows).
function corpusInvokesScript(corpus, name) {
  const quoted = new RegExp(`["']${escapeRegExp(name)}["']`);
  const shell = new RegExp(`npm run ${escapeRegExp(name)}(?![\\w:-])`);
  return quoted.test(corpus) || shell.test(corpus);
}

// Only a real execution counts (`node scripts/<file>` in a workflow step), not
// a bare path mention: verify-package.mjs lists every test path in
// requiredArtifactPaths as packaging data, which must not be read as "executed".
function corpusInvokesFile(corpus, fileBasename) {
  const exec = new RegExp(`node\\s+(?:\\./)?scripts/${escapeRegExp(fileBasename)}(?![\\w.-])`);
  return exec.test(corpus);
}

const failures = [];

const testFiles = readdirSync(scriptsDir).filter((name) => /^test-.*\.mjs$/.test(name));
if (testFiles.length === 0) {
  failures.push("no scripts/test-*.mjs files found; expected the test suite to be non-empty");
}

const pkg = JSON.parse(read("package.json"));
const npmScripts = pkg.scripts || {};
const corpus = buildCorpus();
const manifestScriptNames = verifyPipelineNpmScriptNames;
const packageScriptNames = Object.keys(npmScripts).filter((name) =>
  manifestScriptNames.includes(name),
);
const missingPackageScripts = manifestScriptNames.filter((name) => !(name in npmScripts));
const packageScriptOrderMismatch =
  JSON.stringify(packageScriptNames) !== JSON.stringify(manifestScriptNames);
if (missingPackageScripts.length > 0 || packageScriptOrderMismatch) {
  failures.push(
    `verify pipeline manifest/package.json script drift detected:\n` +
      (missingPackageScripts.length > 0
        ? `  missing from package.json:\n${missingPackageScripts.map((name) => `    - ${name}`).join("\n")}\n`
        : "") +
      (packageScriptOrderMismatch
        ? `  order mismatch:\n    manifest: ${JSON.stringify(manifestScriptNames)}\n    package:  ${JSON.stringify(packageScriptNames)}`
        : ""),
  );
}

// file basename -> npm script names whose command references it
const scriptNamesByFile = new Map();
for (const [name, command] of Object.entries(npmScripts)) {
  for (const fileBasename of testFiles) {
    if (String(command).includes(`scripts/${fileBasename}`)) {
      const list = scriptNamesByFile.get(fileBasename) || [];
      list.push(name);
      scriptNamesByFile.set(fileBasename, list);
    }
  }
}

const orphans = [];
for (const fileBasename of testFiles) {
  if (corpusInvokesFile(corpus, fileBasename)) continue;
  const scriptNames = scriptNamesByFile.get(fileBasename) || [];
  const wiredViaScript = scriptNames.some((name) => corpusInvokesScript(corpus, name));
  if (!wiredViaScript) orphans.push(fileBasename);
}

if (orphans.length > 0) {
  failures.push(
    `orphan test scripts not executed by the verify chain or any workflow:\n` +
      orphans.map((file) => `  - scripts/${file}`).join("\n") +
      `\nWire each into scripts/verify-package.mjs (npm run verify) or a .github/workflows/*.yml step.`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`[test-verify-test-coverage] FAIL: ${failure}`);
  }
  console.error(`[test-verify-test-coverage] ${failures.length} check(s) failed`);
  process.exit(1);
}

console.log(
  `[test-verify-test-coverage] ${testFiles.length} test scripts all covered by the verify chain or a workflow`,
);
