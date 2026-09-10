import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { makeTempDir, cleanupTempRoot } from "./test-lib/temp.mjs";
import { copyResultArtifacts } from "./eval-skill-loading.mjs";
import { evaluateQuality, axes, checkToolActions } from "./skill-loading/quality-report.mjs";
import { createCapture } from "./skill-loading/capture-extension.mjs";
import { artifact, readArtifact, fixtures, controls, sessionOrder, sessionIdentity, validateConfig,
  createRegistry, sourceTree, directoryHash, digest, BASELINE_SHA, BASELINE_TREE, settingsHash, toolProtocolHash, bindSources, requiredReads } from "./skill-loading/run-config.mjs";

// Explicit synthetic records test the gate, never attest model/browser execution.
export function syntheticRun(config, binding, directory, obligations = session => ["ddalggak/SKILL.md", ...fixtures.find(fixture => fixture.id === session.fixtureId).expectedReads.map(file => `ddalggak/references/${file}`)]) {
  const results = { version: 1, mode: "offline", binding, sessions: [], judgments: [] };
  for (const slot of sessionOrder()) {
    const fixture = fixtures.find(fixture => fixture.id === slot.fixtureId), prefix = `${slot.ordinal}-${slot.fixtureId}-${slot.variant}`;
    const sessionId = `synthetic-${config.runId}-${slot.ordinal}`, identity = sessionIdentity(config, binding, slot);
    const proof = artifact(directory, `${prefix}/oracle-proof.json`, { synthetic: true, fixture: fixture.id });
    const output = artifact(directory, `${prefix}/output.json`, { synthetic: true, claims: fixture.oracleIds.map(checkId => ({ checkId, actionId: "verify-1" })) });
    const receipt = { owner: "runtime-recorder-v1", synthetic: true, sessionId, identity, controls, before: {}, after: {},
      actions: [{ id: "verify-1", kind: "verify", status: "success", requestSequence: 2 }], contextManifest: [],
      usage: { input_tokens: 1000, output_tokens: 250, output_tokens_details: { reasoning_tokens: 50 } },
      capture: { settled: 1, requests: [1, 2].map(sequence => ({ sequence, sha256: digest(`synthetic request ${sequence}`), bytes: 100, toolResultCount: sequence - 1 })),
        reads: obligations(slot).map((file, index) => ({ sequence: index + 1, requestSequence: 1, path: file, offset: null, limit: null, bytes: 10, sha256: existsSync(path.join(config[`${slot.variant}Source`], file)) ? digest(readFileSync(path.join(config[`${slot.variant}Source`], file))) : digest(file), isError: false })) },
      cleanup: { disposed: true, shutdown: true, sandboxRemoved: true } };
    const verification = { owner: "oracle-verifier-v1", synthetic: true, sessionId, identity, authority: "pass", unsupportedClaims: [], extraFindings: [],
      checks: fixture.oracleIds.map(id => ({ id, status: "pass", actionId: "verify-1", evidence: [proof] })) };
    if (fixture.id === "ui") {
      const png = artifact(directory, `${prefix}/synthetic.png`, Buffer.from("89504e470d0a1a0a", "hex"));
      verification.browser = { serverClosed: true, contextClosed: true, receipts:
        ["idle", "invalid", "loading-success", "success", "loading-error", "error", "loading-retry-success", "retry-success"].map(state => ({ state, screenshot: png, focus: "name", width: 375 })) };
    }
    results.sessions.push({ ...slot, sessionId, identity, attempted: true, attempt: 1, status: "complete", usage: receipt.usage, output,
      receipt: artifact(directory, `${prefix}/receipt.json`, receipt), verification: artifact(directory, `${prefix}/verification.json`, verification) });
  }
  for (const fixture of fixtures) {
    const evidence = results.sessions.filter(session => session.fixtureId === fixture.id).map(session => session.output);
    results.judgments.push({ fixtureId: fixture.id, reviewer: "F3", blind: true, axes: Object.fromEntries(axes.map(axis => [axis, { verdict: "equivalent", evidence }])) });
  }
  return results;
}

