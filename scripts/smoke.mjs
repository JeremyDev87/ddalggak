import { spawnSync } from "node:child_process";
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
const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
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
    `expected exit ${expected}, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

function assertStdout(result, expected) {
  assert(
    result.stdout === expected,
    `expected stdout ${JSON.stringify(expected)}, got ${JSON.stringify(result.stdout)}`
  );
}

function assertIncludes(value, needle, streamName) {
  assert(
    value.includes(needle),
    `expected ${streamName} to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`
  );
}

function listNames(dir) {
  return readdirSync(dir).sort();
}

function skillDirFor(claudeHome) {
  return path.join(claudeHome, "skills", "ddalggak");
}

function writeExistingInstall(claudeHome, version = "0.0.0") {
  const skillDir = skillDirFor(claudeHome);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "SKILL.md"), "old skill\n", "utf8");
  writeFileSync(path.join(skillDir, ".installed-version"), `${version}\n`, "utf8");
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
        `expected dry-run home to stay empty, found ${readdirSync(claudeHome).join(", ")}`
      );
    },
  },
  {
    name: "setup rejects missing --target value",
    run() {
      const result = runCli(["setup", "--target"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "--target requires a path argument", "stderr");
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
        "expected setup to create skills/ddalggak/SKILL.md"
      );
      assert(
        existsSync(path.join(skillDir, ".installed-version")),
        "expected setup to create skills/ddalggak/.installed-version"
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
          name.startsWith("ddalggak.bak.")
        ),
        "expected stale install backup next to skills/ddalggak"
      );
      assert(
        readFileSync(path.join(skillDirFor(claudeHome), ".installed-version"), "utf8") ===
          `${pkg.version}\n`,
        "expected fresh install version after backup"
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
          name.startsWith("ddalggak.bak.")
        ),
        "expected --no-backup not to create backup directories"
      );
      assert(
        readFileSync(path.join(skillDirFor(claudeHome), ".installed-version"), "utf8") ===
          `${pkg.version}\n`,
        "expected fresh install version after --no-backup replace"
      );
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
        '/ddalggak plan simple "two words" "quote\\"here" "path\\\\with\\\\slashes" "line\\nbreak" "$HOME" "`cmd`"\n'
      );
    },
  },
  {
    name: "dispatch -- stops local flag parsing",
    run() {
      const result = runCli(["plan", "--print", "--", "--show-doc", "two words"]);
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
      assertIncludes(result.stdout, "AI code quality gate", "stdout");
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
