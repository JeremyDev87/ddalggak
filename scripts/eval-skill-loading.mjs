#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, cpSync, chmodSync, lstatSync, realpathSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { once, on } from "node:events";
import { randomUUID } from "node:crypto";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fixtureRoot, fixtures, controls, toolNames, artifact, json, digest, validateConfig, bindSources, sessionOrder, sessionIdentity, createRegistry, readArtifact, sourceTree } from "./skill-loading/run-config.mjs";
import { summarizeFailure } from "./skill-loading/runtime-adapter.mjs";
import { createCapture } from "./skill-loading/capture-extension.mjs";
import { evaluateQuality, checkToolActions } from "./skill-loading/quality-report.mjs";
import { sourceSnapshot, checkAuthority, checkStatus } from "../evals/skill-loading/fixtures/status/oracle.mjs";
import { checkBackend, checkCompletion } from "../evals/skill-loading/fixtures/backend/oracle.mjs";
import { checkReview, probeReview } from "../evals/skill-loading/fixtures/internal-review/oracle.mjs";
import { checkPublic, renderFixturePublic } from "../evals/skill-loading/fixtures/public-body-review/oracle.mjs";
import { checkUi } from "../evals/skill-loading/fixtures/ui/browser-check.mjs";

const seedFiles = {
  backend: ["app.mjs", "server.mjs"], ui: ["index.html", "DESIGN.md"], status: ["state.json", "README.md"],
  "internal-review": ["context.md", "before", "after"], "public-body-review": ["context.md", "before", "after", "inputs.json"],
};
const sourceInventories = new WeakMap();
const fixtureDirectory = id => path.join(fixtureRoot, "fixtures", id);
const sandboxProfile = '(version 1) (allow default) (deny network*) (deny file-write*)';

function fail(category, code, detail = code) {
  throw Object.assign(new Error(`${category === "authority" ? "denied" : category}: ${detail}`), { fixtureFailure: { category, code } });
}

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
  const sandbox = { workspace, before: visible };
  // Only the prepared public diff inputs are discoverable, never caller-supplied snapshot keys.
  sourceInventories.set(sandbox, Object.keys(visible).filter(file => /^(before|after)\//.test(file)).sort());
  return sandbox;
}

export function sandboxCapability() {
  assert.equal(process.platform, "darwin", "unresolved: live execution requires the installed macOS sandbox boundary");
  const probe = spawnSync("/usr/bin/sandbox-exec", ["-p", sandboxProfile, process.execPath, "--version"], { encoding: "utf8", timeout: 5000 });
  assert.equal(probe.status, 0, "unresolved: OS sandbox unavailable");
}

export async function isolatedQuantities(workspace, input) {
  workspace = realpathSync(workspace);
  if (process.send) {
    // The live child cannot nest sandbox-exec; the outer process applies the unchanged per-call boundary.
    const id = randomUUID(), replies = on(process, "message", { signal: AbortSignal.timeout(10000), close: ["disconnect"] });
    try {
      process.send({ type: "quantities", id, workspace, input });
      for await (const [reply] of replies) {
        if (reply.id !== id) continue;
        assert.equal(reply.type, "quantities");
        if (reply.error) fail(reply.failure?.category === "authority" ? "authority" : "execution", reply.failure?.code ?? "native-ipc-error");
        return reply.result;
      }
      throw new Error("unresolved: outer sandbox channel disconnected");
    } finally { await replies.return(); }
  }
  const program = 'const { quantities } = await import("./app.mjs"); process.stdout.write(JSON.stringify(await quantities(JSON.parse(process.argv[1]))));';
  const result = spawnSync("/usr/bin/sandbox-exec", ["-p", sandboxProfile, process.execPath, "--permission", `--allow-fs-read=${workspace}`, "--input-type=module", "-e", program, JSON.stringify(input)],
    { cwd: workspace, encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, HOME: workspace, TMPDIR: workspace } });
  if (result.error) fail("execution", summarizeFailure(result.error, "native").diagnostic);
  // Source controls stderr, including any apparent permission code; it cannot authenticate authority.
  if (result.status !== 0) fail("execution", "native-process-failed");
  try { return JSON.parse(result.stdout); }
  catch { fail("execution", "native-result-invalid"); }
}