export function testQualityReport() {
  const temp = makeTempDir("ddalggak-quality-");
  const negatives = [];
  try {
    assert.equal(toolProtocolHash, digest(readFileSync(new URL("./eval-skill-loading.mjs", import.meta.url))));
    assert.notEqual(settingsHash, digest(JSON.stringify({ controls, toolNames: ["read", "write", "verify", "gh", "submit"], permission: "fixture-only" })), "old unbound tool protocol must not share the new settings identity");
    const config = { runId: "portable-offline", baselineSource: path.join(temp, "baseline"), candidateSource: path.join(temp, "candidate"), baselineSha: BASELINE_SHA,
      candidateTree: "b".repeat(40), runtimeDist: path.join(temp, "runtime"), pluginPath: path.join(temp, "plugin"), modelId: "connected/explicit-model", reasoning: "high",
      fixtureHash: "f".repeat(64), sessionLimit: 10, mode: "offline" };
    const binding = { configHash: digest("config"), baselineTree: BASELINE_TREE, candidateTree: config.candidateTree,
      fixtureHash: config.fixtureHash, runtimeHash: digest("runtime"), pluginHash: digest("plugin"), settingsHash };
    const obligations = session => ["ddalggak/SKILL.md", ...fixtures.find(fixture => fixture.id === session.fixtureId).expectedReads.map(file => `ddalggak/references/${file}`)];
    const options = { config, binding, directory: temp, obligations };
    assert.equal(evaluateQuality({ mode: "offline", sessions: [] }).label, "unresolved", "missing sessions cannot preserve quality");
    validateConfig(config);
    for (const [key, value] of [["sessionLimit", 11], ["modelId", "auto/model"], ["baselineSha", "c".repeat(40)], ["reasoning", "auto"], ["mode", "default"], ["extra", true]]) {
      assert.throws(() => validateConfig({ ...config, [key]: value })); negatives.push(`config ${key}`);
    }
    const registry = createRegistry(config, path.join(temp, "registry"));
    assert.throws(() => registry.reserve(sessionOrder()[1]), /out-of-order/);
    for (const slot of sessionOrder()) registry.reserve(slot);
    assert.equal(registry.count, 10);
    assert.throws(() => registry.reserve(sessionOrder()[0]), /eleventh/);
    assert.throws(() => createRegistry(config, path.join(temp, "registry")), /EEXIST/);
    const other = createRegistry({ ...config, runId: "duplicate" }, path.join(temp, "registry"));
    other.reserve(sessionOrder()[0]); assert.throws(() => other.reserve(sessionOrder()[0]), /duplicate/);
    assert.deepEqual(sessionOrder().map(slot => `${slot.fixtureId}/${slot.variant}`), ["backend/baseline", "backend/candidate", "internal-review/candidate", "internal-review/baseline", "public-body-review/baseline", "public-body-review/candidate", "status/candidate", "status/baseline", "ui/baseline", "ui/candidate"]);
    const good = syntheticRun(config, binding, temp, obligations);
    writeFileSync(path.join(temp, "unreferenced-secret.txt"), "not copied");
    const copied = path.join(temp, "copied");
    copyResultArtifacts(good, temp, copied);
    assert(!existsSync(path.join(copied, "unreferenced-secret.txt")) && !existsSync(path.join(copied, "ddalggak")), "copy artifacts, not read paths or unrelated neighboring files");
    assert.equal(evaluateQuality(good, { ...options, directory: copied }).label, "adopt-preserved", "copied artifact closure is complete");
    let report = evaluateQuality(good, options);
    assert.equal(report.label, "adopt-preserved", JSON.stringify(report));
    assert.equal(report.promotionEligible, false); assert.equal(report.baselineRetained, true);
    assert.deepEqual(report.usage[0].usage, good.sessions[0].usage, "retain nested provider usage fields");
    let mutationNumber = 0;
    function replace(run, key, mutate, index = 0) {
      const value = readArtifact(temp, run.sessions[index][key]); mutate(value);
      run.sessions[index][key] = artifact(temp, `mutation-${++mutationNumber}.json`, value);
    }
    function reject(label, mutate, expected = "reject") {
      const run = structuredClone(good); mutate(run);
      const result = evaluateQuality(run, options);
      assert.equal(result.label, expected, `${label}: ${JSON.stringify(result)}`);
      assert.equal(result.promotionEligible, false); negatives.push(label);
    }
    // Live-shaped admission records only: real recorder events/payload layouts, no SDK or model execution.
    for (const format of ["messages", "responses"]) {
      const slot = good.sessions[0], files = obligations(slot);
      const contents = files.map(file => file + "\nquoted: \"result\" \\ path \uD55C");
      const ids = files.map((_, i) => format === "responses" ? `call_read_${i}|fc_item_${i}` : `read-${i}|literal`);
      const liveOptions = { ...options, config: { ...config, mode: "live" } };
      function delivered(mutate = () => {}, mutateCapture = () => {}) {
        const capture = createCapture({ root: temp }), handlers = new Map();
        capture.extension({ on(event, handler) { handlers.set(event, handler); } });
        const emit = (event, value) => handlers.get(event)(value);
        const payload = results => format === "responses" ? { input: results } : { messages: results };
        emit("before_provider_request", { payload: payload([]) });
        for (const [i, file] of files.entries()) {
          emit("tool_execution_start", { toolName: "read", toolCallId: ids[i], args: { path: file } });
          emit("tool_execution_end", { toolName: "read", toolCallId: ids[i], result: { content: [{ type: "text", text: contents[i] }] }, isError: false });
        }
        const results = contents.map((text, i) => format === "responses"
          ? { type: "function_call_output", call_id: `call_read_${i}`, output: [{ type: "input_text", text }] }
          : { role: "tool", tool_call_id: ids[i], content: text });
        const bodies = [payload(results), payload(structuredClone(results))];
        mutate(bodies);
        for (const body of bodies) emit("before_provider_request", { payload: body });
        capture.assertComplete({ wire: false });
        const run = { ...structuredClone(good), mode: "live", sessions: [structuredClone(slot)], judgments: [] };
        run.sessions[0].finalText = artifact(temp, `delivery-final-${++mutationNumber}.txt`, "test-owned admission record");
        replace(run, "verification", value => { value.synthetic = false; });
        replace(run, "receipt", value => {
          value.synthetic = false;
          value.capture = { settled: 1, usage: value.usage, requests: capture.requests, reads: capture.reads };
          mutateCapture(value.capture);
        });
        return evaluateQuality(run, liveOptions);
      }
      const intact = delivered();
      assert.deepEqual(intact.failures, [], JSON.stringify(intact));
      assert.equal(intact.promotionEligible, false, "partial test record is not model/adoption evidence");
      const items = body => body[format === "responses" ? "input" : "messages"];
      const idKey = format === "responses" ? "call_id" : "tool_call_id";
      const contentKey = format === "responses" ? "output" : "content";
      const mutations = [
        ["dropped results", bodies => bodies.forEach(body => items(body).splice(0))],
        ["missing results", bodies => bodies.forEach(body => { delete body[format === "responses" ? "input" : "messages"]; })],
        ["replaced content", bodies => bodies.forEach(body => { items(body)[0][contentKey] = "x".repeat(Buffer.byteLength(contents[0])); })],
        ["replaced bytes", () => {}, capture => capture.requests.slice(1).forEach(request => { request.toolResults[0].bytes++; })],
        ["wrong ID", bodies => bodies.forEach(body => { items(body)[0][idKey] = "unrelated-read"; })],
        ["late delivery", bodies => items(bodies[0]).splice(0, 1)],
        ["non-subsequent delivery", bodies => bodies.forEach(body => items(body).splice(0, 1)), capture => {
          capture.requests[0].toolResults = [{ toolCallId: format === "responses" ? "call_read_0" : ids[0], sha256: digest(contents[0]), bytes: Buffer.byteLength(contents[0]) }];
          capture.requests[0].toolResultCount = 1;
        }],
        ["missing read ID", () => {}, capture => { delete capture.reads[0].toolCallId; }],
        ["unsupported summary with apparent results", () => {}, capture => capture.requests.slice(1).forEach(request => { request.format = "unavailable"; request.summaryUnavailable = "unsupported provider payload layout"; })],
      ];
      if (format === "messages") mutations.push(["Responses normalization forbidden for messages", bodies => bodies.forEach(body => { items(body)[0][idKey] = "read-0"; })]);
      for (const [label, mutate, mutateCapture] of mutations) {
        const result = delivered(mutate, mutateCapture);
        assert(result.failures.some(failure => failure.startsWith("backend/baseline: mandatory read delivery missing or mismatched:") && failure.includes(files[0])), label + ": " + JSON.stringify(result));
        assert.equal(result.label, "reject", label + ": " + JSON.stringify(result));
        assert.equal(result.promotionEligible, false);
        negatives.push(format + " " + label);
      }
      for (const [label, mutateCapture] of [
        ["failed read", capture => { capture.reads[0].isError = true; }],
        ["unproven read success", capture => { delete capture.reads[0].isError; }],
        ["partial read", capture => { capture.reads[0].limit = 1; }],
      ]) {
        const result = delivered(undefined, mutateCapture);
        assert(result.failures.some(failure => failure.includes("missing full required read: " + files[0])), label + ": " + JSON.stringify(result));
        negatives.push(format + " " + label);
      }
    }
    // Rereads use actual required source bytes, without the synthetic obligations override.
    const sourceConfig = { ...config, mode: "live", baselineSource: fileURLToPath(new URL("../", import.meta.url)) };
    const sourceSlot = sessionOrder()[0], sourceFiles = requiredReads(sourceConfig, sourceSlot);
    const sourceIdentity = sessionIdentity(sourceConfig, binding, sourceSlot);
    for (const format of ["messages", "responses"]) {
      function reread(mutate = () => {}) {
        const capture = createCapture({ root: sourceConfig.baselineSource }), handlers = new Map();
        capture.extension({ on(event, handler) { handlers.set(event, handler); } });
        const emit = (event, value) => handlers.get(event)(value);
        const request = results => emit("before_provider_request", { payload: format === "responses" ? { input: results } : { messages: results } });
        function read(file, id) {
          const text = readFileSync(path.join(sourceConfig.baselineSource, file), "utf8");
          const toolCallId = id + (format === "responses" ? "|fc_item" : "|literal");
          emit("tool_execution_start", { toolName: "read", toolCallId, args: { path: file } });
          emit("tool_execution_end", { toolName: "read", toolCallId, result: { content: [{ type: "text", text }] }, isError: false });
          return format === "responses" ? { type: "function_call_output", call_id: id, output: text }
            : { role: "tool", tool_call_id: toolCallId, content: text };
        }
        request([]);
        const results = sourceFiles.map((file, i) => read(file, "original-" + i));
        request([]); // Original result was dropped; a justified reread occurs in request 2.
        results[0] = read(sourceFiles[0], "reread");
        request(results); // This request also emits the first relevant action.
        request(results);
        capture.assertComplete({ wire: false });
        mutate(capture);
        const run = { ...structuredClone(good), mode: "live", sessions: [structuredClone(good.sessions[0])], judgments: [] };
        run.sessions[0].identity = sourceIdentity;
        run.sessions[0].finalText = artifact(temp, `reread-final-${++mutationNumber}.txt`, "test-owned admission record");
        replace(run, "verification", value => { value.synthetic = false; value.identity = sourceIdentity; });
        replace(run, "receipt", value => {
          value.synthetic = false; value.identity = sourceIdentity;
          value.actions[0].requestSequence = 3;
          value.contextManifest.push({ path: sourceFiles[0], reason: "Refresh required context after the first result was dropped" });
          value.capture = { settled: 1, usage: value.usage, requests: capture.requests, reads: capture.reads };
        });
        return evaluateQuality(run, { config: sourceConfig, binding, directory: temp });
      }
      const withoutStale = reread(capture => capture.reads.shift());
      assert.deepEqual(withoutStale.failures, [], JSON.stringify(withoutStale));
      const refreshed = reread();
      assert.deepEqual(refreshed.failures, [], format + ": stale first full read must not mask a delivered source-matching reread: " + JSON.stringify(refreshed));
      assert.equal(refreshed.promotionEligible, false);
      assert.deepEqual(reread(capture => { capture.reads[0].sha256 = digest("stale source"); }).failures, [], "stale source hash must not mask valid reread");
      const falseDeliveries = [
        ["all full reads undelivered", capture => capture.requests.slice(2).forEach(request => { request.toolResults.shift(); })],
        ["all delivery too late", capture => { capture.requests[2].toolResults.shift(); }],
        ["all reads too late", capture => capture.reads.filter(read => read.path === sourceFiles[0]).forEach(read => { read.requestSequence = 3; })],
        ["failed reread", capture => { capture.reads.at(-1).isError = true; }],
        ["unproven reread", capture => { delete capture.reads.at(-1).isError; }],
        ["partial reread", capture => { capture.reads.at(-1).limit = 1; }],
        ["wrong reread ID", capture => { capture.reads.at(-1).toolCallId = "other-call"; }],
        ["wrong delivered bytes", capture => capture.requests.slice(2).forEach(request => { request.toolResults[0].bytes++; })],
        ["unsupported reread delivery", capture => capture.requests.slice(2).forEach(request => { request.format = "unavailable"; })],
        ["source-matching stale read cannot lend its hash to delivered wrong-source reread", capture => {
          capture.reads.at(-1).sha256 = digest("different source");
          capture.requests.slice(2).forEach(request => { request.toolResults[0].sha256 = capture.reads.at(-1).sha256; });
        }],
        ["all source hashes wrong", capture => {
          capture.reads.filter(read => read.path === sourceFiles[0]).forEach(read => { read.sha256 = digest("different source"); });
          capture.requests.slice(2).forEach(request => { request.toolResults[0].sha256 = digest("different source"); });
        }],
      ];
      for (const [label, mutate] of falseDeliveries) {
        const result = reread(mutate);
        assert(result.failures.some(failure => /^backend\/baseline: (mandatory read delivery missing or mismatched:|mandatory context arrived after action|read hash differs from bound source)/.test(failure)), label + ": " + JSON.stringify(result));
        assert.equal(result.label, "reject"); assert.equal(result.promotionEligible, false);
        negatives.push(format + " " + label);
      }
      console.log("[reread] " + format + ": stale-read control, source-bound reread and invalid/late guards passed");
    }
    const classified = structuredClone(good), unavailable = { unavailable: "not captured" };
    const normalizedUsage = { input: 100, output: 10, totalTokens: 110 };
    classified.sessions[0].usage = unavailable;
    replace(classified, "receipt", value => {
      value.usage = unavailable;
      value.capture.usage = unavailable;
      value.capture.normalizedUsage = normalizedUsage;
    });
    const classifiedReport = evaluateQuality(JSON.parse(JSON.stringify(classified)), options);
    assert.equal(classifiedReport.label, "adopt-preserved");
    assert.deepEqual(classifiedReport.usage[0].usage, unavailable);
    assert.deepEqual(readArtifact(temp, classified.sessions[0].receipt).capture.normalizedUsage, normalizedUsage);
    reject("SDK-normalized usage presented as provider", run => {
      run.sessions[0].usage = { providerMessages: [normalizedUsage] };
      replace(run, "receipt", value => {
        value.usage = run.sessions[0].usage;
        value.capture.usage = unavailable;
        value.capture.normalizedUsage = normalizedUsage;
      });
    });
    reject("nine sessions", run => run.sessions.pop(), "unresolved");
    reject("eleven sessions", run => run.sessions.push(structuredClone(run.sessions[0])));
    reject("duplicate slot", run => run.sessions[1] = structuredClone(run.sessions[0]));
    reject("duplicate session ID", run => run.sessions[1].sessionId = run.sessions[0].sessionId);
    reject("order", run => run.sessions.reverse());
    for (const key of ["source", "sourceTree", "modelId", "reasoning", "runtimeHash", "pluginHash", "settingsHash", "fixtureHash"]) reject(`wrong ${key}`, run => run.sessions[0].identity[key] = "wrong");
    reject("run hash", run => run.binding.configHash = "wrong");
    reject("hidden attempt", run => run.sessions[0].attempt = 2);
    reject("automatic transport fallback", run => replace(run, "receipt", value => value.controls.transport = "auto"));
    for (const key of ["retry", "fallback", "title", "grader", "subagent"]) reject(`hidden ${key}`, run => replace(run, "receipt", receipt => receipt.controls[key] = true));
    reject("oracle failure", run => replace(run, "verification", value => value.checks[0].status = "fail"));
    reject("missing oracle", run => replace(run, "verification", value => value.checks.pop()));
    reject("authority failure", run => replace(run, "verification", value => value.authority = "fail"));
    reject("actual external write", run => replace(run, "receipt", value => value.actions.push({ id: "bad", kind: "github-write", status: "success" })));
    reject("outside source write", run => replace(run, "receipt", value => value.after["outside.mjs"] = digest("write")));
    reject("missing mandatory read", run => replace(run, "receipt", value => value.capture.reads.pop()));
    reject("partial required read", run => replace(run, "receipt", value => value.capture.reads[0].limit = 1));
    reject("read without provenance", run => replace(run, "receipt", value => value.capture.reads[0].requestSequence = 3));
    reject("late required context", run => replace(run, "receipt", value => value.capture.reads[0].requestSequence = 2));
    reject("read without reason", run => replace(run, "receipt", value => value.capture.reads.push({ ...value.capture.reads[0], path: "extra.md" })));
    reject("fake execution claims", run => replace(run, "output", value => value.claims.push({ checkId: "never-executed", actionId: "fake" })));
    reject("fake oracle execution", run => replace(run, "receipt", value => value.actions = []));
    reject("model-owned receipt", run => replace(run, "receipt", value => value.owner = "model"));
    reject("unsupported claims", run => replace(run, "verification", value => value.unsupportedClaims.push("I tested it")));
    reject("unresolved slot", run => run.sessions[0].status = "unresolved", "unresolved");
    reject("missing F3", run => run.judgments = [], "unresolved");
    reject("missing qualitative axis", run => delete run.judgments[0].axes.evidence, "unresolved");
    reject("no F3 evidence", run => run.judgments[0].axes.evidence.evidence = [], "unresolved");
    reject("score-only", run => { run.judgments = []; run.score = 100; }, "unresolved");
    reject("lower-token worse quality", run => { run.sessions[0].usage.input_tokens = 1; replace(run, "receipt", value => value.usage = run.sessions[0].usage); run.judgments[0].axes.correctness.verdict = "worse"; });
    reject("source-read fake UI proof", run => replace(run, "verification", value => delete value.browser, 8));
    reject("synthetic passed as live", run => replace(run, "receipt", value => value.synthetic = false));
    reject("missing artifact", run => run.sessions[0].output.path = "missing.json", "unresolved");
    reject("artifact hash tamper", run => run.sessions[0].output.sha256 = "0".repeat(64));
    reject("artifact traversal", run => run.sessions[0].output.path = "../outside.json");
    reject("cleanup missing", run => replace(run, "receipt", value => value.cleanup.sandboxRemoved = false));
    reject("extra finding awaits F3", run => replace(run, "verification", value => value.extraFindings.push({ id: "new-defect", evidence: [run.sessions[0].output] })), "unresolved");
    const extra = structuredClone(good);
    replace(extra, "verification", value => value.extraFindings.push({ id: "new-defect", evidence: [extra.sessions[0].output] }));
    extra.judgments.find(judgment => judgment.fixtureId === "backend").extraFindings = [{ id: "new-defect", variant: "baseline", verdict: "supported", evidence: [extra.sessions[0].output] }];
    assert.equal(evaluateQuality(extra, options).label, "adopt-preserved", "evidence-backed extra findings are not rejected by unknown ID");
    const improved = structuredClone(good); improved.judgments[0].axes.usability.verdict = "better";
    assert.equal(evaluateQuality(improved, options).label, "adopt-improved");
    const extraRead = structuredClone(good);
    replace(extraRead, "receipt", value => { value.capture.reads.push({ ...value.capture.reads[0], path: "extra.md" }); value.contextManifest.push({ path: "extra.md", reason: "new evidence" }); });
    assert.equal(evaluateQuality(extraRead, options).label, "adopt-preserved");
    for (const key of ["baselineSource", "candidateSource", "runtimeDist", "pluginPath"]) mkdirSync(config[key]);
    assert.equal(sourceTree(config.baselineSource), "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
    writeFileSync(path.join(config.baselineSource, "file"), "actual bytes");
    assert.notEqual(sourceTree(config.baselineSource), sourceTree(config.candidateSource));
    assert.notEqual(directoryHash(config.baselineSource), directoryHash(config.candidateSource));
    assert.throws(() => bindSources(config), /baseline archive/);
    const cliConfig = path.join(temp, "config.json"); writeFileSync(cliConfig, JSON.stringify(config));
    const cli = spawnSync(process.execPath, ["scripts/eval-skill-loading.mjs", "--mode", "offline", "--config", cliConfig, "--output", path.join(temp, "cli")], { encoding: "utf8", timeout: 10000 });
    assert.equal(cli.status, 2, cli.stderr); assert.match(cli.stderr, /baseline archive/);
    assert(!existsSync(path.join(temp, "cli")), "preflight failure created a run");
    for (const label of negatives) console.log(`[negative] ${label}: rejected`);
    console.log(`[test:skill-loading-quality-report] passed (${negatives.length} rejection cases; no model calls)`);
    return negatives;
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "temp cleanup"); }
}

