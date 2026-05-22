import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
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
    name: "all subcommands expose compact --show-doc reference contracts",
    run() {
      const expectedContracts = {
        start: {
          heading: "## Start Workflow",
          references: [
            "references/start-workflow.md",
            "templates/worker-brief.md",
          ],
          maxLines: 20,
        },
        review: {
          heading: "## Cross-Review Loop",
          references: [
            "references/cross-review-loop.md",
            "templates/review-brief.md",
          ],
          maxLines: 20,
        },
        status: {
          heading: "## Status",
          references: ["references/status.md"],
          maxLines: 12,
        },
        plan: {
          heading: "## Issue-Ready Plan",
          references: [
            "references/issue-ready-plan.md",
            "references/wiki-context-preflight.md",
          ],
          maxLines: 20,
        },
        issue: {
          heading: "## Plan to Issues",
          references: [
            "references/plan-to-issues.md",
            "templates/issue-body.md",
          ],
          maxLines: 12,
        },
        clean: {
          heading: "## Merge Cleanup",
          references: ["references/merge-cleanup.md"],
          maxLines: 12,
        },
        ship: {
          heading: "## Ship",
          references: ["references/ship.md"],
          maxLines: 12,
        },
        retro: {
          heading: "## Retrospective",
          references: ["references/retrospective.md"],
          maxLines: 12,
        },
        prompt: {
          heading: "## Prompt Optimizer",
          references: ["references/prompt-optimizer.md"],
          maxLines: 12,
        },
        check: {
          heading: "## Local Diff Check",
          references: ["references/local-diff-check.md"],
          maxLines: 12,
        },
        getwiki: {
          heading: "## GetWiki Bridge",
          references: ["references/wiki-bridge.md"],
          maxLines: 12,
        },
        setwiki: {
          heading: "## SetWiki Bridge",
          references: ["references/wiki-bridge.md"],
          maxLines: 12,
        },
      };

      for (const [subcommand, contract] of Object.entries(expectedContracts)) {
        const result = runCli([subcommand, "--show-doc"]);
        assertExit(result, 0);
        assertIncludes(result.stdout, contract.heading, `${subcommand} stdout`);
        assertIncludes(
          result.stdout,
          "Full procedure:",
          `${subcommand} stdout`,
        );
        for (const reference of contract.references) {
          assertIncludes(result.stdout, reference, `${subcommand} stdout`);
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
