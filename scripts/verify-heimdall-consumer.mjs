import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const required = [
  "ARTIFACTS_DIR",
  "HEIMDALL_STATE",
  "HEIMDALL_EXIT_CODE",
  "HEIMDALL_EVIDENCE_DIGEST",
  "HEIMDALL_REPORT_DIGEST",
  "HEIMDALL_BINARY_VERSION",
  "HEIMDALL_BINARY_COMMIT",
];

function fail(message) {
  throw new Error(message);
}

for (const name of required) {
  if (!process.env[name]) fail(`${name} is required`);
}

const artifactsDir = path.resolve(process.env.ARTIFACTS_DIR);
if (!path.isAbsolute(process.env.ARTIFACTS_DIR)) {
  fail("ARTIFACTS_DIR must be absolute");
}
if (!existsSync(artifactsDir) || !statSync(artifactsDir).isDirectory()) {
  fail(`artifact directory is missing: ${artifactsDir}`);
}

function readJson(name) {
  const file = path.join(artifactsDir, name);
  if (!existsSync(file)) fail(`missing artifact: ${name}`);
  return JSON.parse(readFileSync(file, "utf8"));
}

const evidence = readJson("evidence.json");
const report = readJson("report.json");
for (const name of ["evidence.json", "report.json", "report.md"]) {
  if (!existsSync(path.join(artifactsDir, name))) fail(`missing artifact: ${name}`);
}

if (process.env.HEIMDALL_STATE !== "PASS") {
  fail(`consumer readiness must PASS, got ${process.env.HEIMDALL_STATE}`);
}
if (process.env.HEIMDALL_EXIT_CODE !== "0") {
  fail(`consumer readiness exit must be 0, got ${process.env.HEIMDALL_EXIT_CODE}`);
}
if (process.env.HEIMDALL_BINARY_VERSION !== "0.1.0") {
  fail(`unexpected Heimdall binary version: ${process.env.HEIMDALL_BINARY_VERSION}`);
}
if (
  process.env.HEIMDALL_BINARY_COMMIT !==
  "1cc04368aebe25d459cc65796855a9f3e9ce3338"
) {
  fail(`unexpected Heimdall binary commit: ${process.env.HEIMDALL_BINARY_COMMIT}`);
}

if (report.state !== "PASS") fail(`report state is not PASS: ${report.state}`);
if (report.semantic_digest !== process.env.HEIMDALL_REPORT_DIGEST) {
  fail("report digest output does not match report.json semantic_digest");
}
if (!report.semantic_digest) fail("report semantic_digest is empty");
if (
  evidence.semantic_digest !== process.env.HEIMDALL_EVIDENCE_DIGEST ||
  !evidence.semantic_digest
) {
  fail("evidence digest output does not match evidence.json semantic_digest");
}

if (evidence.target?.id !== "ddalggak") fail("unexpected evidence target id");
if (evidence.target?.no_write !== true) fail("target no_write must be true");
if (evidence.target?.digest_before !== evidence.target?.digest_after) {
  fail("target digest changed during evaluation");
}
if (evidence.boundary?.outside_workspace_write !== false) {
  fail("outside_workspace_write must be false");
}

console.log(
  `[PASS] Heimdall consumer evidence: state=${report.state} target=${evidence.target.id} no_write=true outside_workspace_write=false`,
);