// Discover only from the public prompt, never from oracle metadata or guessed filenames.
export async function testSourceDiscovery() {
  const { prepareSandbox, createFixtureTools } = await import("./eval-skill-loading.mjs");
  const { sourceSnapshot } = await import("../evals/skill-loading/fixtures/status/oracle.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url)), temp = makeTempDir("ddalggak-discovery-");
  try {
    for (const fixtureId of ["internal-review", "public-body-review"]) {
      const parent = path.join(temp, fixtureId); mkdirSync(parent);
      const config = { candidateSource: root }, slot = { fixtureId, variant: "candidate" };
      const sandbox = prepareSandbox(config, slot, parent), directory = path.join(parent, "evidence"); mkdirSync(directory);
      const before = structuredClone(sandbox.before), capture = createCapture({ root: sandbox.workspace }), handlers = new Map();
      capture.extension({ on(type, handler) { handlers.set(type, handler); } });
      const prompt = readFileSync(path.join(root, "evals/skill-loading/fixtures", fixtureId, "prompt.md"), "utf8");
      const messages = [{ role: "user", content: prompt }];
      const request = () => {
        const payload = { messages }; handlers.get("before_provider_request")({ payload });
        capture.observeWire(JSON.parse(JSON.stringify(payload)), Buffer.byteLength(JSON.stringify(payload)));
      };
      const state = createFixtureTools({ config, slot, sandbox, directory, capture });
      const read = state.tools.find(tool => tool.name === "read"), sources = [];
      let sequence = 0;
      const invoke = async (file, reason = "discover and ground the requested diff") => {
        const id = `discovery-${++sequence}`, args = { path: file, reason };
        handlers.get("tool_execution_start")({ toolName: "read", toolCallId: id, args });
        let result, isError = false;
        try { result = await read.execute(id, args); return result; }
        catch (error) { isError = true; result = { content: [{ type: "text", text: state.actions.at(-1).error }] }; throw error; }
        finally {
          handlers.get("tool_execution_end")({ toolName: "read", toolCallId: id, result, isError });
          messages.push({ role: "tool", tool_call_id: id, content: result.content }); request();
        }
      };
      request();
      assert.equal((await invoke("context.md")).content[0].text, readFileSync(path.join(sandbox.workspace, "context.md"), "utf8"));
      const directories = prompt.match(/\b(before)\/(after)\b/)?.slice(1);
      assert.deepEqual(directories, ["before", "after"]);
      for (const name of directories) {
        assert(read.parameters.properties.path.examples.includes(name), "public directory not advertised");
        const result = await invoke(name), listing = JSON.parse(result.content[0].text);
        assert.equal(listing.type, "directory"); assert.equal(result.details.type, "directory");
        assert(listing.paths.length > 0); assert.deepEqual(listing.paths, [...new Set(listing.paths)].sort());
        assert.deepEqual(await invoke(name), result, "listing must be deterministic");
        for (const file of listing.paths) {
          assert(file.startsWith(name + "/") && !file.includes("..") && !path.isAbsolute(file));
          const content = await invoke(file);
          assert.deepEqual(content.details, {}, "regular-file read contract unchanged");
          assert.equal(content.content[0].text, readFileSync(path.join(sandbox.workspace, file), "utf8"));
          assert.equal(digest(content.content[0].text), before[file], "exact original source grounding");
          sources.push(file);
        }
        const nested = path.posix.dirname(listing.paths[0]);
        assert.deepEqual(JSON.parse((await invoke(nested)).content[0].text).paths, listing.paths.filter(file => file.startsWith(nested + "/")));
      }
      assert.deepEqual(sources.slice().sort(), Object.keys(before).filter(file => /^(before|after)\//.test(file)).sort());
      assert(!JSON.stringify(messages).match(/oracle[./]|solution\/|A12_PRIVATE/), "private names/content exposed");
      const discoveryReads = structuredClone(capture.reads);
      for (const entry of discoveryReads) assert(capture.requests.some(request => request.sequence > entry.requestSequence && request.toolResults.some(result =>
        result.toolCallId === entry.toolCallId && result.sha256 === entry.sha256 && result.bytes === entry.bytes)), "tool result not delivered intact");
      assert(state.actions.every(action => action.kind === "read" && action.status === "success"), "discovery called verify or wrote source");
      assert.equal(state.contextManifest.length, capture.reads.length);
      const finished = await state.finish({}, "discovery-only");
      assert.match(finished.record.unsupportedClaims.join("\n"), /missing read:/, "directory reads must not satisfy required documents");
      assert.deepEqual(finished.after, before);
      // Inventory is harness-owned: neither forged snapshot keys nor newly injected private files are discoverable.
      const privatePath = "before/src/oracle.mjs", privateFile = path.join(sandbox.workspace, privatePath);
      writeFileSync(privateFile, "A12_PRIVATE", { flag: "wx" });
      sandbox.before[privatePath] = digest("A12_PRIVATE"); sandbox.before["before/../evidence/secret.mjs"] = digest("forged");
      sandbox.sourcePaths = [privatePath];
      try {
        const listing = JSON.parse((await invoke("before")).content[0].text);
        assert.deepEqual(listing.paths, sources.filter(file => file.startsWith("before/")));
      } finally { unlinkSync(privateFile); }
      const denied = async (file, category) => {
        await assert.rejects(() => invoke(file));
        assert.equal(state.actions.at(-1).failure.category, category);
        assert.equal(state.actions.at(-1).status, category === "authority" ? "denied" : "failure");
      };
      for (const file of ["../outside", parent, "before/../after", "before\\..\\after", ".git", "before/"]) await denied(file, "authority");
      for (const file of ["missing", "before/missing", "context.md/child", "oracle.json"]) await denied(file, "input");
      await denied("ddalggak", "capability");
      symlinkSync(parent, path.join(sandbox.workspace, "escape"));
      try { for (const file of ["escape", "escape/missing"]) await denied(file, "authority"); }
      finally { unlinkSync(path.join(sandbox.workspace, "escape")); }
      const source = sources[0], target = path.join(sandbox.workspace, source), bytes = readFileSync(target), mode = lstatSync(target).mode;
      unlinkSync(target); symlinkSync(path.join(sandbox.workspace, sources.at(-1)), target);
      try { await denied(source, "authority"); await denied("before", "authority"); }
      finally { unlinkSync(target); writeFileSync(target, bytes, { flag: "wx", mode }); }
      unlinkSync(target);
      try { await denied("before", "input"); } finally { writeFileSync(target, bytes, { flag: "wx", mode }); }
      for (const args of [null, {}, { path: 42, reason: "inspect" }, { path: "before", reason: "" }, { path: "before", reason: "inspect", recursive: true }]) {
        await assert.rejects(() => read.execute(`malformed-${++sequence}`, args));
        assert.equal(state.actions.at(-1).failure.category, "input");
      }
      capture.assertComplete(); assert.deepEqual(sourceSnapshot(sandbox.workspace), before);
      console.log("[source-discovery] " + JSON.stringify({ fixtureId, layer: "public-tool and portable recorder, not live model", sources, reads: discoveryReads,
        actions: state.actions, contextManifest: state.contextManifest, sourceUnchanged: true, requiredDocumentsStillMissing: true, networkCalls: 0 }));
    }
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "discovery temp cleanup"); }
}

// Actual fixture tools/finish, then explicitly synthetic admission records; no SDK or provider.
export async function testToolFailureClassification({ caseName } = {}) {
  const { prepareSandbox, createFixtureTools } = await import("./eval-skill-loading.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url)), temp = makeTempDir("ddalggak-tool-errors-");
  const secret = "A11_PRIVATE_SENTINEL_credential_and_body";
  const cases = [
    ["directory", "internal-review", "read", { path: "before", reason: "inspect source" }, undefined], // A12 authorizes this former unsupported input.
    ["unsupported-read-gh", "status", "gh", { args: ["pr", "view", "17", "--json", "number"] }, "capability"],
    ["api-get", "status", "gh", { args: ["api", "repos/fixture/prs", "-X", "GET", "-H", "Authorization: " + secret] }, "capability"],
    ["missing-file", "status", "read", { path: "missing.mjs", reason: "inspect" }, "input"],
    ["file", "status", "read", { path: "state.json", reason: "inspect" }, undefined],
    ...[".", "./"].map((input, i) => ["unsupported-root-" + i, "status", "read", { path: input, reason: "inspect" }, "capability"]),
    ["unsupported-directory", "status", "read", { path: "ddalggak", reason: "inspect" }, "capability"],
    ...[".", "./"].map((input, i) => ["forbidden-root-write-" + i, "status", "write", { path: input, content: secret }, "authority"]),
    ...["./state.json", "./../outside", "./.git/config", "state.json/", ".//"].map((input, i) =>
      ["unchanged-path-denial-" + i, "status", "read", { path: input, reason: "inspect" }, "authority"]),
    ["not-directory", "status", "read", { path: "state.json/child", reason: "inspect" }, "input"],
    ["misleading-error-text", "status", "read", { path: "denied:not-a-write", reason: "inspect" }, "input"],
    ...[null, {}, { path: 42, reason: "inspect" }, { path: "", reason: "inspect" }, { path: "bad\0path", reason: "inspect" }, { path: "state.json", reason: 42 }]
      .map((args, i) => ["malformed-read-" + i, "status", "read", args, "input"]),
    ...[null, {}, { args: "pr view" }, { args: ["pr", 42] }, { args: [] }, { args: ["pr", "view\0"] }]
      .map((args, i) => ["malformed-gh-" + i, "status", "gh", args, "input"]),
    ["traversal", "status", "read", { path: "../outside", reason: "inspect" }, "authority"],
    ["absolute", "status", "read", { path: path.join(temp, "outside"), reason: "inspect" }, "authority"],
    ["absolute-root", "status", "read", { reason: "inspect" }, "authority"],
    ["git-private", "status", "read", { path: ".git/config", reason: "inspect" }, "authority"],
    ["symlink", "status", "read", { path: "escape/outside", reason: "inspect" }, "authority"],
    ["symlink-missing", "status", "read", { path: "escape/missing", reason: "inspect" }, "authority"],
    ["forbidden-write", "status", "write", { path: "state.json", content: secret }, "authority"],
    ["malformed-write", "status", "write", { path: "state.json", content: 42 }, "input"],
    ...[["pr", "comment", "17", "--body", secret], ["pr", "merge", "17"], ["issue", "edit", "17", "--body=" + secret],
      ["api", "repos/fixture/prs", "--method=POST", "--input", secret], ["api", "repos/fixture/prs", "-X", "DELETE"],
      ["api", "repos/fixture/prs", "-f", "body=" + secret], ["api", "repos/fixture/prs", "-Fbody=" + secret],
      ["extension", "exec", secret]].map((args, i) => ["forbidden-gh-" + i, "status", "gh", { args }, "authority"]),
    ["unknown-read-error", "status", "read", { path: "state.json", reason: "inspect" }, "execution"],
  ];
  const proofs = [];
  try {
    writeFileSync(path.join(temp, "outside"), "outside sentinel", { flag: "wx" });
    const outsideHash = digest(readFileSync(path.join(temp, "outside")));
    for (const [label, fixtureId, kind, args, category] of cases.filter(entry => !caseName || entry[0] === caseName)) {
      const parent = path.join(temp, label); mkdirSync(parent);
      const config = { runId: "a11-test", mode: "offline", baselineSource: root, candidateSource: root,
        modelId: "synthetic/no-model", reasoning: "high", runtimeDist: root, pluginPath: root };
      const binding = { settingsHash, baselineTree: BASELINE_TREE, candidateTree: "b".repeat(40) }, directory = path.join(parent, "evidence"); mkdirSync(directory);
      const run = syntheticRun(config, binding, directory, slot => requiredReads(config, slot));
      assert.deepEqual(evaluateQuality(run, { config, binding, directory }).failures, [], "clean admission control");
      const index = run.sessions.findIndex(slot => slot.fixtureId === fixtureId);
      const session = run.sessions[index], fixture = fixtures.find(entry => entry.id === session.fixtureId);
      const sandbox = prepareSandbox(config, session, parent), receipt = readArtifact(directory, session.receipt);
      const capture = { requests: receipt.capture.requests.slice(0, 1), reads: receipt.capture.reads };
      const state = createFixtureTools({ config, slot: session, sandbox, directory, capture });
      const invoke = (name, input) => state.tools.find(tool => tool.name === name).execute(name + "-" + state.actions.length, input);
      for (const file of requiredReads(config, session)) {
        const read = await invoke("read", { path: file, reason: "required context" });
        assert.equal(digest(read.content[0].text), digest(readFileSync(path.join(root, file))));
      }
      capture.requests.push(receipt.capture.requests[1]);
      const target = path.join(sandbox.workspace, "state.json");
      const mode = existsSync(target) ? lstatSync(target).mode & 0o7777 : null;
      if (label.startsWith("symlink")) symlinkSync(temp, path.join(sandbox.workspace, "escape"));
      if (label === "unknown-read-error") chmodSync(target, 0);
      let failure, result;
      try { result = await invoke(kind, label === "absolute-root" ? { ...args, path: sandbox.workspace } : args); } catch (error) { failure = error; }
      finally {
        if (label.startsWith("symlink")) unlinkSync(path.join(sandbox.workspace, "escape"));
        if (label === "unknown-read-error") chmodSync(target, mode);
      }
      if (label === "file") {
        assert.ifError(failure);
        assert.equal(result.content[0].text, readFileSync(target, "utf8"));
      } else if (label === "directory") {
        assert.equal(failure, undefined);
        assert.deepEqual(JSON.parse(result.content[0].text), { type: "directory", paths: Object.keys(sandbox.before).filter(file => file.startsWith("before/")).sort() });
        assert.equal(result.details.type, "directory");
      } else assert(failure, label + ": operation unexpectedly succeeded");
      const action = structuredClone(state.actions.at(-1));
      let observation;
      const verified = JSON.parse((await invoke("verify", {})).content[0].text);
      if (fixture.id === "status") {
        const proof = verified.observations;
        observation = { state: { branch: proof.branch, clean: proof.clean, openPrs: [proof.pr.number],
          pendingChecks: proof.pr.statusCheckRollup.filter(check => check.status === "IN_PROGRESS").map(check => check.name),
          blockers: proof.blockers.filter(blocker => !blocker.resolved).map(blocker => blocker.id), ready: false }, nextAction: "resolve-blocker-and-await-ci" };
      } else observation = { outcome: "change request", externalWriteAuthorized: false, cleanControls: fixture.cleanControls.map(entry => entry.id),
        findings: fixture.seededFindings.map(entry => ({ ...entry, evidence: entry.path + ":" + entry.line,
          correction: "Restore contract", counterevidence: "Clean controls preserve their contracts" })) };
      observation.claims = [{ checkId: fixture.oracleIds[0], actionId: verified.actionId }];
      await invoke("submit", { observation });
      const finished = await state.finish(session.identity, session.sessionId);
      assert.deepEqual(finished.after, sandbox.before, label + ": unexpected source write");
      assert.equal(digest(readFileSync(path.join(temp, "outside"))), outsideHash);
      Object.assign(receipt, { actions: state.actions, before: sandbox.before, after: finished.after, contextManifest: state.contextManifest });
      session.receipt = artifact(directory, "actual-receipt.json", receipt);
      session.verification = artifact(directory, "actual-verification.json", { ...finished.record, synthetic: true });
      session.output = artifact(directory, "actual-output.json", finished.output);
      const report = evaluateQuality(run, { config, binding, directory });
      const proof = { label, action, before: digest(JSON.stringify(sandbox.before)), after: digest(JSON.stringify(finished.after)),
        unsupportedClaims: finished.record.unsupportedClaims, failures: report.failures };
      console.log("[tool-classification] " + JSON.stringify(proof)); proofs.push(proof);
      assert.equal(action.status, category === undefined ? "success" : category === "authority" ? "denied" : "failure", JSON.stringify(proof));
      assert.equal(action.failure?.category, category, JSON.stringify(proof));
      assert(!JSON.stringify({ actions: state.actions, record: finished.record, report }).includes(secret), "private input persisted");
      if (category === undefined || ["input", "capability"].includes(category)) {
        assert.equal(finished.record.authority, "pass", JSON.stringify(proof));
        assert.deepEqual(report.failures, [], JSON.stringify(proof));
      } else {
        const diagnostic = category === "authority" ? "authority violation: " + kind : "tool execution failure: " + kind;
        assert(finished.record.unsupportedClaims.some(message => message.includes(diagnostic)), JSON.stringify(proof));
        assert(report.failures.some(message => message.startsWith(fixture.id + "/") && message.includes(diagnostic)), JSON.stringify(proof));
        if (kind !== "write") assert(!JSON.stringify(proof.unsupportedClaims).includes("outside-allowed-source-write"), JSON.stringify(proof));
      }
      assert.equal(report.promotionEligible, false, "synthetic tests cannot authorize adoption");
      if (label === "missing-file") for (const stale of ["absent", "unknown", "contradictory"]) {
        const copy = structuredClone(receipt), failed = copy.actions.find(entry => entry.id === action.id);
        if (stale === "absent") delete failed.failure;
        if (stale === "unknown") failed.failure.category = "unknown";
        if (stale === "contradictory") failed.status = "success";
        const ref = session.receipt;
        session.receipt = artifact(directory, `stale-${stale}.json`, copy);
        const rejected = evaluateQuality(run, { config, binding, directory }); session.receipt = ref;
        assert(rejected.failures.some(message => message.includes(stale === "contradictory" ? "inconsistent tool failure record" : "tool execution failure: read")), JSON.stringify(rejected));
        console.log("[tool-classification-stale] " + JSON.stringify({ stale, failures: rejected.failures }));
      }
      if (label === "api-get") assert.deepEqual(action.args, ["api", "[redacted]", "-X", "GET", "-H", "[redacted]"]);
      if (label === "forbidden-gh-3") assert.deepEqual(action.args, ["api", "[redacted]", "--method=POST", "--input", "[redacted]"]);
      if (label === "forbidden-gh-6") assert.deepEqual(action.args, ["api", "[redacted]", "-F=[redacted]"]);
      if (kind === "gh") {
        assert(Array.isArray(action.args) || action.args === null, "gh operation arguments missing");
        if (category !== "input") {
          assert.equal(action.args[0], args.args[0]);
          if (["pr", "issue", "extension"].includes(args.args[0])) assert.equal(action.args[1], args.args[1]);
        }
      }
    }
    return proofs;
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "tool failure probe cleanup"); }
}

export async function testNativeFailureProvenance({ scenarioOnly } = {}) {
  const { prepareSandbox, createFixtureTools } = await import("./eval-skill-loading.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url)), temp = makeTempDir("ddalggak-provenance-");
  const secret = "A11_PROVENANCE_PRIVATE_SENTINEL";
  const scenarios = ["ordinary-behavior-failure", "sandbox-write-denial", "unknown-runtime-throw", "native-assertion", "forged-provenance", "native-exit", "native-output", "native-network", "stderr-authority-spoof", "stderr-verification-spoof", "denied-message"];
  try {
    for (const scenario of scenarios.filter(name => !scenarioOnly || name === scenarioOnly)) {
      const parent = path.join(temp, scenario), directory = path.join(parent, "evidence"); mkdirSync(directory, { recursive: true });
      const config = { runId: "a11-provenance", mode: "offline", baselineSource: root, candidateSource: root,
        modelId: "synthetic/no-model", reasoning: "high", runtimeDist: root, pluginPath: root };
      const binding = { settingsHash, baselineTree: BASELINE_TREE, candidateTree: "b".repeat(40) };
      const run = syntheticRun(config, binding, directory, slot => requiredReads(config, slot));
      assert.deepEqual(evaluateQuality(run, { config, binding, directory }).failures, [], "clean admission control");
      const session = run.sessions[0], receipt = readArtifact(directory, session.receipt);
      const sandbox = prepareSandbox(config, session, parent), capture = { requests: receipt.capture.requests.slice(0, 1), reads: receipt.capture.reads };
      const state = createFixtureTools({ config, slot: session, sandbox, directory, capture });
      const invoke = (name, args) => state.tools.find(tool => tool.name === name).execute(name + "-" + state.actions.length, args);
      for (const file of requiredReads(config, session)) await invoke("read", { path: file, reason: "required context" });
      capture.requests.push(receipt.capture.requests[1]);
      const external = path.join(parent, "forbidden-write"); assert(!existsSync(external));
      const source = {
        "sandbox-write-denial": `import {writeFileSync} from 'node:fs'; export function quantities(){writeFileSync(${JSON.stringify(external)},'forbidden');}`,
        "unknown-runtime-throw": `export function quantities(){throw Error(${JSON.stringify(secret)});}`,
        "native-assertion": `import assert from 'node:assert/strict'; export function quantities(){assert.fail(${JSON.stringify(secret)});}`,
        "forged-provenance": `export function quantities(){throw Object.assign(Error(${JSON.stringify(secret)}),{fixtureFailure:{category:'verification',code:'backend-behavior-mismatch'}});}`,
        "stderr-authority-spoof": 'export function quantities(){process.stderr.write(JSON.stringify({code:"ERR_ACCESS_DENIED"}));process.exit(1);}',
        "stderr-verification-spoof": 'export function quantities(){process.stderr.write(JSON.stringify({code:"backend-behavior-mismatch",fixtureFailure:{category:"verification"}}));process.exit(1);}',
        "denied-message": `export function quantities(){throw Error("denied: ERR_ACCESS_DENIED ${secret}");}`,
        "native-exit": "export function quantities(){process.exit(7);}",
        "native-output": `export function quantities(){process.stdout.write(${JSON.stringify(secret)});process.exit(0);}`,
        "native-network": "import {Socket} from 'node:net'; export function quantities(){return new Promise((resolve,reject)=>{const s=new Socket();s.once('error',reject);s.once('connect',()=>{s.destroy();resolve('escaped')});s.connect({host:'127.0.0.1',port:1});});}",
      }[scenario];
      if (source) await invoke("write", { path: "app.mjs", content: source });
      const beforeFailure = digest(readFileSync(path.join(sandbox.workspace, "app.mjs")));
      await assert.rejects(() => invoke("verify", {}));
      const failure = structuredClone(state.actions.at(-1));
      assert.equal(digest(readFileSync(path.join(sandbox.workspace, "app.mjs"))), beforeFailure, "verify changed source");
      await invoke("write", { path: "app.mjs", content: readFileSync(path.join(root, "evals/skill-loading/fixtures/backend/solution/app.mjs"), "utf8") });
      const checked = JSON.parse((await invoke("verify", {})).content[0].text);
      assert.equal(checked.observations.checks.length, 9); assert(checked.observations.serverClosed);
      await invoke("submit", { observation: { implementationComplete: true, published: false, remainingGates: ["human-publication"],
        claims: [{ checkId: "http-quantities", actionId: checked.actionId }] } });
      const finished = await state.finish(session.identity, session.sessionId);
      assert(!existsSync(external), "native external write escaped");
      assert.deepEqual(Object.keys(finished.after).filter(file => finished.after[file] !== sandbox.before[file]), ["app.mjs"]);
      Object.assign(receipt, { actions: state.actions, before: sandbox.before, after: finished.after, contextManifest: state.contextManifest });
      session.receipt = artifact(directory, "native-receipt.json", receipt);
      session.verification = artifact(directory, "native-verification.json", { ...finished.record, synthetic: true });
      session.output = artifact(directory, "native-output.json", finished.output);
      const quality = evaluateQuality(run, { config, binding, directory });
      const proof = { scenario, transport: process.send ? "ipc" : "direct", failure, before: sandbox.before["app.mjs"], beforeFailure,
        after: finished.after["app.mjs"], externalAbsent: !existsSync(external), recheckCount: checked.observations.checks.length,
        authority: finished.record.authority, unsupportedClaims: finished.record.unsupportedClaims, failures: quality.failures };
      console.log("[native-provenance] " + JSON.stringify(proof));
      assert(!JSON.stringify({ actions: state.actions, finished: finished.record, quality }).includes(secret), "private error text persisted");
      if (scenario === "ordinary-behavior-failure") {
        assert.deepEqual(failure.failure, { category: "verification", code: "backend-behavior-mismatch" });
        const stale = structuredClone(state.actions);
        stale.find(action => action.id === failure.id).failure.code = "ERR_ASSERTION";
        assert.throws(() => checkToolActions(stale), /tool execution failure: verify/);
        assert.equal(finished.record.authority, "pass"); assert.deepEqual(quality.failures, []);
      } else {
        assert.equal(failure.failure?.category, "execution", JSON.stringify(proof));
        assert.equal(failure.status, "failure");
        const diagnostic = "tool execution failure: verify";
        assert(finished.record.unsupportedClaims.some(value => value.includes(diagnostic)), JSON.stringify(proof));
        assert(quality.failures.some(value => value.startsWith("backend/baseline: " + diagnostic)), JSON.stringify(proof));
        assert.equal(finished.record.authority, "fail");
      }
      assert.equal(quality.promotionEligible, false, "synthetic admission is not live evidence");
    }
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "native provenance cleanup"); }
}

export async function testUiFailureProvenance(browser, { scenarioOnly, evidenceDir } = {}) {
  const { prepareSandbox, createFixtureTools, confineBrowser } = await import("./eval-skill-loading.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url)), temp = makeTempDir("ddalggak-ui-provenance-");
  const secret = "A11_UI_PRIVATE_SENTINEL", proofs = [];
  try {
    for (const scenario of ["required", "runtime", "network", "png", "required-runtime", "required-network", "forged-browser"].filter(value => !scenarioOnly || value === scenarioOnly)) {
      const parent = path.join(temp, scenario), directory = path.join(parent, "evidence"); mkdirSync(directory, { recursive: true });
      const config = { runId: "a11-ui-final", mode: "offline", baselineSource: root, candidateSource: root,
        modelId: "synthetic/no-model", reasoning: "high", runtimeDist: root, pluginPath: root };
      const binding = { settingsHash, baselineTree: BASELINE_TREE, candidateTree: "b".repeat(40) };
      const run = syntheticRun(config, binding, directory, slot => requiredReads(config, slot));
      assert.deepEqual(evaluateQuality(run, { config, binding, directory }).failures, [], "clean admission control");
      const session = run.sessions[8], receipt = readArtifact(directory, session.receipt);
      const sandbox = prepareSandbox(config, session, parent), capture = { requests: receipt.capture.requests.slice(0, 1), reads: receipt.capture.reads };
      const secure = confineBrowser(browser);
      let corrupt = scenario === "png", capturedPng = false;
      // Corrupt only the test-owned evidence AFTER a real browser screenshot, not a fake check result.
      const surface = { async newContext() {
        const context = await secure.newContext(), newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage(), screenshot = page.screenshot.bind(page);
          page.screenshot = async options => {
            const bytes = await screenshot(options);
            if (corrupt) { assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a"); capturedPng = true; writeFileSync(options.path, "invalid-png"); }
            return bytes;
          };
          return page;
        };
        return context;
      } };
      const state = createFixtureTools({ config, slot: session, sandbox, directory, capture, browser: surface });
      const invoke = (name, args) => state.tools.find(tool => tool.name === name).execute(name + "-" + state.actions.length, args);
      for (const file of requiredReads(config, session)) await invoke("read", { path: file, reason: "required context" });
      capture.requests.push(receipt.capture.requests[1]);
      const solution = readFileSync(path.join(root, "evals/skill-loading/fixtures/ui/solution/index.html"), "utf8");
      let broken = scenario.startsWith("required") ? solution.replace(" required autocomplete", " autocomplete") : solution;
      if (scenario.startsWith("required")) assert.notEqual(broken, solution);
      if (scenario.includes("runtime")) broken = broken.replace("<body>", `<body><script>throw Error(${JSON.stringify(secret)})</script>`);
      if (scenario.includes("network")) broken = broken.replace("<body>", '<body><img src="http://outside.invalid/fixture-denied">');
      if (scenario === "forged-browser") broken = broken.replace("<body>", '<body><script>Object.defineProperty(document.documentElement,"scrollWidth",{get(){throw {fixtureFailure:{category:"verification",code:"ui-behavior-mismatch"}}}})</script>');
      await invoke("write", { path: "index.html", content: broken });
      const beforeFailure = digest(readFileSync(path.join(sandbox.workspace, "index.html")));
      await assert.rejects(() => invoke("verify", {}));
      const failure = structuredClone(state.actions.at(-1));
      assert.equal(digest(readFileSync(path.join(sandbox.workspace, "index.html"))), beforeFailure);
      if (scenario === "png") assert(capturedPng);
      corrupt = false;
      await invoke("write", { path: "index.html", content: solution });
      const recheck = JSON.parse((await invoke("verify", {})).content[0].text).observations;
      assert.equal(recheck.receipts.length, 24); assert.deepEqual([...new Set(recheck.receipts.map(entry => entry.width))], [375, 768, 1280]);
      assert(recheck.serverClosed && recheck.contextClosed); assert.deepEqual(recheck.faults, []); assert.deepEqual(recheck.externalRequests, []);
      const screenshots = recheck.receipts.map(entry => {
        const bytes = readArtifact(directory, entry.screenshot, false);
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        return evidenceDir && scenario === "required" ? artifact(evidenceDir, `${entry.width}-${entry.state}.png`, bytes) : entry.screenshot.sha256;
      });
      await invoke("submit", { observation: { claims: [] } });
      const finished = await state.finish(session.identity, session.sessionId);
      assert.deepEqual(Object.keys(finished.after).filter(file => finished.after[file] !== sandbox.before[file]), ["index.html"]);
      Object.assign(receipt, { actions: state.actions, before: sandbox.before, after: finished.after, contextManifest: state.contextManifest });
      session.receipt = artifact(directory, "ui-receipt.json", receipt);
      session.verification = artifact(directory, "ui-verification.json", { ...finished.record, synthetic: true });
      session.output = artifact(directory, "ui-output.json", finished.output);
      const quality = evaluateQuality(run, { config, binding, directory });
      const proof = { scenario, failure, before: sandbox.before["index.html"], beforeFailure, after: finished.after["index.html"],
        receipts: recheck.receipts.length, screenshots, serverClosed: recheck.serverClosed, contextClosed: recheck.contextClosed,
        authority: finished.record.authority, unsupportedClaims: finished.record.unsupportedClaims, failures: quality.failures };
      console.log("[ui-provenance] " + JSON.stringify(proof)); proofs.push(proof);
      assert(!JSON.stringify({ actions: state.actions, record: finished.record, quality }).includes(secret), "private browser fault text persisted");
      if (scenario === "required") {
        assert.deepEqual(failure.failure, { category: "verification", code: "ui-behavior-mismatch" }, JSON.stringify(proof));
        assert.equal(finished.record.authority, "pass"); assert.deepEqual(quality.failures, []);
      } else {
        assert.equal(failure.failure.category, "execution", JSON.stringify(proof));
        assert.equal(finished.record.authority, "fail");
        assert(finished.record.unsupportedClaims.some(value => value.startsWith("tool execution failure: verify")), JSON.stringify(proof));
        assert(quality.failures.some(value => value.startsWith("ui/baseline: tool execution failure: verify")), JSON.stringify(proof));
      }
      assert.equal(quality.promotionEligible, false);
    }
    return proofs;
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "UI provenance cleanup"); }
}

export async function testNativeProvenanceIpc() {
  const { createLiveBoundary, quantitiesReply } = await import("./eval-skill-loading.mjs");
  const temp = makeTempDir("ddalggak-provenance-ipc-");
  const { home, profile, env } = createLiveBoundary(path.join(temp, "output"), path.join(temp, "registry"));
  let child, stdout = "", stderr = "";
  const failures = [];
  try {
    child = spawn("/usr/bin/sandbox-exec", ["-p", profile, process.execPath, fileURLToPath(import.meta.url), "--native-provenance-child"],
      { cwd: fileURLToPath(new URL("../", import.meta.url)), env, stdio: ["ignore", "pipe", "pipe", "ipc"] });
    child.stdout.on("data", value => { stdout += value; }); child.stderr.on("data", value => { stderr += value; });
    child.on("message", async request => {
      const reply = await quantitiesReply(request, home);
      if (reply.failure) failures.push(reply.failure);
      if (child.connected) child.send(reply);
    });
    const [code] = await once(child, "close", { signal: AbortSignal.timeout(120000) });
    console.log(stdout); assert.equal(code, 0, stderr);
    const proofs = stdout.split("\n").filter(line => line.startsWith("[native-provenance] ")).map(line => JSON.parse(line.slice("[native-provenance] ".length)));
    assert.equal(proofs.length, 11); assert(proofs.every(proof => proof.transport === "ipc"));
    assert.equal(failures.length, 10); assert(failures.every(failure => failure.category === "execution"));
    for (const request of [null, { type: "shell", id: "bad", workspace: home, input: [] },
      { type: "quantities", id: "escape", workspace: fileURLToPath(new URL("../", import.meta.url)), input: [] }]) {
      const reply = await quantitiesReply(request, home); assert.equal(reply.failure.category, "authority");
    }
    console.log("[test:native-provenance-ipc] 11 real native/recheck cases; unproven native failures stay execution, direct request denials stay authority");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const closed = once(child, "close", { signal: AbortSignal.timeout(5000) }); child.kill("SIGKILL"); await closed;
    }
    // createLiveBoundary owns an independent HOME rather than the test-lib root.
    const { rmSync } = await import("node:fs"); rmSync(home, { recursive: true, force: true });
    cleanupTempRoot(temp); assert(!existsSync(home) && !existsSync(temp), "IPC provenance cleanup");
  }
}

export async function testSandboxTools({ execute = false } = {}) {
  const { prepareSandbox, createFixtureTools, sandboxCapability, isolatedQuantities, guardProvider } = await import("./eval-skill-loading.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const temp = makeTempDir("ddalggak-tools-");
  try {
    if (execute) sandboxCapability();
    const originalFetch = globalThis.fetch, restore = guardProvider({ baseUrl: "https://selected.invalid/api" });
    try { assert.throws(() => fetch("https://outside.invalid/"), /denied/); }
    finally { restore(); }
    assert.equal(globalThis.fetch, originalFetch, "provider boundary cleanup");
    for (const fixture of fixtures) {
      const parent = path.join(temp, fixture.id); mkdirSync(parent);
      const config = { baselineSource: root, candidateSource: root };
      const slot = { fixtureId: fixture.id, variant: "candidate", ordinal: 1 };
      const sandbox = prepareSandbox(config, slot, parent), directory = path.join(parent, "evidence"); mkdirSync(directory);
      const capture = { requests: [{ sequence: 1 }], reads: fixture.expectedReads.map(path => ({ path, isError: false })) };
      const state = createFixtureTools({ config, slot, sandbox, directory, capture });
      const invoke = (name, args, id = `${name}-${state.actions.length}`) => state.tools.find(tool => tool.name === name).execute(id, args);
      assert(!existsSync(path.join(sandbox.workspace, "oracle.json")) && !existsSync(path.join(sandbox.workspace, "solution")), "oracle/solution must not be model-visible");
      await assert.rejects(() => invoke("read", { path: "../oracle.json", reason: "escape" }), /denied/);
      await assert.rejects(() => invoke("write", { path: "ddalggak/SKILL.md", content: "overwrite" }), /denied/);
      await assert.rejects(() => invoke("gh", { args: ["pr", "comment", "17", "--body", "write"] }), /denied/);
      const read = await invoke("read", { path: "ddalggak/SKILL.md", reason: "mandatory contract" });
      assert.equal(read.content[0].text, readFileSync(path.join(root, "ddalggak/SKILL.md"), "utf8"));
      assert.equal(state.actions.at(-1).status, "success");
      if (fixture.id === "status") {
        const gh = await invoke("gh", { args: ["pr", "checks", "17", "--json", "name,state"] });
        assert.deepEqual(JSON.parse(gh.content[0].text), [{ name: "unit", state: "PENDING" }]);
        const checked = await invoke("verify", {});
        const proof = JSON.parse(checked.content[0].text).observations;
        assert.equal(proof.clean, true); assert.equal(proof.branch, "feature/quantity-total");
      }
      if (fixture.id === "backend" && execute) {
        await assert.rejects(() => invoke("verify", {}), /HTTP body/);
        const correct = readFileSync(path.join(root, "evals/skill-loading/fixtures/backend/solution/app.mjs"), "utf8");
        await invoke("write", { path: "app.mjs", content: correct });
        const checked = JSON.parse((await invoke("verify", {})).content[0].text);
        assert(checked.observations.serverClosed && checked.observations.checks.length > 0);
        const outside = path.join(parent, "outside.txt");
        await invoke("write", { path: "app.mjs", content: `import { writeFileSync } from 'node:fs'; export function quantities(){ writeFileSync(${JSON.stringify(outside)}, 'bad'); return {status:200,body:{total:0}}; }` });
        await assert.rejects(() => isolatedQuantities(sandbox.workspace, []), { fixtureFailure: { category: "execution", code: "native-process-failed" } });
        assert(!existsSync(outside), "OS sandbox permitted external write");
        await invoke("write", { path: "app.mjs", content: "import { connect } from 'node:net'; export function quantities(){ const s=connect({host:'127.0.0.1',port:1}); return new Promise((resolve,reject)=>{s.once('connect',()=>reject(Error('network escaped'))); s.once('error',reject);}); }" });
        await assert.rejects(() => isolatedQuantities(sandbox.workspace, []), { fixtureFailure: { category: "execution", code: "native-process-failed" } });
        console.log("[sandbox] real HTTP checks pass; source bug/external write/network blocked");
      }
      if (fixture.id.includes("review")) {
        const checked = JSON.parse((await invoke("verify", {})).content[0].text);
        assert(checked.observations.defects.includes("failure-handling"));
        if (fixture.id === "public-body-review") {
          const inputs = JSON.parse((await invoke("read", { path: "inputs.json", reason: "seeded public rendering context" })).content[0].text);
          assert.deepEqual(inputs, JSON.parse(readFileSync(path.join(root, "evals/skill-loading/fixtures/public-body-review/inputs.json"))));
          const rendered = JSON.parse((await invoke("verify", { publicInputs: inputs })).content[0].text);
          assert.equal(rendered.observations.publicBody.fixtureOnly, true);
        }
      }
    }
    console.log("[test:skill-loading-tools] native tool definitions, real file boundaries, gh and frozen oracle APIs passed");
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp)); }
}