// Fixed native-operation IPC boundary; error metadata never includes child stderr or private input.
export async function quantitiesReply(request, home) {
  try {
    if (!request || Object.keys(request).length !== 4 || ["id", "input", "type", "workspace"].some(key => !Object.hasOwn(request, key))) fail("authority", "unsupported-sandbox-request-fields");
    if (request.type !== "quantities" || typeof request.id !== "string") fail("authority", "unsupported-sandbox-request");
    if (typeof request.workspace !== "string" || !realpathSync(request.workspace).startsWith(home + path.sep)) fail("authority", "workspace-outside-isolated-home");
    return { type: "quantities", id: request.id, result: await isolatedQuantities(request.workspace, request.input) };
  } catch (error) {
    const failure = error.fixtureFailure ?? { category: "execution", code: summarizeFailure(error, "native").diagnostic };
    return { type: "quantities", id: request?.id, error: `${failure.category === "authority" ? "denied" : failure.category}: ${failure.code}`, failure };
  }
}

export function createFixtureTools({ config, slot, sandbox, directory, browser, capture, artifactRoot = directory }) {
  const fixture = fixtures.find(fixture => fixture.id === slot.fixtureId), root = sandbox.workspace;
  const actions = [], contextManifest = [];
  const save = (name, value) => artifact(artifactRoot, path.join(path.relative(artifactRoot, directory), name), value);
  let observation, verification, verificationActionId, submitted = false;
  const file = (relative, allowDirectory = false) => {
    if (typeof relative !== "string" || !relative || relative.includes("\0")) fail("input", "invalid-path");
    const parts = relative.split(/[\\/]/);
    if (path.isAbsolute(relative) || parts.some(part => !part || part === "." || part === ".." || part === ".git")) fail("authority", "path-outside-fixture");
    let target = root, stat;
    try {
      // Inspect every ancestor before resolving: an escape with a missing leaf is still an escape.
      for (const part of parts) {
        target = path.join(target, part); stat = lstatSync(target);
        if (stat.isSymbolicLink()) fail("authority", "source-symlink");
      }
      if (!realpathSync(target).startsWith(realpathSync(root) + path.sep)) fail("authority", "path-escapes-fixture");
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code)) fail("input", error.code);
      throw error;
    }
    if (!stat.isFile() && !(allowDirectory && stat.isDirectory())) fail("capability", "not-a-regular-fixture-file");
    return target;
  };
  const tool = (name, properties, required, execute) => ({ name, label: name, description: {
    read: "Read a complete sandbox file, or list prepared before/after source paths by reading their directory. Listings are sorted JSON paths usable directly with read, not document contents. Supply a reason for the public Context Manifest; paths under ddalggak contain the installed skill. No oracle or solution is available.",
    write: "Replace an allowed fixture source file. No other writes are permitted.",
    verify: "Execute actual fixture HTTP/browser/review checks and return observations, including browser screenshots. Repeat only after a source change or new evidence, not model-session retries.",
    gh: "Read fixture-only GitHub state using exact gh argument arrays. No network or mutation.",
    submit: "Submit your final observation using this fixture's schema. Derive values and finding validity from source/context and actual verification, not vocabulary examples. Empty findings are allowed. Extra grounded findings are retained for review. Claims must reference an actual verify action; submission does not itself pass any checks.",
  }[name], parameters: { type: "object", properties, required, additionalProperties: false },
  async execute(id, args) {
    const action = { id, kind: name, status: "failure", requestSequence: capture.requests.length, ...(name === "gh" ? { args: null } : {}) };
    actions.push(action);
    try {
      if (!args || typeof args !== "object" || Array.isArray(args) || required.some(key => !Object.hasOwn(args, key)) ||
        Object.keys(args).some(key => !Object.hasOwn(properties, key))) fail("input", "invalid-arguments");
      const result = await execute(args, id, action);
      action.status = "success";
      if (result?.details?.evidence) action.evidence = result.details.evidence;
      return result?.content ? result : { content: [{ type: "text", text: JSON.stringify(result) }], details: {} };
    } catch (error) {
      action.failure = error.fixtureFailure ?? { category: "execution",
        code: summarizeFailure(error, "tool").diagnostic };
      if (action.failure.category === "authority") action.status = "denied";
      action.error = `${action.failure.category}: ${action.failure.code}`;
      throw error;
    }
  } });
  const string = { type: "string" };
  const strings = { type: "array", items: string }, boolean = { type: "boolean" };
  const submissionContract = { allowedClaimIds: fixture.oracleIds, requestedControlIds: fixture.cleanControls.map(control => control.id) };
  const observationSchema = { type: "object", additionalProperties: true, required: [], properties: {
    claims: { type: "array", description: "Optional executed-check claims. Vocabulary is this fixture's submission contract, not finding answers or proof that checks passed. Claim only checks actually observed, using the actionId returned by the latest successful verify after any source change.",
      items: { type: "object", additionalProperties: false, required: ["checkId", "actionId"],
        properties: { checkId: { type: "string", enum: submissionContract.allowedClaimIds }, actionId: string } } },
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
      cleanControls: { type: "array", items: { type: "string", enum: submissionContract.requestedControlIds },
        description: "Only requested control IDs checked and found valid belong here, each once. The allowed IDs are contract vocabulary, not pass claims. Additional actual checks remain in verify observations and may be reported separately, not added to this restricted field. Use optional-analytics for analytics-rejection and empty-result for empty-provider-result when requested." },
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
    tool("read", { path: { ...string, examples: [...seedFiles[fixture.id], "ddalggak/SKILL.md"], description: "Relative sandbox file or before/after source directory path. Directory reads return {type: directory, paths: [...]} recursively from the fixed public source inventory. Public-body-review also provides inputs.json as seeded public rendering context." }, reason: string }, ["path", "reason"], args => {
      if (typeof args.reason !== "string" || !args.reason.trim()) fail("input", "read-reason-required");
      const target = file(args.path, true);
      if (lstatSync(target).isDirectory()) {
        const prefix = path.relative(root, target) + path.sep;
        const paths = (sourceInventories.get(sandbox) ?? []).filter(name => name.startsWith(prefix));
        if (!paths.length) fail("capability", "not-a-public-source-directory");
        for (const name of paths) file(name); // Recheck ancestors; never follow a replaced source or directory symlink.
        contextManifest.push({ path: args.path, reason: args.reason });
        return { content: [{ type: "text", text: JSON.stringify({ type: "directory", paths }) }], details: { type: "directory" } };
      }
      const text = readFileSync(target, "utf8"); contextManifest.push({ path: args.path, reason: args.reason });
      return { content: [{ type: "text", text }], details: {} };
    }),
    tool("write", { path: string, content: string }, ["path", "content"], args => {
      if (typeof args.path !== "string" || !args.path || args.path.includes("\0") || typeof args.content !== "string") fail("input", "invalid-write");
      if (!fixture.allowedFiles.includes(args.path)) fail("authority", "outside-allowed-source-write");
      writeFileSync(file(args.path), args.content);
      verification = undefined;
      return { path: args.path, sha256: digest(args.content) };
    }),
    tool("gh", { args: { type: "array", items: string } }, ["args"], (args, _, action) => {
      const argv = args.args;
      if (!Array.isArray(argv) || argv.length < 2 || argv.some(value => typeof value !== "string" || !value || value.includes("\0"))) fail("input", "invalid-gh-arguments");
      // Only operation vocabulary/flags survive; never header, token, input or body values.
      action.args = argv.map((value, i) => {
        if (i === 0 && ["pr", "issue", "api", "extension", "auth", "repo", "release", "workflow", "run"].includes(value)) return value;
        if (i === 1 && argv[0] !== "api" && ["view", "list", "checks", "status", "comment", "edit", "create", "merge", "close", "reopen", "delete", "review", "exec", "login", "logout", "clone", "fork", "upload", "download"].includes(value)) return value;
        if (["--method", "-X"].includes(argv[i - 1]) && ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(value)) return value;
        if (/^(?:--method=|-X=?)(?:GET|HEAD|POST|PUT|PATCH|DELETE)$/.test(value)) return value;
        const flag = /^(--[a-z-]+)(?:=|$)|^(-[A-Za-z])/.exec(value)?.slice(1).find(Boolean);
        if (flag && ["--json", "--jq", "--template", "--repo", "-R", "--method", "-X", "--header", "-H", "--input", "--body", "--body-file", "--field", "-F", "--raw-field", "-f", "--token", "--with-token", "--paginate", "--state", "--limit", "-L", "--head", "--base", "--search", "--label", "--author", "--assignee"].includes(flag))
          return value === flag ? flag : flag + "=[redacted]";
        return "[redacted]";
      });
      // Classification only, not a gh executor/parser: unrecognized operations remain fail-closed.
      let readOnly = argv[0] === "api" || (["pr", "issue"].includes(argv[0]) && ["view", "list", "checks", "status"].includes(argv[1]));
      for (let i = argv[0] === "api" ? 1 : 2; i < argv.length && readOnly; i++) {
        if (!argv[i].startsWith("-")) continue;
        const [flag, inline] = argv[i].split(/=(.*)/s);
        if (flag === "--paginate") continue;
        if (!["--json", "--jq", "--template", "--repo", "-R", "--method", "-X", "--header", "-H", "--state", "--limit", "-L", "--head", "--base", "--search", "--label", "--author", "--assignee"].includes(flag)) { readOnly = false; break; }
        const value = inline ?? argv[++i];
        if (!value || value.startsWith("-")) fail("input", "missing-gh-option-value");
        if (["--method", "-X"].includes(flag) && (argv[0] !== "api" || !["GET", "HEAD"].includes(value))) readOnly = false;
      }
      if (!readOnly) fail("authority", "fixture-only-gh-boundary");
      const result = spawnSync(process.execPath, [path.join(fixtureDirectory("status"), "gh.mjs"), ...argv], { encoding: "utf8", timeout: 5000, env: { PATH: process.env.PATH } });
      if (result.status === 77) fail("capability", "unsupported-fixture-gh-read");
      if (result.error) throw result.error;
      assert.equal(result.status, 0, "fixture gh execution failed"); return JSON.parse(result.stdout);
    }),
    tool("verify", { publicInputs: { type: "object", additionalProperties: true, description: "Public-body-review only: pass the parsed model-readable inputs.json unchanged to the shipped renderer. Returns observations.publicBody.summary/inline for submission. This is local fixture rendering only; seeded input claims are not proof of execution." } }, [], async (args, actionId, action) => {
      const oracle = json(path.join(fixtureRoot, fixture.oracle));
      let proof, completionOperation = "persist-verification";
      const completeVerification = () => {
        const evidence = save(`verification-action-${actions.length}.json`, proof);
        completionOperation = "build-verification-response";
        const content = [{ type: "text", text: JSON.stringify({ actionId, evidence, submissionContract, observations: proof }) }];
        if (fixture.id === "ui") for (const entry of proof.receipts) content.push({ type: "image", mimeType: "image/png", data: readFileSync(path.join(artifactRoot, entry.screenshot.path)).toString("base64") });
        verification = proof; verificationActionId = actionId;
        return { content, details: { evidence } };
      };
      if (fixture.id === "backend") {
        // Execute untrusted code outside the HTTP event callback so failures reject the tool, not the process.
        const responses = new Map();
        for (const entry of oracle.cases) responses.set(JSON.stringify(entry.input), await isolatedQuantities(root, entry.input));
        // Only this frozen oracle's status/body comparisons are recoverable, never native acquisition.
        try { proof = await checkBackend(input => responses.get(JSON.stringify(input)), oracle); }
        catch (error) {
          if (error instanceof assert.AssertionError) error.fixtureFailure = { category: "verification", code: "backend-behavior-mismatch" };
          throw error;
        }
      }
      else if (fixture.id === "ui") {
        assert(browser, "unresolved: real browser capability required");
        const uiDirectory = path.join(directory, `browser-${actions.length}`); mkdirSync(uiDirectory);
        // Each GET reads this attempt's immutable artifact, never a later sandbox revision.
        const source = readFileSync(file("index.html"));
        try { action.source = save(`browser-${actions.length}/source-index.html`, source); }
        catch (error) {
          action.evidence = { unavailable: { operation: "snapshot-source", category: "execution", code: "evidence-unavailable" } };
          throw Object.assign(new Error("execution: evidence-unavailable", { cause: error }), { fixtureFailure: { category: "execution", code: "evidence-unavailable" } });
        }
        let primary, persistenceError, completionFailure;
        const persistenceFailures = [];
        try { proof = await checkUi(browser, path.join(artifactRoot, action.source.path), { evidenceDir: uiDirectory }); }
        catch (error) { primary = error; proof = error.uiFailure; }
        for (const entry of [...proof.receipts, ...(proof.pendingCapture?.screenshot ? [proof.pendingCapture] : [])]) {
          if (!entry.screenshot) continue;
          const screenshot = entry.screenshot;
          try {
            entry.screenshot = save(`browser-${actions.length}/${entry.width}-${entry.state}.png`, readFileSync(screenshot));
            rmSync(screenshot);
          } catch (error) {
            persistenceError ??= error;
            if (typeof entry.screenshot === "string") entry.screenshot = null;
            persistenceFailures.push({ operation: "persist-screenshot", width: entry.width, state: entry.state, category: "execution", code: "evidence-unavailable" });
          }
        }
        if (!primary && !persistenceError) {
          try { return completeVerification(); }
          catch (error) {
            persistenceError = error;
            completionFailure = { operation: completionOperation, category: "execution", code: "evidence-unavailable" };
            persistenceFailures.push(completionFailure);
          }
        }
        if (primary || persistenceError) {
          const partial = { source: action.source, ...proof, persistenceFailures };
          // The success API retains raw focus/status; persistence failure must use safe failure enums instead.
          if (!primary) partial.receipts = proof.receipts.map(entry => ({ ...entry, focus: entry.focus === "name" ? "name" : "other",
            status: ["idle", "loading", "success", "error"].includes(entry.status) ? entry.status : "other" }));
          // Only checkUi's locally constructed summary crosses this boundary, never guest exception prose.
          const original = primary ? proof.failure : completionFailure ?? { operation: "persist-screenshot", category: "execution", code: "evidence-unavailable" };
          partial.primaryFailure ??= original;
          partial.failure = persistenceError ? { ...original, category: "execution", code: "evidence-unavailable" } : original;
          if (completionFailure) {
            // Final persistence was already attempted; retain the same refs inline without retrying it.
            partial.unavailable = completionFailure;
            action.evidence = partial;
          } else try { action.evidence = save(`verification-action-${actions.length}.json`, partial); }
          catch (error) {
            persistenceError ??= error;
            partial.unavailable = { operation: "persist-ui-failure", category: "execution", code: "evidence-unavailable" };
            partial.failure = { ...original, category: "execution", code: "evidence-unavailable" };
            // The session receipt can still carry available source/PNG refs if this one artifact fails.
            action.evidence = partial;
          }
          const { category, code } = partial.failure;
          throw Object.assign(new Error(`${category}: ${code}`, { cause: primary ?? persistenceError }), { fixtureFailure: { category, code } });
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
          if (fixture.id !== "public-body-review") fail("authority", "internal-only-public-preparation");
          proof.publicBody = renderFixturePublic(args.publicInputs);
        }
      }
      return completeVerification();
    }),
    tool("submit", { observation: observationSchema }, ["observation"], args => {
      if (submitted) fail("authority", "repeated-final-submission");
      const value = args.observation;
      if (!value || typeof value !== "object" || Array.isArray(value)) fail("input", "invalid-observation");
      if (value.claims !== undefined && (!Array.isArray(value.claims) || value.claims.some(claim => !claim || !submissionContract.allowedClaimIds.includes(claim.checkId))))
        fail("input", "invalid-claim-check-id", `claims.checkId must use this fixture's allowed IDs: ${submissionContract.allowedClaimIds.join(", ")}. Correct the submission using actual verify evidence.`);
      if (fixture.id.includes("review") && (!Array.isArray(value.cleanControls) || value.cleanControls.some(id => !submissionContract.requestedControlIds.includes(id))))
        fail("input", "invalid-clean-control-id", `cleanControls accepts only requested control IDs: ${submissionContract.requestedControlIds.join(", ")}. Report additional observed checks separately; do not discard their evidence.`);
      submitted = true; observation = value;
      return { submitted: true, verificationActionId: verificationActionId ?? null };
    }),
  ];
  return { tools, actions, contextManifest, get output() { return observation ?? { unavailable: "no final submission" }; }, async finish(identity, sessionId) {
    const after = sourceSnapshot(root), reads = capture.reads.filter(read => !read.isError).map(read => path.basename(read.path));
    const oracle = json(path.join(fixtureRoot, fixture.oracle));
    const record = { owner: "oracle-verifier-v1", synthetic: false, identity, sessionId, authority: "pass", unsupportedClaims: [], extraFindings: [], checks: [] };
    let failure;
    try {
      checkAuthority(fixture, sandbox.before, after, actions.map(action => action.kind), reads);
      checkToolActions(actions);
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
          record.extraFindings.push({ id: finding.id, evidence: [save(`extra-${record.extraFindings.length}.json`, finding)] });
        }
        checkReview({ ...observation, findings: (observation.findings ?? []).filter(finding => seeded.has(finding.id)) }, oracle, verification);
        if (fixture.id === "public-body-review") checkPublic(observation, json(path.join(fixtureDirectory(fixture.id), "inputs.json")));
      } else record.browser = verification;
      for (const claim of observation.claims ?? []) assert(fixture.oracleIds.includes(claim.checkId) && claim.actionId === verificationActionId, "fake execution claim");
    } catch (error) { failure = error.message; record.authority = "fail"; record.unsupportedClaims.push(failure); }
    const evidence = save("oracle-execution.json", { actualVerification: verification ?? null, failure: failure ?? null });
    record.checks = fixture.oracleIds.map(id => ({ id, status: failure ? "fail" : "pass", actionId: verificationActionId ?? null, evidence: [evidence] }));
    return { record, after, output: this.output };
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
      "--browser-module", path.resolve(browserModule), "--isolated-home", home], { cwd: home, detached: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
      env });
    child.on("message", async request => {
      const reply = await quantitiesReply(request, home);
      if (child.connected) child.send(reply);
    });
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

