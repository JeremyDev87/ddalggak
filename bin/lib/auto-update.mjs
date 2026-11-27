import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { devNull, homedir } from "node:os";
import { join, resolve } from "node:path";

import { listPayloadFiles, payloadChecksum } from "./local-payload.mjs";
import { readIpgaelPolicy, renderIpgaelPolicy, validateIpgaelPolicy } from "./ipgael-policy.mjs";

let runtimePayloadRoot = null;
let runtimePolicySha = null;
export function resolveRuntimePayloadRoot(packageRoot) {
  return runtimePayloadRoot || packageRoot;
}

export const UPDATE_REMOTE = "https://github.com/JeremyDev87/ddalggak.git";
export const UPDATE_REF = "refs/heads/master";
const SOURCE_SHA_FILE = ".ddalggak-source-sha";
const ACTIVE_FILE = "active.json";
const STATE_FILE = "state.json";
const LOCK_DIR = ".update-lock";
const REQUIRED_PATHS = [
  "package.json",
  "bin/ddalggak.js",
  "bin/lib/cli-main.mjs",
  "bin/lib/auto-update.mjs",
  "bin/lib/command-contracts.mjs",
  "bin/lib/dispatch.mjs",
  "bin/lib/setup.mjs",
  "bin/lib/status.mjs",
  "core/commands",
  "ddalggak/SKILL.md",
  ".codex/skills/ddalggak/SKILL.md",
];

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

function canonicalPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function sanitizeError(message) {
  return String(message).replaceAll(homedir(), "~").slice(0, 500);
}

export function stripNoUpdateFlag(argv) {
  const args = [];
  let optedOut = false;
  let passthrough = false;
  for (const arg of argv) {
    if (arg === "--") passthrough = true;
    if (!passthrough && arg === "--no-update") {
      optedOut = true;
      continue;
    }
    args.push(arg);
  }
  return { args, optedOut };
}

export function resolveUpdateConfig({ env = process.env, packageRoot }) {
  const testMode = truthy(env.DDALGGAK_UPDATE_TEST_MODE);
  const cacheBase =
    env.DDALGGAK_UPDATE_CACHE_DIR ||
    join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "ddalggak");
  return {
    packageRoot: resolve(packageRoot),
    cacheRoot: resolve(cacheBase),
    remote:
      testMode && env.DDALGGAK_UPDATE_REMOTE
        ? env.DDALGGAK_UPDATE_REMOTE
        : UPDATE_REMOTE,
    ref:
      testMode && env.DDALGGAK_UPDATE_REF
        ? env.DDALGGAK_UPDATE_REF
        : UPDATE_REF,
    gitBin:
      testMode && env.DDALGGAK_GIT_BIN ? env.DDALGGAK_GIT_BIN : "git",
    timeoutMs: Number.parseInt(
      testMode && env.DDALGGAK_UPDATE_TIMEOUT_MS
        ? env.DDALGGAK_UPDATE_TIMEOUT_MS
        : "8000",
      10,
    ),
    lockWaitMs: Number.parseInt(
      testMode && env.DDALGGAK_UPDATE_LOCK_WAIT_MS
        ? env.DDALGGAK_UPDATE_LOCK_WAIT_MS
        : "60000",
      10,
    ),
    testMode,
    env,
  };
}

