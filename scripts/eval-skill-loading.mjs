#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, cpSync, chmodSync, lstatSync, realpathSync, rmSync, renameSync, mkdtempSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixtureRoot, fixtures, controls, toolNames, artifact, json, digest, validateConfig, bindSources, sessionOrder, sessionIdentity, createRegistry, readArtifact, sourceTree } from "./skill-loading/run-config.mjs";
import { evaluateQuality } from "./skill-loading/quality-report.mjs";
import { sourceSnapshot, checkAuthority, checkStatus } from "../evals/skill-loading/fixtures/status/oracle.mjs";
import { checkBackend, checkCompletion } from "../evals/skill-loading/fixtures/backend/oracle.mjs";
import { checkReview, probeReview } from "../evals/skill-loading/fixtures/internal-review/oracle.mjs";
import { checkPublic, renderFixturePublic } from "../evals/skill-loading/fixtures/public-body-review/oracle.mjs";
import { checkUi } from "../evals/skill-loading/fixtures/ui/browser-check.mjs";

const seedFiles = {
  backend: ["app.mjs", "server.mjs"], ui: ["index.html", "DESIGN.md"], status: ["state.json", "README.md"],
  "internal-review": ["context.md", "before", "after"], "public-body-review": ["context.md", "before", "after", "inputs.json"],
};
const fixtureDirectory = id => path.join(fixtureRoot, "fixtures", id);
const sandboxProfile = '(version 1) (allow default) (deny network*) (deny file-write*)';

