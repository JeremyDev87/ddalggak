import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildSlashString, quoteIfNeeded } from "../../bin/lib/dispatch/slash.mjs";
import { executableCandidates, resolveExecutable } from "../../bin/lib/process/resolve-executable.mjs";
import { loadCommandContracts } from "../../bin/lib/command-contracts.mjs";
import { COMMAND_CONTRACT_UNKNOWN_KEY_POLICY, validateCommandContract } from "../lib/command-contract-schema.mjs";

export const rootDir = process.cwd();
export const cliPath = path.join(rootDir, "bin", "ddalggak.js");
export const pkg = JSON.parse(
  readFileSync(path.join(rootDir, "package.json"), "utf8"),
);
export const readme = readFileSync(path.join(rootDir, "README.md"), "utf8");
export const llmsIndex = readFileSync(path.join(rootDir, "llms.txt"), "utf8");
export const tempRoots = [];

export function makeTempHome() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-smoke-"));
  tempRoots.push(dir);
  return dir;
}

export function cleanup() {
  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    rmSync(dir, { recursive: true, force: true });
  }
}

process.on("exit", cleanup);
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    cleanup();
    process.exit(1);
  });
}

export function runCli(args = [], options = {}) {
  const env = {
    ...process.env,
    ...(options.env || {}),
  };
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: rootDir,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertExit(result, expected) {
  assert(
    result.status === expected,
    `expected exit ${expected}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

export function assertStdout(result, expected) {
  assert(
    result.stdout === expected,
    `expected stdout ${JSON.stringify(expected)}, got ${JSON.stringify(result.stdout)}`,
  );
}

export function assertIncludes(value, needle, streamName) {
  assert(
    value.includes(needle),
    `expected ${streamName} to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

export function assertShowDocIncludes(subcommand, output, asset) {
  assert(
    output.includes(asset),
    `missing ${subcommand} --show-doc disclosure asset: ${asset}`,
  );
}

export function assertDispatchSlashHelpers() {
  assert(
    quoteIfNeeded("plain-token") === "plain-token",
    "plain slash arguments should not be quoted",
  );
  assert(
    quoteIfNeeded("hello world") === '"hello world"',
    "whitespace slash arguments should use JSON string quoting",
  );
  assert(
    quoteIfNeeded('quote"and\\slash') === '"quote\\"and\\\\slash"',
    "quotes and backslashes should be escaped by JSON string quoting",
  );
  assert(
    quoteIfNeeded("line\nbreak") === '"line\\nbreak"',
    "control characters should be escaped by JSON string quoting",
  );
  assert(
    buildSlashString("start", ["hello world", "plain-token"]) ===
      '/ddalggak start "hello world" plain-token',
    "ddalggak subcommands should build the expected slash command string",
  );
  assert(
    buildSlashString("getwiki", ["하린 정보"]) === '/getwiki "하린 정보"',
    "getwiki should keep its standalone slash command prefix",
  );
}

export async function assertResolveExecutableHelper() {
  const first = makeTempHome();
  const second = makeTempHome();
  const executable = path.join(second, "claude");
  writeFileSync(executable, "#!/bin/sh\nexit 0\n", "utf8");
  chmodSync(executable, 0o755);

  const resolved = await resolveExecutable("claude", {
    pathValue: ["", first, second].join(path.delimiter),
    pathSeparator: path.delimiter,
  });
  assert(resolved === executable, `expected resolver to find executable in second PATH dir, got ${resolved}`);

  const missing = await resolveExecutable("claude", {
    pathValue: first,
    pathSeparator: path.delimiter,
  });
  assert(missing === null, `expected resolver to return null for missing executable, got ${missing}`);

  const windowsCandidates = executableCandidates("claude", { platform: "win32" });
  assert(
    windowsCandidates.join(",") === "claude.exe,claude.cmd,claude",
    `unexpected Windows candidates: ${windowsCandidates.join(",")}`,
  );
}

export function parseJsonStdout(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `expected JSON stdout, got:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

export function listNames(dir) {
  return readdirSync(dir).sort();
}

export function skillDirFor(claudeHome) {
  return path.join(claudeHome, "skills", "ddalggak");
}

export function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function readInstalledManifest(claudeHome) {
  return JSON.parse(
    readFileSync(
      path.join(skillDirFor(claudeHome), ".installed-manifest.json"),
      "utf8",
    ),
  );
}

export function writeExistingInstall(claudeHome, version = "0.0.0") {
  const skillDir = skillDirFor(claudeHome);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), "old skill\n", "utf8");
  writeFileSync(
    path.join(skillDir, ".installed-version"),
    `${version}\n`,
    "utf8",
  );
  return skillDir;
}

export const DOCTOR_FIXTURE_ROOTS = ["ddalggak", ".codex/skills/ddalggak"];

// Minimal repo layout that passes every doctor check; cases break it on
// purpose so detection does not depend on current real-repo findings.
export function writeDoctorFixture() {
  const fixtureRoot = makeTempHome();
  const write = (relPath, content) => {
    const target = path.join(fixtureRoot, relPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
  };
  write(
    "core/projections.yaml",
    [
      "source_root: ddalggak",
      "projection_roots:",
      "  codex:",
      "    root: .codex/skills/ddalggak",
      "    runtime: codex",
      "  claude:",
      "    root: ddalggak",
      "    runtime: claude",
      "parity_ledger:",
      "  - path: SKILL.md",
      "    class: may-localize",
      "  - path: references/alpha.md",
      "    class: must-match",
      "  - path: references/claude-only.md",
      "    class: root-specific",
      "    root: claude",
      "    reason: fixture root-specific regression asset",
      "  - path: templates/brief.md",
      "    class: must-match",
      "",
    ].join("\n"),
  );
  write(
    "core/commands/start.yaml",
    [
      "command: start",
      "required_references:",
      "  - wiki-context-preflight.md",
      "  - alpha.md",
      "required_templates:",
      "  - brief.md",
      "output_contract:",
      '  completion_signal: "ISSUE_PR_READY"',
      "",
    ].join("\n"),
  );
  const skill = [
    "# fixture skill",
    "",
    "Read `references/alpha.md` first.",
    "Claude-only procedure: `references/claude-only.md`.",
    "",
    "## 명명 규칙",
    "",
    "Completion signals distinguish ISSUE_PR_READY and LANE DONE.",
    "",
  ].join("\n");
  const alpha = "# alpha\n\nUse `templates/brief.md`.\n";
  const wikiPreflight = "# wiki preflight\n\nFixture wiki-context preflight.\n";
  const brief = "# brief\n\nEnd with LANE DONE.\n";
  for (const root of DOCTOR_FIXTURE_ROOTS) {
    write(path.join(root, "SKILL.md"), skill);
    write(path.join(root, "references", "alpha.md"), alpha);
    write(
      path.join(root, "references", "wiki-context-preflight.md"),
      wikiPreflight,
    );
    write(path.join(root, "templates", "brief.md"), brief);
  }
  write(
    path.join("ddalggak", "references", "claude-only.md"),
    "# claude only\n\nLedger-declared root-specific fixture.\n",
  );
  return fixtureRoot;
}

export function writeSessionStateFixture(content) {
  const workspaceRoot = makeTempHome();
  mkdirSync(path.join(workspaceRoot, ".ddalggak"), { recursive: true });
  writeFileSync(
    path.join(workspaceRoot, ".ddalggak", "session-state.json"),
    content,
    "utf8",
  );
  return workspaceRoot;
}

export function validSessionState(overrides = {}) {
  return {
    schema: "ddalggak-session-state/v1",
    updated_at: new Date().toISOString(),
    phase: "wave-1",
    repo: "JeremyDev87/ddalggak",
    base_branch: "master",
    lanes: [
      {
        lane_id: "lane-223",
        state: "pr_opened",
        issue: {
          number: 223,
          url: "https://github.com/JeremyDev87/ddalggak/issues/223",
          title: "session state schema",
        },
        branch: {
          name: "feat/session-state-schema",
          worktree: "/tmp/ddalggak-wt-223",
          base_sha: "0551c0d",
          head_sha: "abc1234",
        },
        pull_request: {
          url: "https://github.com/JeremyDev87/ddalggak/pull/1",
          number: 1,
          is_draft: true,
          base_ref: "master",
          head_ref: "feat/session-state-schema",
        },
        validation: {
          commands: [
            { command: "npm test", result: "passed", evidence: "smoke green" },
          ],
          blocking_gaps: [],
        },
        review: {
          required_for_head_sha: "abc1234",
          latest_conclusion: "pending",
          conclusion_head_sha: "",
          comment_url: "",
          stale_reason: "",
        },
        next_gate: {
          owner: "human",
          action: "merge the PR",
          command: "",
          exit_condition: "PR merged",
        },
      },
    ],
    validation_evidence: ["npm test green"],
    blocking_gaps: [],
    waiting_on: "human review",
    next_gate: {
      owner: "human",
      action: "review the open PR",
      command: "",
      exit_condition: "review conclusion posted",
    },
    ...overrides,
  };
}

export function runStatusWithSessionState(workspaceRoot) {
  const result = runCli(["status", "--local", "--json"], {
    env: {
      CLAUDE_HOME: makeTempHome(),
      DDALGGAK_WORKSPACE_ROOT: workspaceRoot,
    },
  });
  assertExit(result, 0);
  return parseJsonStdout(result);
}

export {
  existsSync,
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  os,
  path,
  executableCandidates,
  resolveExecutable,
  loadCommandContracts,
  COMMAND_CONTRACT_UNKNOWN_KEY_POLICY,
  validateCommandContract,
};
