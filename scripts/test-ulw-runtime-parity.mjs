import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dd = path.join(repo, "bin", "ddalggak.js");
const oracle = path.join(repo, "core", "ulw-loop", "vendor", "dist", "cli.js");
const hash = (data) => createHash("sha256").update(data).digest("hex");
function run(entry, cwd, args, input) { return spawnSync(process.execPath, [entry, ...args], { cwd, input, encoding: "utf8", env: { ...process.env, DDALGGAK_NO_UPDATE: "1" } }); }
function runAsync(entry, cwd, args) { return new Promise((resolve) => { const child = spawn(process.execPath, [entry, ...args], { cwd, env: { ...process.env, DDALGGAK_NO_UPDATE: "1" } }); let stdout = ""; let stderr = ""; child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; }); child.on("close", (status) => resolve({ status, stdout, stderr })); }); }
function ok(r, label) { assert.equal(r.status, 0, `${label}\nstdout=${r.stdout}\nstderr=${r.stderr}`); return r; }
function normalized(value) { if (Array.isArray(value)) return value.map(normalized); if (!value || typeof value !== "object") return value; const out = {}; for (const [key, item] of Object.entries(value)) if (!/(?:At|_at)$/.test(key) && key !== "recorded_at") out[key] = normalized(item); return out; }