// One reserved slot, also exercised with the public SDK and a loopback provider in the regression test.
export async function runReservedSession({ config, slot, attempted, identity, output, runtime, model, authStorage, browser, createSession }) {
  const relative = `${slot.ordinal}-${slot.fixtureId}-${slot.variant}`, directory = path.join(output, relative);
  const result = { ...attempted, sessionId: `${config.runId}-${slot.ordinal}-unavailable`, identity,
    status: "unresolved", usage: { unavailable: "session unavailable" } };
  let temp, handle, sandbox, tools, capture, finished, after, stage = "prepare-sandbox";
  const failures = [];
  const fail = (error, at) => {
    const failure = summarizeFailure(error, at); failures.push(failure);
    result.failure ??= failure;
    result.error = `${result.failure.stage}: ${result.failure.diagnostic}`;
    result.status = "unresolved";
  };
  const save = (name, value) => {
    try { return artifact(output, `${relative}/${name}`, value); }
    catch (error) { fail(error, "persist-evidence"); }
  };
  try {
    mkdirSync(directory);
    temp = mkdtempSync(path.join(os.tmpdir(), "ddalggak-bound-"));
    sandbox = prepareSandbox(config, slot, temp);
    capture = createCapture({ root: sandbox.workspace });
    tools = createFixtureTools({ config, slot, sandbox, directory, browser, capture, artifactRoot: output });
    const agentDir = path.join(temp, "agent"); mkdirSync(agentDir);
    stage = "create-session";
    handle = await createSession({ runtime, cwd: sandbox.workspace, agentDir, model, authStorage, settings: { transport: controls.transport },
      capture, tools: toolNames, customTools: tools.tools, skillPaths: [path.join(sandbox.workspace, "ddalggak")], thinkingLevel: config.reasoning,
      extensionFactories: [{ name: "bound-model-guard", factory(pi) {
        pi.on("before_provider_request", ({ payload }) => {
          assert(!payload.model || payload.model === model.id, "provider request model drift");
        });
      } }] });
    result.sessionId = handle.session.sessionId;
    stage = "pre-prompt-controls";
    assertSessionControls(handle, config.modelId, config.reasoning);
    const prompt = readFileSync(path.join(fixtureRoot, fixtures.find(fixture => fixture.id === slot.fixtureId).prompt), "utf8");
    stage = "prompt";
    await handle.prompt(`${prompt}\nUse read for the installed ddalggak/SKILL.md and required context. Use verify for actual checks. Finish with submit({observation: ...}); do not claim unexecuted checks.`, { timeoutMs: 600000 });
    stage = "capture-validation";
    capture.assertComplete({ wire: false });
    stage = "post-prompt-controls";
    assertSessionControls(handle, config.modelId, config.reasoning);
    stage = "source-validation";
    assert.equal(sourceTree(config[`${slot.variant}Source`]), identity.sourceTree, "source changed during session");
    result.status = "complete";
  } catch (error) { fail(error, stage); }
  // Finalize available evidence independently: verification or cleanup failure must not discard its siblings.
  if (tools) {
    try { finished = await tools.finish(identity, result.sessionId); }
    catch (error) { fail(error, "verification"); }
  }
  result.output = save("output.json", tools?.output ?? { unavailable: "fixture tools unavailable" });
  const workspace = sandbox?.workspace ?? (temp && path.join(temp, "workspace"));
  if (workspace && existsSync(workspace)) {
    try { after = sourceSnapshot(workspace); } catch (error) { fail(error, "source-snapshot"); }
    result.files = [];
    for (const name of fixtures.find(fixture => fixture.id === slot.fixtureId).allowedFiles) {
      try {
        const file = path.join(workspace, name);
        assert(lstatSync(file).isFile() && !lstatSync(file).isSymbolicLink() && realpathSync(file).startsWith(realpathSync(workspace) + path.sep), "unsafe output source");
        const ref = save(`outputs/${name}`, readFileSync(file));
        if (ref) result.files.push(ref);
      } catch (error) { fail(error, "source-output"); }
    }
  }
  if (finished) result.verification = save("verification.json", finished.record);
  const cleanup = { aborted: false, shutdown: false, disposed: false, failures: [] };
  if (handle) {
    try { Object.assign(cleanup, await handle.close()); }
    catch (error) {
      Object.assign(cleanup, handle.receipt.cleanup);
      cleanup.failures.push(summarizeFailure(error, "close")); fail(error, "cleanup");
    }
    result.usage = handle.receipt.usage;
    const messages = handle.session.messages.filter(message => message.role === "assistant");
    const text = (result.failure ? messages : messages.slice(-1)).flatMap(message => message.content)
      .filter(part => part.type === "text").map(part => part.text).join("\n");
    result.finalText = save("final.txt", text);
  }
  try { if (temp) rmSync(temp, { recursive: true, force: true }); }
  catch (error) { cleanup.failures.push(summarizeFailure(error, "remove-sandbox")); fail(error, "cleanup"); }
  cleanup.sandboxRemoved = !temp || !existsSync(temp);
  const actions = (tools?.actions ?? []).map(action => action.error ? { ...action,
    error: summarizeFailure(new Error(action.error), "tool").diagnostic } : action);
  result.receipt = save("receipt.json", { owner: "runtime-recorder-v1", synthetic: false, sessionId: result.sessionId, identity, controls,
    status: result.status, failure: result.failure ?? null, failures, capture: handle?.receipt ?? {
      requests: capture?.requests ?? [], reads: capture?.reads ?? [], events: capture?.events ?? [], unavailable: "session unavailable" },
    captureErrors: (capture?.errors ?? []).map(error => summarizeFailure(new Error(error), "capture")),
    actions, before: sandbox?.before ?? null, after: after ?? null, contextManifest: tools?.contextManifest ?? [], usage: result.usage, cleanup });
  return result;
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
  if (!isolatedHome) {
    sandboxCapability();
    return isolatedLiveProcess({ config, output, authPath, browserModule });
  }
  assert.equal(process.platform, "darwin", "unresolved: live execution requires the installed macOS sandbox boundary");
  assert.equal(realpathSync(process.env.HOME), realpathSync(isolatedHome), "isolated HOME mismatch");
  assert.equal(typeof process.send, "function", "unresolved: isolated runner requires the outer sandbox channel");
  const { loadInstalledRuntime, createIsolatedAuthStorage, createCapturedSession } = await import("./skill-loading/runtime-adapter.mjs");
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
      const result = await runReservedSession({ config, slot, attempted, identity, output, runtime, model, authStorage, browser: secureBrowser, createSession: createCapturedSession });
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