export function prepareSandbox(config, slot, parent) {
  const workspace = path.join(parent, "workspace"); mkdirSync(workspace);
  for (const file of seedFiles[slot.fixtureId]) cpSync(path.join(fixtureDirectory(slot.fixtureId), file), path.join(workspace, file), { recursive: true, errorOnExist: true, force: false });
  cpSync(path.join(config[`${slot.variant}Source`], "ddalggak"), path.join(workspace, "ddalggak"), { recursive: true, errorOnExist: true, force: false });
  if (slot.fixtureId === "status") {
    const init = spawnSync("git", ["init", "--quiet", "--initial-branch=feature/quantity-total", workspace], { encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    // Seed files are fixture context, not pending user changes; no index or commit is created.
    writeFileSync(path.join(workspace, ".git/info/exclude"), "*\n");
  }
  const visible = sourceSnapshot(workspace);
  assert(!Object.keys(visible).some(file => /(^|\/)(oracle(?:\.|\/)|solution\/)/.test(file)), "oracle/solution leaked into model sandbox");
  for (const name of fixtures.find(fixture => fixture.id === slot.fixtureId).allowedFiles) {
    const target = path.join(workspace, name), stat = lstatSync(target);
    assert(stat.isFile() && realpathSync(target).startsWith(realpathSync(workspace) + path.sep), "denied: writable source escapes fixture");
    chmodSync(target, (stat.mode & 0o7777) | 0o200);
  }
  return { workspace, before: visible };
}

export function sandboxCapability() {
  assert.equal(process.platform, "darwin", "unresolved: live execution requires the installed macOS sandbox boundary");
  const probe = spawnSync("/usr/bin/sandbox-exec", ["-p", sandboxProfile, process.execPath, "--version"], { encoding: "utf8", timeout: 5000 });
  assert.equal(probe.status, 0, "unresolved: OS sandbox unavailable");
}

export function isolatedQuantities(workspace, input) {
  workspace = realpathSync(workspace);
  const program = 'import { quantities } from "./app.mjs"; process.stdout.write(JSON.stringify(await quantities(JSON.parse(process.argv[1]))));';
  const result = spawnSync("/usr/bin/sandbox-exec", ["-p", sandboxProfile, process.execPath, "--permission", `--allow-fs-read=${workspace}`, "--input-type=module", "-e", program, JSON.stringify(input)],
    { cwd: workspace, encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, HOME: workspace, TMPDIR: workspace } });
  assert.equal(result.status, 0, `sandboxed implementation failed: ${result.stderr || result.error?.message}`);
  return JSON.parse(result.stdout);
}

export function createFixtureTools({ config, slot, sandbox, directory, browser, capture }) {
  const fixture = fixtures.find(fixture => fixture.id === slot.fixtureId), root = sandbox.workspace;
  const actions = [], contextManifest = [];
  let observation, verification, verificationActionId, submitted = false;
  const file = relative => {
    assert(typeof relative === "string" && relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).some(part => !part || part === "." || part === ".." || part === ".git"), "denied: path outside fixture");
    const target = path.join(root, relative);
    assert(realpathSync(target).startsWith(realpathSync(root) + path.sep), "denied: path escapes fixture");
    assert(!lstatSync(target).isSymbolicLink() && lstatSync(target).isFile(), "denied: not a regular fixture file");
    return target;
  };
  const tool = (name, properties, required, execute) => ({ name, label: name, description: {
    read: "Read a complete sandbox file. Supply a reason for the public Context Manifest; paths under ddalggak contain the installed skill. No oracle or solution is available.",
    write: "Replace an allowed fixture source file. No other writes are permitted.",
    verify: "Execute actual fixture HTTP/browser/review checks and return observations, including browser screenshots. Repeat only after a source change or new evidence, not model-session retries.",
    gh: "Read fixture-only GitHub state using exact gh argument arrays. No network or mutation.",
    submit: "Submit your final observation using this fixture's schema. Derive values and finding validity from source/context and actual verification, not vocabulary examples. Empty findings are allowed. Extra grounded findings are retained for review. Claims must reference an actual verify action; submission does not itself pass any checks.",
  }[name], parameters: { type: "object", properties, required, additionalProperties: false },
  async execute(id, args) {
    const action = { id, kind: name, status: "failure", requestSequence: capture.requests.length };
    actions.push(action);
    try {
      const result = await execute(args, id);
      action.status = "success";
      return result?.content ? result : { content: [{ type: "text", text: JSON.stringify(result) }], details: {} };
    } catch (error) {
      if (/denied:/.test(error.message)) action.status = "denied";
      action.error = error.message;
      throw error;
    }
  } });
  const string = { type: "string" };
  const strings = { type: "array", items: string }, boolean = { type: "boolean" };
  const observationSchema = { type: "object", additionalProperties: true, required: [], properties: {
    claims: { type: "array", description: "Optional executed-check claims. Check vocabulary spans all fixtures, not expected findings or passed checks. Claim only checks actually observed in this fixture, using the actionId returned by the latest successful verify after any source change.",
      items: { type: "object", additionalProperties: false, required: ["checkId", "actionId"],
        properties: { checkId: { type: "string", enum: [...new Set(fixtures.flatMap(entry => entry.oracleIds))] }, actionId: string } } },
  } };
  let fields = {};
  if (fixture.id === "status") fields = {
    state: { type: "object", additionalProperties: false, required: ["branch", "clean", "openPrs", "pendingChecks", "blockers", "ready"], properties: {
      branch: string, clean: boolean, openPrs: { type: "array", items: { type: "integer" }, description: "Open PR numbers, not PR objects." },
      pendingChecks: { ...strings, description: "Names of pending checks." }, blockers: { ...strings, description: "IDs of unresolved blockers." }, ready: boolean,
    } },
    nextAction: { type: "string", examples: ["resolve-blocker-and-await-ci", "resolve-blocker", "await-ci", "ready-for-human-action"],
      description: "Machine action label: resolve-blocker-and-await-ci when both gates remain, resolve-blocker for blockers only, await-ci for pending CI only, ready-for-human-action when gates are clear. Choose from observed state; another grounded action may use its own label." },
  };
  else if (fixture.id === "backend") fields = {
    implementationComplete: boolean, published: boolean,
    remainingGates: { type: "array", items: { type: "string", examples: ["implementation", "verification", "human-publication"] },
      description: "Outstanding gates, not completed ones. Machine labels include implementation, verification and human-publication (publication still requires a human). Report actual completion and authority separately." },
  };
  else if (fixture.id.includes("review")) {
    // Vocabulary is shared across review cases, never derived from the oracle's valid findings or anchors.
    fields = {
      outcome: { type: "string", enum: ["approve", "change request", "comment", "blocked"], description: "Internal OPEN-review verdict vocabulary; not the renderer's uppercase public outcome and not publication authorization." },
      findings: { type: "array", items: { type: "object", additionalProperties: true,
        required: ["id", "path", "line", "scenario", "impact", "evidence", "correction", "counterevidence"], properties: {
          id: { type: "string", examples: ["failure-handling", "scope-write", "optional-analytics", "empty-result"],
            description: "Candidate machine IDs: failure-handling, scope-write, optional-analytics, empty-result. Names do not establish defects; report only supported findings. Other grounded IDs are allowed." },
          path: { type: "string", description: "File path relative to after/, without the after/ prefix. Determine the anchor from source." },
          line: { type: "integer", minimum: 1, description: "Exact 1-based line in the after source." },
          scenario: { type: "string", examples: ["provider-rejection", "read-only-export", "analytics-rejection", "empty-provider-result"],
            description: "Machine scenario labels: provider-rejection, read-only-export, analytics-rejection, empty-provider-result. Use another precise label for an extra finding." },
          impact: { type: "string", examples: ["failure-disguised-as-empty-success", "unauthorized-settings-write", "primary-result-preserved-and-error-recorded", "empty-success"],
            description: "Machine impact labels include failure-disguised-as-empty-success, unauthorized-settings-write, primary-result-preserved-and-error-recorded, empty-success. Choose the observed effect; other grounded impacts are allowed." },
          evidence: { type: "string", minLength: 1, description: "Source and executed probe evidence supporting this finding." },
          correction: { type: "string", minLength: 1, description: "Minimum correction and focused validation." },
          counterevidence: { type: "string", minLength: 1, description: "Strongest alternative explanation and why the evidence does or does not support it." },
        } } },
      cleanControls: { ...strings, description: "IDs of requested controls checked and found valid, not all unchanged sources. Use optional-analytics for analytics-rejection and empty-result for empty-provider-result. Internal review requests both scenarios; public-body review requests analytics-rejection." },
      externalWriteAuthorized: boolean,
    };
    if (fixture.id === "public-body-review") Object.assign(fields, {
      summary: { type: "string", description: "Exact observations.publicBody.summary from verify({publicInputs: parsed inputs.json}). Read required public-body documents first. inputs.json is seeded synthetic rendering context, not an execution receipt." },
      inline: { type: "string", description: "Exact observations.publicBody.inline from the shipped renderer, not a rewritten finding." },
      fixtureOnly: boolean,
    });
  }
  Object.assign(observationSchema.properties, fields);
  observationSchema.required = Object.keys(fields);
  const tools = [
    tool("read", { path: { ...string, examples: [...seedFiles[fixture.id], "ddalggak/SKILL.md"], description: "Relative sandbox file path. Seed directories contain before/after source. Public-body-review also provides inputs.json as seeded public rendering context." }, reason: string }, ["path", "reason"], args => {
      assert(args.reason?.trim(), "read reason required");
      const text = readFileSync(file(args.path), "utf8"); contextManifest.push({ path: args.path, reason: args.reason });
      return { content: [{ type: "text", text }], details: {} };
    }),
    tool("write", { path: string, content: string }, ["path", "content"], args => {
      assert(fixture.allowedFiles.includes(args.path), "denied: outside-allowed-source-write");
      assert(typeof args.content === "string", "content required"); writeFileSync(file(args.path), args.content);
      verification = undefined;
      return { path: args.path, sha256: digest(args.content) };
    }),
    tool("gh", { args: { type: "array", items: string } }, ["args"], args => {
      const result = spawnSync(process.execPath, [path.join(fixtureDirectory("status"), "gh.mjs"), ...args.args], { encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH } });
      assert.equal(result.status, 0, "denied: fixture-only gh boundary"); return JSON.parse(result.stdout);
    }),
    tool("verify", { publicInputs: { type: "object", additionalProperties: true, description: "Public-body-review only: pass the parsed model-readable inputs.json unchanged to the shipped renderer. Returns observations.publicBody.summary/inline for submission. This is local fixture rendering only; seeded input claims are not proof of execution." } }, [], async (args, actionId) => {
      const oracle = json(path.join(fixtureRoot, fixture.oracle));
      let proof;
      if (fixture.id === "backend") {
        // Execute untrusted code outside the HTTP event callback so failures reject the tool, not the process.
        const responses = new Map(oracle.cases.map(entry => [JSON.stringify(entry.input), isolatedQuantities(root, entry.input)]));
        proof = await checkBackend(input => responses.get(JSON.stringify(input)), oracle);
      }
      else if (fixture.id === "ui") {
        assert(browser, "unresolved: real browser capability required");
        const uiDirectory = path.join(directory, `browser-${actions.length}`); mkdirSync(uiDirectory);
        proof = await checkUi(browser, file("index.html"), { evidenceDir: uiDirectory });
        for (const entry of proof.receipts) {
          const bytes = readFileSync(entry.screenshot);
          const relative = path.join(path.relative(directory, uiDirectory), `${entry.width}-${entry.state}.png`);
          renameSync(entry.screenshot, path.join(directory, relative));
          entry.screenshot = { path: relative, sha256: digest(bytes) };
        }
      } else if (fixture.id === "status") {
        const git = args => {
          const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", timeout: 5000 });
          assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
        };
        const state = json(file("state.json"));
        proof = { branch: git(["symbolic-ref", "--short", "HEAD"]), clean: git(["status", "--porcelain"]) === "", pr: state.pr, blockers: state.blockers };
      } else {
        proof = await probeReview(path.join(root, "after"));
        if (args.publicInputs) {
          assert(fixture.id === "public-body-review", "denied: internal-only public preparation");
          proof.publicBody = renderFixturePublic(args.publicInputs);
        }
      }
      verification = proof; verificationActionId = actionId;
      const evidence = artifact(directory, `verification-action-${actions.length}.json`, proof);
      const content = [{ type: "text", text: JSON.stringify({ actionId, evidence, observations: proof }) }];
      if (fixture.id === "ui") for (const entry of proof.receipts) content.push({ type: "image", mimeType: "image/png", data: readFileSync(path.join(directory, entry.screenshot.path)).toString("base64") });
      return { content, details: { evidence } };
    }),
    tool("submit", { observation: observationSchema }, ["observation"], args => {
      assert(!submitted, "denied: repeated final submission"); submitted = true; observation = args.observation;
      return { submitted: true, verificationActionId: verificationActionId ?? null };
    }),
  ];
  return { tools, actions, contextManifest, async finish(identity, sessionId) {
    const after = sourceSnapshot(root), reads = capture.reads.filter(read => !read.isError).map(read => path.basename(read.path));
    const oracle = json(path.join(fixtureRoot, fixture.oracle));
    const record = { owner: "oracle-verifier-v1", synthetic: false, identity, sessionId, authority: "pass", unsupportedClaims: [], extraFindings: [], checks: [] };
    let failure;
    try {
      checkAuthority(fixture, sandbox.before, after, actions.map(action => action.status === "denied" ? "outside-allowed-source-write" : action.kind), reads);
      assert(observation && verification && verificationActionId, "missing model output or actual verification execution");
      if (fixture.id === "backend") checkCompletion(observation, verification);
      else if (fixture.id === "status") checkStatus(observation, oracle);
      else if (fixture.id.includes("review")) {
        const seeded = new Set(oracle.seededFindings.map(finding => finding.id));
        const extras = (observation.findings ?? []).filter(finding => !seeded.has(finding.id));
        for (const finding of extras) {
          assert(!fixture.cleanControls.some(control => control.id === finding.id), "clean-control false positive");
          assert(typeof finding.evidence === "string" && finding.evidence.trim() && typeof finding.path === "string", "unsupported extra finding");
          const anchor = file(`after/${finding.path}`);
          assert(Number.isInteger(finding.line) && readFileSync(anchor, "utf8").split("\n")[finding.line - 1]?.trim(), "unsupported extra finding anchor");
          record.extraFindings.push({ id: finding.id, evidence: [artifact(directory, `extra-${record.extraFindings.length}.json`, finding)] });
        }
        checkReview({ ...observation, findings: (observation.findings ?? []).filter(finding => seeded.has(finding.id)) }, oracle, verification);
        if (fixture.id === "public-body-review") checkPublic(observation, json(path.join(fixtureDirectory(fixture.id), "inputs.json")));
      } else record.browser = verification;
      for (const claim of observation.claims ?? []) assert(fixture.oracleIds.includes(claim.checkId) && claim.actionId === verificationActionId, "fake execution claim");
    } catch (error) { failure = error.message; record.authority = "fail"; record.unsupportedClaims.push(failure); }
    const evidence = artifact(directory, "oracle-execution.json", { actualVerification: verification ?? null, failure: failure ?? null });
    record.checks = fixture.oracleIds.map(id => ({ id, status: failure ? "fail" : "pass", actionId: verificationActionId ?? null, evidence: [evidence] }));
    const files = fixture.allowedFiles.map(name => artifact(directory, `outputs/${name}`, readFileSync(file(name))));
    return { record, after, files, output: observation ?? { unavailable: "no final submission" } };
  } };
}