const roots = [mkdtempSync(path.join(os.tmpdir(), "dd-ulw-")), mkdtempSync(path.join(os.tmpdir(), "omo-ulw-"))];
try {
  for (const component of ["ulw-plan", "ulw-research"]) {
    const source = JSON.parse(readFileSync(path.join(repo, "core", component, "SOURCE.json"), "utf8"));
    assert.equal(source.behavioral_upstream, "https://github.com/code-yeongyu/oh-my-openagent");
    assert.equal(source.upstream_tag, "v3.8.3");
    assert.equal(source.upstream_commit, "84e103c41f9863ea32533b9532b013a796053587");
    assert.equal(source.upstream_named_command, "absent");
    assert.match(source.implementation, /clean-room/);
    assert.ok(source.observed_source_paths.length >= 3);
    assert.ok(source.non_claims.some((item) => item.includes("not an exact command-port")));
  }
  console.log("[PASS] OMO plan/research source receipts pin the live tag and reject exact-command overclaims");

  const runners = [
    (args, input) => run(dd, roots[0], ["ulw-loop", ...args], input),
    (args, input) => run(oracle, roots[1], ["ulw-loop", ...args], input),
  ];
  for (const invoke of runners) {
    ok(invoke(["create-goals", "--brief", "Build a CLI with tests", "--session-id", "alpha", "--json"]), "create alpha");
    ok(invoke(["create-goals", "--brief", "Independent work", "--session-id", "beta", "--json"]), "create beta");
    ok(invoke(["complete-goals", "--session-id", "alpha", "--json"]), "start alpha");
  }
  for (const session of ["alpha", "beta"]) {
    const a = JSON.parse(ok(runners[0](["status", "--session-id", session, "--json"]), "dd status").stdout);
    const b = JSON.parse(ok(runners[1](["status", "--session-id", session, "--json"]), "oracle status").stdout);
    assert.deepEqual(normalized(a), normalized(b), `differential state mismatch for ${session}`);
  }
  assert.equal(JSON.parse(readFileSync(path.join(roots[0], ".omo/ulw-loop/alpha/goals.json"))).goals[0].status, "in_progress");
  assert.equal(JSON.parse(readFileSync(path.join(roots[0], ".omo/ulw-loop/beta/goals.json"))).goals[0].status, "pending");
  for (let i = 0; i < 2; i++) {
    const transcript = path.join(roots[i], "transcript.jsonl"); writeFileSync(transcript, "{}\n");
    const payload = JSON.stringify({ hook_event_name: "Stop", session_id: "alpha", turn_id: "t1", transcript_path: transcript, cwd: roots[i], model: "test", permission_mode: "test", stop_hook_active: false });
    const args = i === 0 ? ["ulw-loop", "hook", "stop"] : ["hook", "stop"];
    const receipt = ok(run(i === 0 ? dd : oracle, roots[i], args, payload), "stop hook");
    assert.equal(JSON.parse(receipt.stdout).decision, "block", "unfinished run must interrupt Stop");
  }
  const hookEscapeRoot = mkdtempSync(path.join(os.tmpdir(), "dd-hook-escape-")); const hookExternal = mkdtempSync(path.join(os.tmpdir(), "dd-hook-external-"));
  mkdirSync(path.join(hookEscapeRoot, ".omo"), { recursive: true }); symlinkSync(hookExternal, path.join(hookEscapeRoot, ".omo", "ulw-loop")); const hookTranscript = path.join(hookEscapeRoot, "transcript.jsonl"); writeFileSync(hookTranscript, "{}\n");
  const hookPayload = JSON.stringify({ hook_event_name: "Stop", session_id: "escape", turn_id: "t1", transcript_path: hookTranscript, cwd: hookEscapeRoot, model: "test", permission_mode: "test", stop_hook_active: false });
  const escapedHook = run(dd, roots[0], ["ulw-loop", "hook", "stop"], hookPayload); assert.notEqual(escapedHook.status, 0, "hook must validate payload.cwd rather than only process.cwd"); assert.equal(existsSync(path.join(hookExternal, "escape")), false, "hook must not write through payload cwd symlink");
  rmSync(hookEscapeRoot, { recursive: true, force: true }); rmSync(hookExternal, { recursive: true, force: true });
  const resumed = JSON.parse(ok(runners[0](["status", "--session-id", "alpha", "--json"]), "resume status").stdout);
  assert.equal(resumed.plan.goals[0].status, "in_progress", "fresh CLI process resumes durable state");
  const escapeRoot = mkdtempSync(path.join(os.tmpdir(), "dd-loop-escape-")); const externalLoop = mkdtempSync(path.join(os.tmpdir(), "dd-loop-external-"));
  mkdirSync(path.join(escapeRoot, ".omo"), { recursive: true }); symlinkSync(externalLoop, path.join(escapeRoot, ".omo", "ulw-loop"));
  const escapedLoop = run(dd, escapeRoot, ["ulw-loop", "create-goals", "--brief", "must stay local", "--session-id", "escape", "--json"]); assert.notEqual(escapedLoop.status, 0, "symlinked loop state root must fail closed"); assert.equal(existsSync(path.join(externalLoop, "escape", "goals.json")), false, "loop must not write through state symlink");
  rmSync(escapeRoot, { recursive: true, force: true }); rmSync(externalLoop, { recursive: true, force: true });
  const evidenceEscapeRoot = mkdtempSync(path.join(os.tmpdir(), "dd-loop-evidence-")); const externalEvidence = mkdtempSync(path.join(os.tmpdir(), "dd-evidence-external-"));
  mkdirSync(path.join(evidenceEscapeRoot, ".omo", "evidence"), { recursive: true }); symlinkSync(externalEvidence, path.join(evidenceEscapeRoot, ".omo", "evidence", "ulw"));
  const escapedEvidence = run(dd, evidenceEscapeRoot, ["ulw-loop", "status", "--session-id", "escape", "--json"]); assert.notEqual(escapedEvidence.status, 0, "symlinked evidence root must fail closed");
  rmSync(evidenceEscapeRoot, { recursive: true, force: true }); rmSync(externalEvidence, { recursive: true, force: true });
  const ancestorEscapeRoot = mkdtempSync(path.join(os.tmpdir(), "dd-evidence-ancestor-")); const ancestorExternal = mkdtempSync(path.join(os.tmpdir(), "dd-evidence-ancestor-external-"));
  mkdirSync(path.join(ancestorExternal, "ulw")); mkdirSync(path.join(ancestorEscapeRoot, ".omo"), { recursive: true }); symlinkSync(ancestorExternal, path.join(ancestorEscapeRoot, ".omo", "evidence"));
  const escapedAncestor = run(dd, ancestorEscapeRoot, ["ulw-loop", "status", "--session-id", "escape", "--json"]); assert.notEqual(escapedAncestor.status, 0, "symlinked .omo/evidence ancestor must fail closed when external ulw exists");
  rmSync(ancestorEscapeRoot, { recursive: true, force: true }); rmSync(ancestorExternal, { recursive: true, force: true });
  console.log("[PASS] ulw-loop differential fixtures, session isolation, and interruption/resume");

  const planRoot = mkdtempSync(path.join(os.tmpdir(), "dd-plan-"));
  ok(run(dd, planRoot, ["ulw-plan", "scaffold", "demo", "--clear", "--review-required"]), "plan scaffold");
  const planPath = path.join(planRoot, ".omo/plans/demo.md"); assert.equal(existsSync(planPath), false, "plan must not exist before explicit approval");
  const draftPath = path.join(planRoot, ".omo/drafts/demo.md"); const externalDraft = path.join(planRoot, "external-draft.md"); writeFileSync(externalDraft, readFileSync(draftPath)); unlinkSync(draftPath); symlinkSync(externalDraft, draftPath);
  const symlinkDraft = run(dd, planRoot, ["ulw-plan", "approve", "--slug", "demo", "--approved-by", "owner"]); assert.notEqual(symlinkDraft.status, 0, "symlinked draft must be rejected"); unlinkSync(draftPath); writeFileSync(draftPath, readFileSync(externalDraft));
  ok(run(dd, planRoot, ["ulw-plan", "approve", "--slug", "demo", "--approved-by", "owner"]), "plan approve");
  assert.equal(existsSync(planPath), true, "approval creates the plan exactly once"); writeFileSync(planPath, readFileSync(planPath, "utf8").replaceAll("<fill>", "complete"));
  const init = JSON.parse(ok(run(dd, planRoot, ["ulw-plan", "review-init", "--slug", "demo", "--momus-session", "momus-1", "--independent-session", "ind-1"]), "review init").stdout);
  const laneArgs = (lane, result = "approved") => ["ulw-plan", "review-receipt", "--slug", "demo", "--lane", lane, "--round-id", init.round_id, "--launch-id", init.review[lane].launch_id, "--session", init.review[lane].session, "--plan-sha256", init.plan_sha256, "--result", result, "--evidence", `${lane}-receipt`];
  const staleArgs = laneArgs("momus"); staleArgs[staleArgs.indexOf("--round-id") + 1] = "stale";
  const stale = run(dd, planRoot, staleArgs); assert.notEqual(stale.status, 0); assert.match(stale.stderr, /stale or mismatched/);
  const concurrentReceipts = await Promise.all([runAsync(dd, planRoot, laneArgs("momus")), runAsync(dd, planRoot, laneArgs("independent"))]); ok(concurrentReceipts[0], "concurrent momus receipt"); ok(concurrentReceipts[1], "concurrent independent receipt");
  const planFinal = ok(run(dd, planRoot, ["ulw-plan", "finalize", "--slug", "demo"]), "plan finalize"); assert.match(planFinal.stdout, /^ULW_PLAN_DONE \.omo\/plans\/demo\.md sha256:[a-f0-9]{64}$/m, "plan finalization must emit its canonical completion signal");
  const reopened = run(dd, planRoot, ["ulw-plan", "review-init", "--slug", "demo", "--momus-session", "momus-2", "--independent-session", "ind-2"]); assert.notEqual(reopened.status, 0, "final plan must be immutable");
  console.log("[PASS] ulw-plan durable scaffold/final, approval, stale receipt rejection, and reviewer binding");
  rmSync(planRoot, { recursive: true, force: true });

  const researchRoot = mkdtempSync(path.join(os.tmpdir(), "dd-research-"));
  const axes = '["runtime","licensing","delivery"]';
  ok(run(dd, researchRoot, ["ulw-research", "init", "--session-id", "r1", "--topic", "runtime parity", "--axes-json", axes, "--format-proposal", "PDF+DOCX or Markdown using a cited engineering report template"]), "research init");
  const earlyWave = run(dd, researchRoot, ["ulw-research", "wave", "--session-id", "r1", "--mode", "EXPAND", "--returns-json", "[]", "--closed-leads-json", "[]"]); assert.notEqual(earlyWave.status, 0, "worker dispatch is blocked before format acceptance");
  ok(run(dd, researchRoot, ["ulw-research", "accept-format", "--session-id", "r1", "--format", "markdown", "--template", "cited engineering report", "--accepted-by", "owner"]), "format acceptance");
  const wave1 = JSON.stringify([
    { axis: "runtime", findings: "state runtime", sources: ["source-a"], expand: ["lead-1"] },
    { axis: "licensing", findings: "license boundary", sources: ["source-b"], expand: [] },
    { axis: "delivery", findings: "artifact gates", sources: ["source-c"], expand: [] },
  ]);
  ok(run(dd, researchRoot, ["ulw-research", "wave", "--session-id", "r1", "--mode", "EXPAND", "--returns-json", wave1, "--closed-leads-json", "[]"]), "expand wave 1");
  const tooSoon = run(dd, researchRoot, ["ulw-research", "wave", "--session-id", "r1", "--mode", "CONVERGE", "--returns-json", "[]", "--closed-leads-json", '["lead-1"]']); assert.notEqual(tooSoon.status, 0, "convergence is blocked before the two-wave floor");
  const wave2 = JSON.stringify([{ axis: "lead-1", findings: "lead closed", sources: ["source-d"], expand: [] }]);
  ok(run(dd, researchRoot, ["ulw-research", "wave", "--session-id", "r1", "--mode", "EXPAND", "--returns-json", wave2, "--closed-leads-json", '["lead-1"]']), "expand wave 2");
  ok(run(dd, researchRoot, ["ulw-research", "wave", "--session-id", "r1", "--mode", "CONVERGE", "--returns-json", "[]", "--closed-leads-json", "[]"]), "converge");
  ok(run(dd, researchRoot, ["ulw-research", "claim", "--session-id", "r1", "--claim-id", "c1", "--text", "observable behavior exists", "--intent-id", "i1", "--risk", "high", "--claim-type", "noncode"]), "claim");
  const self = run(dd, researchRoot, ["ulw-research", "record-evidence", "--session-id", "r1", "--claim-id", "c1", "--source-type", "self-report", "--url", "https://example.test", "--domain", "example.test", "--observer-group", "g0", "--valid-at", "2026-08-11", "--locator", "x"]); assert.notEqual(self.status, 0);
  const userinfo = run(dd, researchRoot, ["ulw-research", "record-evidence", "--session-id", "r1", "--claim-id", "c1", "--source-type", "official", "--url", "https://user:password@example.org/source", "--domain", "example.org", "--observer-group", "g0", "--valid-at", "2026-08-11", "--locator", "x"]); assert.notEqual(userinfo.status, 0, "URL userinfo credentials must be rejected");
  const querySecret = run(dd, researchRoot, ["ulw-research", "record-evidence", "--session-id", "r1", "--claim-id", "c1", "--source-type", "official", "--url", "https://example.org/source?access_token=secret-value", "--domain", "example.org", "--observer-group", "g0", "--valid-at", "2026-08-11", "--locator", "x"]); assert.notEqual(querySecret.status, 0, "credential query parameters must be rejected");
  const secretState = readFileSync(path.join(researchRoot, ".omo/ulw-research/r1/state.json"), "utf8"); assert.doesNotMatch(secretState, /password|secret-value/, "rejected URL credentials must not persist in state");
  const evidencePath = path.join(researchRoot, "evidence.txt"); writeFileSync(evidencePath, "observed output\n"); const evidenceSha = hash(readFileSync(evidencePath));
  const externalRoot = mkdtempSync(path.join(os.tmpdir(), "dd-research-external-")); writeFileSync(path.join(externalRoot, "escape.txt"), "escape\n"); mkdirSync(path.join(researchRoot, "linked"), { recursive: true }); rmSync(path.join(researchRoot, "linked"), { recursive: true }); symlinkSync(externalRoot, path.join(researchRoot, "linked")); const escapeSha = hash(readFileSync(path.join(externalRoot, "escape.txt")));
  const symlinkArtifact = run(dd, researchRoot, ["ulw-research", "record-evidence", "--session-id", "r1", "--claim-id", "c1", "--source-type", "fixture", "--artifact", "linked/escape.txt", "--sha256", escapeSha, "--domain", "local-fixture", "--observer-group", "execution", "--valid-at", "2026-08-11", "--locator", "line:1"]); assert.notEqual(symlinkArtifact.status, 0, "symlinked artifact ancestor must be rejected"); rmSync(externalRoot, { recursive: true, force: true });
  ok(run(dd, researchRoot, ["ulw-research", "record-evidence", "--session-id", "r1", "--claim-id", "c1", "--source-type", "fixture", "--artifact", "evidence.txt", "--sha256", evidenceSha, "--domain", "local-fixture", "--observer-group", "execution", "--valid-at", "2026-08-11", "--primary", "--locator", "line:1"]), "primary evidence");
  ok(run(dd, researchRoot, ["ulw-research", "record-evidence", "--session-id", "r1", "--claim-id", "c1", "--source-type", "official", "--url", "https://example.org/oracle", "--domain", "example.org", "--observer-group", "counter", "--valid-at", "2026-08-11", "--counter-search", "--locator", "section:oracle"]), "independent counter evidence");
  const reportPath = path.join(researchRoot, "report.md"); writeFileSync(reportPath, "# report\n"); const reportSha = hash(readFileSync(reportPath));
  const qaPath = path.join(researchRoot, "qa.json"); writeFileSync(qaPath, JSON.stringify({ reviewer: "independent", verdict: "pass", artifact_sha256: reportSha, rendered_pages_pass: true, proofread_pass: true })); const qaSha = hash(readFileSync(qaPath));
  ok(run(dd, researchRoot, ["ulw-research", "finalize", "--session-id", "r1", "--format", "markdown", "--artifact", "report.md", "--artifact-sha256", reportSha, "--assets-json", "[]", "--qa-receipt", "qa.json", "--qa-sha256", qaSha]), "research finalize");
  const lateClaim = run(dd, researchRoot, ["ulw-research", "claim", "--session-id", "r1", "--claim-id", "late", "--text", "late mutation", "--intent-id", "i2", "--risk", "low", "--claim-type", "code"]); assert.notEqual(lateClaim.status, 0, "final research must be immutable");
  const duplicateFinal = run(dd, researchRoot, ["ulw-research", "finalize", "--session-id", "r1", "--format", "markdown", "--artifact", "report.md", "--artifact-sha256", reportSha, "--assets-json", "[]", "--qa-receipt", "qa.json", "--qa-sha256", qaSha]); assert.notEqual(duplicateFinal.status, 0, "research finalization must be one-shot");
  console.log("[PASS] ulw-research wave journal, convergence, claims/evidence, artifact, format, and QA gates");
  rmSync(researchRoot, { recursive: true, force: true });
} finally { for (const root of roots) rmSync(root, { recursive: true, force: true }); }