function run(config, command, args, options = {}) {
  const childEnv = { ...process.env, ...config.env, ...(options.env || {}) };
  if (command === config.gitBin) {
    for (const key of Object.keys(childEnv)) {
      if (key.startsWith("GIT_")) delete childEnv[key];
    }
    Object.assign(childEnv, {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: devNull,
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "core.hooksPath",
      GIT_CONFIG_VALUE_0: devNull,
      GIT_TERMINAL_PROMPT: "0",
    });
    if (!config.testMode) childEnv.GIT_ALLOW_PROTOCOL = "https";
  }
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: childEnv,
    encoding: options.binary ? null : "utf8",
    maxBuffer: options.maxBuffer || 1024 * 1024,
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs || config.timeoutMs,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed with exit ${result.status}${
        detail ? `: ${detail}` : ""
      }`,
    );
  }
  return result;
}

export function parseRemoteSha(stdout) {
  const first = String(stdout || "").trim().split(/\s+/)[0] || "";
  if (!/^[0-9a-f]{40}$/i.test(first)) {
    throw new Error("GitHub master lookup did not return an exact 40-character commit SHA");
  }
  return first.toLowerCase();
}

function lookupRemoteSha(config) {
  const result = run(config, config.gitBin, [
    "ls-remote",
    "--exit-code",
    config.remote,
    config.ref,
  ]);
  return parseRemoteSha(result.stdout);
}

export async function fetchIpgaelPolicy({ env = process.env, cacheRoot, previousPolicy } = {}) {
  const config = resolveUpdateConfig({ env, packageRoot: process.cwd() });
  if (cacheRoot) config.cacheRoot = cacheRoot;
  const remote = config.testMode && env.DDALGGAK_IPGAEL_REMOTE
    ? env.DDALGGAK_IPGAEL_REMOTE
    : "https://github.com/JeremyDev87/ipgael.git";
  const sha = parseRemoteSha(run(config, config.gitBin, [
    "ls-remote", "--exit-code", remote, "refs/heads/main",
  ]).stdout);
  if (previousPolicy?.sha === sha) {
    return validateIpgaelPolicy(sha, Buffer.from(previousPolicy.text, "utf8"));
  }
  await mkdir(config.cacheRoot, { recursive: true });
  const staging = await mkdtemp(join(config.cacheRoot, ".ipgael-fetch-"));
  try {
    run(config, config.gitBin, ["init", "--quiet"], { cwd: staging });
    run(config, config.gitBin, ["fetch", "--quiet", "--depth", "1", remote, sha], { cwd: staging });
    const head = run(config, config.gitBin, ["rev-parse", "FETCH_HEAD"], { cwd: staging }).stdout.trim();
    if (head !== sha) throw new Error("ipgael fetched SHA mismatch");
    const entry = run(config, config.gitBin, ["ls-tree", sha, "--", "policy.md"], { cwd: staging }).stdout;
    if (!/^100644 blob [a-f0-9]{40}\tpolicy\.md\n$/.test(entry)) {
      throw new Error("ipgael policy.md must be a regular file");
    }
    const bytes = run(config, config.gitBin, ["show", `${sha}:policy.md`], {
      cwd: staging, binary: true, maxBuffer: 64 * 1024,
    }).stdout;
    return validateIpgaelPolicy(sha, bytes);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function validPolicyPayload(root, paths, texts, policy, sourceRoot) {
  try {
    for (const [index, rel] of paths.entries()) {
      if (await readFile(join(root, rel), "utf8") !== renderIpgaelPolicy(texts[index], policy)) return false;
    }
    for (const rel of ["ddalggak", ".codex/skills/ddalggak"]) {
      const source = join(sourceRoot, rel);
      const target = join(root, rel);
      const files = await listPayloadFiles(source);
      if (JSON.stringify(files) !== JSON.stringify(await listPayloadFiles(target))) return false;
      const unchanged = files.filter((file) => file !== "SKILL.md");
      if ((await payloadChecksum(source, unchanged)).sha256 !== (await payloadChecksum(target, unchanged)).sha256) return false;
    }
    return await readFile(join(root, "package.json"), "utf8") === await readFile(join(sourceRoot, "package.json"), "utf8");
  } catch {
    return false;
  }
}

async function refreshIpgaelPolicy(config, sha) {
  const sourcePaths = ["ddalggak/SKILL.md", ".codex/skills/ddalggak/SKILL.md"];
  const sourceTexts = await Promise.all(sourcePaths.map((rel) => readFile(join(config.packageRoot, rel), "utf8")));
  if (sourceTexts.some((text) => !readIpgaelPolicy(text))) return;
  const releaseLock = await acquireLock(config);
  let staging = null;
  let sync = null;
  try {
    if (await readActiveSha(config) !== sha) return;
    const lastGoodPath = join(config.cacheRoot, "ipgael-policy.json");
    let previousPolicy = null;
    try {
      const saved = JSON.parse(await readFile(lastGoodPath, "utf8"));
      previousPolicy = validateIpgaelPolicy(saved.sha, Buffer.from(saved.text, "utf8"));
    } catch {}
    let policy;
    let fetched = false;
    try {
      policy = await fetchIpgaelPolicy({ env: config.env, cacheRoot: config.cacheRoot, previousPolicy });
      fetched = previousPolicy?.sha !== policy.sha;
    } catch (error) {
      process.stderr.write(`ddalggak ipgael warning: ${sanitizeError(errorMessage(error))}; retaining last good policy.\n`);
      policy = previousPolicy || readIpgaelPolicy(sourceTexts[0]);
    }
    let verifiedRoot = null;
    if (previousPolicy) {
      const previousRoot = join(config.cacheRoot, "payloads", `${sha}-${previousPolicy.sha}`);
      if (await validPolicyPayload(previousRoot, sourcePaths, sourceTexts, previousPolicy, config.packageRoot)) {
        verifiedRoot = previousRoot;
        runtimePayloadRoot = previousRoot;
        runtimePolicySha = previousPolicy.sha;
      }
    }
    const current = join(config.cacheRoot, "payloads", `${sha}-${policy.sha}`);
    if (current !== verifiedRoot && !(await validPolicyPayload(current, sourcePaths, sourceTexts, policy, config.packageRoot))) {
      await rm(current, { recursive: true, force: true });
      await mkdir(join(config.cacheRoot, "payloads"), { recursive: true });
      staging = await mkdtemp(join(config.cacheRoot, ".ipgael-payload-"));
      for (const rel of ["package.json", "ddalggak", ".codex/skills/ddalggak"]) {
        await cp(join(config.packageRoot, rel), join(staging, rel), { recursive: true });
      }
      for (const [index, rel] of sourcePaths.entries()) {
        await writeFile(join(staging, rel), renderIpgaelPolicy(sourceTexts[index], policy), "utf8");
      }
      await rename(staging, current);
      staging = null;
    }
    sync = await syncExistingRuntimeSkills(config, current);
    if (fetched) {
      const temp = `${lastGoodPath}.tmp-${process.pid}`;
      await writeFile(temp, JSON.stringify(policy), "utf8");
      await rename(temp, lastGoodPath);
    }
    runtimePayloadRoot = current;
    runtimePolicySha = policy.sha;
    await sync.finalize();
    sync = null;
  } finally {
    if (sync) await sync.rollback();
    if (staging) await rm(staging, { recursive: true, force: true });
    await releaseLock();
  }
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function readText(path) {
  try {
    return (await readFile(path, "utf8")).trim();
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeState(config, patch) {
  await mkdir(config.cacheRoot, { recursive: true });
  const statePath = join(config.cacheRoot, STATE_FILE);
  let previous = {};
  try {
    previous = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (!(error && error.code === "ENOENT")) previous = {};
  }
  const next = {
    ...previous,
    ...patch,
    checkedAt: new Date().toISOString(),
    remote: config.remote === UPDATE_REMOTE ? UPDATE_REMOTE : "test-override",
    ref: config.ref,
  };
  const temp = `${statePath}.tmp-${process.pid}-${randomBytes(3).toString("hex")}`;
  await writeFile(temp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await rename(temp, statePath);
}

async function safeWriteState(config, patch) {
  try {
    await writeState(config, patch);
  } catch {
    // Diagnostics must never make an otherwise usable CLI unavailable.
  }
}

function versionPath(config, sha) {
  return join(config.cacheRoot, "versions", sha);
}

async function writeActiveSha(config, sha) {
  await mkdir(config.cacheRoot, { recursive: true });
  const activePath = join(config.cacheRoot, ACTIVE_FILE);
  const temp = `${activePath}.tmp-${process.pid}-${randomBytes(3).toString("hex")}`;
  await writeFile(temp, `${JSON.stringify({ sha })}\n`, "utf8");
  await rename(temp, activePath);
}

async function readActiveSha(config) {
  let sha = null;
  try {
    const active = JSON.parse(
      await readFile(join(config.cacheRoot, ACTIVE_FILE), "utf8"),
    );
    sha = typeof active.sha === "string" ? active.sha.toLowerCase() : null;
  } catch {
    return null;
  }
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) return null;
  return (await isValidCurrent(config, versionPath(config, sha), sha)) ? sha : null;
}

async function validateCheckout(config, checkout, expectedSha) {
  for (const relPath of REQUIRED_PATHS) {
    if (!(await pathExists(join(checkout, relPath)))) {
      throw new Error(`downloaded payload is missing required path: ${relPath}`);
    }
  }
  const pkg = JSON.parse(await readFile(join(checkout, "package.json"), "utf8"));
  if (pkg.name !== "@jeremyfellaz/ddalggak") {
    throw new Error(`downloaded package identity mismatch: ${String(pkg.name)}`);
  }
  if (pkg.bin?.ddalggak !== "./bin/ddalggak.js") {
    throw new Error("downloaded package bin.ddalggak contract mismatch");
  }
  const head = run(config, config.gitBin, ["rev-parse", "HEAD"], {
    cwd: checkout,
  }).stdout.trim();
  if (head !== expectedSha) {
    throw new Error(`downloaded checkout SHA mismatch: expected ${expectedSha}, got ${head}`);
  }
  for (const relPath of [
    "bin/ddalggak.js",
    "bin/lib/auto-update.mjs",
    "bin/lib/cli-main.mjs",
  ]) {
    run(config, process.execPath, ["--check", join(checkout, relPath)]);
  }
  run(config, process.execPath, [join(checkout, "bin", "ddalggak.js"), "--no-update", "--help"], {
    cwd: checkout,
  });
}

async function materializeExactCommit(config, sha, staging) {
  await mkdir(staging, { recursive: true });
  run(config, config.gitBin, ["init", "--quiet"], { cwd: staging });
  run(config, config.gitBin, ["remote", "add", "origin", config.remote], {
    cwd: staging,
  });
  run(config, config.gitBin, ["fetch", "--quiet", "--depth", "1", "origin", sha], {
    cwd: staging,
    timeoutMs: Math.max(config.timeoutMs, 30000),
  });
  run(config, config.gitBin, ["checkout", "--quiet", "--detach", "FETCH_HEAD"], {
    cwd: staging,
  });
  await validateCheckout(config, staging, sha);
}

async function acquireLock(config) {
  const lockPath = join(config.cacheRoot, LOCK_DIR);
  const deadline = Date.now() + config.lockWaitMs;
  await mkdir(config.cacheRoot, { recursive: true });
  while (true) {
    try {
      await mkdir(lockPath);
      await writeFile(join(lockPath, "owner"), `${process.pid}\n`, "utf8");
      return async () => rm(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (!(error && error.code === "EEXIST")) throw error;
      try {
        const owner = await readText(join(lockPath, "owner"));
        const ownerPid = Number.parseInt(owner || "", 10);
        if (Number.isInteger(ownerPid) && ownerPid > 0) {
          let ownerAlive = true;
          try {
            process.kill(ownerPid, 0);
          } catch (ownerError) {
            ownerAlive = !(ownerError && ownerError.code === "ESRCH");
          }
          if (!ownerAlive) {
            await rm(lockPath, { recursive: true, force: true });
            continue;
          }
        } else {
          const lockStat = await stat(lockPath);
          if (Date.now() - lockStat.mtimeMs > 30000) {
            await rm(lockPath, { recursive: true, force: true });
            continue;
          }
        }
      } catch (lockError) {
        if (lockError && lockError.code === "ENOENT") continue;
      }
      if (Date.now() >= deadline) {
        throw new Error("timed out waiting for another ddalggak updater process");
      }
      await sleep(50);
    }
  }
}

async function isValidCurrent(config, current, expectedSha = null) {
  const sha = await readText(join(current, SOURCE_SHA_FILE));
  if (!sha || (expectedSha && sha !== expectedSha)) return null;
  try {
    await validateCheckout(config, current, sha);
    return sha;
  } catch {
    return null;
  }
}

async function syncExistingRuntimeSkills(config, current) {
  const { installSkillPayload } = await import("./setup/install-transaction.mjs");
  const version = JSON.parse(
    await readFile(join(current, "package.json"), "utf8"),
  ).version;
  const candidates = [
    {
      runtime: "claude",
      sourceRoot: join(current, "ddalggak"),
      dstDir: join(
        config.env.CLAUDE_HOME || join(homedir(), ".claude"),
        "skills",
        "ddalggak",
      ),
    },
    {
      runtime: "codex",
      sourceRoot: join(current, ".codex", "skills", "ddalggak"),
      dstDir: join(
        config.env.CODEX_HOME || join(homedir(), ".codex"),
        "skills",
        "ddalggak",
      ),
    },
  ];
  const swaps = [];
  try {
    for (const candidate of candidates) {
      if (!(await pathExists(candidate.dstDir))) continue;
      if (
        config.testMode &&
        config.env.DDALGGAK_UPDATE_TEST_FAIL_RUNTIME_SYNC === candidate.runtime
      ) {
        throw new Error(`injected ${candidate.runtime} runtime sync failure`);
      }
      let backup = null;
      await installSkillPayload({
        sourceRoot: candidate.sourceRoot,
        dstDir: candidate.dstDir,
        version,
        force: false,
        noBackup: false,
        out: (message) => {
          const prefix = "Backed up existing install → ";
          if (message.startsWith(prefix)) backup = message.slice(prefix.length);
        },
      });
      swaps.push({ ...candidate, backup });
    }
  } catch (error) {
    for (const swap of swaps.reverse()) {
      if (!swap.backup) continue;
      await rm(swap.dstDir, { recursive: true, force: true });
      await rename(swap.backup, swap.dstDir);
    }
    throw error;
  }
  return {
    syncedRuntimes: swaps.map((swap) => swap.runtime),
    async finalize() {
      for (const swap of swaps) {
        if (swap.backup) {
          await rm(swap.backup, { recursive: true, force: true }).catch(() => {});
        }
      }
    },
    async rollback() {
      for (const swap of [...swaps].reverse()) {
        if (!swap.backup) continue;
        await rm(swap.dstDir, { recursive: true, force: true });
        await rename(swap.backup, swap.dstDir);
      }
    },
  };
}

function reexec(config, current, sha, argv) {
  if (config.testMode && truthy(config.env.DDALGGAK_UPDATE_TEST_FAIL_REEXEC)) {
    throw new Error("injected cached launcher spawn failure");
  }
  const cli = join(current, "bin", "ddalggak.js");
  const result = spawnSync(process.execPath, [cli, ...argv], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...config.env,
      DDALGGAK_REEXEC_SHA: sha,
      DDALGGAK_UPDATE_ACTIVE_ROOT: current,
    },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return typeof result.status === "number" ? result.status : 1;
}

async function reexecOrFallback(config, current, sha, argv) {
  try {
    return {
      args: argv,
      handled: true,
      code: reexec(config, current, sha, argv),
    };
  } catch (error) {
    await safeWriteState(config, {
      status: "cached-launcher-failed-local-fallback",
      error: sanitizeError(errorMessage(error)),
      activeSha: sha,
    });
    process.stderr.write(
      `ddalggak update warning: cached launcher failed; using installed version.\n`,
    );
    return { args: argv, handled: false, reason: "cached-launcher-failed" };
  }
}

export async function readAutoUpdateStatus({ env = process.env } = {}) {
  const config = resolveUpdateConfig({ env, packageRoot: process.cwd() });
  let state = null;
  try {
    state = JSON.parse(await readFile(join(config.cacheRoot, STATE_FILE), "utf8"));
  } catch {
    state = null;
  }
  return {
    enabled: !truthy(env.DDALGGAK_NO_UPDATE),
    ipgaelSha: runtimePolicySha,
    cacheRoot: config.cacheRoot,
    activeSha: await readActiveSha(config),
    lastStatus: state?.status || "never-checked",
    lastCheckedAt: state?.checkedAt || null,
    lastError: state?.error || null,
    source: `${UPDATE_REMOTE}#master`,
  };
}

