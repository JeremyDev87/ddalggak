import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, lstatSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCommandContracts } from "../../bin/lib/command-contracts.mjs";
import { selectCommandAssets } from "../../core/conditional-assets.mjs";

export const fixtureRoot = fileURLToPath(new URL("../../evals/skill-loading/", import.meta.url));
export const fixtures = JSON.parse(readFileSync(path.join(fixtureRoot, "fixtures.json"))).fixtures;
export const BASELINE_SHA = "33d6d3b5318841739a13611da740de2845b2f1f9";
export const BASELINE_TREE = "a3290a126b0a3d2a026015f5d0f87ddacc19560a";
export const digest = value => createHash("sha256").update(value).digest("hex");
export const json = file => JSON.parse(readFileSync(file, "utf8"));
export const configFields = ["runId", "baselineSource", "candidateSource", "baselineSha", "candidateTree", "runtimeDist", "pluginPath", "modelId", "reasoning", "fixtureHash", "sessionLimit", "mode"];
export const controls = Object.freeze({ retry: false, fallback: false, title: false, grader: false, subagent: false, externalWrites: false, network: "selected-provider-only", transport: "sse" });
export const toolNames = ["read", "write", "verify", "gh", "submit"];
// Bind both variants to the same executable tool protocol, including model-visible schemas and seeds.
export const toolProtocolHash = digest(readFileSync(new URL("../eval-skill-loading.mjs", import.meta.url)));
export const settingsHash = digest(JSON.stringify({ controls, toolNames, toolProtocolHash, permission: "fixture-only" }));

export function validateConfig(config) {
  assert(config && typeof config === "object" && !Array.isArray(config), "config object required");
  assert.deepEqual(Object.keys(config).sort(), configFields.slice().sort(), "exact run config fields required");
  for (const key of configFields.filter(key => key !== "sessionLimit")) assert(typeof config[key] === "string" && config[key].trim(), `missing ${key}`);
  assert(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(config.runId), "invalid runId");
  assert.equal(config.baselineSha, BASELINE_SHA, "wrong baseline SHA");
  assert(/^[a-f0-9]{40}$/.test(config.candidateTree), "candidateTree must be a Git tree hash");
  assert(/^[a-f0-9]{64}$/.test(config.fixtureHash), "fixtureHash must be sha256");
  assert.equal(config.sessionLimit, 10, "exactly ten attempted sessions");
  assert(["offline", "live"].includes(config.mode), "explicit offline or live mode required");
  assert(config.modelId.includes("/") && !/^(auto|default|synthetic)\//.test(config.modelId), "explicit provider/model ID required");
  assert(["off", "minimal", "low", "medium", "high", "xhigh"].includes(config.reasoning), "unsupported reasoning");
  for (const key of ["baselineSource", "candidateSource", "runtimeDist", "pluginPath"]) assert(path.isAbsolute(config[key]), `${key} must be an explicit absolute path`);
  assert.notEqual(config.baselineSource, config.candidateSource, "variants must have separate sources");
  return config;
}

// Git object hashing binds an extracted archive without creating an index or commit.
export function sourceTree(root) {
  const object = (kind, data) => createHash("sha1").update(`${kind} ${data.length}\0`).update(data).digest();
  const tree = directory => {
    const entries = readdirSync(directory).filter(name => name !== ".git").map(name => {
      const file = path.join(directory, name), stat = lstatSync(file);
      assert(!stat.isSymbolicLink(), "source symlinks are outside the boundary");
      assert(stat.isDirectory() || stat.isFile(), "unsupported source entry");
      return { name, file, stat, sort: name + (stat.isDirectory() ? "/" : "") };
    }).sort((a, b) => Buffer.compare(Buffer.from(a.sort), Buffer.from(b.sort)));
    return object("tree", Buffer.concat(entries.map(({ name, file, stat }) => Buffer.concat([
      Buffer.from(`${stat.isDirectory() ? "40000" : stat.mode & 0o111 ? "100755" : "100644"} ${name}\0`),
      stat.isDirectory() ? tree(file) : object("blob", readFileSync(file)),
    ]))));
  };
  return tree(root).toString("hex");
}

export function directoryHash(root) {
  const hash = createHash("sha256");
  const walk = (directory, prefix = "") => {
    for (const name of readdirSync(directory).sort()) {
      if (name === ".git") continue;
      const file = path.join(directory, name), relative = `${prefix}${name}`, stat = lstatSync(file);
      assert(!stat.isSymbolicLink(), `symlink in bound directory: ${relative}`);
      if (stat.isDirectory()) walk(file, `${relative}/`);
      else hash.update(relative).update("\0").update(readFileSync(file)).update("\0");
    }
  };
  walk(root);
  return hash.digest("hex");
}

export function bindSources(config) {
  validateConfig(config);
  for (const key of ["baselineSource", "candidateSource", "runtimeDist", "pluginPath"]) assert(lstatSync(config[key]).isDirectory(), `${key} directory missing`);
  assert.notEqual(realpathSync(config.baselineSource), realpathSync(config.candidateSource), "source aliases");
  assert.equal(sourceTree(config.baselineSource), BASELINE_TREE, "baseline archive does not match immutable SHA tree");
  assert.equal(sourceTree(config.candidateSource), config.candidateTree, "candidate source tree drift");
  assert.equal(directoryHash(fixtureRoot), config.fixtureHash, "fixture hash drift");
  for (const variant of ["baseline", "candidate"]) for (const fixture of fixtures) requiredReads(config, { variant, fixtureId: fixture.id });
  return { configHash: digest(JSON.stringify(configFields.map(key => [key, config[key]]))), baselineTree: BASELINE_TREE,
    candidateTree: config.candidateTree, fixtureHash: config.fixtureHash,
    runtimeHash: directoryHash(config.runtimeDist), pluginHash: directoryHash(config.pluginPath), settingsHash };
}

export function sessionOrder() {
  assert.equal(fixtures.length, 5);
  return fixtures.map(fixture => fixture.id).sort().flatMap((fixtureId, index) =>
    (index % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]).map(variant => ({ fixtureId, variant }))
  ).map((slot, index) => ({ ...slot, ordinal: index + 1 }));
}

