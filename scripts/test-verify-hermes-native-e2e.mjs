#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildExpectedBundle,
  createCanonicalTempRoot,
  validateHermesNativeEvidence,
  validateHermesNativeRepositoryBinding,
} from "./verify-hermes-native-e2e.mjs";
import { runNodeScript } from "./test-lib/process.mjs";

const rootDir = process.cwd();
const expected = buildExpectedBundle(rootDir);
const commit = "1".repeat(40);
const repoTree = "2".repeat(40);
const skillTree = "3".repeat(40);
const hermesRevision = "4".repeat(40);
const rawUrl = `https://raw.githubusercontent.com/JeremyDev87/ddalggak/${commit}/ddalggak/SKILL.md`;
const identifier = "JeremyDev87/ddalggak/ddalggak";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

{
  const tempRoot = createCanonicalTempRoot();
  try {
    assert(tempRoot === realpathSync(tempRoot), `temporary root is not canonical: ${tempRoot}`);
    console.log("[PASS] canonicalizes temporary roots before Hermes containment checks");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function lane(source, laneIdentifier, sourceRevision = "") {
  return {
    inspect: true,
    installed: true,
    listed: true,
    check_status: "up_to_date",
    update_status: "no_updates",
    loader_discovered: true,
    audit_install: true,
    audit_scan: true,
    hash_stable_after_update: true,
    source,
    identifier: laneIdentifier,
    source_revision: sourceRevision,
    content_hash: expected.content_hash,
    files: [...expected.files],
    scan_verdict: "safe",
  };
}

function validEvidence() {
  return {
    schema: "ddalggak-hermes-native-e2e/v1",
    result: "PASS",
    generated_at: new Date().toISOString(),
    repository: {
      commit,
      repo_tree: repoTree,
      skill_tree: skillTree,
      raw_url: rawUrl,
      identifier,
    },
    hermes: { revision: hermesRevision },
    expected,
    lanes: {
      default_raw: lane("url", rawUrl),
      named_repository: {
        ...lane("github", identifier, commit),
        synthetic_check_status: "update_available",
        synthetic_update_restored: true,
        installed_at_preserved: true,
        updated_at_advanced: true,
        audit_install_count: 2,
      },
      named_empty: {
        tree_absent: true,
        lock_absent: true,
        loader_absent: true,
      },
    },
  };
}

function expectReject(name, mutate, needle) {
  const evidence = structuredClone(validEvidence());
  mutate(evidence);
  let message = "";
  try {
    validateHermesNativeEvidence(evidence, expected);
  } catch (error) {
    message = error.message;
  }
  assert(message.includes(needle), `${name}: expected ${JSON.stringify(needle)}, got ${JSON.stringify(message)}`);
  console.log(`[PASS] ${name}`);
}

validateHermesNativeEvidence(validEvidence(), expected);
console.log("[PASS] accepts complete dual-source/profile evidence");

expectReject("rejects malformed evidence timestamps", (e) => {
  e.generated_at = "not-a-timestamp";
}, "canonical ISO timestamp");
expectReject("rejects non-canonical timestamp text", (e) => {
  e.generated_at = "August 16, 2026 00:00:00 UTC";
}, "canonical ISO timestamp");
expectReject("rejects impossible calendar dates", (e) => {
  e.generated_at = "2026-02-30T00:00:00.000Z";
}, "canonical ISO timestamp");
expectReject("rejects stale evidence", (e) => {
  e.generated_at = "1970-01-01T00:00:00.000Z";
}, "older than 24 hours");
expectReject("rejects future-dated evidence", (e) => {
  e.generated_at = "2999-01-01T00:00:00.000Z";
}, "cannot be in the future");
expectReject("rejects command-success false positives without an installed tree", (e) => {
  e.lanes.default_raw.installed = false;
}, "did not produce an installed tree");
expectReject("rejects empty or missing lock provenance", (e) => {
  delete e.lanes.named_repository;
}, "missing lane");
expectReject("rejects a missing supporting file", (e) => {
  e.lanes.default_raw.files.pop();
}, "file manifest differs");
expectReject("rejects exact-source content hash drift", (e) => {
  e.lanes.default_raw.content_hash = "sha256:0000000000000000";
}, "content hash differs");
expectReject("rejects repository revision drift", (e) => {
  e.lanes.named_repository.source_revision = "5".repeat(40);
}, "source_revision mismatch");
expectReject("rejects cross-profile loader leakage", (e) => {
  e.lanes.named_empty.loader_absent = false;
}, "loader leaked");
expectReject("rejects non-idempotent update mutation", (e) => {
  e.lanes.named_repository.hash_stable_after_update = false;
}, "content changed");
expectReject("rejects stale mutable raw URLs", (e) => {
  e.repository.raw_url = "https://raw.githubusercontent.com/JeremyDev87/ddalggak/master/ddalggak/SKILL.md";
}, "immutable raw URL");
expectReject("rejects dangerous scan verdicts", (e) => {
  e.lanes.default_raw.scan_verdict = "dangerous";
}, "unsafe scan verdict");

{
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
    assert(result.status === 0, `git ${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  const evidence = validEvidence();
  evidence.repository.commit = git("rev-parse", "HEAD");
  evidence.repository.repo_tree = git("rev-parse", "HEAD^{tree}");
  evidence.repository.skill_tree = git("rev-parse", "HEAD:ddalggak");
  evidence.repository.raw_url = `https://raw.githubusercontent.com/JeremyDev87/ddalggak/${evidence.repository.commit}/ddalggak/SKILL.md`;
  evidence.lanes.default_raw.identifier = evidence.repository.raw_url;
  evidence.lanes.named_repository.source_revision = evidence.repository.commit;
  validateHermesNativeRepositoryBinding(evidence, rootDir);
  const forged = structuredClone(evidence);
  forged.repository.repo_tree = "f".repeat(40);
  let message = "";
  try {
    validateHermesNativeRepositoryBinding(forged, rootDir);
  } catch (error) {
    message = error.message;
  }
  assert(message.includes("repository tree mismatch"), `forged repository tree must fail closed, got ${message}`);
  console.log("[PASS] binds native evidence to real repository and skill trees");
}

const dangerousPatterns = [
  { id: "agent_config_mod", regex: /AGENTS\.md|CLAUDE\.md|\.cursorrules|\.clinerules/i },
  { id: "dump_all_env", regex: /printenv|env\s*\|/i },
  { id: "context_exfil", regex: /(include|output|print|send|share)\s+(?:\w+\s+)*(conversation|chat\s+history|previous\s+messages|context)/i },
];
const findings = [];
for (const relPath of expected.files) {
  const text = readFileSync(path.join(rootDir, "ddalggak", relPath), "utf8");
  for (const pattern of dangerousPatterns) {
    if (pattern.regex.test(text)) findings.push(`${pattern.id}:${relPath}`);
  }
}
assert(findings.length === 0, `Hermes bundle still trips known dangerous scanner patterns: ${findings.join(", ")}`);
console.log("[PASS] exact Hermes bundle avoids known dangerous scanner false positives");

const tempDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-hermes-native-evidence-"));
try {
  const evidencePath = path.join(tempDir, "evidence.json");
  writeFileSync(evidencePath, `${JSON.stringify(validEvidence(), null, 2)}\n`, "utf8");
  const result = runNodeScript("scripts/verify-hermes-native-e2e.mjs", ["--evidence", evidencePath], { cwd: rootDir });
  assert(result.status === 1, `public verifier must reject repository-unbound evidence\n${result.stdout}\n${result.stderr}`);
  assert(result.stderr.includes("not locally verifiable"), result.stderr);
  console.log("[PASS] public evidence-verification CLI rejects repository-unbound reports");

  const git = (...args) => {
    const gitResult = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
    assert(gitResult.status === 0, `git ${args.join(" ")} failed: ${gitResult.stderr}`);
    return gitResult.stdout.trim();
  };
  const bound = validEvidence();
  bound.repository.commit = git("rev-parse", "HEAD");
  bound.repository.repo_tree = git("rev-parse", "HEAD^{tree}");
  bound.repository.skill_tree = git("rev-parse", "HEAD:ddalggak");
  bound.repository.raw_url = `https://raw.githubusercontent.com/JeremyDev87/ddalggak/${bound.repository.commit}/ddalggak/SKILL.md`;
  bound.lanes.default_raw.identifier = bound.repository.raw_url;
  bound.lanes.named_repository.source_revision = bound.repository.commit;
  writeFileSync(evidencePath, `${JSON.stringify(bound, null, 2)}\n`, "utf8");
  const boundResult = runNodeScript("scripts/verify-hermes-native-e2e.mjs", ["--evidence", evidencePath], { cwd: rootDir });
  assert(boundResult.status === 0, `${boundResult.stdout}\n${boundResult.stderr}`);
  assert(boundResult.stdout.includes("repository-bound evidence PASS"), boundResult.stdout);
  console.log("[PASS] public evidence-verification CLI validates repository-bound reports");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log("[test:hermes-native-e2e] passed: 20/20");
