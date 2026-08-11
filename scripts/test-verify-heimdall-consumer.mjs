import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const verifierPath = path.join(
  process.cwd(),
  "scripts",
  "verify-heimdall-consumer.mjs",
);
const targetDigest = "c".repeat(64);
const policyDigest = "e".repeat(64);
const binaryCommit = "1cc04368aebe25d459cc65796855a9f3e9ce3338";

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function withSemanticDigest(doc) {
  const clone = { ...doc };
  delete clone.semantic_digest;
  return {
    ...clone,
    semantic_digest: createHash("sha256")
      .update(canonicalJson(clone))
      .digest("hex"),
  };
}

function baseArtifacts(overrides = {}) {
  const evidenceBase = {
    schema_version: "1.0",
    target: {
      id: "ddalggak",
      digest_before: targetDigest,
      digest_after: targetDigest,
      no_write: true,
    },
    boundary: { outside_workspace_write: false },
    execution: {
      exit_code: 0,
      timed_out: false,
      launch_error: false,
    },
    checks: [{ id: "readiness-result", status: "PASS" }],
    policy: {
      id: "harness-readiness",
      version: "1",
      digest: policyDigest,
    },
    isolation: {
      requested: "trusted-local",
      effective: "temp-copy-sanitized-env",
      security_boundary: false,
    },
    ...overrides.evidence,
  };
  if (overrides.evidenceTarget) {
    evidenceBase.target = {
      ...evidenceBase.target,
      ...overrides.evidenceTarget,
    };
  }
  if (overrides.evidenceExecution) {
    evidenceBase.execution = {
      ...evidenceBase.execution,
      ...overrides.evidenceExecution,
    };
  }
  if (overrides.evidencePolicy) {
    evidenceBase.policy = {
      ...evidenceBase.policy,
      ...overrides.evidencePolicy,
    };
  }

  const evidence = withSemanticDigest(evidenceBase);
  const reportBase = {
    schema_version: "1.0",
    state: "PASS",
    target: { id: "ddalggak", digest: targetDigest },
    evidence: { digest: evidence.semantic_digest },
    policy: {
      id: "harness-readiness",
      version: "1",
      digest: policyDigest,
    },
    reason_codes: ["checks_passed"],
    ...overrides.report,
  };
  if (overrides.reportTarget) {
    reportBase.target = {
      ...reportBase.target,
      ...overrides.reportTarget,
    };
  }
  if (overrides.reportEvidence) {
    reportBase.evidence = {
      ...reportBase.evidence,
      ...overrides.reportEvidence,
    };
  }
  if (overrides.reportPolicy) {
    reportBase.policy = {
      ...reportBase.policy,
      ...overrides.reportPolicy,
    };
  }
  const report = withSemanticDigest(reportBase);
  if (overrides.staleEvidenceSemanticDigest) {
    evidence.semantic_digest = overrides.staleEvidenceSemanticDigest;
  }
  if (overrides.staleReportSemanticDigest) {
    report.semantic_digest = overrides.staleReportSemanticDigest;
  }
  return { evidence, report };
}

function runCase(name, build, expectedStatus, envOverrides = {}) {
  const artifactsDir = mkdtempSync(
    path.join(os.tmpdir(), "ddalggak-heimdall-consumer-test-"),
  );
  const values = typeof build === "function" ? build() : baseArtifacts(build);
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
      HEIMDALL_EVIDENCE_DIGEST: values.evidence.semantic_digest,
      HEIMDALL_REPORT_DIGEST: values.report.semantic_digest,
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
    if (expectedStatus !== 0) {
      assert.match(
        `${result.stderr}\n${result.stdout}`,
        /Error:/,
        `${name}: expected an Error message on failure`,
      );
    }
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
  {
    evidenceTarget: {
      digest_before: undefined,
      digest_after: undefined,
    },
  },
  1,
);
runCase(
  "non-SHA target digests fail closed",
  {
    evidenceTarget: {
      digest_before: "target-fixture",
      digest_after: "target-fixture",
    },
    reportTarget: { digest: "target-fixture" },
  },
  1,
);
runCase(
  "report and evidence target binding mismatch fails closed",
  { reportTarget: { id: "different-target" } },
  1,
);
runCase(
  "report and evidence target digest mismatch fails closed",
  { reportTarget: { digest: "d".repeat(64) } },
  1,
);
runCase(
  "report.evidence.digest mismatch fails closed",
  { reportEvidence: { digest: "f".repeat(64) } },
  1,
);
runCase(
  "policy cross-binding mismatch fails closed",
  { reportPolicy: { id: "other-policy" } },
  1,
);
runCase(
  "execution non-zero fails closed",
  { evidenceExecution: { exit_code: 1 } },
  1,
);
runCase(
  "timed_out true fails closed",
  { evidenceExecution: { timed_out: true } },
  1,
);
runCase(
  "empty checks fails closed",
  { evidence: { checks: [] } },
  1,
);
runCase(
  "non-PASS checks fail closed",
  { evidence: { checks: [{ id: "readiness-result", status: "FAIL" }] } },
  1,
);
runCase(
  "bad reason_codes fail closed",
  { report: { reason_codes: ["forged"] } },
  1,
);
runCase(
  "stale semantic_digest after content tamper fails closed",
  () => {
    const values = baseArtifacts();
    const staleEvidenceDigest = values.evidence.semantic_digest;
    values.evidence.checks = [
      { id: "readiness-result", status: "PASS" },
      { id: "extra", status: "PASS" },
    ];
    values.evidence.semantic_digest = staleEvidenceDigest;
    values.report.evidence = { digest: staleEvidenceDigest };
    const reportClone = { ...values.report, evidence: { digest: staleEvidenceDigest } };
    delete reportClone.semantic_digest;
    values.report.semantic_digest = createHash("sha256")
      .update(canonicalJson(reportClone))
      .digest("hex");
    return values;
  },
  1,
);

const hostedDir = process.env.HEIMDALL_HOSTED_ARTIFACT_DIR;
if (hostedDir) {
  const evidence = JSON.parse(
    readFileSync(path.join(hostedDir, "evidence.json"), "utf8"),
  );
  const report = JSON.parse(
    readFileSync(path.join(hostedDir, "report.json"), "utf8"),
  );
  const result = spawnSync(process.execPath, [verifierPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      ARTIFACTS_DIR: hostedDir,
      HEIMDALL_STATE: "PASS",
      HEIMDALL_EXIT_CODE: "0",
      HEIMDALL_EVIDENCE_DIGEST: evidence.semantic_digest,
      HEIMDALL_REPORT_DIGEST: report.semantic_digest,
      HEIMDALL_BINARY_VERSION: "0.1.0",
      HEIMDALL_BINARY_COMMIT: binaryCommit,
    },
  });
  assert.equal(
    result.status,
    0,
    `hosted artifact must PASS\nstdout=${result.stdout}\nstderr=${result.stderr}`,
  );
  console.log("[PASS] hosted artifact remains accepted -> exit 0");
}
