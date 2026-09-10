import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const EXPECTED_SHA = "33d6d3b5318841739a13611da740de2845b2f1f9";
const manifestFile = process.argv.includes("--manifest") ? path.resolve(process.argv[process.argv.indexOf("--manifest") + 1]) : path.resolve("evals/skill-loading/baseline-manifest.json");
const digest = value => createHash("sha256").update(value).digest("hex");

export function loadBinding(manifest, sourceRoot, expectedRoots) {
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.baselineSha, EXPECTED_SHA, "baseline SHA is not immutable");
  assert.equal(typeof manifest.oracleVersion, "string");
  assert(sourceRoot && expectedRoots?.length === 2, "two supplied baseline roots required");
  for (const { relativePath, sha256 } of expectedRoots) assert.equal(digest(readFileSync(path.join(sourceRoot, relativePath))), sha256, `${relativePath} baseline binding mismatch`);
  return true;
}

const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
const temp = mkdtempSync(path.join(os.tmpdir(), "ddalggak-baseline-"));
try {
  const fixture = path.join(temp, "source");
  const files = [{ relativePath: "ddalggak/SKILL.md", body: "baseline-a" }, { relativePath: ".codex/skills/ddalggak/SKILL.md", body: "baseline-b" }];
  for (const file of files) { mkdirSync(path.dirname(path.join(fixture, file.relativePath)), { recursive: true }); writeFileSync(path.join(fixture, file.relativePath), file.body); }
  const expected = files.map(file => ({ relativePath: file.relativePath, sha256: digest(file.body) }));
  loadBinding(manifest, fixture, expected);
  for (const value of ["", "f".repeat(40)]) assert.throws(() => loadBinding({ ...manifest, baselineSha: value }, fixture, expected), /immutable/);
  console.log("[PASS] portable supplied-source binding: 2 roots");
  console.log("[PASS] actual validator rejection probes: empty SHA, wrong SHA");
} finally { rmSync(temp, { recursive: true, force: true }); }
