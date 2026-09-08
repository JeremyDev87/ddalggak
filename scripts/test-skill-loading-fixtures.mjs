import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { withTempRepo, copyRepoWithoutGitAndNodeModules } from "./test-lib/repo-fixture.mjs";
import { cleanupTempRoot } from "./test-lib/temp.mjs";
import { quantities } from "../evals/skill-loading/fixtures/backend/solution/app.mjs";
import { quantities as brokenQuantities } from "../evals/skill-loading/fixtures/backend/app.mjs";
import { checkBackend, checkCompletion } from "../evals/skill-loading/fixtures/backend/oracle.mjs";
import { checkAuthority, checkStatus, sourceSnapshot } from "../evals/skill-loading/fixtures/status/oracle.mjs";
import { checkReview, probeReview } from "../evals/skill-loading/fixtures/internal-review/oracle.mjs";
import { checkPublic, renderFixturePublic } from "../evals/skill-loading/fixtures/public-body-review/oracle.mjs";
import { startUiServer } from "../evals/skill-loading/fixtures/ui/server.mjs";

const root = fileURLToPath(new URL("../evals/skill-loading/", import.meta.url));
const json = file => JSON.parse(readFileSync(file, "utf8"));
export const fixtureManifest = json(path.join(root, "fixtures.json"));
export function loadFixture(id) {
  const fixture = fixtureManifest.fixtures.find(entry => entry.id === id);
  assert(fixture, "unknown fixture");
  return { fixture, oracle: json(path.join(root, fixture.oracle)), directory: path.join(root, "fixtures", id) };
}
export function fixtureHashes() {
  return Object.fromEntries(fixtureManifest.order.map(id => {
    const directory = path.join(root, "fixtures", id);
    const files = readdirSync(directory, { recursive: true }).filter(name => /\.[a-z]+$/.test(name)).sort();
    const hash = createHash("sha256");
    hash.update(JSON.stringify(loadFixture(id).fixture));
    for (const file of files) hash.update(file).update("\0").update(readFileSync(path.join(directory, file))).update("\0");
    return [id, hash.digest("hex")];
  }));
}

