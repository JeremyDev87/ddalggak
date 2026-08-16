#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const defaultRoot = path.resolve(path.dirname(__filename), "..");
const SUPPORT_LINK_RE = /(?:\]\(|`|(?:^|[\s"']))((?:references|templates|scripts|assets|examples)\/[^\s)`"'<>]+)/gm;
const SHA_RE = /^[0-9a-f]{40}$/;
const CONTENT_HASH_RE = /^sha256:[0-9a-f]{16}$/;
const ISO_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout || 180_000,
  });
  if (result.error) throw result.error;
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  if (result.status !== 0) {
    throw new Error(`${commandName} ${args.join(" ")} failed with exit ${result.status}: ${output}`);
  }
  return output;
}

function git(rootDir, ...args) {
  return command("git", args, { cwd: rootDir }).trim();
}

export function referencedSupportFiles(skillText) {
  const files = new Set();
  for (const match of skillText.matchAll(SUPPORT_LINK_RE)) {
    const relPath = match[1].replace(/[.,;:]+$/, "");
    invariant(!relPath.split("/").includes(".."), `unsafe support path: ${relPath}`);
    files.add(relPath);
  }
  return [...files].sort();
}

export function contentHash(skillRoot, files) {
  const hash = createHash("sha256");
  for (const relPath of [...files].sort()) {
    const absolutePath = path.join(skillRoot, relPath);
    invariant(existsSync(absolutePath) && statSync(absolutePath).isFile(), `missing expected bundle file: ${relPath}`);
    hash.update(Buffer.from(`${relPath}\0`, "utf8"));
    hash.update(readFileSync(absolutePath));
  }
  return `sha256:${hash.digest("hex").slice(0, 16)}`;
}

export function buildExpectedBundle(rootDir = defaultRoot) {
  const skillRoot = path.join(rootDir, "ddalggak");
  const skillText = readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
  const files = ["SKILL.md", ...referencedSupportFiles(skillText)].sort();
  return {
    files,
    content_hash: contentHash(skillRoot, files),
  };
}

export function createCanonicalTempRoot(prefix = path.join(os.tmpdir(), "ddalggak-hermes-native-e2e-")) {
  return realpathSync(mkdtempSync(prefix));
}

function assertLane(lane, expected, label, source, identifier, sourceRevision = null) {
  invariant(lane && typeof lane === "object", `${label}: missing lane`);
  invariant(lane.inspect === true, `${label}: inspect did not succeed`);
  invariant(lane.installed === true, `${label}: native install did not produce an installed tree`);
  invariant(lane.listed === true, `${label}: native list did not discover ddalggak`);
  invariant(lane.check_status === "up_to_date", `${label}: check status is not up_to_date`);
  invariant(lane.update_status === "no_updates", `${label}: update was not idempotent`);
  invariant(lane.loader_discovered === true, `${label}: fresh loader did not discover ddalggak`);
  invariant(lane.audit_install === true, `${label}: INSTALL audit record missing`);
  invariant(lane.audit_scan === true, `${label}: native audit did not rescan the installed tree`);
  invariant(lane.hash_stable_after_update === true, `${label}: installed content changed after check/update`);
  invariant(lane.source === source, `${label}: expected source ${source}, got ${lane.source}`);
  invariant(lane.identifier === identifier, `${label}: source identifier mismatch`);
  invariant(CONTENT_HASH_RE.test(lane.content_hash || ""), `${label}: malformed content hash`);
  invariant(lane.content_hash === expected.content_hash, `${label}: installed content hash differs from exact source bundle`);
  invariant(JSON.stringify(lane.files) === JSON.stringify(expected.files), `${label}: installed file manifest differs from exact source bundle`);
  invariant(["safe", "caution"].includes(lane.scan_verdict), `${label}: unsafe scan verdict ${lane.scan_verdict}`);
  if (sourceRevision !== null) {
    invariant(lane.source_revision === sourceRevision, `${label}: repository source_revision mismatch`);
  }
}

