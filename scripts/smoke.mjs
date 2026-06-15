import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
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

const rootDir = process.cwd();
const cliPath = path.join(rootDir, "bin", "ddalggak.js");
const pkg = JSON.parse(
  readFileSync(path.join(rootDir, "package.json"), "utf8"),
);
const readme = readFileSync(path.join(rootDir, "README.md"), "utf8");
const llmsIndex = readFileSync(path.join(rootDir, "llms.txt"), "utf8");
const tempRoots = [];

function makeTempHome() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-smoke-"));
  tempRoots.push(dir);
  return dir;
}

function cleanup() {
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

function runCli(args = [], options = {}) {
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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertExit(result, expected) {
  assert(
    result.status === expected,
    `expected exit ${expected}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

function assertStdout(result, expected) {
  assert(
    result.stdout === expected,
    `expected stdout ${JSON.stringify(expected)}, got ${JSON.stringify(result.stdout)}`,
  );
}

function assertIncludes(value, needle, streamName) {
  assert(
    value.includes(needle),
    `expected ${streamName} to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

function assertShowDocIncludes(subcommand, output, asset) {
  assert(
    output.includes(asset),
    `missing ${subcommand} --show-doc disclosure asset: ${asset}`,
  );
}

function parseJsonStdout(result) {
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(
      `expected JSON stdout, got:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
}

function listNames(dir) {
  return readdirSync(dir).sort();
}

function skillDirFor(claudeHome) {
  return path.join(claudeHome, "skills", "ddalggak");
}

function sha256File(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function readInstalledManifest(claudeHome) {
  return JSON.parse(
    readFileSync(
      path.join(skillDirFor(claudeHome), ".installed-manifest.json"),
      "utf8",
    ),
  );
}

function writeExistingInstall(claudeHome, version = "0.0.0") {
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

const DOCTOR_FIXTURE_ROOTS = ["ddalggak", ".codex/skills/ddalggak"];

// Minimal repo layout that passes every doctor check; cases break it on
// purpose so detection does not depend on current real-repo findings.
function writeDoctorFixture() {
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
      "  claude_legacy:",
      "    root: ddalggak",
      "    runtime: claude",
      "parity_ledger:",
      "  - path: SKILL.md",
      "    class: may-localize",
      "  - path: references/alpha.md",
      "    class: must-match",
      "  - path: references/claude-only.md",
      "    class: root-specific",
      "    root: claude_legacy",
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
  const brief = "# brief\n\nEnd with LANE DONE.\n";
  for (const root of DOCTOR_FIXTURE_ROOTS) {
    write(path.join(root, "SKILL.md"), skill);
    write(path.join(root, "references", "alpha.md"), alpha);
    write(path.join(root, "templates", "brief.md"), brief);
  }
  write(
    path.join("ddalggak", "references", "claude-only.md"),
    "# claude only\n\nLedger-declared root-specific fixture.\n",
  );
  return fixtureRoot;
}

function writeSessionStateFixture(content) {
  const workspaceRoot = makeTempHome();
  mkdirSync(path.join(workspaceRoot, ".ddalggak"), { recursive: true });
  writeFileSync(
    path.join(workspaceRoot, ".ddalggak", "session-state.json"),
    content,
    "utf8",
  );
  return workspaceRoot;
}

function validSessionState(overrides = {}) {
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

function runStatusWithSessionState(workspaceRoot) {
  const result = runCli(["status", "--local", "--json"], {
    env: {
      CLAUDE_HOME: makeTempHome(),
      DDALGGAK_WORKSPACE_ROOT: workspaceRoot,
    },
  });
  assertExit(result, 0);
  return parseJsonStdout(result);
}

const cases = [
  {
    name: "--version prints package version",
    run() {
      const result = runCli(["--version"]);
      assertExit(result, 0);
      assertStdout(result, `${pkg.version}\n`);
    },
  },
  {
    name: "--help prints usage",
    run() {
      const result = runCli(["--help"]);
      assertExit(result, 0);
      assertIncludes(result.stdout, "Usage", "stdout");
    },
  },
  {
    name: "no args prints help",
    run() {
      const result = runCli();
      assertExit(result, 0);
      assertIncludes(result.stdout, "Usage", "stdout");
    },
  },
  {
    name: "unknown command exits 2",
    run() {
      const result = runCli(["bogus"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "Unknown", "stderr");
    },
  },
  {
    name: "unknown command suggests close match",
    run() {
      const result = runCli(["stats"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "Did you mean: status?", "stderr");
    },
  },
  {
    name: "setup --dry-run does not create files",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["setup", "--dry-run"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assert(
        readdirSync(claudeHome).length === 0,
        `expected dry-run home to stay empty, found ${readdirSync(claudeHome).join(", ")}`,
      );
    },
  },
  {
    name: "profile hermes --dry-run proposes patch without writing CLAUDE.md",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["profile", "hermes", "--dry-run"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assertIncludes(
        result.stdout,
        "ddalggak profile hermes dry-run",
        "stdout",
      );
      assertIncludes(result.stdout, "Korean with 극존칭", "stdout");
      assertIncludes(
        result.stdout,
        "GitHub issue body, labels, and comments",
        "stdout",
      );
      assertIncludes(
        result.stdout,
        "issue → plan → start → ship → review",
        "stdout",
      );
      assertIncludes(result.stdout, "getwiki", "stdout");
      assertIncludes(result.stdout, "setwiki", "stdout");
      assertIncludes(result.stdout, "Never merge", "stdout");
      assert(
        !existsSync(path.join(claudeHome, "CLAUDE.md")),
        "expected profile dry-run not to create CLAUDE.md",
      );
      assert(
        !existsSync(path.join(claudeHome, "settings.json")),
        "expected profile dry-run not to create settings.json",
      );
    },
  },
  {
    name: "profile hermes --print-claude-md-patch reads existing profile but does not modify it",
    run() {
      const claudeHome = makeTempHome();
      const claudeMd = path.join(claudeHome, "CLAUDE.md");
      const before = "# Existing Claude profile\n\nKeep this line.\n";
      writeFileSync(claudeMd, before, "utf8");

      const result = runCli(["profile", "hermes", "--print-claude-md-patch"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assert(
        result.stdout.startsWith(`--- ${claudeMd}\n+++ ${claudeMd}\n`),
        "expected unified diff for existing CLAUDE.md",
      );
      assertIncludes(
        result.stdout,
        "+- Before `plan` and before `review`, run or delegate `getwiki`",
        "stdout",
      );
      assertIncludes(
        result.stdout,
        "+- Treat `setwiki` as approval-gated",
        "stdout",
      );
      assert(
        readFileSync(claudeMd, "utf8") === before,
        "expected print patch not to modify existing CLAUDE.md",
      );
    },
  },
  {
    name: "profile hermes rejects --apply",
    run() {
      const result = runCli(["profile", "hermes", "--apply"]);
      assertExit(result, 2);
      assertIncludes(
        result.stderr,
        "--apply is intentionally not supported",
        "stderr",
      );
    },
  },
  {
    name: "setup rejects missing --target value",
    run() {
      const result = runCli(["setup", "--target"]);
      assertExit(result, 2);
      assertIncludes(
        result.stderr,
        "--target requires a path argument",
        "stderr",
      );
    },
  },
  {
    name: "setup rejects filesystem root target",
    run() {
      const result = runCli(["setup", "--target", path.parse(rootDir).root]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "safety check failed", "stderr");
    },
  },
  {
    name: "setup rejects system directory descendants",
    run() {
      const result = runCli(["setup", "--dry-run", "--target", "/etc/ddalggak-test"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "resolves under system directory", "stderr");
    },
  },
  {
    name: "setup rejects HOME as target",
    run() {
      const result = runCli(["setup", "--dry-run", "--target", os.homedir()]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "user home directory", "stderr");
    },
  },
  {
    name: "setup rejects symlink target descendants that resolve to a system directory",
    run() {
      const tempRoot = makeTempHome();
      const linkPath = path.join(tempRoot, "bin-link");
      symlinkSync("/bin", linkPath, "dir");
      const result = runCli([
        "setup",
        "--dry-run",
        "--target",
        path.join(linkPath, "ddalggak-test"),
      ]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "resolves under system directory", "stderr");
    },
  },
  {
    name: "setup installs skill payload",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      const skillDir = path.join(claudeHome, "skills", "ddalggak");
      assertExit(result, 0);
      assert(
        existsSync(path.join(skillDir, "SKILL.md")),
        "expected setup to create skills/ddalggak/SKILL.md",
      );
      assert(
        existsSync(path.join(skillDir, ".installed-version")),
        "expected setup to create skills/ddalggak/.installed-version",
      );
      assert(
        existsSync(path.join(skillDir, ".installed-manifest.json")),
        "expected setup to create skills/ddalggak/.installed-manifest.json",
      );
      const manifest = readInstalledManifest(claudeHome);
      assert(
        manifest.packageVersion === pkg.version,
        "expected manifest packageVersion to match package.json",
      );
      assert(
        typeof manifest.installedAt === "string" &&
          manifest.installedAt.length > 0,
        "expected manifest installedAt",
      );
      assert(
        manifest.sourceRoot === path.join(rootDir, "ddalggak"),
        `expected sourceRoot to record source payload root, got ${manifest.sourceRoot}`,
      );
      const skillEntry = manifest.files.find(
        (file) => file.path === "SKILL.md",
      );
      assert(skillEntry, "expected manifest to include SKILL.md");
      assert(
        skillEntry.sha256 === sha256File(path.join(skillDir, "SKILL.md")),
        "expected manifest SKILL.md sha256 to match installed file",
      );
    },
  },
  {
    name: "setup re-run is idempotent",
    run() {
      const claudeHome = makeTempHome();
      const first = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(first, 0);

      const second = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(second, 0);
      assertIncludes(second.stdout, "Already up to date", "stdout");
    },
  },
  {
    name: "setup backs up stale existing install by default",
    run() {
      const claudeHome = makeTempHome();
      writeExistingInstall(claudeHome);
      const result = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assertIncludes(result.stdout, "Backed up existing install", "stdout");
      assert(
        listNames(path.join(claudeHome, "skills")).some((name) =>
          name.startsWith("ddalggak.bak."),
        ),
        "expected stale install backup next to skills/ddalggak",
      );
      assert(
        readFileSync(
          path.join(skillDirFor(claudeHome), ".installed-version"),
          "utf8",
        ) === `${pkg.version}\n`,
        "expected fresh install version after backup",
      );
    },
  },
  {
    name: "setup --no-backup replaces stale install without backup",
    run() {
      const claudeHome = makeTempHome();
      writeExistingInstall(claudeHome);
      const result = runCli(["setup", "--no-backup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assert(
        !listNames(path.join(claudeHome, "skills")).some((name) =>
          name.startsWith("ddalggak.bak."),
        ),
        "expected --no-backup not to create backup directories",
      );
      assert(
        !listNames(path.join(claudeHome, "skills")).some((name) =>
          name.startsWith(".ddalggak-install-") ||
          name.startsWith(".ddalggak-replace-"),
        ),
        "expected atomic staging directories to be cleaned up",
      );
      assert(
        readFileSync(
          path.join(skillDirFor(claudeHome), ".installed-version"),
          "utf8",
        ) === `${pkg.version}\n`,
        "expected fresh install version after --no-backup replace",
      );
    },
  },
  {
    name: "status --local --json reports not-installed",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(
        status.state === "not-installed",
        `expected not-installed, got ${status.state}`,
      );
      assert(status.ok === false, "expected not-installed status to be non-ok");
      assert(status.installedVersion === null, "expected no installed version");
      assert(
        status.evidence.runtime.status === "ok",
        "expected runtime evidence to report ok",
      );
      assert(
        status.evidence.package.manifest.status === "not-installed",
        "expected manifest evidence to distinguish not-installed",
      );
      assertIncludes(
        status.evidence.nextAction,
        "ddalggak setup",
        "status evidence nextAction",
      );
      assert(
        status.installedClaudeSkillPath ===
          path.join(claudeHome, "skills", "ddalggak"),
        `expected installed path under CLAUDE_HOME, got ${status.installedClaudeSkillPath}`,
      );
    },
  },
  {
    name: "status --local --json reports ok after setup",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "ok", `expected ok, got ${status.state}`);
      assert(status.ok === true, "expected ok status");
      assert(
        status.installedVersion === pkg.version,
        "expected installed package version",
      );
      assert(
        status.installedManifest !== null,
        "expected status to expose installed manifest metadata",
      );
      assert(
        status.installedManifest.packageVersion === pkg.version,
        "expected manifest packageVersion in status",
      );
      assert(
        status.installedManifest.sourceRoot === path.join(rootDir, "ddalggak"),
        "expected manifest sourceRoot in status",
      );
      assert(
        status.installedManifest.fileCount > 0,
        "expected manifest file count in status",
      );
      assert(
        status.sourceChecksum === status.installedChecksum,
        "expected source and installed checksum to match after setup",
      );
      assert(
        status.evidence.package.manifest.status === "present",
        "expected present installed manifest evidence after setup",
      );
      assert(
        status.evidence.package.payload.checksumsMatch === true,
        "expected matching package payload evidence after setup",
      );
      assertIncludes(
        status.evidence.nextAction,
        "No action needed",
        "status evidence nextAction",
      );
    },
  },
  {
    name: "status --local human reports runtime/package evidence next action",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["status", "--local"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assertIncludes(result.stdout, "evidence:\n", "stdout");
      assertIncludes(result.stdout, "  runtime: ok", "stdout");
      assertIncludes(result.stdout, "  package manifest: not-installed", "stdout");
      assertIncludes(result.stdout, "  next: Run `ddalggak setup`", "stdout");
    },
  },
  {
    name: "status --local detects stale checksum",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      writeFileSync(
        path.join(skillDirFor(claudeHome), "SKILL.md"),
        "mutated skill\n",
        "utf8",
      );
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.sourceChecksum !== status.installedChecksum,
        "expected source and installed checksum to differ after mutation",
      );
      assert(
        status.evidence.package.payload.checksumsMatch === false,
        "expected package payload evidence to show checksum drift",
      );
    },
  },
  {
    name: "status --local detects missing required reference",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      rmSync(path.join(skillDirFor(claudeHome), "references", "status.md"), {
        force: true,
      });
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.missingRequiredPaths.includes("references/status.md"),
        `expected missing status reference, got ${status.missingRequiredPaths.join(", ")}`,
      );
    },
  },
  {
    name: "status --local detects extra installed payload file",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      writeFileSync(
        path.join(skillDirFor(claudeHome), "references", "obsolete.md"),
        "obsolete\n",
        "utf8",
      );
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.extraInstalledPaths.includes("references/obsolete.md"),
        `expected obsolete extra path, got ${status.extraInstalledPaths.join(", ")}`,
      );
    },
  },
  {
    name: "setup backfills missing manifest on same-version installs",
    run() {
      const claudeHome = makeTempHome();
      const first = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(first, 0);
      rmSync(path.join(skillDirFor(claudeHome), ".installed-manifest.json"), {
        force: true,
      });

      const second = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(second, 0);
      assertIncludes(
        second.stdout,
        "Wrote missing installed manifest",
        "stdout",
      );
      assert(
        existsSync(
          path.join(skillDirFor(claudeHome), ".installed-manifest.json"),
        ),
        "expected setup to backfill missing .installed-manifest.json",
      );
    },
  },
  {
    name: "status --local --json distinguishes absent installed manifest evidence",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      rmSync(path.join(skillDirFor(claudeHome), ".installed-manifest.json"), {
        force: true,
      });

      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(status.ok === false, "expected absent manifest status to be non-ok");
      assert(
        status.evidence.package.manifest.status === "absent",
        `expected absent manifest evidence, got ${status.evidence.package.manifest.status}`,
      );
      assertIncludes(
        status.evidence.nextAction,
        "backfill the missing installed manifest",
        "status evidence nextAction",
      );
    },
  },
  {
    name: "status --local --json distinguishes stale installed manifest evidence",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      const manifestPath = path.join(
        skillDirFor(claudeHome),
        ".installed-manifest.json",
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.packageVersion = "0.0.0-stale";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.evidence.package.manifest.status === "stale",
        `expected stale manifest evidence, got ${status.evidence.package.manifest.status}`,
      );
    },
  },
  {
    name: "status --local reports malformed installed manifest as stale",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      writeFileSync(
        path.join(skillDirFor(claudeHome), ".installed-manifest.json"),
        "{not json\n",
        "utf8",
      );
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.installedManifestParseError,
        "expected installed manifest parse error evidence",
      );
      assert(
        status.evidence.package.manifest.status === "malformed",
        "expected malformed installed manifest evidence",
      );
    },
  },
  {
    name: "status -- respects dispatch flag terminator before --local",
    run() {
      const result = runCli(["status", "--print", "--", "--local"]);
      assertExit(result, 0);
      assertStdout(result, "/ddalggak status --local\n");
    },
  },
  {
    name: "prompt --print emits slash command",
    run() {
      const result = runCli(["prompt", "--print"]);
      assertExit(result, 0);
      assertStdout(result, "/ddalggak prompt\n");
    },
  },
  {
    name: "getwiki --print delegates to dedicated slash command",
    run() {
      const result = runCli(["getwiki", "--print", "workflow routing"]);
      assertExit(result, 0);
      assertStdout(result, '/getwiki "workflow routing"\n');
    },
  },
  {
    name: "setwiki --print delegates to dedicated slash command",
    run() {
      const result = runCli(["setwiki", "--print", "review this lesson"]);
      assertExit(result, 0);
      assertStdout(result, '/setwiki "review this lesson"\n');
    },
  },
  {
    name: "dispatch --print quotes ambiguous args safely",
    run() {
      const result = runCli([
        "plan",
        "--print",
        "simple",
        "two words",
        'quote"here',
        "path\\with\\slashes",
        "line\nbreak",
        "$HOME",
        "`cmd`",
      ]);
      assertExit(result, 0);
      assertStdout(
        result,
        '/ddalggak plan simple "two words" "quote\\"here" "path\\\\with\\\\slashes" "line\\nbreak" "$HOME" "`cmd`"\n',
      );
    },
  },
  {
    name: "dispatch -- stops local flag parsing",
    run() {
      const result = runCli([
        "plan",
        "--print",
        "--",
        "--show-doc",
        "two words",
      ]);
      assertExit(result, 0);
      assertStdout(result, '/ddalggak plan --show-doc "two words"\n');
    },
  },
  {
    name: "dispatch --show-doc extracts requested section",
    run() {
      const result = runCli(["review", "--show-doc"]);
      assertExit(result, 0);
      assertIncludes(result.stdout, "## Cross-Review Loop", "stdout");
      assertIncludes(
        result.stdout,
        "Full procedure: `references/cross-review-loop.md`",
        "stdout",
      );
      assertIncludes(result.stdout, "Execution contract index:", "stdout");
    },
  },
  {
    name: "all subcommands expose compact --show-doc disclosure matrix",
    run() {
      const expectedDisclosures = {
        start: {
          heading: "## Start Workflow",
          fullProcedure: "references/start-workflow.md",
          assets: [
            "templates/worker-brief.md",
          ],
          maxLines: 20,
        },
        review: {
          heading: "## Cross-Review Loop",
          fullProcedure: "references/cross-review-loop.md",
          assets: [
            "templates/review-brief.md",
          ],
          maxLines: 20,
        },
        status: {
          heading: "## Status",
          fullProcedure: "references/status.md",
          assets: [],
          maxLines: 12,
        },
        plan: {
          heading: "## Issue-Ready Plan",
          fullProcedure: "references/issue-ready-plan.md",
          assets: [
            "references/wiki-context-preflight.md",
            "references/wiki-bridge.md",
          ],
          maxLines: 20,
        },
        issue: {
          heading: "## Plan to Issues",
          fullProcedure: "references/plan-to-issues.md",
          assets: [
            "templates/issue-body.md",
            "templates/epic-body.md",
          ],
          maxLines: 12,
        },
        clean: {
          heading: "## Merge Cleanup",
          fullProcedure: "references/merge-cleanup.md",
          assets: [],
          maxLines: 12,
        },
        ship: {
          heading: "## Ship",
          fullProcedure: "references/ship.md",
          assets: [],
          maxLines: 12,
        },
        retro: {
          heading: "## Retrospective",
          fullProcedure: "references/retrospective.md",
          assets: ["references/wiki-bridge.md"],
          maxLines: 12,
        },
        prompt: {
          heading: "## Prompt Optimizer",
          fullProcedure: "references/prompt-optimizer.md",
          assets: [
            "Prompt Safety / Brief Compiler",
            "Prompt Audit",
            "prompt grill-me",
            "Unsafe Prompt Gate",
            "READY_FOR_BRIEF",
            "NEEDS_CLARIFICATION",
            "BLOCKED_UNSAFE",
            "DISCOVERY_ONLY",
            "PROMPT_DONE",
            "source_edit_allowed: false",
          ],
          maxLines: 12,
        },
        check: {
          heading: "## Local Diff Check",
          fullProcedure: "references/local-diff-check.md",
          assets: [],
          maxLines: 12,
        },
        getwiki: {
          heading: "## GetWiki Bridge",
          fullProcedure: "references/wiki-bridge.md",
          assets: [],
          maxLines: 12,
        },
        setwiki: {
          heading: "## SetWiki Bridge",
          fullProcedure: "references/wiki-bridge.md",
          assets: [],
          maxLines: 12,
        },
      };

      for (const [subcommand, contract] of Object.entries(expectedDisclosures)) {
        const result = runCli([subcommand, "--show-doc"]);
        assertExit(result, 0);
        assertShowDocIncludes(subcommand, result.stdout, contract.heading);
        assertShowDocIncludes(
          subcommand,
          result.stdout,
          `Full procedure: \`${contract.fullProcedure}\``,
        );
        for (const asset of contract.assets) {
          assertShowDocIncludes(subcommand, result.stdout, asset);
        }
        const lineCount = result.stdout.trim().split("\n").length;
        assert(
          lineCount >= 3,
          `expected ${subcommand} --show-doc to expose a non-empty section`,
        );
        assert(
          lineCount <= contract.maxLines,
          `expected ${subcommand} --show-doc to stay compact (${lineCount}/${contract.maxLines} lines)`,
        );
      }
    },
  },
  {
    name: "status fallback works without PATH",
    run() {
      const result = runCli(["status"], {
        env: { PATH: "" },
      });
      assertExit(result, 0);
      assertIncludes(`${result.stdout}${result.stderr}`, "not found", "output");
      assertIncludes(result.stdout, "/ddalggak status", "stdout");
    },
  },
  {
    name: "AI-readable docs index is package-local and points at shipped files",
    run() {
      assert(
        pkg.files?.includes("llms.txt"),
        "expected llms.txt to be included in package artifact boundary",
      );
      for (const required of [
        "# ddalggak AI-readable documentation index",
        "./README.md",
        "./.codex/skills/ddalggak/SKILL.md",
        "./ddalggak/SKILL.md",
        "./scripts/verify-package.mjs",
        "not a crawler directive",
        "Secrets, credentials, private issue comments",
      ]) {
        assertIncludes(llmsIndex, required, "llms.txt");
      }
      for (const missing of [
        "https://docs.github.com/llms.txt",
        "https://modelcontextprotocol.io/llms.txt",
        "Authorization:",
        "Bearer",
      ]) {
        assert(
          !llmsIndex.includes(missing),
          `expected llms.txt not to include external/private runtime token ${JSON.stringify(missing)}`,
        );
      }
    },
  },
  {
    name: "package verification contract is release-safe",
    run() {
      assert(
        pkg.scripts?.verify === "node scripts/verify-package.mjs",
        `expected package verify script to run scripts/verify-package.mjs, got ${JSON.stringify(
          pkg.scripts?.verify,
        )}`,
      );
      assert(
        pkg.scripts?.prepublishOnly === "npm run verify",
        `expected prepublishOnly to delegate to npm run verify, got ${JSON.stringify(
          pkg.scripts?.prepublishOnly,
        )}`,
      );
      assert(
        pkg.files?.includes("scripts/"),
        "expected scripts/ to be included in package artifact boundary",
      );
      assert(
        !readme.includes(
          "https://www.npmjs.com/package/@jeremyfellaz/ddalggak",
        ),
        "README must not link to an unpublished npm package as if it is live",
      );
      assert(
        !readme.includes("img.shields.io/npm/"),
        "README must not show npm badges before first publish proves registry visibility",
      );
    },
  },
  {
    name: "doctor passes on clean fixture",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 0);
      assertIncludes(result.stdout, "doctor: all checks passed", "stdout");
      assertIncludes(result.stdout, "not checked", "stdout");
    },
  },
  {
    name: "doctor root-parity honors ledger root-specific files",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const result = runCli(["doctor", "--root", fixtureRoot, "--json"]);
      assertExit(result, 0);
      const report = parseJsonStdout(result);
      assert(report.checks["root-parity"].ok === true, "expected root-parity to pass");
      assert(
        !result.stdout.includes("references/claude-only.md"),
        "expected ledger root-specific file not to be reported as missing",
      );
    },
  },
  {
    name: "doctor detects orphan reference",
    run() {
      const fixtureRoot = writeDoctorFixture();
      for (const root of DOCTOR_FIXTURE_ROOTS) {
        writeFileSync(
          path.join(fixtureRoot, root, "references", "orphan.md"),
          "# orphan\n",
          "utf8",
        );
      }
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "orphan reference: ddalggak/references/orphan.md",
        "stdout",
      );
    },
  },
  {
    name: "doctor detects dead pointer",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const alphaPath = path.join(
        fixtureRoot,
        "ddalggak",
        "references",
        "alpha.md",
      );
      writeFileSync(
        alphaPath,
        `${readFileSync(alphaPath, "utf8")}\nAlso read \`references/missing.md\`.\n`,
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "dead pointer: ddalggak/references/alpha.md -> references/missing.md",
        "stdout",
      );
    },
  },
  {
    name: "doctor detects undefined completion signal",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const skillPath = path.join(fixtureRoot, "ddalggak", "SKILL.md");
      writeFileSync(
        skillPath,
        readFileSync(skillPath, "utf8").replace(
          "LANE DONE.",
          "LANE DONE and PHANTOM DONE.",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        'undefined completion signal: "PHANTOM DONE"',
        "stdout",
      );
    },
  },
  {
    name: "doctor detects file missing across projection roots",
    run() {
      const fixtureRoot = writeDoctorFixture();
      rmSync(
        path.join(
          fixtureRoot,
          ".codex",
          "skills",
          "ddalggak",
          "references",
          "alpha.md",
        ),
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "missing in .codex/skills/ddalggak: references/alpha.md (present in ddalggak)",
        "stdout",
      );
    },
  },
  {
    name: "doctor detects unregistered single-root reference file",
    run() {
      const fixtureRoot = writeDoctorFixture();
      writeFileSync(
        path.join(
          fixtureRoot,
          "ddalggak",
          "references",
          "unregistered.md",
        ),
        "# Unregistered reference\n",
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "missing in .codex/skills/ddalggak: references/unregistered.md (present in ddalggak)",
        "stdout",
      );
    },
  },
  {
    name: "doctor reports malformed command contract structure",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const contractPath = path.join(
        fixtureRoot,
        "core",
        "commands",
        "start.yaml",
      );
      writeFileSync(
        contractPath,
        readFileSync(contractPath, "utf8").replace(
          "required_references:\n  - alpha.md",
          "required_references: [alpha.md]",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "malformed command contract: core/commands/start.yaml line 2: unsupported inline structure for key: required_references",
        "stdout",
      );
    },
  },
  {
    name: "doctor reports non-list required_references",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const contractPath = path.join(
        fixtureRoot,
        "core",
        "commands",
        "start.yaml",
      );
      writeFileSync(
        contractPath,
        readFileSync(contractPath, "utf8").replace(
          "required_references:\n  - alpha.md",
          "required_references: alpha.md",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "malformed command contract: core/commands/start.yaml: required_references must be a list",
        "stdout",
      );
    },
  },
  {
    name: "doctor reports unparseable parity_ledger line",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const projectionsPath = path.join(
        fixtureRoot,
        "core",
        "projections.yaml",
      );
      writeFileSync(
        projectionsPath,
        readFileSync(projectionsPath, "utf8").replace(
          "  - path: SKILL.md\n    class: may-localize",
          "  - SKILL.md",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "core/projections.yaml line 10: unparseable parity_ledger line: - SKILL.md",
        "stdout",
      );
    },
  },
  {
    name: "doctor reports inline projections section structure",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const projectionsPath = path.join(
        fixtureRoot,
        "core",
        "projections.yaml",
      );
      writeFileSync(
        projectionsPath,
        readFileSync(projectionsPath, "utf8").replace(
          "parity_ledger:",
          "parity_ledger: [{path: SKILL.md}]",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "core/projections.yaml line 9: unsupported inline structure for key: parity_ledger",
        "stdout",
      );
    },
  },
  {
    name: "doctor --json reports machine-readable contract",
    run() {
      const cleanRoot = writeDoctorFixture();
      const clean = runCli(["doctor", "--root", cleanRoot, "--json"]);
      assertExit(clean, 0);
      const cleanReport = parseJsonStdout(clean);
      assert(cleanReport.ok === true, "expected clean fixture to report ok");
      for (const check of [
        "layout",
        "reachability",
        "dead-pointer",
        "signal-registry",
        "root-parity",
      ]) {
        assert(
          cleanReport.checks[check]?.ok === true,
          `expected clean ${check} check, got ${JSON.stringify(cleanReport.checks[check])}`,
        );
      }
      assert(
        Array.isArray(cleanReport.notChecked) &&
          cleanReport.notChecked.length > 0,
        "expected notChecked disclosure in doctor JSON output",
      );

      const brokenRoot = writeDoctorFixture();
      rmSync(
        path.join(
          brokenRoot,
          ".codex",
          "skills",
          "ddalggak",
          "templates",
          "brief.md",
        ),
      );
      const broken = runCli(["doctor", "--root", brokenRoot, "--json"]);
      assertExit(broken, 1);
      const brokenReport = parseJsonStdout(broken);
      assert(
        brokenReport.ok === false,
        "expected broken fixture to report not ok",
      );
      assert(
        brokenReport.findings.some(
          (finding) =>
            finding.check === "root-parity" &&
            finding.message.includes("templates/brief.md"),
        ),
        `expected root-parity finding for removed template, got ${JSON.stringify(brokenReport.findings)}`,
      );
    },
  },
  {
    name: "doctor rejects unknown option and missing root",
    run() {
      const unknown = runCli(["doctor", "--bogus"]);
      assertExit(unknown, 2);
      assertIncludes(unknown.stderr, "Unknown option: --bogus", "stderr");

      const missingRoot = runCli([
        "doctor",
        "--root",
        path.join(makeTempHome(), "missing-subdir"),
      ]);
      assertExit(missingRoot, 2);
      assertIncludes(missingRoot.stderr, "not a directory", "stderr");
    },
  },
  {
    name: "status --local --json reports absent session state",
    run() {
      const workspaceRoot = makeTempHome();
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "absent",
        `expected absent session state, got ${status.sessionState.status}`,
      );
      assert(
        status.sessionState.path ===
          path.join(workspaceRoot, ".ddalggak", "session-state.json"),
        `expected session state path under workspace root, got ${status.sessionState.path}`,
      );
      assert(
        status.sessionState.violations.length === 0,
        "expected no violations for absent session state",
      );
    },
  },
  {
    name: "status --local --json reports valid session state evidence",
    run() {
      const workspaceRoot = writeSessionStateFixture(
        `${JSON.stringify(validSessionState(), null, 2)}\n`,
      );
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "valid",
        `expected valid session state, got ${status.sessionState.status}\nviolations:\n${status.sessionState.violations.join("\n")}`,
      );
      assert(
        status.sessionState.violations.length === 0,
        "expected no violations for valid session state",
      );
      assert(
        typeof status.sessionState.ageHours === "number" &&
          status.sessionState.ageHours >= 0 &&
          status.sessionState.ageHours <
            status.sessionState.staleAfterHours,
        `expected fresh ageHours, got ${status.sessionState.ageHours}`,
      );
      assertIncludes(
        status.sessionState.action,
        "fresh enough to trust",
        "session state action",
      );
    },
  },
  {
    name: "status --local --json reports malformed session state file",
    run() {
      const workspaceRoot = writeSessionStateFixture("{not json\n");
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "malformed",
        `expected malformed session state, got ${status.sessionState.status}`,
      );
      assert(
        status.sessionState.violations.length > 0,
        "expected parse error evidence for malformed session state",
      );
      assertIncludes(
        status.sessionState.action,
        "valid JSON",
        "session state action",
      );
    },
  },
  {
    name: "status --local --json reports schema-invalid session state without touching skill state",
    run() {
      const broken = validSessionState();
      delete broken.phase;
      broken.lanes[0].state = "warp-speed";
      const workspaceRoot = writeSessionStateFixture(
        `${JSON.stringify(broken, null, 2)}\n`,
      );
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "invalid",
        `expected invalid session state, got ${status.sessionState.status}`,
      );
      assert(
        status.sessionState.violations.some((violation) =>
          violation.includes('missing required field "phase"'),
        ),
        `expected missing phase violation, got ${status.sessionState.violations.join("; ")}`,
      );
      assert(
        status.sessionState.violations.some((violation) =>
          violation.startsWith("$.lanes[0].state"),
        ),
        `expected lane state enum violation, got ${status.sessionState.violations.join("; ")}`,
      );
      assert(
        status.state === "not-installed",
        `expected session state judgment not to change skill state, got ${status.state}`,
      );
    },
  },
  {
    name: "status --local --json reports stale session state by updated_at",
    run() {
      const workspaceRoot = writeSessionStateFixture(
        `${JSON.stringify(
          validSessionState({
            updated_at: new Date(Date.now() - 48 * 36e5).toISOString(),
          }),
          null,
          2,
        )}\n`,
      );
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "stale",
        `expected stale session state, got ${status.sessionState.status}\nviolations:\n${status.sessionState.violations.join("\n")}`,
      );
      assert(
        status.sessionState.staleAfterHours === 24,
        `expected schema staleAfterHours 24, got ${status.sessionState.staleAfterHours}`,
      );
      assert(
        status.sessionState.ageHours > status.sessionState.staleAfterHours,
        `expected ageHours beyond threshold, got ${status.sessionState.ageHours}`,
      );
      assertIncludes(
        status.sessionState.action,
        "rebuild it from live git/GitHub state",
        "session state action",
      );
    },
  },
];

let passed = 0;
const failures = [];

for (const testCase of cases) {
  try {
    testCase.run();
    passed += 1;
    console.log(`[PASS] ${testCase.name}`);
  } catch (error) {
    failures.push({ name: testCase.name, error });
    console.error(`[FAIL] ${testCase.name}`);
    console.error(error && error.stack ? error.stack : String(error));
  }
}

console.log(`\nSummary: ${passed}/${cases.length} smoke cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