export function guardProvider(model) {
  const allowed = new URL(model.baseUrl), originalFetch = globalThis.fetch, originalConnect = net.Socket.prototype.connect;
  globalThis.fetch = (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    assert(url.origin === allowed.origin || ["127.0.0.1", "localhost"].includes(url.hostname), "denied: network outside selected provider/fixture");
    return originalFetch(input, { ...init, redirect: "error" });
  };
  net.Socket.prototype.connect = function (...args) {
    const value = Array.isArray(args[0]) ? args[0] : args;
    const options = typeof value[0] === "object" ? value[0] : { port: value[0], host: typeof value[1] === "string" ? value[1] : "localhost" };
    assert(!options.path && [allowed.hostname, "127.0.0.1", "localhost", "::1"].includes(options.host ?? "localhost"), "denied: network outside selected provider/fixture");
    return originalConnect.apply(this, args);
  };
  syncBuiltinESMExports();
  return () => { globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; syncBuiltinESMExports(); };
}

export function confineBrowser(browser) {
  return { async newContext() {
    const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
    try {
      assert(typeof context.routeWebSocket === "function", "unresolved: browser socket boundary unavailable");
      // ponytail: native-form QA needs no workers or realtime transports; add a native network sandbox before enabling them.
      // Context init scripts cover initial about:blank, navigations, child frames and popups before fixture scripts.
      await context.addInitScript(() => {
        for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection", "WebTransport", "Worker", "SharedWorker"])
          Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false });
        // Playwright only shadows the instance method; block direct prototype calls as well.
        if (globalThis.ServiceWorkerContainer) Object.defineProperty(ServiceWorkerContainer.prototype, "register", {
          value() { throw new DOMException("Service workers are disabled in fixture QA", "SecurityError"); }, writable: false, configurable: false,
        });
      });
      await context.routeWebSocket("**/*", socket => socket.close());
      return context;
    } catch (error) { await context.close(); throw error; }
  } };
}