export function validateHermesNativeEvidence(evidence, expected) {
  invariant(evidence?.schema === "ddalggak-hermes-native-e2e/v1", "unsupported or missing evidence schema");
  invariant(evidence.result === "PASS", `native E2E result is not PASS: ${evidence.result || "<missing>"}`);
  invariant(ISO_TIMESTAMP_RE.test(evidence.generated_at || ""), "generated_at must be a canonical ISO timestamp");
  const generatedAt = Date.parse(evidence.generated_at || "");
  invariant(Number.isFinite(generatedAt), "generated_at must be a valid ISO timestamp");
  invariant(new Date(generatedAt).toISOString() === evidence.generated_at, "generated_at must be a canonical ISO timestamp");
  invariant(generatedAt <= Date.now() + 300_000, "generated_at cannot be in the future");
  invariant(generatedAt >= Date.now() - MAX_EVIDENCE_AGE_MS, "generated_at is older than 24 hours");
  invariant(SHA_RE.test(evidence.repository?.commit || ""), "repository commit must be a full SHA");
  invariant(SHA_RE.test(evidence.repository?.repo_tree || ""), "repository tree must be a full SHA");
  invariant(SHA_RE.test(evidence.repository?.skill_tree || ""), "skill tree must be a full SHA");
  invariant(SHA_RE.test(evidence.hermes?.revision || ""), "Hermes revision must be a full SHA");
  const rawUrl = `https://raw.githubusercontent.com/JeremyDev87/ddalggak/${evidence.repository.commit}/ddalggak/SKILL.md`;
  invariant(evidence.repository.raw_url === rawUrl, "immutable raw URL is not bound to the repository commit");
  invariant(evidence.repository.identifier === "JeremyDev87/ddalggak/ddalggak", "repository identifier mismatch");
  assertLane(evidence.lanes?.default_raw, expected, "default_raw", "url", rawUrl);
  assertLane(
    evidence.lanes?.named_repository,
    expected,
    "named_repository",
    "github",
    evidence.repository.identifier,
    evidence.repository.commit,
  );
  const named = evidence.lanes.named_repository;
  invariant(named.synthetic_check_status === "update_available", "named_repository: synthetic update check evidence missing");
  invariant(named.synthetic_update_restored === true, "named_repository: synthetic update restoration evidence missing");
  invariant(named.installed_at_preserved === true, "named_repository: installed_at preservation evidence missing");
  invariant(named.updated_at_advanced === true, "named_repository: updated_at advancement evidence missing");
  invariant(named.audit_install_count === 2, "named_repository: expected two INSTALL audit records");
  const empty = evidence.lanes?.named_empty;
  invariant(empty?.tree_absent === true, "named_empty: unexpected installed tree");
  invariant(empty?.lock_absent === true, "named_empty: unexpected lock entry");
  invariant(empty?.loader_absent === true, "named_empty: loader leaked ddalggak across profiles");
  return true;
}

export function validateHermesNativeRepositoryBinding(evidence, rootDir = defaultRoot) {
  validateHermesNativeEvidence(evidence, buildExpectedBundle(rootDir));
  const commit = evidence.repository.commit;
  let actualRepoTree;
  let actualSkillTree;
  try {
    git(rootDir, "cat-file", "-e", `${commit}^{commit}`);
    actualRepoTree = git(rootDir, "rev-parse", `${commit}^{tree}`);
    actualSkillTree = git(rootDir, "rev-parse", `${commit}:ddalggak`);
  } catch (error) {
    throw new Error(`evidence repository commit is not locally verifiable: ${error.message}`);
  }
  invariant(evidence.repository.repo_tree === actualRepoTree, `repository tree mismatch: expected ${actualRepoTree}, got ${evidence.repository.repo_tree}`);
  invariant(evidence.repository.skill_tree === actualSkillTree, `skill tree mismatch: expected ${actualSkillTree}, got ${evidence.repository.skill_tree}`);
  const currentSkillTree = git(rootDir, "rev-parse", "HEAD:ddalggak");
  invariant(evidence.repository.skill_tree === currentSkillTree, `evidence skill tree ${evidence.repository.skill_tree} does not match current ${currentSkillTree}`);
  try {
    git(rootDir, "merge-base", "--is-ancestor", commit, "HEAD");
  } catch {
    throw new Error("evidence repository commit is not an ancestor of HEAD");
  }
  return true;
}

function walkFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(path.relative(root, absolutePath).split(path.sep).join("/"));
    }
  };
  if (existsSync(root)) visit(root);
  return files.sort();
}