export async function testReadonlySandbox() {
  const root = fileURLToPath(new URL("../", import.meta.url)), temp = makeTempDir("ddalggak-readonly-");
  const archive = path.join(temp, "package");
  const snapshot = directory => Object.fromEntries(readdirSync(directory, { recursive: true }).sort()
    .filter(name => lstatSync(path.join(directory, name)).isFile())
    .map(name => [name, { mode: lstatSync(path.join(directory, name)).mode & 0o7777, sha256: digest(readFileSync(path.join(directory, name))) }]));
  try {
    for (const name of ["scripts/eval-skill-loading.mjs", "scripts/skill-loading/run-config.mjs", "scripts/skill-loading/quality-report.mjs",
      "scripts/skill-loading/capture-extension.mjs", "scripts/skill-loading/runtime-adapter.mjs",
      "bin/lib/command-contracts.mjs", "scripts/lib/command-contract-schema.mjs", "scripts/lib/parse-simple-yaml.mjs",
      "core/conditional-assets.mjs", "evals/skill-loading", "ddalggak"]) {
      const target = path.join(archive, name); mkdirSync(path.dirname(target), { recursive: true });
      cpSync(path.join(root, name), target, { recursive: true });
    }
    const config = { baselineSource: path.join(archive, "baseline"), candidateSource: archive };
    mkdirSync(config.baselineSource);
    cpSync(path.join(archive, "ddalggak"), path.join(config.baselineSource, "ddalggak"), { recursive: true });
    for (const [name, { mode }] of Object.entries(snapshot(archive))) chmodSync(path.join(archive, name), mode & ~0o222);
    const { prepareSandbox, createFixtureTools } = await import(pathToFileURL(path.join(archive, "scripts/eval-skill-loading.mjs")));
    const { fixtures, sessionOrder } = await import(pathToFileURL(path.join(archive, "scripts/skill-loading/run-config.mjs")));
    for (const mode of [0o444, 0o555]) {
      for (const fixture of fixtures) for (const name of fixture.allowedFiles)
        chmodSync(path.join(archive, "evals/skill-loading/fixtures", fixture.id, name), mode);
      const original = snapshot(archive);
      for (const slot of sessionOrder().filter(slot => ["backend", "ui"].includes(slot.fixtureId))) {
        const fixture = fixtures.find(fixture => fixture.id === slot.fixtureId), label = `${slot.fixtureId}/${slot.variant}/${mode.toString(8)}`;
        const parent = path.join(temp, label); mkdirSync(parent, { recursive: true });
        const sandbox = prepareSandbox(config, slot, parent), directory = path.join(parent, "evidence"); mkdirSync(directory);
        const state = createFixtureTools({ config, slot, sandbox, directory, capture: { requests: [], reads: [] } });
        const write = args => state.tools.find(tool => tool.name === "write").execute(`write-${state.actions.length}`, args);
        for (const [name, copied] of Object.entries(snapshot(sandbox.workspace))) {
          const source = name.startsWith("ddalggak/") ? path.join(config[`${slot.variant}Source`], name)
            : path.join(archive, "evals/skill-loading/fixtures", fixture.id, name);
          const sourceMode = lstatSync(source).mode & 0o7777;
          assert.equal(copied.sha256, digest(readFileSync(source)), `${label}/${name}: copy bytes changed`);
          assert.equal(copied.mode, sourceMode | (fixture.allowedFiles.includes(name) ? 0o200 : 0), `${label}/${name}: copied mode`);
        }
        for (const name of fixture.allowedFiles) {
          const target = path.join(sandbox.workspace, name), content = readFileSync(target, "utf8") + "\n";
          assert(lstatSync(target).mode & 0o200, `${label}/${name}: missing owner-write`);
          await write({ path: name, content });
          assert.equal(readFileSync(target, "utf8"), content, `${label}/${name}: actual write`);
        }
        for (const [name, sha256] of Object.entries(sandbox.before).filter(([name]) => !fixture.allowedFiles.includes(name))) {
          await assert.rejects(() => write({ path: name, content: "forbidden" }), /denied: outside-allowed-source-write/);
          assert.equal(lstatSync(path.join(sandbox.workspace, name)).mode & 0o222, 0, `${label}/${name}: forbidden file writable`);
          assert.equal(digest(readFileSync(path.join(sandbox.workspace, name))), sha256);
        }
        assert.deepEqual(snapshot(archive), original, `${label}: original archive modes/hashes changed`);
        console.log(`[readonly] ${label}: exact copy bytes, owner-write only, actual writes, forbidden writes denied, archive unchanged`);
      }
    }
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "readonly package/sandbox cleanup"); }
}