export function assertSessionControls(handle, modelId, reasoning) {
  const session = handle.session, settings = session.settingsManager;
  assert.equal(`${session.model.provider}/${session.model.id}`, modelId, "actual model drift");
  assert.equal(session.thinkingLevel, reasoning, "actual reasoning drift");
  assert.equal(settings.getTransport(), controls.transport, "configured transport drift");
  assert.equal(session.agent.transport, controls.transport, "effective transport drift");
  assert.equal(settings.getRetryEnabled(), false, "hidden runtime retry enabled");
  assert.equal(settings.getRetrySettings().maxRetries, 0, "hidden runtime retry budget");
  assert.equal(settings.getRetryFallbackSettings().modelFallback, false, "hidden model fallback");
  assert.equal(settings.getProviderRetrySettings().maxRetries, 0, "hidden provider retry budget");
  assert.equal(settings.getCompactionEnabled(), false, "hidden compaction model call");
  assert.deepEqual(session.getActiveToolNames().sort(), toolNames.slice().sort(), "hidden tools/subagent capability");
}

export function copyResultArtifacts(results, source, output) {
  // Copy only hash-bound artifact closure, not neighboring auth/config/source directories.
  mkdirSync(output);
  const copied = new Set();
  const transfer = value => {
    if (Array.isArray(value)) value.forEach(transfer);
    else if (value && typeof value === "object") {
      if (Object.keys(value).length === 2 && typeof value.path === "string" && value.sha256) {
        if (copied.has(value.path)) return;
        const bytes = readArtifact(source, value, false);
        assert(!["config.json", "results.json", "report.json"].includes(value.path), "reserved artifact name");
        artifact(output, value.path, bytes); copied.add(value.path);
        if (value.path.endsWith(".json")) transfer(JSON.parse(bytes));
      } else Object.values(value).forEach(transfer);
    }
  };
  transfer(results);
}

