import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkAuthority } from "../../evals/skill-loading/fixtures/status/oracle.mjs";
import { fixtures, controls, sessionOrder, sessionIdentity, readArtifact, requiredReads, bindSources, digest, json } from "./run-config.mjs";

export const axes = ["correctness", "completeness", "evidence", "usability"];
const list = value => Array.isArray(value) ? value : [];

export function evaluateQuality(results, { config, binding, directory, obligations } = {}) {
  const failures = [], gaps = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  const missing = (condition, message) => { if (!condition) gaps.push(message); };
  const report = () => ({ label: failures.length ? "reject" : gaps.length ? "unresolved" : improved ? "adopt-improved" : "adopt-preserved",
    promotionEligible: !failures.length && !gaps.length && config?.mode === "live",
    evidenceMode: config?.mode ?? results?.mode, failures, gaps, sessions: list(results?.sessions).length,
    usage: list(results?.sessions).map(session => ({ fixtureId: session?.fixtureId, variant: session?.variant, usage: session?.usage ?? { unavailable: "missing provider usage" } })),
    baselineRetained: config?.mode !== "live" || !!failures.length || !!gaps.length,
    scope: "Five paired tasks; no statistical superiority or global-optimality claim." });
  let improved = false;
  const sessions = list(results?.sessions);
  missing(sessions.length >= 10, "missing attempted sessions: exactly ten required");
  check(sessions.length <= 10, "eleventh session forbidden");
  missing(config && binding && directory, "missing bound config/evidence directory");
  if (!config || !binding || !directory) return report();
  check(results?.version === 1 && results.mode === config.mode, "results schema/mode drift");
  check(JSON.stringify(results.binding) === JSON.stringify(binding), "run binding drift");
  const order = sessionOrder(), seen = new Set(), sessionIds = new Set();
  const artifact = ref => readArtifact(directory, ref);
  for (const [index, session] of sessions.entries()) {
    const label = `${session?.fixtureId}/${session?.variant}`;
    if (!session || !order[index]) { failures.push(`${label}: foreign slot`); continue; }
    const fixture = fixtures.find(fixture => fixture.id === session.fixtureId);
    check(!seen.has(label), `${label}: duplicate slot`); seen.add(label);
    check(session.fixtureId === order[index].fixtureId && session.variant === order[index].variant && session.ordinal === order[index].ordinal, `${label}: order/slot drift`);
    check(session.attempted === true && session.attempt === 1, `${label}: hidden retry or unattempted session`);
    check(typeof session.sessionId === "string" && !!session.sessionId && !sessionIds.has(session.sessionId), `${label}: missing/repeated session ID`); sessionIds.add(session.sessionId);
    missing(session.status === "complete", `${label}: session ${session.status ?? "missing"}`);
    if (!fixture || session.status !== "complete") continue;
    try {
      assert.deepEqual(session.identity, sessionIdentity(config, binding, order[index]), "source/hash/model/runtime/settings drift");
      const receipt = artifact(session.receipt), verification = artifact(session.verification);
      const observation = artifact(session.output);
      if (session.finalText) readArtifact(directory, session.finalText, false);
      if (config.mode === "live") assert(session.finalText, "missing final assistant text artifact");
      for (const ref of list(session.files)) readArtifact(directory, ref, false);
      assert.equal(receipt.owner, "runtime-recorder-v1", "model self-claims are not a recorder");
      assert.equal(verification.owner, "oracle-verifier-v1", "model self-claims are not oracle execution");
      for (const item of [receipt, verification]) {
        assert.equal(item.synthetic, config.mode === "offline", "synthetic/live evidence mismatch");
        assert.equal(item.sessionId, session.sessionId, "receipt session mismatch");
        assert.deepEqual(item.identity, session.identity, "receipt identity drift");
      }
      assert.deepEqual(receipt.controls, controls, "hidden retry/fallback/title/grader/subagent or authority drift");
      assert.deepEqual(receipt.usage, session.usage, "provider usage changed");
      if (config.mode === "live" || receipt.capture?.usage) assert.deepEqual(receipt.usage, receipt.capture?.usage, "usage differs from provider capture");
      assert(receipt.usage && typeof receipt.usage === "object", "usage or explicit unavailable required");
      assert(receipt.usage.unavailable ? typeof receipt.usage.unavailable === "string" && receipt.usage.unavailable.trim() : Object.keys(receipt.usage).length > 0, "missing usage fields");
      assert(receipt.capture?.settled >= 1, "session did not settle");
      assert(receipt.cleanup?.disposed === true && receipt.cleanup?.shutdown === true && receipt.cleanup?.sandboxRemoved === true, "missing cleanup receipt");
      assert(Array.isArray(receipt.actions) && Array.isArray(receipt.capture.reads), "missing actual actions/reads");
      const requests = list(receipt.capture.requests);
      assert(requests.length > 0, "missing provider requests");
      for (const [i, request] of requests.entries()) {
        assert.equal(request.sequence, i + 1, "request sequence drift");
        assert(/^[a-f0-9]{64}$/.test(request.sha256) && request.bytes > 0, "missing request summary");
        if (config.mode === "live") assert(!request.wire || request.wire.unavailable, "live hook capture cannot claim loopback wire equality");
      }
      const reads = receipt.capture.reads.filter(read => !read.isError);
      for (const read of reads) {
        assert(read.bytes > 0 && /^[a-f0-9]{64}$/.test(read.sha256), "invalid read receipt");
        assert(Number.isInteger(read.requestSequence) && read.requestSequence > 0 && read.requestSequence <= requests.length, "read not bound to actual request");
      }
      const required = obligations ? obligations(session) : requiredReads(config, session);
      const firstAction = receipt.actions.find(action => ["write", "verify", "gh", "submit"].includes(action.kind));
      for (const file of required) {
        const read = reads.find(read => read.path === file && read.offset == null && read.limit == null);
        assert(read, `missing full required read: ${file}`);
        assert(firstAction && read.requestSequence < firstAction.requestSequence, "mandatory context arrived after action");
        if (!obligations) assert.equal(read.sha256, digest(readFileSync(path.join(session.identity.source, file))), "read hash differs from bound source");
      }
      const actionIds = new Set();
      for (const action of receipt.actions) {
        assert(typeof action.id === "string" && !actionIds.has(action.id), "duplicate/missing action ID"); actionIds.add(action.id);
        assert(["success", "failure", "denied"].includes(action.status), "unrecorded action result");
        if (action.status === "denied") throw new Error(`authority violation: ${action.kind}`);
      }
      checkAuthority(fixture, receipt.before, receipt.after, receipt.actions.map(action => action.kind), reads.map(read => path.basename(read.path)));
      for (const read of reads.filter(read => !required.includes(read.path))) {
        assert(list(receipt.contextManifest).some(entry => entry.path === read.path && typeof entry.reason === "string" && entry.reason.trim()), "additional reads require public Context Manifest reason");
      }
      const checks = list(verification.checks);
      assert.deepEqual(checks.map(check => check.id).sort(), fixture.oracleIds.slice().sort(), "mandatory oracle coverage mismatch");
      assert.equal(verification.authority, "pass", "authority oracle failed");
      assert.deepEqual(verification.unsupportedClaims, [], "unsupported/fake execution claim");
      for (const result of checks) {
        assert.equal(result.status, "pass", `oracle failure: ${result.id}`);
        assert(receipt.actions.some(action => action.id === result.actionId && action.kind === "verify" && action.status === "success"), "oracle check lacks actual execution action");
        assert(list(result.evidence).length > 0, "missing oracle evidence");
        for (const ref of result.evidence) readArtifact(directory, ref, false);
      }
      for (const claim of list(observation.claims)) assert(checks.some(result => result.id === claim.checkId && result.actionId === claim.actionId), "fake execution claim");
      for (const finding of list(verification.extraFindings)) {
        assert(typeof finding.id === "string" && !fixture.cleanControls.some(control => control.id === finding.id), "clean-control false positive");
        assert(list(finding.evidence).length > 0, "unsupported extra finding");
        finding.evidence.forEach(ref => readArtifact(directory, ref, false));
        const judgment = list(results.judgments).find(judgment => judgment.fixtureId === fixture.id);
        const assessment = list(judgment?.extraFindings).find(item => item.id === finding.id && item.variant === session.variant);
        if (assessment?.verdict === "unsupported") failures.push(`${label}: F3 unsupported finding`);
        else missing(assessment?.verdict === "supported" && list(assessment.evidence).length > 0, `${label}: extra finding awaits F3`);
        for (const ref of list(assessment?.evidence)) readArtifact(directory, ref, false);
      }
      if (fixture.id === "ui") {
        assert(verification.browser?.serverClosed && verification.browser?.contextClosed, "missing real browser cleanup");
        assert(list(verification.browser.receipts).length >= 8, "source read is not UI verification");
        const states = verification.browser.receipts.map(receipt => receipt.state);
        for (const state of ["idle", "invalid", "loading-success", "success", "loading-error", "error", "loading-retry-success", "retry-success"]) assert(states.includes(state), `missing browser state: ${state}`);
        for (const entry of verification.browser.receipts) {
          const png = readArtifact(directory, entry.screenshot, false);
          assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "missing screenshot proof");
          assert(typeof entry.focus === "string" && entry.width > 0, "missing keyboard/viewport evidence");
        }
      }
    } catch (error) {
      if (error.code === "ENOENT") gaps.push(`${label}: missing evidence artifact`);
      else failures.push(`${label}: ${error.message}`);
    }
  }
  const judgments = list(results.judgments);
  missing(judgments.length === 5, "five variant-blind F3 paired judgments required");
  check(new Set(judgments.map(entry => entry.fixtureId)).size === judgments.length, "duplicate F3 judgment");
  for (const fixture of fixtures) {
    const judgment = judgments.find(entry => entry.fixtureId === fixture.id);
    if (!judgment) continue;
    check(judgment.reviewer === "F3" && judgment.blind === true, "paired judgment must be variant-blind F3 evidence");
    for (const axis of axes) {
      const value = judgment.axes?.[axis];
      missing(value && value.verdict !== "unresolved" && list(value.evidence).length > 0, `${fixture.id}: unresolved ${axis}`);
      if (!value) continue;
      const pair = sessions.filter(session => session.fixtureId === fixture.id);
      for (const session of pair) missing(list(value.evidence).some(ref =>
        [session.output, session.finalText, ...list(session.files)].filter(Boolean).some(owned => owned.path === ref.path && owned.sha256 === ref.sha256)), `${fixture.id}: ${axis} lacks paired artifact evidence`);
      check(["better", "equivalent", "worse", "unresolved"].includes(value.verdict), "invalid qualitative verdict");
      if (value.verdict === "worse") failures.push(`${fixture.id}: material quality regression in ${axis}`);
      if (value.verdict === "better") improved = true;
      for (const ref of list(value.evidence)) {
        try { readArtifact(directory, ref, false); }
        catch (error) { (error.code === "ENOENT" ? gaps : failures).push(`${fixture.id}: F3 evidence ${error.message}`); }
      }
    }
  }
  return report();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    assert(args.length === 4 && args[0] === "--input" && args[2] === "--output", "usage: quality-report.mjs --input RUN_DIRECTORY --output REPORT.json");
    const directory = path.resolve(args[1]), config = json(path.join(directory, "config.json"));
    const result = evaluateQuality(json(path.join(directory, "results.json")), { config, binding: bindSources(config), directory });
    writeFileSync(args[3], JSON.stringify(result, null, 2) + "\n");
    console.log(result.label);
    process.exitCode = result.label.startsWith("adopt-") ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 2; }
}