export async function testFixtures({ evidenceDir, browserModule } = {}) {
  const negatives = [];
  const evidence = { timestamp: new Date().toISOString(), modelCalls: 0, order: fixtureManifest.order, hashes: fixtureHashes() };
  function rejects(label, fn, pattern) {
    assert.throws(fn, pattern, label);
    negatives.push(label);
    console.log(`[negative] ${label}: rejected`);
  }
  async function rejectsAsync(label, fn, pattern) {
    await assert.rejects(fn, pattern, label);
    negatives.push(label);
    console.log(`[negative] ${label}: rejected`);
  }
  assert.deepEqual(fixtureManifest.order, ["status", "backend", "ui", "internal-review", "public-body-review"]);
  assert.deepEqual(fixtureManifest.fixtures.map(entry => entry.id), fixtureManifest.order);
  for (const fixture of fixtureManifest.fixtures) {
    for (const key of ["id", "prompt", "allowedFiles", "forbiddenActions", "oracleIds", "requiredChecks", "seededFindings", "cleanControls"]) assert(Object.hasOwn(fixture, key), `missing ${key}`);
    assert(readFileSync(path.join(root, fixture.prompt)).length > 0);
    const { oracle } = loadFixture(fixture.id);
    assert.equal(oracle.id, fixture.id);
    for (const key of ["allowedFiles", "seededFindings", "cleanControls"]) assert.deepEqual(oracle[key], fixture[key]);
    assert.deepEqual(oracle.checks, fixture.oracleIds);
    assert.deepEqual(fixture.requiredChecks, fixture.oracleIds);
    for (const entry of [...fixture.seededFindings, ...fixture.cleanControls]) {
      const source = readFileSync(path.join(root, "fixtures", fixture.id, "after", entry.path), "utf8").split("\n");
      assert(source[entry.line - 1]?.trim(), "defect/control anchor must exist in actual source");
    }
    checkAuthority(fixture, {}, {}, [], fixture.expectedReads);
    rejects(`${fixture.id}: forbidden action`, () => checkAuthority(fixture, {}, {}, ["github-write"], fixture.expectedReads), /forbidden action/);
    rejects(`${fixture.id}: missing read`, () => checkAuthority(fixture, {}, {}, [], []), /missing read/);
    rejects(`${fixture.id}: forbidden source write`, () => checkAuthority(fixture, {}, { "outside.mjs": "changed" }, [], fixture.expectedReads), /outside-allowed-source-write/);
  }

  const status = loadFixture("status");
  let statusTemp;
  withTempRepo({ rootDir: status.directory, run(temp) {
    statusTemp = temp;
    const workspace = path.join(temp, "workspace");
    mkdirSync(workspace);
    execFileSync("git", ["init", "--quiet", "--initial-branch=feature/quantity-total", workspace]);
    const git = args => execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8" }).trim();
    copyFileSync(path.join(temp, "gh.mjs"), path.join(temp, "gh"));
    chmodSync(path.join(temp, "gh"), 0o755);
    const env = { ...process.env, PATH: `${temp}${path.delimiter}${process.env.PATH}` };
    const before = sourceSnapshot(workspace);
    const pr = json(path.join(temp, "state.json")).pr;
    const livePr = JSON.parse(execFileSync("gh", ["pr", "view", "17", "--json", "number,state,headRefName,headRefOid,statusCheckRollup,reviewDecision,mergeStateStatus"], { env, encoding: "utf8" }));
    assert.deepEqual(livePr, pr);
    const state = { branch: git(["symbolic-ref", "--short", "HEAD"]), clean: git(["status", "--porcelain"]) === "", openPrs: [livePr.number], pendingChecks: livePr.statusCheckRollup.filter(check => check.status === "IN_PROGRESS").map(check => check.name), blockers: json(path.join(temp, "state.json")).blockers.filter(entry => !entry.resolved).map(entry => entry.id), ready: false };
    const observation = { state, nextAction: "resolve-blocker-and-await-ci" };
    checkStatus(observation, status.oracle);
    checkAuthority(status.fixture, before, sourceSnapshot(workspace), [], status.fixture.expectedReads);
    rejects("status: pending declared ready", () => checkStatus({ ...observation, state: { ...state, ready: true } }, status.oracle), /live-state mismatch/);
    rejects("status: blocker omitted", () => checkStatus({ ...observation, state: { ...state, blockers: [] } }, status.oracle), /live-state mismatch/);
    writeFileSync(path.join(workspace, "unauthorized.mjs"), "export const forbidden = true;\n");
    rejects("status: real filesystem mutation", () => checkAuthority(status.fixture, before, sourceSnapshot(workspace), [], status.fixture.expectedReads), /outside-allowed-source-write/);
    const blocked = [];
    for (const args of [["pr", "comment", "17", "--body", "forbidden"], ["pr", "review", "17", "--approve"], ["api", "repos/example/fixture/issues", "--method", "POST"], ["api", "graphql", "-f", "query=mutation {}"], ["pr", "view", "17", "--json", "number", "--repo", "external/repo"]]) {
      const result = spawnSync("gh", args, { env, encoding: "utf8" });
      assert.equal(result.status, 77);
      assert.deepEqual(JSON.parse(result.stderr), { boundary: "fixture-gh", denied: true, externalRequests: 0 });
      blocked.push({ args, exitCode: result.status });
    }
    evidence.status = { observation, ghBlocked: blocked, externalRequests: 0, gitCommitCreated: false };
  } });
  assert(!existsSync(statusTemp), "status temp cleanup");

  const backend = loadFixture("backend");
  evidence.backend = await checkBackend(quantities, backend.oracle);
  checkCompletion({ implementationComplete: true, published: false, remainingGates: ["human-publication"] }, evidence.backend);
  await rejectsAsync("backend: seeded wrong sum", () => checkBackend(brokenQuantities, backend.oracle), /HTTP body/);
  await rejectsAsync("backend: negative/fractional inputs accepted", () => checkBackend(input => ({ status: 200, body: { total: Array.isArray(input) ? input.reduce((sum, value) => sum + value, 0) : 0 } }), backend.oracle), /HTTP status/);
  rejects("backend: missing execution receipt", () => checkCompletion({ implementationComplete: true }, { checks: [], serverClosed: true }), /missing executed/);
  rejects("backend: false published completion", () => checkCompletion({ implementationComplete: true, published: true }, evidence.backend));
  withTempRepo({ rootDir: backend.directory, run(temp) {
    const before = sourceSnapshot(temp);
    copyFileSync(path.join(temp, "solution/app.mjs"), path.join(temp, "app.mjs"));
    assert.deepEqual(checkAuthority(backend.fixture, before, sourceSnapshot(temp), [], backend.fixture.expectedReads), ["app.mjs"]);
  } });

  for (const id of ["internal-review", "public-body-review"]) {
    const { oracle, directory } = loadFixture(id);
    const before = sourceSnapshot(directory);
    const clean = await probeReview(path.join(directory, "before"));
    assert.deepEqual(clean.defects, [], "baseline controls must not contain defects");
    const probe = await probeReview(path.join(directory, "after"));
    const observation = { outcome: "change request", externalWriteAuthorized: false,
      findings: oracle.seededFindings.map(entry => ({ ...entry, evidence: `${entry.path}:${entry.line} and executable ${entry.scenario}`, correction: entry.id === "failure-handling" ? "Propagate provider failures and execute rejection check." : "Remove the settings write and execute read-only export check.", counterevidence: "Empty results and logged optional analytics remain valid." })),
      cleanControls: oracle.cleanControls.map(entry => entry.id) };
    checkReview(observation, oracle, probe);
    rejects(`${id}: missed defect`, () => checkReview({ ...observation, findings: [] }, oracle, probe), /missed defect/);
    rejects(`${id}: clean-control false positive`, () => checkReview({ ...observation, findings: [...observation.findings, { id: "optional-analytics" }] }, oracle, probe), /unsupported finding/);
    rejects(`${id}: wrong anchor`, () => checkReview({ ...observation, findings: observation.findings.map(entry => ({ ...entry, line: 999 })) }, oracle, probe), /finding line mismatch/);
    rejects(`${id}: absent impact`, () => checkReview({ ...observation, findings: observation.findings.map(entry => ({ ...entry, impact: "" })) }, oracle, probe), /finding impact mismatch/);
    if (id === "internal-review") rejects("internal review: public preparation", () => checkReview({ ...observation, summary: "prepared body" }, oracle, probe), /internal-only/);
    assert.deepEqual(sourceSnapshot(directory), before, "review mutated fixture source");
    evidence[id] = { probe, observation, cleanBaseline: clean, sourceUnchanged: true };
  }

  const inputs = json(path.join(loadFixture("public-body-review").directory, "inputs.json"));
  for (const file of ["review-output-contract.md", "review-comment-style.md"]) assert(readFileSync(new URL(`../ddalggak/references/${file}`, import.meta.url)).length > 0);
  const rendered = renderFixturePublic(inputs);
  evidence.publicBody = { ...rendered, validation: checkPublic(rendered, inputs) };
  rejects("public body: absent fixture authority", () => renderFixturePublic(inputs, false), /eligible publication decision/);
  for (const leak of ["Wiki Context Manifest", "/Users/synthetic/private", "Authorization: Basic synthetic"]) {
    rejects("public body: private content", () => checkPublic({ ...rendered, inline: `${rendered.inline} ${leak}` }, inputs), /prohibited public/);
  }
  rejects("public body: invented valid-looking finding", () => checkPublic({ ...rendered, inline: "A different operation fails. Restore it and validate the result." }, inputs), /admitted candidate/);
  rejects("public body: formal approval", () => checkPublic({ ...rendered, summary: rendered.summary.replaceAll("CHANGES_REQUESTED", "APPROVE") }, inputs));

  const ui = loadFixture("ui");
  const app = await startUiServer(path.join(ui.directory, "solution/index.html"));
  try {
    const response = await fetch(app.url, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), readFileSync(path.join(ui.directory, "solution/index.html"), "utf8"), "served source equality");
    for (const [name, status] of [["Ada", 200], ["fail", 503], ["", 400]]) {
      const response = await fetch(`${app.url}/submit`, { method: "POST", body: JSON.stringify({ name }), signal: AbortSignal.timeout(5000) });
      assert.equal(response.status, status);
      await response.text();
    }
  } finally { await app.close(); }
  evidence.ui = { httpServerClosed: !app.server.listening, browser: "not-run: supply --browser-module for real UI QA" };
  if (browserModule) {
    const { chromium } = await import(pathToFileURL(path.resolve(browserModule)));
    const { checkUi } = await import("../evals/skill-loading/fixtures/ui/browser-check.mjs");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    const temp = copyRepoWithoutGitAndNodeModules({ rootDir: path.join(ui.directory, "solution") });
    try {
      evidence.ui.browser = await checkUi(browser, path.join(ui.directory, "solution/index.html"), { evidenceDir });
      await rejectsAsync("ui: original seed", () => checkUi(browser, path.join(ui.directory, "index.html"), { widths: [375] }), /required input/);
      const source = readFileSync(path.join(temp, "index.html"), "utf8");
      for (const [label, from, to, expected] of [
        ["missing required", " required", "", /required input/],
        ["missing label", 'for="name"', 'for="missing"', /label must target/],
        ["pending enabled", "button.disabled = true", "button.disabled = false", /submit disabled/],
        ["keyboard trapped", "form.addEventListener('submit'", "form.addEventListener('keydown', event => event.preventDefault()); form.addEventListener('submit'", /keyboard reaches submit/],
        ["error becomes success", "show('error',", "show('success',", /state timeout: error/],
      ]) {
        assert(source.includes(from));
        writeFileSync(path.join(temp, "index.html"), source.replace(from, to));
        await rejectsAsync(`ui: ${label}`, () => checkUi(browser, path.join(temp, "index.html"), { widths: [375] }), expected);
      }
    } finally { cleanupTempRoot(temp); await browser.close(); }
    assert(!existsSync(temp));
    evidence.ui.browserClosed = !browser.isConnected();
  }
  evidence.negatives = negatives;
  evidence.cleanup = { tempReposRemoved: true, serversClosed: true, browserClosed: evidence.ui.browserClosed ?? "not-started", globalSettingsChanged: false, externalWrites: 0 };
  if (evidenceDir) {
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(path.join(evidenceDir, "task-5-fixtures.json"), JSON.stringify(evidence, null, 2) + "\n");
    writeFileSync(path.join(evidenceDir, "task-5-negative-oracles.log"), negatives.map(label => `${label}: rejected`).join("\n") + "\n");
  }
  console.log("[test:skill-loading-fixtures] passed");
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  await testFixtures({ evidenceDir: option("--evidence"), browserModule: option("--browser-module") });
}