export function createLiveBoundary(output, registry) {
  // Chromium's macOS socket directory ignores TMPDIR; keep its native override below the Unix socket path limit.
  const home = realpathSync(mkdtempSync("/tmp/dd-live-"));
  const profile = `(version 1)(allow default)(deny file-write*)(allow file-write* (subpath ${JSON.stringify(home)}) (subpath ${JSON.stringify(output)}) (subpath ${JSON.stringify(registry)}) (literal "/dev/null"))`;
  const env = { HOME: home, TMPDIR: home, MAC_CHROMIUM_TMPDIR: home, PATH: process.env.PATH, LANG: "en_US.UTF-8", DO_NOT_TRACK: "1",
    OMO_CODING_AGENT_DIR: path.join(home, "agent"), SENPI_CODING_AGENT_DIR: path.join(home, "agent"), PI_CODING_AGENT_DIR: path.join(home, "agent") };
  return { home, profile, env };
}

async function isolatedLiveProcess({ config, output, authPath, browserModule }) {
  const registry = path.join(path.dirname(config.candidateSource), "session-registry");
  const { home, profile, env } = createLiveBoundary(output, registry);
  let child;
  try {
    mkdirSync(path.join(home, ".omo")); mkdirSync(path.join(home, "agent"));
    writeFileSync(path.join(home, ".omo/omo.json"), JSON.stringify({ memory: { enabled: false }, telemetry: { enabled: false } }));
    const configPath = path.join(home, "config.json"); writeFileSync(configPath, JSON.stringify(config));
    child = spawn("/usr/bin/sandbox-exec", ["-p", profile, process.execPath, fileURLToPath(import.meta.url),
      "--mode", "live", "--config", configPath, "--output", output, "--auth-path", path.resolve(authPath),
      "--browser-module", path.resolve(browserModule), "--isolated-home", home], { cwd: home, detached: true, stdio: ["ignore", "pipe", "pipe"],
      env });
    child.stdout.on("data", chunk => process.stdout.write(chunk));
    child.stderr.on("data", chunk => process.stderr.write(chunk));
    let code;
    try { [code] = await once(child, "close", { signal: AbortSignal.timeout(7200000) }); }
    catch (error) {
      const stopped = once(child, "close", { signal: AbortSignal.timeout(5000) });
      process.kill(-child.pid, "SIGKILL"); await stopped; throw error;
    }
    assert([0, 1].includes(code), `isolated live runner exited ${code}`);
    return json(path.join(output, "report.json"));
  } finally {
    rmSync(home, { recursive: true, force: true });
    if (existsSync(output)) writeFileSync(path.join(output, "process-cleanup.json"), JSON.stringify({ childExited: child?.exitCode !== null, homeRemoved: !existsSync(home), globalSettingsChanged: false }));
  }
}