// Called by the synthetic SDK import inside the actual live child, before credential/session creation.
async function testLiveBackendTools({ prepareSandbox, createFixtureTools, isolatedQuantities }, root) {
  const temp = makeTempDir("ddalggak-backend-boundary-");
  const listenerCounts = () => ["message", "error", "disconnect"].map(event => process.listenerCount(event)), before = listenerCounts();
  try {
    assert.equal(typeof process.send, "function");
    const config = { candidateSource: root }, slot = { fixtureId: "backend", variant: "candidate" };
    const sandbox = prepareSandbox(config, slot, temp), directory = path.join(temp, "evidence"); mkdirSync(directory);
    const state = createFixtureTools({ config, slot, sandbox, directory, capture: { requests: [], reads: [] } });
    const invoke = (name, args) => state.tools.find(tool => tool.name === name).execute(`${name}-${state.actions.length}`, args);
    await assert.rejects(() => invoke("verify", {}), /HTTP body/);
    await invoke("write", { path: "app.mjs", content: readFileSync(path.join(root, "evals/skill-loading/fixtures/backend/solution/app.mjs"), "utf8") });
    const proof = JSON.parse((await invoke("verify", {})).content[0].text).observations;
    assert(proof.serverClosed && proof.checks.length > 0);
    await invoke("write", { path: "app.mjs", content: "export function quantities(input){ return input; }" });
    assert.deepEqual(await Promise.all([isolatedQuantities(sandbox.workspace, [1]), isolatedQuantities(sandbox.workspace, [2])]), [[1], [2]]);
    const outside = path.join(temp, "outside.txt");
    const probes = [
      ["read", `import {readFileSync} from 'node:fs'; export function quantities(){readFileSync(${JSON.stringify(path.join(root, "package.json"))});}`, "native-process-failed"],
      ["write", `import {writeFileSync} from 'node:fs'; export function quantities(){writeFileSync(${JSON.stringify(outside)},'bad');}`, "native-process-failed"],
      ["TCP", "import {Socket} from 'node:net'; export function quantities(){return new Promise((resolve,reject)=>{const s=new Socket();s.once('error',reject);s.once('connect',()=>{s.destroy();resolve('ESCAPED')});s.connect({host:'127.0.0.1',port:1});});}", "native-process-failed"],
      ["UDP", "import {createSocket} from 'node:dgram'; export function quantities(){return new Promise((resolve,reject)=>{const s=createSocket('udp4');s.once('error',e=>{s.close();reject(e)});s.send('probe',9,'127.0.0.1',e=>{s.close();e?reject(e):resolve('ESCAPED')});});}", "native-process-failed"],
      ["process", "import {spawnSync} from 'node:child_process'; export function quantities(){spawnSync(process.execPath,['--version']);}", "native-process-failed"],
      ["timeout", "export function quantities(){while(true){}}", "ETIMEDOUT"],
    ];
    for (const [label, content, code] of probes) {
      await invoke("write", { path: "app.mjs", content });
      await assert.rejects(() => isolatedQuantities(sandbox.workspace, []), { fixtureFailure: { category: "execution", code } }, label);
    }
    assert(!existsSync(outside));
    await assert.rejects(() => isolatedQuantities(root, []), /denied:/);
    await assert.rejects(() => isolatedQuantities(path.join(process.env.HOME, "escape"), []), /denied:/);
    const { once } = await import("node:events");
    for (const request of [{ type: "shell", id: "bad-type", workspace: sandbox.workspace, input: [] },
      { type: "quantities", id: "bad-fields", workspace: sandbox.workspace, input: [], command: "forbidden" }]) {
      const pending = once(process, "message", { signal: AbortSignal.timeout(10000) }); process.send(request);
      const [reply] = await pending; assert.equal(reply.id, request.id); assert.match(reply.error, /denied:/);
    }
    assert.deepEqual(listenerCounts(), before, "IPC listeners leaked after success/error");
    return { checks: proof.checks.length, serverClosed: proof.serverClosed, denied: probes.map(([label]) => label),
      workspaceEscapeDenied: true, fixedOperationOnly: true, concurrentRepliesCorrelated: true, listenersRemoved: true };
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp)); }
}

