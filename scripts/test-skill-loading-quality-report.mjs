import assert from "node:assert/strict";
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { once } from "node:events";
import { runInNewContext } from "node:vm";
import { makeTempDir, cleanupTempRoot } from "./test-lib/temp.mjs";
import { copyResultArtifacts } from "./eval-skill-loading.mjs";
import { evaluateQuality, axes } from "./skill-loading/quality-report.mjs";
import { artifact, readArtifact, fixtures, controls, sessionOrder, sessionIdentity, validateConfig,
  createRegistry, sourceTree, directoryHash, digest, BASELINE_SHA, BASELINE_TREE, settingsHash, toolProtocolHash, bindSources } from "./skill-loading/run-config.mjs";

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
        await assert.rejects(() => isolatedQuantities(sandbox.workspace, []), /sandboxed implementation failed/);
        assert(!existsSync(outside), "OS sandbox permitted external write");
        await invoke("write", { path: "app.mjs", content: "import { connect } from 'node:net'; export function quantities(){ const s=connect({host:'127.0.0.1',port:1}); return new Promise((resolve,reject)=>{s.once('connect',()=>reject(Error('network escaped'))); s.once('error',reject);}); }" });
        await assert.rejects(() => isolatedQuantities(sandbox.workspace, []), /EPERM|Operation not permitted/);
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
      ["read", `import {readFileSync} from 'node:fs'; export function quantities(){readFileSync(${JSON.stringify(path.join(root, "package.json"))});}`, /ERR_ACCESS_DENIED/],
      ["write", `import {writeFileSync} from 'node:fs'; export function quantities(){writeFileSync(${JSON.stringify(outside)},'bad');}`, /ERR_ACCESS_DENIED|EPERM/],
      ["TCP", "import {Socket} from 'node:net'; export function quantities(){return new Promise((resolve,reject)=>{const s=new Socket();s.once('error',reject);s.once('connect',()=>{s.destroy();resolve('ESCAPED')});s.connect({host:'127.0.0.1',port:1});});}", /EPERM/],
      ["UDP", "import {createSocket} from 'node:dgram'; export function quantities(){return new Promise((resolve,reject)=>{const s=createSocket('udp4');s.once('error',e=>{s.close();reject(e)});s.send('probe',9,'127.0.0.1',e=>{s.close();e?reject(e):resolve('ESCAPED')});});}", /EPERM/],
      ["process", "import {spawnSync} from 'node:child_process'; export function quantities(){spawnSync(process.execPath,['--version']);}", /ERR_ACCESS_DENIED/],
      ["timeout", "export function quantities(){while(true){}}", /ETIMEDOUT/],
    ];
    for (const [label, content, error] of probes) {
      await invoke("write", { path: "app.mjs", content });
      await assert.rejects(() => isolatedQuantities(sandbox.workspace, []), error, label);
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
    assert.deepEqual(schema.properties.claims.items.properties.checkId.enum, [...new Set(fixtures.flatMap(entry => entry.oracleIds))], "shared vocabulary must not reveal which findings are valid in this fixture");
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  testQualityReport();
  await testBrowserContract();
  await testReadonlySandbox();
  await testSandboxTools({ execute: process.argv.includes("--sandbox") });
  await testSubmissionContract({ execute: process.argv.includes("--sandbox") });
}