function freshLoader(python, hermesRoot, home, shouldDiscover) {
  const script = [
    "from agent.prompt_builder import build_skills_system_prompt",
    "from tools.skills_tool import skills_list, skill_view",
    "import json, pathlib, os",
    "home = pathlib.Path(os.environ['HERMES_HOME']).resolve()",
    "listed = json.loads(skills_list())",
    `matches = [s for s in listed.get('skills', []) if s.get('name') == ${JSON.stringify("ddalggak")}]`,
    `assert len(matches) == ${shouldDiscover ? "1" : "0"}, listed`,
    shouldDiscover
      ? "viewed = json.loads(skill_view('ddalggak', preprocess=False)); assert viewed.get('success') is True, viewed; assert pathlib.Path(viewed['_source_path']).resolve() == home / 'skills/ddalggak/SKILL.md', viewed"
      : "pass",
    "text = build_skills_system_prompt()",
    `present = ${JSON.stringify("ddalggak")} in text`,
    `assert present is ${shouldDiscover ? "True" : "False"}, text[:2000]`,
    "print('DISCOVERY=' + ('present' if present else 'absent'))",
  ].join("; ");
  const env = { ...process.env, HERMES_HOME: home, PYTHONPATH: hermesRoot };
  delete env.HERMES_PROFILE;
  return command(python, ["-c", script], { cwd: hermesRoot, env }).includes(shouldDiscover ? "DISCOVERY=present" : "DISCOVERY=absent");
}

