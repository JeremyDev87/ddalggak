import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { stripNoUpdateFlag } from "../bin/lib/auto-update.mjs";
import { assert, rootDir } from "./test-lib/cli-fixtures.mjs";

const cliPath = path.join(rootDir, "bin", "ddalggak.js");
const roots = [];

function temp(prefix) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

process.on("exit", () => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  return result;
}

function git(repo, args) {
  const result = command("git", args, { cwd: repo });
  assert(
    result.status === 0,
    `git ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}

function writeVersion(repo, version) {
  const packagePath = path.join(repo, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  pkg.version = version;
  writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

function addContextEcho(repo) {
  const target = path.join(repo, "bin", "lib", "cli-main.mjs");
  const body = readFileSync(target, "utf8");
  const anchor = "export async function runCli(argv = process.argv.slice(2)) {\n";
  assert(body.includes(anchor), "fixture CLI context echo anchor missing");
  writeFileSync(
    target,
    body.replace(
      anchor,
      `${anchor}\n  if (process.env.DDALGGAK_ECHO_CONTEXT === "1") {\n    process.stdout.write(JSON.stringify({ argv, cwd: process.cwd(), sentinel: process.env.DDALGGAK_TEST_SENTINEL, reexecSha: process.env.DDALGGAK_REEXEC_SHA }) + "\\n");\n    return 0;\n  }\n`,
    ),
    "utf8",
  );
}

function addBootstrapPause(repo) {
  const target = path.join(repo, "bin", "ddalggak.js");
  const body = readFileSync(target, "utf8");
  const anchor = "  if (update.handled) return update.code;\n\n";
  assert(body.includes(anchor), "fixture bootstrap pause anchor missing");
  writeFileSync(
    target,
    body.replace(
      anchor,
      `${anchor}  if (process.env.DDALGGAK_REEXEC_SHA && process.env.DDALGGAK_TEST_PAUSE_READY) {\n    const { existsSync, writeFileSync } = await import("node:fs");\n    writeFileSync(process.env.DDALGGAK_TEST_PAUSE_READY, "ready\\n");\n    while (!existsSync(process.env.DDALGGAK_TEST_PAUSE_RELEASE)) {\n      await new Promise((resolvePause) => setTimeout(resolvePause, 10));\n    }\n  }\n\n`,
    ),
    "utf8",
  );
}

function createRemote({
  version = "0.1.0-test-a",
  contextEcho = false,
  bootstrapPause = false,
} = {}) {
  const root = temp("ddalggak-update-remote-");
  const repo = path.join(root, "repo");
  cpSync(rootDir, repo, {
    recursive: true,
    filter: (source) => {
      const rel = path.relative(rootDir, source).replaceAll("\\", "/");
      return !(
        rel === ".git" ||
        rel.startsWith(".git/") ||
        rel === "node_modules" ||
        rel.startsWith("node_modules/")
      );
    },
  });
  writeVersion(repo, version);
  if (contextEcho) addContextEcho(repo);
  if (bootstrapPause) addBootstrapPause(repo);
  git(repo, ["init", "--quiet", "--initial-branch=master"]);
  git(repo, ["config", "user.email", "fixture@example.invalid"]);
  git(repo, ["config", "user.name", "ddalggak fixture"]);
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "--quiet", "-m", `fixture ${version}`]);
  return { root, repo, sha: git(repo, ["rev-parse", "HEAD"]) };
}

function advanceRemote(remote, version, { skillMarker = null, corrupt = false } = {}) {
  writeVersion(remote.repo, version);
  if (skillMarker) {
    for (const relPath of [
      "ddalggak/SKILL.md",
      ".codex/skills/ddalggak/SKILL.md",
    ]) {
      const target = path.join(remote.repo, relPath);
      writeFileSync(
        target,
        `${readFileSync(target, "utf8")}\n<!-- ${skillMarker} -->\n`,
        "utf8",
      );
    }
  }
  if (corrupt) rmSync(path.join(remote.repo, "bin", "ddalggak.js"), { force: true });
  git(remote.repo, ["add", "-A"]);
  git(remote.repo, ["commit", "--quiet", "-m", `fixture ${version}`]);
  remote.sha = git(remote.repo, ["rev-parse", "HEAD"]);
  return remote.sha;
}

function fixtureEnv(remote, extra = {}) {
  const home = extra.HOME || temp("ddalggak-update-home-");
  const cache = extra.DDALGGAK_UPDATE_CACHE_DIR || path.join(home, "cache");
  return {
    HOME: home,
    CLAUDE_HOME: extra.CLAUDE_HOME || path.join(home, ".claude"),
    CODEX_HOME: extra.CODEX_HOME || path.join(home, ".codex"),
    DDALGGAK_UPDATE_TEST_MODE: "1",
    DDALGGAK_NO_UPDATE: "0",
    DDALGGAK_UPDATE_REMOTE: remote.repo,
    DDALGGAK_UPDATE_REF: "refs/heads/master",
    DDALGGAK_UPDATE_CACHE_DIR: cache,
    DDALGGAK_UPDATE_TIMEOUT_MS: "30000",
    DDALGGAK_UPDATE_LOCK_WAIT_MS: "30000",
    ...extra,
  };
}

function runUpdateCli(remote, args, extra = {}) {
  const env = fixtureEnv(remote, extra.env || {});
  const result = command(process.execPath, [extra.cliPath || cliPath, ...args], {
    cwd: extra.cwd || rootDir,
    env,
  });
  return { ...result, env };
}

function assertExit(result, expected, label) {
  assert(
    result.status === expected,
    `${label}: expected exit ${expected}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

function activeSha(cacheRoot) {
  return JSON.parse(
    readFileSync(path.join(cacheRoot, "active.json"), "utf8"),
  ).sha;
}

function state(cacheRoot) {
  return JSON.parse(readFileSync(path.join(cacheRoot, "state.json"), "utf8"));
}

function runParallel(count, remote, env) {
  return Promise.all(
    Array.from({ length: count }, () =>
      new Promise((resolvePromise, reject) => {
        const child = spawn(process.execPath, [cliPath, "--version"], {
          cwd: rootDir,
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => (stdout += chunk));
        child.stderr.on("data", (chunk) => (stderr += chunk));
        child.on("error", reject);
        child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
      }),
    ),
  );
}

function spawnVersion(env) {
  const child = spawn(process.execPath, [cliPath, "--version"], {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  const done = new Promise((resolvePromise, reject) => {
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
  return { child, done };
}

async function waitForPath(target, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (!existsSync(target)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${target}`);
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
}

export const cases = [
  {
    name: "auto-update opt-out parser strips only pre-passthrough --no-update",
    run() {
      const parsed = stripNoUpdateFlag(["plan", "--no-update", "--", "--no-update"]);
      assert(parsed.optedOut === true, "expected opt-out detection");
      assert(
        JSON.stringify(parsed.args) === JSON.stringify(["plan", "--", "--no-update"]),
        `unexpected stripped argv: ${JSON.stringify(parsed.args)}`,
      );
    },
  },
  {
    name: "updater ignores inherited Git URL rewrites and hook configuration",
    run() {
      const remote = createRemote();
      const globalConfig = path.join(temp("ddalggak-git-config-"), "config");
      writeFileSync(
        globalConfig,
        `[url "${path.join(remote.root, "malicious-missing")}"]\n\tinsteadOf = ${remote.repo}\n[core]\n\thooksPath = ${path.join(remote.root, "malicious-hooks")}\n`,
        "utf8",
      );
      const maliciousRemote = path.join(remote.root, "malicious-missing");
      const result = runUpdateCli(remote, ["--version"], {
        env: {
          GIT_CONFIG_GLOBAL: globalConfig,
          GIT_CONFIG_PARAMETERS: `'url.${maliciousRemote}.insteadof'='${remote.repo}'`,
        },
      });
      assertExit(result, 0, "Git config isolation");
      assert(result.stdout.trim() === "0.1.0-test-a", "Git URL rewrite changed updater source");
    },
  },
  {
    name: "same SHA is a no-op and new SHA refreshes cache plus installed Claude/Codex skills",
    run() {
      const remote = createRemote();
      const home = temp("ddalggak-update-sync-home-");
      const claudeHome = path.join(home, ".claude");
      const codexHome = path.join(home, ".codex");
      for (const target of [
        path.join(claudeHome, "skills", "ddalggak"),
        path.join(codexHome, "skills", "ddalggak"),
      ]) {
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, "SKILL.md"), "old\n", "utf8");
      }
      const env = fixtureEnv(remote, { HOME: home, CLAUDE_HOME: claudeHome, CODEX_HOME: codexHome });
      const first = command(process.execPath, [cliPath, "--version"], { cwd: rootDir, env });
      assertExit(first, 0, "initial update");
      assert(first.stdout.trim() === "0.1.0-test-a", `unexpected first version: ${first.stdout}`);
      assert(activeSha(env.DDALGGAK_UPDATE_CACHE_DIR) === remote.sha, "expected initial active SHA");

      const second = command(process.execPath, [cliPath, "--version"], { cwd: rootDir, env });
      assertExit(second, 0, "same SHA");
      assert(second.stdout.trim() === "0.1.0-test-a", "same SHA should keep version A");
      assert(state(env.DDALGGAK_UPDATE_CACHE_DIR).status === "current", "same SHA should report current");
      assert(
        !readdirSync(env.DDALGGAK_UPDATE_CACHE_DIR).some((name) => name.startsWith(".staging-")),
        "same SHA should not leave staging directories",
      );

      advanceRemote(remote, "0.1.0-test-b", { skillMarker: "AUTO_UPDATE_B" });
      const third = command(process.execPath, [cliPath, "--version"], { cwd: rootDir, env });
      assertExit(third, 0, "new SHA");
      assert(third.stdout.trim() === "0.1.0-test-b", `unexpected updated version: ${third.stdout}`);
      assert(activeSha(env.DDALGGAK_UPDATE_CACHE_DIR) === remote.sha, "expected new active SHA");
      const statusResult = command(
        process.execPath,
        [cliPath, "status", "--local", "--json"],
        { cwd: rootDir, env },
      );
      assertExit(statusResult, 0, "auto-update status evidence");
      const statusJson = JSON.parse(statusResult.stdout);
      assert(
        statusJson.autoUpdate.activeSha === remote.sha &&
          statusJson.autoUpdate.source.endsWith("#master"),
        `missing auto-update status evidence: ${statusResult.stdout}`,
      );
      for (const target of [
        path.join(claudeHome, "skills", "ddalggak", "SKILL.md"),
        path.join(codexHome, "skills", "ddalggak", "SKILL.md"),
      ]) {
        assert(readFileSync(target, "utf8").includes("AUTO_UPDATE_B"), `missing synced marker in ${target}`);
      }
    },
  },
  {
    name: "offline lookup falls back to the last validated cache",
    run() {
      const remote = createRemote();
      const first = runUpdateCli(remote, ["--version"]);
      assertExit(first, 0, "offline seed");
      const offlinePath = `${remote.repo}-offline`;
      renameSync(remote.repo, offlinePath);
      const fallback = command(process.execPath, [cliPath, "--version"], {
        cwd: rootDir,
        env: first.env,
      });
      assertExit(fallback, 0, "offline fallback");
      assert(fallback.stdout.trim() === "0.1.0-test-a", "offline fallback should run cached version A");
      assert(fallback.stderr.includes("GitHub master unavailable"), "expected offline warning");
      assert(state(first.env.DDALGGAK_UPDATE_CACHE_DIR).status === "offline-cache-fallback", "expected offline cache state");
    },
  },
  {
    name: "corrupt new SHA is rejected and the prior cache remains active",
    run() {
      const remote = createRemote();
      const first = runUpdateCli(remote, ["--version"]);
      assertExit(first, 0, "corrupt seed");
      const previousSha = remote.sha;
      advanceRemote(remote, "0.1.0-test-corrupt", { corrupt: true });
      const fallback = command(process.execPath, [cliPath, "--version"], {
        cwd: rootDir,
        env: first.env,
      });
      assertExit(fallback, 0, "corrupt fallback");
      assert(fallback.stdout.trim() === "0.1.0-test-a", "corrupt update should retain version A");
      assert(activeSha(first.env.DDALGGAK_UPDATE_CACHE_DIR) === previousSha, "corrupt update replaced active SHA");
      assert(fallback.stderr.includes("missing required path"), "expected corrupt payload evidence");
    },
  },
  {
    name: "activation failure restores the previous cache atomically",
    run() {
      const remote = createRemote();
      const first = runUpdateCli(remote, ["--version"]);
      assertExit(first, 0, "rollback seed");
      const previousSha = remote.sha;
      advanceRemote(remote, "0.1.0-test-b");
      const rollback = command(process.execPath, [cliPath, "--version"], {
        cwd: rootDir,
        env: {
          ...first.env,
          DDALGGAK_UPDATE_TEST_FAIL_AFTER_BACKUP: "1",
        },
      });
      assertExit(rollback, 0, "rollback fallback");
      assert(rollback.stdout.trim() === "0.1.0-test-a", "rollback should execute version A");
      assert(activeSha(first.env.DDALGGAK_UPDATE_CACHE_DIR) === previousSha, "rollback did not restore previous SHA");
      assert(rollback.stderr.includes("injected failure before immutable version activation"), "expected rollback failure evidence");
    },
  },
  {
    name: "runtime skill sync failure rolls back cache and every earlier runtime swap",
    run() {
      const remote = createRemote();
      const home = temp("ddalggak-runtime-rollback-");
      const claudeHome = path.join(home, ".claude");
      const codexHome = path.join(home, ".codex");
      const targets = [
        path.join(claudeHome, "skills", "ddalggak"),
        path.join(codexHome, "skills", "ddalggak"),
      ];
      for (const target of targets) {
        mkdirSync(target, { recursive: true });
        writeFileSync(path.join(target, "SKILL.md"), "bootstrap-old\n", "utf8");
      }
      const env = fixtureEnv(remote, {
        HOME: home,
        CLAUDE_HOME: claudeHome,
        CODEX_HOME: codexHome,
      });
      const seed = command(process.execPath, [cliPath, "--version"], {
        cwd: rootDir,
        env,
      });
      assertExit(seed, 0, "runtime rollback seed");
      const previousSha = remote.sha;
      const before = targets.map((target) =>
        readFileSync(path.join(target, "SKILL.md"), "utf8"),
      );
      advanceRemote(remote, "0.1.0-test-b", { skillMarker: "SHOULD_ROLL_BACK" });
      const failed = command(process.execPath, [cliPath, "--version"], {
        cwd: rootDir,
        env: {
          ...env,
          DDALGGAK_UPDATE_TEST_FAIL_RUNTIME_SYNC: "codex",
        },
      });
      assertExit(failed, 0, "runtime sync rollback fallback");
      assert(failed.stdout.trim() === "0.1.0-test-a", "runtime failure should execute version A");
      assert(activeSha(env.DDALGGAK_UPDATE_CACHE_DIR) === previousSha, "runtime failure did not restore cache A");
      for (const [index, target] of targets.entries()) {
        assert(
          readFileSync(path.join(target, "SKILL.md"), "utf8") === before[index],
          `runtime target was not rolled back: ${target}`,
        );
      }
    },
  },
  {
    name: "invalid re-exec guard cannot suppress the remote check",
    run() {
      const remote = createRemote();
      const home = temp("ddalggak-invalid-guard-");
      const cache = path.join(home, "cache");
      const result = runUpdateCli(remote, ["--version"], {
        env: {
          HOME: home,
          DDALGGAK_UPDATE_CACHE_DIR: cache,
          DDALGGAK_UPDATE_REMOTE: path.join(remote.root, "missing"),
          DDALGGAK_REEXEC_SHA: "a".repeat(40),
          DDALGGAK_UPDATE_ACTIVE_ROOT: rootDir,
        },
      });
      assertExit(result, 0, "invalid re-exec guard fallback");
      assert(
        state(cache).status === "offline-local-fallback",
        "invalid re-exec guard incorrectly skipped the update lookup",
      );
    },
  },
  {
    name: "cached launcher spawn failure falls back to the installed CLI",
    run() {
      const remote = createRemote();
      const home = temp("ddalggak-reexec-fallback-");
      const cache = path.join(home, "cache");
      const failed = runUpdateCli(remote, ["--version"], {
        env: {
          HOME: home,
          DDALGGAK_UPDATE_CACHE_DIR: cache,
          DDALGGAK_UPDATE_TEST_FAIL_REEXEC: "1",
        },
      });
      assertExit(failed, 0, "cached launcher failure fallback");
      assert(failed.stdout.trim() === "0.1.0", "installed CLI did not handle fallback");
      assert(
        state(cache).status === "cached-launcher-failed-local-fallback",
        "cached launcher failure status missing",
      );
      const recovered = runUpdateCli(remote, ["--version"], {
        env: { HOME: home, DDALGGAK_UPDATE_CACHE_DIR: cache },
      });
      assertExit(recovered, 0, "cached launcher recovery");
      assert(recovered.stdout.trim() === "0.1.0-test-a", "valid cache did not recover");
    },
  },
  {
    name: "argv cwd and environment survive the single re-exec boundary",
    run() {
      const remote = createRemote({ contextEcho: true });
      const cwd = temp("ddalggak-update-cwd-");
      const result = runUpdateCli(remote, ["plan", "hello world", "한글", "--", "--no-update"], {
        cwd,
        env: {
          DDALGGAK_ECHO_CONTEXT: "1",
          DDALGGAK_TEST_SENTINEL: "preserved",
        },
      });
      assertExit(result, 0, "context preservation");
      const echoed = JSON.parse(result.stdout);
      assert(
        JSON.stringify(echoed.argv) ===
          JSON.stringify(["plan", "hello world", "한글", "--", "--no-update"]),
        `argv changed across re-exec: ${result.stdout}`,
      );
      assert(
        realpathSync(echoed.cwd) === realpathSync(cwd),
        `cwd changed across re-exec: ${echoed.cwd}`,
      );
      assert(echoed.sentinel === "preserved", "environment sentinel was not preserved");
      assert(echoed.reexecSha === remote.sha, "re-exec SHA marker missing");
    },
  },
  {
    name: "flag and environment opt-outs perform no network or cache write",
    run() {
      const remote = createRemote();
      const cache = path.join(temp("ddalggak-optout-"), "cache");
      const base = fixtureEnv(remote, {
        DDALGGAK_UPDATE_CACHE_DIR: cache,
        DDALGGAK_UPDATE_REMOTE: path.join(remote.root, "missing-remote"),
      });
      const flag = command(process.execPath, [cliPath, "--no-update", "--version"], {
        cwd: rootDir,
        env: base,
      });
      assertExit(flag, 0, "flag opt-out");
      assert(!existsSync(cache), "flag opt-out should not create update cache");
      assert(!flag.stderr.includes("update warning"), "flag opt-out unexpectedly attempted update");

      const envOpt = command(process.execPath, [cliPath, "--version"], {
        cwd: rootDir,
        env: { ...base, DDALGGAK_NO_UPDATE: "1" },
      });
      assertExit(envOpt, 0, "environment opt-out");
      assert(!existsSync(cache), "environment opt-out should not create update cache");
    },
  },
  {
    name: "an in-flight SHA A process remains pinned while SHA B activates",
    async run() {
      const remote = createRemote({ bootstrapPause: true });
      const home = temp("ddalggak-sha-race-");
      const cache = path.join(home, "cache");
      const ready = path.join(home, "a-ready");
      const release = path.join(home, "a-release");
      const env = fixtureEnv(remote, { HOME: home, DDALGGAK_UPDATE_CACHE_DIR: cache });
      const first = spawnVersion({
        ...env,
        DDALGGAK_TEST_PAUSE_READY: ready,
        DDALGGAK_TEST_PAUSE_RELEASE: release,
      });
      let second;
      try {
        await waitForPath(ready);
        const shaA = activeSha(cache);
        advanceRemote(remote, "0.1.0-test-b");
        second = command(process.execPath, [cliPath, "--version"], {
          cwd: rootDir,
          env,
        });
        assertExit(second, 0, "SHA B activation during SHA A execution");
        assert(second.stdout.trim() === "0.1.0-test-b", "second process did not execute SHA B");
        assert(
          existsSync(path.join(cache, "versions", shaA)) &&
            existsSync(path.join(cache, "versions", remote.sha)),
          "immutable SHA A/B version directories were not both retained",
        );
      } finally {
        writeFileSync(release, "release\n", "utf8");
      }
      const firstResult = await first.done;
      assertExit(firstResult, 0, "in-flight SHA A completion");
      assert(
        firstResult.stdout.trim() === "0.1.0-test-a",
        `in-flight process drifted away from SHA A: ${firstResult.stdout}`,
      );
      assert(activeSha(cache) === remote.sha, "SHA B was not left active");
    },
  },
  {
    name: "ten concurrent invocations converge on one valid cache without debris",
    async run() {
      const remote = createRemote();
      const env = fixtureEnv(remote);
      const results = await runParallel(10, remote, env);
      for (const [index, result] of results.entries()) {
        assertExit(result, 0, `concurrent invocation ${index}`);
        assert(result.stdout.trim() === "0.1.0-test-a", `concurrent ${index} got ${result.stdout}`);
      }
      assert(activeSha(env.DDALGGAK_UPDATE_CACHE_DIR) === remote.sha, "concurrent cache SHA mismatch");
      assert(
        !readdirSync(env.DDALGGAK_UPDATE_CACHE_DIR).some(
          (name) => name.startsWith(".staging-") || name.startsWith(".previous-") || name === ".update-lock",
        ),
        "concurrent update left lock/staging/previous debris",
      );
    },
  },
  {
    name: "packed installation follows a local master from SHA A to SHA B without reinstall",
    run() {
      const remote = createRemote();
      const packRoot = temp("ddalggak-pack-smoke-");
      const npmCache = path.join(packRoot, "npm-cache");
      const packed = command("npm", ["pack", "--json", "--ignore-scripts"], {
        cwd: rootDir,
        env: { npm_config_cache: npmCache },
      });
      assertExit(packed, 0, "npm pack");
      const tarballName = JSON.parse(packed.stdout)[0].filename;
      const project = path.join(packRoot, "project");
      mkdirSync(project, { recursive: true });
      writeFileSync(path.join(project, "package.json"), '{"private":true}\n', "utf8");
      const install = command(
        "npm",
        ["install", "--ignore-scripts", "--no-audit", "--no-fund", path.join(rootDir, tarballName)],
        { cwd: project, env: { npm_config_cache: npmCache } },
      );
      rmSync(path.join(rootDir, tarballName), { force: true });
      assertExit(install, 0, "packed install");
      const installedCli = path.join(
        project,
        "node_modules",
        "@jeremyfellaz",
        "ddalggak",
        "bin",
        "ddalggak.js",
      );
      const env = fixtureEnv(remote);
      const first = command(process.execPath, [installedCli, "--version"], { cwd: project, env });
      assertExit(first, 0, "packed SHA A");
      assert(first.stdout.trim() === "0.1.0-test-a", `packed A output: ${first.stdout}`);
      advanceRemote(remote, "0.1.0-test-b");
      const second = command(process.execPath, [installedCli, "--version"], { cwd: project, env });
      assertExit(second, 0, "packed SHA B");
      assert(second.stdout.trim() === "0.1.0-test-b", `packed B output: ${second.stdout}`);
      assert(activeSha(env.DDALGGAK_UPDATE_CACHE_DIR) === remote.sha, "packed install did not activate SHA B");
    },
  },
];
