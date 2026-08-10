import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const verifierPath = path.join(
  process.cwd(),
  "scripts",
  "verify-heimdall-consumer.mjs",
);
const targetDigest = "c".repeat(64);
const evidenceDigest = "a".repeat(64);
const reportDigest = "b".repeat(64);
const binaryCommit = "1cc04368aebe25d459cc65796855a9f3e9ce3338";

function fixture(overrides = {}) {
  return {
    evidence: {
      semantic_digest: evidenceDigest,
      target: {
        id: "ddalggak",
        digest_before: targetDigest,
        digest_after: targetDigest,
        no_write: true,
      },
      boundary: { outside_workspace_write: false },
      ...overrides.evidence,
    },
    report: {
      state: "PASS",
      semantic_digest: reportDigest,
      target: { id: "ddalggak", digest: targetDigest },
      ...overrides.report,
    },
  };
}

function runCase(name, overrides, expectedStatus, envOverrides = {}) {
  const artifactsDir = mkdtempSync(
    path.join(os.tmpdir(), "ddalggak-heimdall-consumer-test-"),
  );
  const values = fixture(overrides);
  writeFileSync(
    path.join(artifactsDir, "evidence.json"),
    `${JSON.stringify(values.evidence)}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(artifactsDir, "report.json"),
    `${JSON.stringify(values.report)}\n`,
    "utf8",
  );
  writeFileSync(path.join(artifactsDir, "report.md"), "# PASS\n", "utf8");

  const result = spawnSync(process.execPath, [verifierPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      ARTIFACTS_DIR: artifactsDir,
      HEIMDALL_STATE: "PASS",
      HEIMDALL_EXIT_CODE: "0",
      HEIMDALL_EVIDENCE_DIGEST: evidenceDigest,
      HEIMDALL_REPORT_DIGEST: reportDigest,
      HEIMDALL_BINARY_VERSION: "0.1.0",
      HEIMDALL_BINARY_COMMIT: binaryCommit,
      ...envOverrides,
    },
  });

  try {
    assert.equal(
      result.status,
      expectedStatus,
      `${name}: expected exit ${expectedStatus}, got ${result.status}\nstdout=${result.stdout}\nstderr=${result.stderr}`,
    );
    console.log(`[PASS] ${name} -> exit ${expectedStatus}`);
  } finally {
    rmSync(artifactsDir, { recursive: true, force: true });
  }
}

runCase("valid evidence remains accepted", {}, 0);
runCase(
  "malformed Action digest output fails closed",
  {},
  1,
  { HEIMDALL_EVIDENCE_DIGEST: "evidence-fixture" },
);
runCase(
  "missing target digests fail closed",
  { evidence: { target: { id: "ddalggak", no_write: true } } },
  1,
);
runCase(
  "non-SHA target digests fail closed",
  {
    evidence: {
      target: {
        id: "ddalggak",
        digest_before: "target-fixture",
        digest_after: "target-fixture",
        no_write: true,
      },
    },
    report: { target: { id: "ddalggak", digest: "target-fixture" } },
  },
  1,
);
runCase(
  "report and evidence target binding mismatch fails closed",
  { report: { target: { id: "different-target", digest: targetDigest } } },
  1,
);
runCase(
  "report and evidence target digest mismatch fails closed",
  { report: { target: { id: "ddalggak", digest: "d".repeat(64) } } },
  1,
);