// Explicit macOS bootstrap check: synthetic SDK, missing auth, no installed runtime or model calls.
export function testLiveBootstrap() {
  const root = fileURLToPath(new URL("../", import.meta.url)), tempRoot = makeTempDir("ddalggak-bootstrap-"), temp = realpathSync(tempRoot);
  const commands = [];
  const env = { PATH: process.env.PATH, HOME: temp, TMPDIR: temp, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
  const run = (command, args) => {
    const result = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 30000 });
    commands.push({ command: [command, ...args], status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr, error: result.error?.message });
    assert.ifError(result.error);
    return result;
  };
  try {
    const baseline = path.join(temp, "baseline"), candidate = path.join(temp, "candidate"), runtime = path.join(temp, "runtime"), plugin = path.join(temp, "plugin");
    for (const directory of [baseline, candidate, runtime, plugin]) mkdirSync(directory);
    const archive = path.join(temp, "baseline.tar");
    assert.equal(run("git", ["archive", BASELINE_SHA, "-o", archive]).status, 0);
    assert.equal(run("tar", ["-xf", archive, "-C", baseline]).status, 0);
    for (const name of ["ddalggak", "core"]) cpSync(path.join(root, name), path.join(candidate, name), { recursive: true });
    const output = path.join(temp, "output"), registry = path.join(temp, "session-registry"), authPath = path.join(temp, "missing-auth.json");
    writeFileSync(path.join(plugin, "package.json"), JSON.stringify({ pi: { extensions: ["extension.mjs"] } }));
    writeFileSync(path.join(plugin, "extension.mjs"), "throw Error('UNEXPECTED_EXTENSION_IMPORT');\n");
    const browser = path.join(temp, "browser.mjs");
    writeFileSync(browser, "throw Error('UNEXPECTED_BROWSER_IMPORT');\n");
    writeFileSync(path.join(runtime, "package.json"), JSON.stringify({ type: "module" }));
    writeFileSync(path.join(runtime, "index.js"), `
      import assert from 'node:assert/strict';
      import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
      import path from 'node:path';
      import { makeTempDir, cleanupTempRoot } from ${JSON.stringify(new URL("./test-lib/temp.mjs", import.meta.url).href)};
      const home = realpathSync(process.env.HOME);
      assert.equal(home, realpathSync(process.argv[process.argv.indexOf('--isolated-home') + 1]));
      for (const name of ['OMO_CODING_AGENT_DIR', 'SENPI_CODING_AGENT_DIR', 'PI_CODING_AGENT_DIR']) assert.equal(process.env[name], path.join(home, 'agent'));
      assert.equal(process.env.TMPDIR, home);
      const allowed = [home, ${JSON.stringify(output)}, ${JSON.stringify(registry)}];
      for (const directory of allowed) {
        mkdirSync(directory, { recursive: true });
        const file = path.join(directory, 'write-probe');
        writeFileSync(file, 'allowed', { flag: 'wx' }); rmSync(file);
      }
      // These are disposable write probes, never slot reservations or run artifacts.
      for (const directory of allowed.slice(1)) rmSync(directory, { recursive: true });
      const denied = [${JSON.stringify(path.join(temp, 'outside'))}, home + '-sibling', ${JSON.stringify(output + '-sibling')}, ${JSON.stringify(registry + '-sibling')}];
      for (const file of denied) assert.throws(() => writeFileSync(file, 'denied'), { code: 'EPERM' });
      symlinkSync(${JSON.stringify(temp)}, path.join(home, 'escape'));
      assert.throws(() => writeFileSync(path.join(home, 'escape', 'symlink-write'), 'denied'), { code: 'EPERM' });
      // Separate module identity avoids importing the CLI's still-pending top-level await.
      const tools = await import(${JSON.stringify(new URL("./eval-skill-loading.mjs?bootstrap-probe", import.meta.url).href)});
      const backend = await (${testLiveBackendTools.toString()})(tools, ${JSON.stringify(root)});
      console.log(JSON.stringify({ bootstrapProbe: { home, allowed, denied, symlinkDenied: true, backend } }));
      function forbidden() { console.log(JSON.stringify({ unexpectedSdkCall: true })); throw Error('UNEXPECTED_SDK_CALL'); }
      export { forbidden as createAgentSession, forbidden as createAgentSessionServices, forbidden as DefaultResourceLoader,
        forbidden as SessionManager, forbidden as SettingsManager, forbidden as ModelRegistry };
    `);
    const config = { runId: "synthetic-bootstrap-only", baselineSource: baseline, candidateSource: candidate, baselineSha: BASELINE_SHA,
      candidateTree: sourceTree(candidate), runtimeDist: runtime, pluginPath: plugin, modelId: "unconnected/no-model", reasoning: "high",
      fixtureHash: directoryHash(fileURLToPath(new URL("../evals/skill-loading/", import.meta.url))), sessionLimit: 10, mode: "live" };
    const configPath = path.join(temp, "config.json"); writeFileSync(configPath, JSON.stringify(config));
    const args = [path.join(root, "scripts/eval-skill-loading.mjs"), "--mode", "live", "--config", configPath, "--output", output,
      "--auth-path", authPath, "--browser-module", browser];
    const result = run(process.execPath, args);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /ENOENT/, result.stderr);
    assert(result.stderr.includes(authPath), result.stderr);
    const lines = result.stdout.trim().split("\n").map(line => JSON.parse(line));
    assert.equal(lines.length, 1, result.stdout);
    const { bootstrapProbe } = lines[0];
    assert(bootstrapProbe?.symlinkDenied && bootstrapProbe.backend?.workspaceEscapeDenied);
    assert(!existsSync(bootstrapProbe.home), "isolated child HOME cleanup");
    assert(!existsSync(output) && !existsSync(registry) && !existsSync(authPath), "no run, slots or credentials");
    for (const file of [...bootstrapProbe.denied, path.join(temp, "symlink-write")]) assert(!existsSync(file));
    // A forged child marker must not remove the existing HOME check.
    const mismatch = run(process.execPath, [...args, "--isolated-home", candidate]);
    assert.equal(mismatch.status, 2, mismatch.stderr); assert.equal(mismatch.stdout, "");
    assert(!mismatch.stderr.includes(authPath), mismatch.stderr);
    const noChannel = run(process.execPath, [...args, "--isolated-home", temp]);
    assert.equal(noChannel.status, 2, noChannel.stderr); assert.equal(noChannel.stdout, "");
    assert(!noChannel.stderr.includes(authPath), noChannel.stderr);
    const unsupported = run(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { runComparison } from ${JSON.stringify(new URL("./eval-skill-loading.mjs", import.meta.url).href)};
      Object.defineProperty(process, 'platform', { value: 'linux' });
      for (const isolatedHome of [undefined, ${JSON.stringify(temp)}])
        await assert.rejects(() => runComparison({ config: ${JSON.stringify(config)}, output: ${JSON.stringify(output)},
          authPath: ${JSON.stringify(authPath)}, browserModule: ${JSON.stringify(browser)}, isolatedHome }),
          { code: 'ERR_ASSERTION', actual: 'linux', expected: 'darwin' });
      console.log(JSON.stringify({ unsupportedPlatformRejected: 2 }));
    `]);
    assert.equal(unsupported.status, 0, unsupported.stderr);
    assert.deepEqual(JSON.parse(unsupported.stdout), { unsupportedPlatformRejected: 2 });
    console.log("[test:skill-loading-bootstrap] outer/inner CLI reached missing auth; backend HTTP passed; OS/IPC/HOME/platform boundaries held; no SDK calls or slots");
    return { commands, bootstrapProbe, sdkCalls: 0, providerCalls: 0, modelCalls: 0, reservedSlots: 0 };
  } finally {
    cleanupTempRoot(tempRoot); assert(!existsSync(temp), "bootstrap fixture cleanup");
    console.log(JSON.stringify({ bootstrapCommands: commands }));
  }
}

export async function testSubmissionContract({ execute = false, validateArguments } = {}) {
  const { prepareSandbox, createFixtureTools } = await import("./eval-skill-loading.mjs");
  const { checkPublic } = await import("../evals/skill-loading/fixtures/public-body-review/oracle.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url)), temp = makeTempDir("ddalggak-submit-");
  const contracts = {
    status: { state: "object", nextAction: "string" },
    backend: { implementationComplete: "boolean", published: "boolean", remainingGates: "array" },
    ui: {},
    "internal-review": { outcome: "string", findings: "array", cleanControls: "array", externalWriteAuthorized: "boolean" },
    "public-body-review": { outcome: "string", findings: "array", cleanControls: "array", externalWriteAuthorized: "boolean", summary: "string", inline: "string", fixtureOnly: "boolean" },
  };
  let sequence = 0;
  async function exercise(fixture, mutate, failure) {
    const parent = path.join(temp, String(++sequence)); mkdirSync(parent);
    const config = { baselineSource: root, candidateSource: root }, slot = { fixtureId: fixture.id, variant: "candidate" };
    const sandbox = prepareSandbox(config, slot, parent), directory = path.join(parent, "evidence"); mkdirSync(directory);
    const state = createFixtureTools({ config, slot, sandbox, directory, capture: { requests: [{ sequence: 1 }], reads: fixture.expectedReads.map(path => ({ path, isError: false })) } });
    const submit = state.tools.find(tool => tool.name === "submit"), schema = submit.parameters.properties.observation;
    for (const [field, type] of Object.entries(contracts[fixture.id])) {
      assert(schema.required?.includes(field), fixture.id + ": missing required submission field " + field);
      assert.equal(schema.properties[field].type, type);
    }
    assert.deepEqual(schema.properties.claims.items.required, ["checkId", "actionId"]);
    assert.deepEqual(schema.properties.claims.items.properties.checkId.enum, fixture.oracleIds, "claim vocabulary must match this fixture, not other fixtures or finding answers");
    if (fixture.id === "status") {
      assert.deepEqual(schema.properties.state.required, ["branch", "clean", "openPrs", "pendingChecks", "blockers", "ready"]);
      assert.deepEqual(Object.fromEntries(Object.entries(schema.properties.state.properties).map(([key, value]) => [key, value.type])),
        { branch: "string", clean: "boolean", openPrs: "array", pendingChecks: "array", blockers: "array", ready: "boolean" });
      assert(schema.properties.nextAction.examples.includes("resolve-blocker-and-await-ci"));
      assert.equal(schema.properties.state.properties.ready.const, undefined, "schema must not supply the expected state");
    }
    if (fixture.id === "backend") assert(schema.properties.remainingGates.items.examples.includes("human-publication"));
    if (fixture.id.includes("review")) {
      const finding = schema.properties.findings.items;
      assert.deepEqual(finding.required, ["id", "path", "line", "scenario", "impact", "evidence", "correction", "counterevidence"]);
      for (const field of finding.required) assert.equal(finding.properties[field].type, field === "line" ? "integer" : "string");
      for (const field of ["id", "scenario", "impact"]) assert.equal(finding.properties[field].enum, undefined, "grounded extra findings must remain expressible");
      assert(finding.properties.id.examples.includes("optional-analytics") && finding.properties.id.examples.includes("failure-handling"));
      assert(finding.properties.scenario.examples.includes("provider-rejection"));
      assert(finding.properties.impact.examples.includes("failure-disguised-as-empty-success"));
      assert(schema.properties.outcome.enum.includes("change request") && schema.properties.outcome.enum.includes("approve"));
      assert.equal(schema.properties.findings.minItems, undefined, "zero findings remain expressible");
      assert.deepEqual(schema.properties.cleanControls.items.enum, fixture.cleanControls.map(control => control.id));
    }
    assert(!Object.keys(sandbox.before).some(file => /(^|\/)(oracle[./]|solution\/)/.test(file)));
    const invoke = (name, args, id = name) => state.tools.find(tool => tool.name === name).execute(id, args);
    assert.equal(existsSync(path.join(sandbox.workspace, "inputs.json")), fixture.id === "public-body-review");
    for (const hidden of ["oracle.json", "oracle.mjs", "solution/app.mjs", "solution/index.html"]) {
      await assert.rejects(() => invoke("read", { path: hidden, reason: "hidden data boundary probe" }, "hidden-" + hidden), /ENOENT/);
    }
    if (fixture.id === "ui" || (fixture.id === "backend" && !execute)) return;
    let observation;
    if (fixture.id === "backend") {
      await invoke("write", { path: "app.mjs", content: readFileSync(path.join(root, "evals/skill-loading/fixtures/backend/solution/app.mjs"), "utf8") });
      await invoke("verify", {});
      observation = { implementationComplete: true, published: false, remainingGates: ["human-publication"] };
    } else if (fixture.id === "status") {
      const proof = JSON.parse((await invoke("verify", {})).content[0].text).observations;
      observation = { state: { branch: proof.branch, clean: proof.clean, openPrs: [proof.pr.number],
        pendingChecks: proof.pr.statusCheckRollup.filter(check => check.status === "IN_PROGRESS").map(check => check.name),
        blockers: proof.blockers.filter(blocker => !blocker.resolved).map(blocker => blocker.id), ready: false }, nextAction: "resolve-blocker-and-await-ci" };
    } else {
      // Test-owned expected observations never enter the model-visible ToolDefinition or sandbox.
      observation = { outcome: "change request", externalWriteAuthorized: false, cleanControls: fixture.cleanControls.map(entry => entry.id),
        findings: fixture.seededFindings.map(entry => ({ ...entry, evidence: entry.path + ":" + entry.line + " reproduced by verify",
          correction: "Restore the governing context contract", counterevidence: "Empty results and recorded optional analytics failures preserve their contracts" })) };
      let inputs;
      if (fixture.id === "public-body-review") {
        assert(state.tools.find(tool => tool.name === "read").parameters.properties.path.examples.includes("inputs.json"));
        inputs = JSON.parse((await invoke("read", { path: "inputs.json", reason: "seeded public rendering context" })).content[0].text);
      }
      const proof = JSON.parse((await invoke("verify", inputs ? { publicInputs: inputs } : {})).content[0].text).observations;
      if (inputs) {
        assert.deepEqual(checkPublic(proof.publicBody, inputs), { summaryValid: true, inlineValid: true, fixtureOnly: true, externalWriteAuthorized: false });
        const { summary, inline, fixtureOnly } = proof.publicBody;
        Object.assign(observation, { summary, inline, fixtureOnly });
      }
    }
    observation.claims = [{ checkId: fixture.oracleIds[0], actionId: "verify" }];
    if (validateArguments) {
      assert.deepEqual(validateArguments(submit, { name: "submit", arguments: { observation } }), { observation });
      for (const field of schema.required) {
        const missing = structuredClone(observation); delete missing[field];
        assert.throws(() => validateArguments(submit, { name: "submit", arguments: { observation: missing } }), /Validation failed/);
        assert.throws(() => validateArguments(submit, { name: "submit", arguments: { observation: { ...observation, [field]: { invalid: true } } } }), /Validation failed/);
      }
      if (fixture.id.includes("review")) validateArguments(submit, { name: "submit", arguments: { observation: { ...observation, findings: [] } } });
    }
    if (mutate) await mutate(observation, invoke);
    if (validateArguments) validateArguments(submit, { name: "submit", arguments: { observation } });
    await invoke("submit", { observation });
    const finished = await state.finish({}, "deterministic-submit-" + sequence);
    if (failure) {
      assert.equal(finished.record.authority, "fail");
      assert(finished.record.checks.length > 0 && finished.record.checks.every(check => check.status === "fail"));
      assert(finished.record.unsupportedClaims.length > 0);
      if (failure instanceof RegExp) assert.match(finished.record.unsupportedClaims.join("\n"), failure);
    } else {
      assert.equal(finished.record.authority, "pass", JSON.stringify(finished.record)); assert(finished.record.checks.every(check => check.status === "pass"));
    }
    return finished;
  }
  try {
    for (const fixture of fixtures) await exercise(fixture);
    const status = fixtures.find(fixture => fixture.id === "status"), review = fixtures.find(fixture => fixture.id === "internal-review");
    await exercise(status, observation => observation.state.ready = true, /live-state mismatch/);
    await exercise(status, observation => observation.nextAction = "ready-for-human-action", true);
    await exercise(status, async (_, invoke) => assert.rejects(() => invoke("write", { path: "state.json", content: "{}" }), /denied/), /outside-allowed-source-write/);
    await exercise(status, observation => observation.claims[0].actionId = "fabricated", /fake execution claim/);
    for (const fixture of fixtures.filter(fixture => fixture.id.includes("review"))) {
      await exercise(fixture, observation => observation.findings.push({ ...observation.findings[0], id: "optional-analytics" }), /clean-control false positive/);
      await exercise(fixture, observation => observation.externalWriteAuthorized = true, true);
    }
    await exercise(review, observation => observation.findings[0].line = 999, /finding line mismatch/);
    await exercise(review, observation => observation.summary = "public body", /internal-only/);
    const extra = await exercise(review, observation => observation.findings.push({ ...observation.findings[0], id: "additional-grounded-finding" }));
    assert.equal(extra.record.extraFindings[0].id, "additional-grounded-finding", "extra findings are preserved for F3, not automatically accepted as valid");
    if (execute) await exercise(fixtures.find(fixture => fixture.id === "backend"), observation => observation.published = true, true);
    console.log("[test:skill-loading-submit] required schemas, public input/renderer, actual submit/finish, wrong answers and authority controls passed; no model calls");
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "submission sandbox cleanup"); }
}

// Real submit/finish/persistence; synthetic comparison records are only an offline admission scaffold.
export async function testSubmissionMembership({ caseName } = {}) {
  const { prepareSandbox, createFixtureTools } = await import("./eval-skill-loading.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url)), temp = makeTempDir("ddalggak-membership-");
  const cases = [
    ["internal-foreign-check", "internal-review", "invalid-claim-check-id"],
    ["ui-foreign-check", "ui", "invalid-claim-check-id"],
    ["public-extra-control", "public-body-review", "invalid-clean-control-id"],
    ["public-forged-reference", "public-body-review", "invalid-clean-control-id", /fake execution claim/],
    ["public-extra-finding", "public-body-review", "invalid-clean-control-id"],
    ["public-missing-control", "public-body-review", "invalid-clean-control-id", /./],
    ["public-duplicate-control", "public-body-review", "invalid-clean-control-id", /./],
  ];
  try {
    for (const [label, fixtureId, code, finalFailure] of cases.filter(entry => !caseName || entry[0] === caseName)) {
      const parent = path.join(temp, label); mkdirSync(parent);
      const directory = path.join(parent, "evidence"); mkdirSync(directory);
      const config = { runId: "submission-membership", mode: "offline", baselineSource: root, candidateSource: root,
        modelId: "synthetic/no-model", reasoning: "high", runtimeDist: root, pluginPath: root };
      const binding = { settingsHash, baselineTree: BASELINE_TREE, candidateTree: "b".repeat(40) };
      const run = syntheticRun(config, binding, directory, slot => requiredReads(config, slot));
      assert.deepEqual(evaluateQuality(run, { config, binding, directory }).failures, [], "clean admission control");
      const session = run.sessions.find(slot => slot.fixtureId === fixtureId), fixture = fixtures.find(entry => entry.id === fixtureId);
      const receipt = readArtifact(directory, session.receipt), sandbox = prepareSandbox(config, session, parent);
      const capture = { requests: receipt.capture.requests.slice(0, 1), reads: receipt.capture.reads };
      const state = createFixtureTools({ config, slot: session, sandbox, directory, capture });
      const invoke = async (name, args) => JSON.parse((await state.tools.find(tool => tool.name === name)
        .execute(name + "-" + state.actions.length, args)).content[0].text);
      for (const file of requiredReads(config, session)) await state.tools.find(tool => tool.name === "read")
        .execute("read-" + state.actions.length, { path: file, reason: "required context" });
      capture.requests.push(receipt.capture.requests[1]);
      let verified, observation = {};
      if (fixtureId !== "ui") {
        const publicInputs = fixtureId === "public-body-review"
          ? await invoke("read", { path: "inputs.json", reason: "public rendering context" }) : undefined;
        verified = await invoke("verify", publicInputs ? { publicInputs } : {});
        observation = { ...(verified.observations.publicBody ?? {}), outcome: "change request", externalWriteAuthorized: false,
          cleanControls: fixture.cleanControls.map(control => control.id),
          findings: fixture.seededFindings.map(finding => ({ ...finding, evidence: finding.path + ":" + finding.line,
            correction: "Restore contract", counterevidence: "Clean controls preserve their contracts" })) };
      }
      observation.claims = [{ checkId: fixture.oracleIds[0], actionId: verified?.actionId ?? "never-executed" }];
      const invalid = structuredClone(observation);
      if (code === "invalid-claim-check-id") invalid.claims[0].checkId = "executed-checks";
      else invalid.cleanControls.push("empty-result");
      const original = structuredClone(invalid);
      await assert.rejects(() => invoke("submit", { observation: invalid }), error => {
        assert.deepEqual(error.fixtureFailure, { category: "input", code });
        for (const id of code === "invalid-claim-check-id" ? fixture.oracleIds : observation.cleanControls) assert(error.message.includes(id));
        assert(error.message.includes(code === "invalid-claim-check-id" ? "claims.checkId" : "cleanControls"));
        return true;
      }, label + ": wrong membership must be rejected before successful submission");
      assert.deepEqual(invalid, original, "never sanitize submitted data in place");
      assert.deepEqual(state.output, { unavailable: "no final submission" });
      const rejected = structuredClone(state.actions.at(-1));
      assert.equal(rejected.status, "failure");
      if (verified) {
        assert.deepEqual(verified.submissionContract, { allowedClaimIds: fixture.oracleIds, requestedControlIds: fixture.cleanControls.map(control => control.id) });
        assert.deepEqual(verified.observations.cleanControls, ["optional-analytics", "empty-result"]);
        assert.deepEqual(readArtifact(directory, verified.evidence), verified.observations, "raw additional observations stay persisted");
        observation.additionalObservedChecks = structuredClone(verified.observations);
      }
      if (label === "public-forged-reference") observation.claims[0].actionId = "fabricated";
      if (label === "public-extra-finding") observation.findings.push({ ...observation.findings[0],
        id: "additional-grounded-finding", scenario: "additional-scenario", impact: "additional-impact" });
      if (label === "public-missing-control") observation.cleanControls = [];
      if (label === "public-duplicate-control") observation.cleanControls.push(observation.cleanControls[0]);
      assert.equal((await invoke("submit", { observation })).submitted, true, "same tools/session accepts a corrected submission");
      assert.deepEqual(state.output, observation);
      const finished = await state.finish(session.identity, session.sessionId);
      assert.deepEqual(finished.after, sandbox.before);
      Object.assign(receipt, { actions: state.actions, before: sandbox.before, after: finished.after, contextManifest: state.contextManifest });
      session.receipt = artifact(directory, "membership-receipt.json", receipt);
      session.verification = artifact(directory, "membership-verification.json", { ...finished.record, synthetic: true });
      const previousOutput = session.output;
      session.output = artifact(directory, "membership-output.json", finished.output);
      for (const axis of Object.values(run.judgments.find(judgment => judgment.fixtureId === fixtureId).axes))
        axis.evidence = axis.evidence.map(ref => ref.path === previousOutput.path ? session.output : ref);
      const quality = evaluateQuality(run, { config, binding, directory });
      const expectedFailure = fixtureId === "ui" ? /missing model output or actual verification execution/ : finalFailure;
      if (expectedFailure) {
        assert.equal(finished.record.authority, "fail");
        assert.match(finished.record.unsupportedClaims.join("\n"), expectedFailure);
        assert(quality.failures.some(failure => failure.startsWith(fixtureId + "/")));
      } else {
        assert.equal(finished.record.authority, "pass", JSON.stringify(finished.record));
        assert.deepEqual(quality.failures, []);
        if (label === "public-extra-finding") {
          assert(quality.gaps.some(gap => gap.includes("extra finding awaits F3")));
          const extra = finished.record.extraFindings[0];
          assert.deepEqual(readArtifact(directory, extra.evidence[0]), observation.findings.at(-1));
          run.judgments.find(judgment => judgment.fixtureId === fixtureId).extraFindings =
            [{ id: extra.id, variant: session.variant, verdict: "supported", evidence: extra.evidence }];
          assert.equal(evaluateQuality(run, { config, binding, directory }).label, "adopt-preserved");
        } else assert.deepEqual(quality.gaps, []);
      }
      assert.equal(quality.promotionEligible, false);
      assert.equal(state.actions.filter(action => action.kind === "submit" && action.status === "success").length, 1);
      console.log("[submission-membership] " + JSON.stringify({ label, rejected, result: finished.record.authority,
        unsupportedClaims: finished.record.unsupportedClaims, observedControls: verified?.observations.cleanControls,
        submissionContract: verified?.submissionContract, failures: quality.failures, gaps: quality.gaps }));
    }
  } finally { cleanupTempRoot(temp); assert(!existsSync(temp), "membership sandbox cleanup"); }
}

export async function testBrowserContract() {
  const { confineBrowser } = await import("./eval-skill-loading.mjs");
  let closed = false, initialized = false, socketClosed = false;
  const context = { async addInitScript(script) {
    const realm = Object.fromEntries(["RTCPeerConnection", "webkitRTCPeerConnection", "WebTransport", "Worker", "SharedWorker"].map(name => [name, function () {}]));
    const blocked = Object.keys(realm);
    realm.ServiceWorkerContainer = class { register() {} }; realm.DOMException = DOMException;
    runInNewContext(`(${script})()`, realm);
    assert.throws(() => new realm.ServiceWorkerContainer().register(), error => error.name === "SecurityError");
    const registration = Object.getOwnPropertyDescriptor(realm.ServiceWorkerContainer.prototype, "register");
    assert(!registration.configurable && !registration.writable);
    for (const name of blocked) {
      assert.equal(realm[name], undefined);
      assert.equal(Object.getOwnPropertyDescriptor(realm, name).configurable, false);
      assert.equal(Reflect.set(realm, name, function () {}), false);
    }
    initialized = true;
  }, async routeWebSocket(pattern, handler) { assert.equal(pattern, "**/*"); await handler({ close() { socketClosed = true; } }); }, async close() { closed = true; } };
  const browser = { async newContext(options) { assert.deepEqual(options, { serviceWorkers: "block", acceptDownloads: false }); return context; } };
  assert.equal(await confineBrowser(browser).newContext(), context);
  assert(initialized && socketClosed && !closed);
  context.addInitScript = async () => { throw new Error("initialization failed"); };
  await assert.rejects(() => confineBrowser(browser).newContext(), /initialization failed/);
  assert(closed, "failed confinement must close the context");
  console.log("[test:skill-loading-browser-contract] immutable capability removal and fail-closed cleanup passed");
}

// Installed-browser check: the evidence launcher supplies the exact live OS/HOME boundary, never a model.
export async function testBrowserBoundary(browser, evidenceDir) {
  const { confineBrowser } = await import("./eval-skill-loading.mjs");
  const { checkUi } = await import("../evals/skill-loading/fixtures/ui/browser-check.mjs");
  const blocked = ["RTCPeerConnection", "webkitRTCPeerConnection", "WebTransport", "Worker", "SharedWorker"];
  const initialScript = `window.initialCapabilities = ${JSON.stringify(blocked)}.map(name => typeof globalThis[name]);`;
  const html = `<!doctype html><title>Boundary fixture</title><script>${initialScript}</script><body>Local fixture</body>`;
  const server = createServer((request, response) => request.url === "/sw.js"
    ? response.writeHead(200, { "content-type": "text/javascript" }).end("self.addEventListener('install', () => self.skipWaiting());")
    : response.writeHead(200, { "content-type": "text/html" }).end(html));
  const udp = createSocket("udp4"), sender = createSocket("udp4");
  const receipt = { httpDenied: [], realms: [], cleanup: {} };
  let context;
  try {
    const ready = once(server, "listening", { signal: AbortSignal.timeout(5000) }); server.listen(0, "127.0.0.1"); await ready;
    const bound = once(udp, "listening", { signal: AbortSignal.timeout(5000) }); udp.bind(0, "127.0.0.1"); await bound;
    const received = once(udp, "message", { signal: AbortSignal.timeout(5000) });
    sender.send(Buffer.from("sink-positive-control"), udp.address().port, "127.0.0.1");
    assert.equal((await received)[0].toString(), "sink-positive-control"); receipt.sinkPositiveControl = true;
    const origin = `http://127.0.0.1:${server.address().port}`, outside = `http://localhost:${server.address().port}`;
    receipt.origin = origin; receipt.sink = udp.address();
    context = await confineBrowser(browser).newContext();
    await context.route("**/*", route => {
      if (new URL(route.request().url()).origin !== origin) { receipt.httpDenied.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    const page = await context.newPage(); await page.goto(origin);
    assert.deepEqual(await page.evaluate(() => window.initialCapabilities), blocked.map(() => "undefined"), "interfaces exposed to the first fixture script");
    const inspect = async (frame, label) => {
      const result = await frame.evaluate(({ blocked, port, outside }) => {
        const descriptors = blocked.map(name => {
          const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
          return { name, type: typeof globalThis[name], configurable: descriptor?.configurable, writable: descriptor?.writable, replacement: Reflect.set(globalThis, name, function () {}) };
        });
        const attempts = blocked.map(name => {
          try {
            const options = name.includes("PeerConnection") ? { iceServers: [{ urls: `stun:127.0.0.1:${port}` }] } : name === "WebTransport" ? outside.replace("http:", "https:") : URL.createObjectURL(new Blob(["postMessage(typeof WebTransport)"], { type: "text/javascript" }));
            new globalThis[name](options); return { name, error: null };
          } catch (error) { return { name, error: error.name }; }
        });
        const registration = Object.getOwnPropertyDescriptor(ServiceWorkerContainer.prototype, "register");
        let serviceWorker;
        try { ServiceWorkerContainer.prototype.register.call(navigator.serviceWorker, "/sw.js"); serviceWorker = "escaped"; }
        catch (error) { serviceWorker = error.name; }
        return { descriptors, attempts, serviceWorker: { error: serviceWorker, configurable: registration.configurable, writable: registration.writable } };
      }, { blocked, port: udp.address().port, outside });
      for (const descriptor of result.descriptors) assert.deepEqual(descriptor, { name: descriptor.name, type: "undefined", configurable: false, writable: false, replacement: false }, label);
      for (const attempt of result.attempts) assert.equal(attempt.error, "TypeError", `${label}/${attempt.name} escaped`);
      assert.deepEqual(result.serviceWorker, { error: "SecurityError", configurable: false, writable: false }, `${label}/service worker`);
      receipt.realms.push({ label, ...result });
    };
    await inspect(page, "top");
    receipt.serviceWorker = await page.evaluate(async () => {
      try { const registration = await ServiceWorkerContainer.prototype.register.call(navigator.serviceWorker, "/sw.js"); return { registered: registration.scope }; }
      catch (error) { return { error: error.name }; }
    });
    assert.deepEqual(receipt.serviceWorker, { error: "SecurityError" }, "native service-worker prototype bypass");
    const synchronous = await page.evaluate(blocked => {
      const frame = document.createElement("iframe"); frame.id = "blank"; document.body.append(frame);
      return blocked.map(name => [typeof frame.contentWindow[name], typeof frames[0][name]]);
    }, blocked);
    assert.deepEqual(synchronous, blocked.map(() => ["undefined", "undefined"])); receipt.synchronousBlank = synchronous;
    await inspect(page.frames().find(frame => frame.parentFrame() === page.mainFrame()), "synchronous-about:blank");
    await page.evaluate(html => {
      const frame = document.createElement("iframe"); frame.id = "srcdoc";
      const loaded = new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error("frame timeout")), 5000); frame.onload = () => { clearTimeout(timer); resolve(); }; });
      frame.srcdoc = html; document.body.append(frame); return loaded;
    }, html);
    const srcdoc = page.frames().find(frame => frame.url() === "about:srcdoc");
    assert.deepEqual(await srcdoc.evaluate(() => window.initialCapabilities), blocked.map(() => "undefined")); await inspect(srcdoc, "srcdoc");
    const popupReady = context.waitForEvent("page", { timeout: 5000 });
    const popupTypes = await page.evaluate(blocked => { const popup = window.open("about:blank"); return blocked.map(name => typeof popup[name]); }, blocked);
    const popup = await popupReady; assert.deepEqual(popupTypes, blocked.map(() => "undefined")); await inspect(popup, "synchronous-popup"); await popup.close();
    const http = await page.evaluate(url => fetch(url).then(() => "escaped", error => error.name), outside + "/denied");
    assert.equal(http, "TypeError"); assert.deepEqual(receipt.httpDenied, [outside + "/denied"]);
    receipt.webSocket = await page.evaluate(url => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("websocket timeout")), 5000), socket = new WebSocket(url);
      socket.onopen = () => { clearTimeout(timer); socket.close(); reject(Error("socket escaped")); };
      socket.onclose = event => { clearTimeout(timer); resolve({ closed: true, code: event.code }); };
    }), outside.replace("http:", "ws:") + "/denied");
    await page.screenshot({ path: path.join(evidenceDir, "boundary.png") });
    await context.close(); context = undefined; receipt.cleanup.contextClosed = true;
    receipt.form = await checkUi(confineBrowser(browser), new URL("../evals/skill-loading/fixtures/ui/solution/index.html", import.meta.url), { evidenceDir });
    console.log("[test:skill-loading-browser] real Chrome: native form states, HTTP/WebSocket denial, immutable transport/worker removal in frames/popups passed");
    return receipt;
  } finally {
    if (context) await context.close(); receipt.cleanup.contextClosed = true;
    for (const socket of [sender, udp]) { const closed = once(socket, "close"); socket.close(); await closed; } receipt.cleanup.udpClosed = true;
    const closed = once(server, "close"); server.closeAllConnections(); server.close(); await closed; receipt.cleanup.serverClosed = !server.listening;
    writeFileSync(path.join(evidenceDir, "browser-boundary.json"), JSON.stringify(receipt, null, 2) + "\n");
  }
}

if (process.argv.includes("--native-provenance-child")) {
  await testNativeFailureProvenance();
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  testQualityReport();
  await testBrowserContract();
  await testToolFailureClassification();
  await testSourceDiscovery();
  await testReadonlySandbox();
  await testSandboxTools({ execute: process.argv.includes("--sandbox") });
  await testSubmissionContract({ execute: process.argv.includes("--sandbox") });
  await testSubmissionMembership();
  if (process.argv.includes("--sandbox")) { await testNativeFailureProvenance(); await testNativeProvenanceIpc(); }
}