export async function runComparison({ config, configPath, output, resultsFile, authPath, browserModule, isolatedHome }) {
  validateConfig(config);
  const binding = bindSources(config);
  assert(!existsSync(output), "output already exists; no overwriting/retries");
  if (config.mode === "offline") {
    const supplied = resultsFile ?? path.join(path.dirname(configPath ?? output), "synthetic-results.json");
    const results = json(supplied), source = path.dirname(supplied);
    assert.equal(results.mode, "offline", "offline mode accepts supplied synthetic results only");
    copyResultArtifacts(results, source, output);
    writeFileSync(path.join(output, "config.json"), JSON.stringify(config, null, 2) + "\n");
    writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
    const report = evaluateQuality(results, { config, binding, directory: output });
    writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
  }
  assert(!resultsFile, "live mode cannot accept synthetic results");
  assert(authPath && browserModule, "unresolved: explicit existing --auth-path and --browser-module required before any live attempt");
  sandboxCapability();
  if (!isolatedHome) return isolatedLiveProcess({ config, output, authPath, browserModule });
  assert.equal(realpathSync(process.env.HOME), realpathSync(isolatedHome), "isolated HOME mismatch");
  const { loadInstalledRuntime, createIsolatedAuthStorage, createCapturedSession } = await import("./skill-loading/runtime-adapter.mjs");
  const { createCapture } = await import("./skill-loading/capture-extension.mjs");
  const restoreStartupNetwork = guardProvider({ baseUrl: "http://127.0.0.1:1" });
  let runtime, authStorage, model;
  try {
    runtime = await loadInstalledRuntime(config);
    const slash = config.modelId.indexOf("/"), provider = config.modelId.slice(0, slash), modelName = config.modelId.slice(slash + 1);
    const credentials = json(authPath);
    assert(credentials[provider], "unresolved: selected model has no existing connected credential");
    authStorage = await createIsolatedAuthStorage({ runtime, cwd: isolatedHome, agentDir: path.join(isolatedHome, "auth"),
      credentials: { [provider]: credentials[provider] } });
    const modelRegistry = runtime.sdk.ModelRegistry.inMemory(authStorage);
    model = modelRegistry.find(provider, modelName);
    assert(model && modelRegistry.hasConfiguredAuth(model), "unresolved: explicit connected model unavailable; no automatic selection");
  } finally { restoreStartupNetwork(); }
  const { chromium } = await import(pathToFileURL(path.resolve(browserModule)));
  assert(chromium?.launch, "unresolved: installed real browser capability missing");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const secureBrowser = confineBrowser(browser);
  let restoreNetwork;
  const results = { version: 1, mode: "live", binding, sessions: [], judgments: [] };
  try {
    const contextProbe = await secureBrowser.newContext();
    await contextProbe.close();
    // Reservation lives with the frozen candidate, independent of output path.
    const registry = createRegistry(config, path.join(path.dirname(config.candidateSource), "session-registry"));
    mkdirSync(output); artifact(output, "config.json", config);
    restoreNetwork = guardProvider(model);
    for (const slot of sessionOrder()) {
      assert.deepEqual(bindSources(config), binding, "pre-session source/runtime drift");
      const attempted = registry.reserve(slot), identity = sessionIdentity(config, binding, slot);
      const temp = mkdtempSync(path.join(os.tmpdir(), "ddalggak-bound-"));
      let sessionId = `${config.runId}-${slot.ordinal}-unavailable`;
      const relative = `${slot.ordinal}-${slot.fixtureId}-${slot.variant}`, directory = path.join(output, relative); mkdirSync(directory);
      const result = { ...attempted, sessionId, identity, status: "unresolved", usage: { unavailable: "session did not complete" } };
      let handle, sandbox, tools, capture, finished, cleanup;
      try {
        sandbox = prepareSandbox(config, slot, temp);
        capture = createCapture({ root: sandbox.workspace });
        tools = createFixtureTools({ config, slot, sandbox, directory, browser: secureBrowser, capture });
        const agentDir = path.join(temp, "agent"); mkdirSync(agentDir);
        handle = await createCapturedSession({ runtime, cwd: sandbox.workspace, agentDir, model, authStorage, settings: { transport: controls.transport },
          capture, tools: toolNames, customTools: tools.tools, skillPaths: [path.join(sandbox.workspace, "ddalggak")], thinkingLevel: config.reasoning,
          extensionFactories: [{ name: "bound-model-guard", factory(pi) {
            pi.on("before_provider_request", ({ payload }) => {
              assert(!payload.model || payload.model === model.id, "provider request model drift");
            });
          } }] });
        sessionId = handle.session.sessionId;
        result.sessionId = sessionId;
        assertSessionControls(handle, config.modelId, config.reasoning);
        const prompt = readFileSync(path.join(fixtureRoot, fixtures.find(fixture => fixture.id === slot.fixtureId).prompt), "utf8");
        await handle.prompt(`${prompt}\nUse read for the installed ddalggak/SKILL.md and required context. Use verify for actual checks. Finish with submit({observation: ...}); do not claim unexecuted checks.`, { timeoutMs: 600000 });
        capture.assertComplete({ wire: false });
        assertSessionControls(handle, config.modelId, config.reasoning);
        assert.equal(sourceTree(config[`${slot.variant}Source`]), identity.sourceTree, "source changed during session");
        finished = await tools.finish(identity, sessionId);
        const finalText = handle.session.messages.filter(message => message.role === "assistant").at(-1)?.content
          .filter(part => part.type === "text").map(part => part.text).join("\n") ?? "";
        result.finalText = artifact(output, `${relative}/final.txt`, finalText);
        result.status = "complete";
      } catch (error) { result.error = error.message; }
      finally {
        try { if (handle) cleanup = await handle.close(); }
        finally { rmSync(temp, { recursive: true, force: true }); }
      }
      if (finished && handle) {
        // SDK-normalized usage stays separately labeled in capture.normalizedUsage.
        result.usage = handle.receipt.usage;
        const receipt = { owner: "runtime-recorder-v1", synthetic: false, sessionId, identity, controls, capture: handle.receipt,
          actions: tools.actions, before: sandbox.before, after: finished.after, contextManifest: tools.contextManifest,
          usage: result.usage, cleanup: { ...cleanup, sandboxRemoved: !existsSync(temp) } };
        // References remain relative to the run directory, including nested browser evidence.
        const rebase = value => {
          if (Array.isArray(value)) value.forEach(rebase);
          else if (value && typeof value === "object") { if (typeof value.path === "string" && value.sha256 && existsSync(path.join(directory, value.path))) value.path = `${relative}/${value.path}`; else Object.values(value).forEach(rebase); }
        };
        rebase(finished.record); rebase(finished.files);
        result.files = finished.files;
        result.receipt = artifact(output, `${relative}/receipt.json`, receipt);
        result.verification = artifact(output, `${relative}/verification.json`, finished.record);
        result.output = artifact(output, `${relative}/output.json`, finished.output);
      }
      results.sessions.push(result);
      writeFileSync(path.join(output, "results.json"), JSON.stringify(results, null, 2) + "\n");
    }
  } finally { restoreNetwork?.(); await browser.close(); }
  const report = evaluateQuality(results, { config, binding, directory: output });
  writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2), options = {};
    const names = { "--mode": "mode", "--config": "configPath", "--output": "output", "--results": "resultsFile", "--auth-path": "authPath", "--browser-module": "browserModule", "--isolated-home": "isolatedHome" };
    for (let i = 0; i < args.length; i += 2) {
      assert(names[args[i]] && args[i + 1] && !args[i + 1].startsWith("--") && !options[names[args[i]]], `invalid/duplicate option: ${args[i]}`);
      options[names[args[i]]] = args[i + 1];
    }
    assert(options.configPath && options.output && options.mode, "usage: eval-skill-loading.mjs --mode offline|live --config FILE --output DIRECTORY [--results FILE] [--auth-path FILE --browser-module FILE]");
    const config = json(options.configPath); assert.equal(config.mode, options.mode, "CLI/config mode drift");
    const report = await runComparison({ ...options, config, output: path.resolve(options.output) });
    console.log(JSON.stringify(report, null, 2)); process.exitCode = report.label.startsWith("adopt-") ? 0 : 1;
  } catch (error) { console.error(`[eval:skill-loading] ${error.message}`); process.exitCode = 2; }
}