export async function maybeAutoUpdate({ argv, packageRoot, env = process.env }) {
  const stripped = stripNoUpdateFlag(argv);
  const config = resolveUpdateConfig({ env, packageRoot });
  const sourceCheckout = existsSync(join(config.packageRoot, ".git"));
  const guardedSha = /^[0-9a-f]{40}$/i.test(env.DDALGGAK_REEXEC_SHA || "")
    ? env.DDALGGAK_REEXEC_SHA.toLowerCase()
    : null;
  const packageSha = guardedSha
    ? await readText(join(config.packageRoot, SOURCE_SHA_FILE))
    : null;
  const validReexecGuard = Boolean(
    guardedSha &&
      packageSha === guardedSha &&
      env.DDALGGAK_UPDATE_ACTIVE_ROOT &&
      canonicalPath(env.DDALGGAK_UPDATE_ACTIVE_ROOT) === canonicalPath(config.packageRoot),
  );
  if (
    stripped.optedOut ||
    truthy(env.DDALGGAK_NO_UPDATE) ||
    (sourceCheckout && !config.testMode && !validReexecGuard)
  ) {
    return { args: stripped.args, handled: false, reason: "skipped" };
  }

  if (validReexecGuard) {
    try {
      await refreshIpgaelPolicy(config, guardedSha);
    } catch (error) {
      process.stderr.write(`ddalggak ipgael warning: ${sanitizeError(errorMessage(error))}; retaining installed payload.\n`);
    }
    return { args: stripped.args, handled: false, reason: "cached" };
  }

  let remoteSha;
  try {
    remoteSha = lookupRemoteSha(config);
  } catch (error) {
    const fallbackSha = await readActiveSha(config);
    await safeWriteState(config, {
      status: fallbackSha ? "offline-cache-fallback" : "offline-local-fallback",
      error: sanitizeError(errorMessage(error)),
      activeSha: fallbackSha,
    });
    process.stderr.write(
      `ddalggak update warning: GitHub master unavailable; using ${
        fallbackSha ? "cached" : "installed"
      } version.\n`,
    );
    if (fallbackSha) {
      return reexecOrFallback(
        config,
        versionPath(config, fallbackSha),
        fallbackSha,
        stripped.args,
      );
    }
    return { args: stripped.args, handled: false, reason: "offline" };
  }

  let activeSha = await readActiveSha(config);
  if (activeSha !== remoteSha) {
    let releaseLock;
    let staging = null;
    let candidate = null;
    let candidateCreated = false;
    let runtimeSync = null;
    try {
      releaseLock = await acquireLock(config);
      activeSha = await readActiveSha(config);
      if (activeSha !== remoteSha) {
        candidate = versionPath(config, remoteSha);
        if (!(await isValidCurrent(config, candidate, remoteSha))) {
          if (await pathExists(candidate)) {
            await rm(candidate, { recursive: true, force: true });
          }
          staging = join(
            config.cacheRoot,
            `.staging-${process.pid}-${randomBytes(3).toString("hex")}`,
          );
          await materializeExactCommit(config, remoteSha, staging);
          await writeFile(join(staging, SOURCE_SHA_FILE), `${remoteSha}\n`, "utf8");
          await mkdir(join(config.cacheRoot, "versions"), { recursive: true });
          await rename(staging, candidate);
          staging = null;
          candidateCreated = true;
        }
        if (
          config.testMode &&
          truthy(config.env.DDALGGAK_UPDATE_TEST_FAIL_AFTER_BACKUP)
        ) {
          throw new Error("injected failure before immutable version activation");
        }
        runtimeSync = await syncExistingRuntimeSkills(config, candidate);
        await writeActiveSha(config, remoteSha);
        activeSha = remoteSha;
        candidateCreated = false;
        await runtimeSync.finalize();
        const syncedRuntimes = runtimeSync.syncedRuntimes;
        runtimeSync = null;
        await safeWriteState(config, {
          status: "updated",
          error: null,
          activeSha,
          syncedRuntimes,
        });
        process.stderr.write(
          `ddalggak updated to GitHub master ${activeSha.slice(0, 12)}.\n`,
        );
      }
    } catch (error) {
      if (runtimeSync) await runtimeSync.rollback();
      if (staging) await rm(staging, { recursive: true, force: true });
      if (candidateCreated && candidate) {
        await rm(candidate, { recursive: true, force: true });
      }
      const fallbackSha = await readActiveSha(config);
      await safeWriteState(config, {
        status: fallbackSha ? "update-failed-cache-fallback" : "update-failed-local-fallback",
        error: sanitizeError(errorMessage(error)),
        activeSha: fallbackSha,
      });
      process.stderr.write(
        `ddalggak update warning: ${sanitizeError(errorMessage(error))}; using ${
          fallbackSha ? "cached" : "installed"
        } version.\n`,
      );
      activeSha = fallbackSha;
    } finally {
      if (releaseLock) await releaseLock();
    }
  } else {
    await safeWriteState(config, {
      status: "current",
      error: null,
      activeSha,
    });
  }

  if (activeSha) {
    return reexecOrFallback(
      config,
      versionPath(config, activeSha),
      activeSha,
      stripped.args,
    );
  }
  return { args: stripped.args, handled: false, reason: "no-valid-update" };
}