export function sessionIdentity(config, binding, slot) {
  return { ...slot, runId: config.runId, source: config[`${slot.variant}Source`],
    sourceTree: binding[`${slot.variant}Tree`], modelId: config.modelId, reasoning: config.reasoning,
    runtimeDist: config.runtimeDist, pluginPath: config.pluginPath, ...binding };
}

export function requiredReads(config, slot) {
  const source = config[`${slot.variant}Source`];
  const command = slot.fixtureId === "status" ? "status" : slot.fixtureId.includes("review") ? "review" : "start";
  const doc = loadCommandContracts(source).find(doc => doc.command === command);
  assert(doc, "missing selected command metadata");
  const assets = selectCommandAssets(doc, slot.variant === "candidate" && slot.fixtureId === "public-body-review" ? ["public-body"] : []);
  const files = ["ddalggak/SKILL.md", ...(slot.variant === "candidate" ? [`ddalggak/references/command-${command}.md`] : []),
    ...assets.references.map(file => `ddalggak/references/${file}`), ...assets.templates.map(file => `ddalggak/templates/${file}`),
    ...fixtures.find(fixture => fixture.id === slot.fixtureId).expectedReads.map(file => `ddalggak/references/${file}`)];
  for (const file of files) assert(lstatSync(path.join(source, file)).isFile(), `missing required payload: ${file}`);
  return [...new Set(files)];
}

export function createRegistry(config, directory) {
  validateConfig(config);
  // Durable exclusive run reservation: failed attempts cannot be retried with another output path.
  mkdirSync(directory, { recursive: true });
  const runDirectory = path.join(directory, config.runId);
  mkdirSync(runDirectory);
  const slots = sessionOrder();
  let count = 0;
  return { directory: runDirectory, reserve(slot) {
    assert(count < 10, "eleventh attempted session forbidden");
    assert.deepEqual(slot, slots[count], "duplicate or out-of-order session slot");
    writeFileSync(path.join(runDirectory, `${slot.ordinal}.json`), JSON.stringify({ slot, attempted: true, attempt: 1 }), { flag: "wx" });
    count++;
    return { ...slot, attempted: true, attempt: 1 };
  }, get count() { return count; } };
}

export function artifact(directory, relative, data) {
  assert(typeof relative === "string" && relative && !path.isAbsolute(relative) && !relative.split(/[\\/]/).some(part => !part || part === "." || part === ".."), "unsafe artifact path");
  const file = path.join(directory, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
  writeFileSync(file, bytes, { flag: "wx" });
  return { path: relative, sha256: digest(bytes) };
}

export function readArtifact(directory, ref, parse = true) {
  assert(ref && typeof ref.path === "string" && /^[a-f0-9]{64}$/.test(ref.sha256), "missing artifact hash");
  const relative = ref.path;
  assert(!path.isAbsolute(relative) && !relative.split(/[\\/]/).some(part => !part || part === "." || part === ".."), "unsafe artifact path");
  const root = realpathSync(directory), file = realpathSync(path.join(directory, relative));
  assert(file.startsWith(root + path.sep), "artifact escapes evidence directory");
  const bytes = readFileSync(file);
  assert.equal(digest(bytes), ref.sha256, `artifact hash mismatch: ${relative}`);
  return parse ? JSON.parse(bytes) : bytes;
}