function readLock(home) {
  const lockPath = path.join(home, "skills", ".hub", "lock.json");
  invariant(existsSync(lockPath), `missing lock file: ${lockPath}`);
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

function assertNativeInstall(output, label) {
  if (/Installed:/.test(output) && !/Installation blocked:/.test(output)) return;
  const diagnostic = output
    .split(/\r?\n/)
    .filter((line) => /Verdict:|Decision:|Installation blocked:|Error:/.test(line))
    .join(" | ") || "command returned without an installed payload";
  throw new Error(`${label}: native install failed: ${diagnostic}`);
}

function laneEvidence({ home, output, expected, expectedSource, expectedIdentifier, expectedRevision, loaderDiscovered }) {
  const installRoot = path.join(home, "skills", "ddalggak");
  const lock = readLock(home);
  const entry = lock.installed?.ddalggak;
  invariant(entry, `lock has no installed.ddalggak entry for ${home}`);
  const actualFiles = walkFiles(installRoot);
  const auditPath = path.join(home, "skills", ".hub", "audit.log");
  const audit = existsSync(auditPath) ? readFileSync(auditPath, "utf8") : "";
  const afterHash = contentHash(installRoot, actualFiles);
  return {
    inspect: /Name:\s+ddalggak/.test(output.inspect) && !/Error:/.test(output.inspect),
    installed: /Installed:/.test(output.install) && !/Installation blocked:/.test(output.install) && existsSync(path.join(installRoot, "SKILL.md")),
    listed: /ddalggak/.test(output.list) && !/0 hub-installed/.test(output.list),
    check_status: /up_to_date/.test(output.check) ? "up_to_date" : "unexpected",
    update_status: /No updates available/.test(output.update) ? "no_updates" : "unexpected",
    loader_discovered: loaderDiscovered,
    audit_install: /\bINSTALL ddalggak\b/.test(audit),
    audit_scan: /Scan: ddalggak/.test(output.audit),
    hash_stable_after_update: entry.content_hash === afterHash,
    source: entry.source,
    identifier: entry.identifier,
    source_revision: entry.metadata?.source_revision || "",
    content_hash: entry.content_hash,
    files: [...(entry.files || [])].sort(),
    scan_verdict: entry.scan_verdict,
    expected_source: expectedSource,
    expected_identifier: expectedIdentifier,
    expected_revision: expectedRevision || "",
    expected_content_hash: expected.content_hash,
  };
}

function parseArgs(argv) {
  const options = { rootDir: defaultRoot, keepTemp: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--online") options.online = true;
    else if (flag === "--keep-temp") options.keepTemp = true;
    else if (["--root", "--hermes-root", "--python", "--evidence", "--evidence-out"].includes(flag)) {
      invariant(argv[index + 1], `missing value for ${flag}`);
      const value = argv[++index];
      if (flag === "--root") options.rootDir = path.resolve(value);
      if (flag === "--hermes-root") options.hermesRoot = path.resolve(value);
      if (flag === "--python") options.python = path.resolve(value);
      if (flag === "--evidence") options.evidencePath = path.resolve(value);
      if (flag === "--evidence-out") options.evidenceOut = path.resolve(value);
    } else throw new Error(`unknown option: ${flag}`);
  }
  return options;
}

function runOnline(options) {
  invariant(options.hermesRoot, "--online requires --hermes-root");
  invariant(options.python, "--online requires --python");
  invariant(options.evidenceOut, "--online requires --evidence-out");
  const rootDir = options.rootDir;
  const commit = git(rootDir, "rev-parse", "HEAD");
  const skillDirty = git(rootDir, "status", "--porcelain", "--", "ddalggak");
  invariant(skillDirty === "", "online canary requires a clean committed ddalggak/ source tree");
  const hermesRevision = git(options.hermesRoot, "rev-parse", "HEAD");
  const remoteSha = (url, ref) => command("git", ["ls-remote", url, ref]).trim().split(/\s+/)[0];
  const remoteHead = remoteSha("https://github.com/JeremyDev87/ddalggak.git", "refs/heads/master");
  invariant(remoteHead === commit, `remote master ${remoteHead || "<missing>"} does not match local exact commit ${commit}`);
  const remoteHermesHead = remoteSha("https://github.com/NousResearch/hermes-agent.git", "refs/heads/main");
  invariant(remoteHermesHead === hermesRevision, `remote Hermes main ${remoteHermesHead || "<missing>"} does not match pinned checkout ${hermesRevision}`);
  const repoTree = git(rootDir, "rev-parse", `${commit}^{tree}`);
  const skillTree = git(rootDir, "rev-parse", `${commit}:ddalggak`);
  const expected = buildExpectedBundle(rootDir);
  const rawUrl = `https://raw.githubusercontent.com/JeremyDev87/ddalggak/${commit}/ddalggak/SKILL.md`;
  const identifier = "JeremyDev87/ddalggak/ddalggak";
  // macOS aliases /tmp to /private/tmp. Hermes resolves install destinations
  // before validating containment, so pass the canonical root on both sides.
  const tempRoot = createCanonicalTempRoot();
  const cli = path.join(options.hermesRoot, "hermes_cli", "main.py");
  const baseEnv = { ...process.env, HERMES_HOME: tempRoot, PYTHONPATH: options.hermesRoot };
  delete baseEnv.HERMES_PROFILE;
  const hermes = (args, env = baseEnv) => command(options.python, [cli, ...args], { cwd: options.hermesRoot, env, timeout: 300_000 });
  try {
    hermes(["-p", "default", "profile", "create", "canarya", "--no-skills", "--no-alias"]);
    hermes(["-p", "default", "profile", "create", "canaryb", "--no-skills", "--no-alias"]);
    const namedA = path.join(tempRoot, "profiles", "canarya");
    const namedB = path.join(tempRoot, "profiles", "canaryb");
    const emptyBefore = {
      tree_absent: !existsSync(path.join(namedB, "skills", "ddalggak")),
      lock_absent: !readLockIfPresent(namedB)?.installed?.ddalggak,
      loader_absent: freshLoader(options.python, options.hermesRoot, namedB, false),
    };

    const rawOutput = {
      inspect: hermes(["skills", "inspect", rawUrl]),
      install: hermes(["skills", "install", rawUrl, "--force", "--yes"]),
    };
    assertNativeInstall(rawOutput.install, "default_raw");
    rawOutput.list = hermes(["skills", "list", "--source", "hub", "--enabled-only"]);
    rawOutput.check = hermes(["skills", "check", "ddalggak"]);
    rawOutput.update = hermes(["skills", "update", "ddalggak"]);
    rawOutput.audit = hermes(["skills", "audit", "ddalggak"]);
    const defaultRaw = laneEvidence({
      home: tempRoot,
      output: rawOutput,
      expected,
      expectedSource: "url",
      expectedIdentifier: rawUrl,
      loaderDiscovered: freshLoader(options.python, options.hermesRoot, tempRoot, true),
    });

    const repoOutput = {
      inspect: hermes(["-p", "canarya", "skills", "inspect", identifier]),
      install: hermes(["-p", "canarya", "skills", "install", identifier, "--force", "--yes"]),
    };
    assertNativeInstall(repoOutput.install, "named_repository");
    repoOutput.list = hermes(["-p", "canarya", "skills", "list", "--source", "hub", "--enabled-only"]);
    repoOutput.check = hermes(["-p", "canarya", "skills", "check", "ddalggak"]);
    repoOutput.update = hermes(["-p", "canarya", "skills", "update", "ddalggak"]);
    repoOutput.audit = hermes(["-p", "canarya", "skills", "audit", "ddalggak"]);
    const namedRepository = laneEvidence({
      home: namedA,
      output: repoOutput,
      expected,
      expectedSource: "github",
      expectedIdentifier: identifier,
      expectedRevision: commit,
      loaderDiscovered: freshLoader(options.python, options.hermesRoot, namedA, true),
    });

    const namedLockPath = path.join(namedA, "skills", ".hub", "lock.json");
    const namedLockBeforeUpdate = readLock(namedA);
    const installedBeforeUpdate = namedLockBeforeUpdate.installed.ddalggak;
    const originalInstalledAt = installedBeforeUpdate.installed_at;
    const originalUpdatedAt = installedBeforeUpdate.updated_at;
    installedBeforeUpdate.content_hash = "sha256:0000000000000000";
    writeFileSync(namedLockPath, `${JSON.stringify(namedLockBeforeUpdate, null, 2)}\n`, "utf8");
    const syntheticCheck = hermes(["-p", "canarya", "skills", "check", "ddalggak"]);
    const syntheticUpdate = hermes(["-p", "canarya", "skills", "update", "ddalggak"]);
    const namedLockAfterUpdate = readLock(namedA).installed.ddalggak;
    const namedAudit = readFileSync(path.join(namedA, "skills", ".hub", "audit.log"), "utf8");
    namedRepository.synthetic_check_status = /update_available/.test(syntheticCheck) ? "update_available" : "unexpected";
    namedRepository.synthetic_update_restored = /Updated 1 skill/.test(syntheticUpdate)
      && namedLockAfterUpdate.content_hash === expected.content_hash;
    namedRepository.installed_at_preserved = namedLockAfterUpdate.installed_at === originalInstalledAt;
    namedRepository.updated_at_advanced = namedLockAfterUpdate.updated_at !== originalUpdatedAt;
    namedRepository.audit_install_count = (namedAudit.match(/\bINSTALL ddalggak\b/g) || []).length;

    const emptyAfter = {
      tree_absent: emptyBefore.tree_absent && !existsSync(path.join(namedB, "skills", "ddalggak")),
      lock_absent: emptyBefore.lock_absent && !readLockIfPresent(namedB)?.installed?.ddalggak,
      loader_absent: emptyBefore.loader_absent && freshLoader(options.python, options.hermesRoot, namedB, false),
    };
    const evidence = {
      schema: "ddalggak-hermes-native-e2e/v1",
      result: "PASS",
      generated_at: new Date().toISOString(),
      repository: { commit, repo_tree: repoTree, skill_tree: skillTree, raw_url: rawUrl, identifier },
      hermes: { revision: hermesRevision },
      expected,
      lanes: { default_raw: defaultRaw, named_repository: namedRepository, named_empty: emptyAfter },
    };
    invariant(namedRepository.synthetic_check_status === "update_available", "named_repository: synthetic check did not detect lock hash drift");
    invariant(namedRepository.synthetic_update_restored === true, "named_repository: synthetic update did not restore the exact bundle hash");
    invariant(namedRepository.installed_at_preserved === true, "named_repository: update rewrote installed_at");
    invariant(namedRepository.updated_at_advanced === true, "named_repository: update did not advance updated_at");
    invariant(namedRepository.audit_install_count === 2, "named_repository: expected exactly two INSTALL audit entries");
    validateHermesNativeEvidence(evidence, expected);
    invariant(remoteSha("https://github.com/JeremyDev87/ddalggak.git", "refs/heads/master") === commit, "ddalggak master advanced during canary");
    invariant(remoteSha("https://github.com/NousResearch/hermes-agent.git", "refs/heads/main") === hermesRevision, "Hermes main advanced during canary");
    writeFileSync(options.evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`[verify:hermes-native-e2e] PASS: Hermes ${hermesRevision.slice(0, 12)}, ddalggak ${commit.slice(0, 12)}, ${expected.files.length} files, default/raw + named/repository + empty-profile isolation`);
  } finally {
    if (options.keepTemp) console.log(`[verify:hermes-native-e2e] temp home retained: ${tempRoot}`);
    else rmSync(tempRoot, { recursive: true, force: true });
  }
}

function readLockIfPresent(home) {
  const lockPath = path.join(home, "skills", ".hub", "lock.json");
  if (!existsSync(lockPath)) return null;
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const expected = buildExpectedBundle(options.rootDir);
  if (options.online) return runOnline(options);
  invariant(options.evidencePath, "use --evidence <path> or --online");
  const evidence = JSON.parse(readFileSync(options.evidencePath, "utf8"));
  validateHermesNativeRepositoryBinding(evidence, options.rootDir);
  console.log(`[verify:hermes-native-e2e] repository-bound evidence PASS: ${expected.files.length} exact bundle files, ${expected.content_hash}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(`[verify:hermes-native-e2e] FAIL: ${error.message}`);
    process.exit(1);
  }
}
