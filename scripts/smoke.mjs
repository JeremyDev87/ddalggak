import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
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
    name: "prompt --print emits slash command",
    run() {
      const result = runCli(["prompt", "--print"]);
      assertExit(result, 0);
      assertStdout(result, "/ddalggak prompt\n");
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
