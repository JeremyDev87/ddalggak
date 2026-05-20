import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const requiredArtifactPaths = [
  "package.json",
  "README.md",
  "LICENSE",
  "bin/ddalggak.js",
  "scripts/smoke.mjs",
  "scripts/verify-codex-skill.mjs",
  "scripts/eval-ddalggak-readiness.mjs",
  "scripts/test-release-helpers.mjs",
  "scripts/test-release-drafter.mjs",
  "scripts/test-manual-release-bump.mjs",
  "scripts/test-release-candidate.mjs",
  "scripts/test-release-publish.mjs",
  "scripts/lib/release.mjs",
  "scripts/release-plan.mjs",
  "scripts/bump-release-version.mjs",
  "scripts/classify-npm-lookup-error.mjs",
  "scripts/classify-npm-publish-error.mjs",
  "evals/ddalggak-readiness/fixtures.json",
  "ddalggak/SKILL.md",
  ".codex/skills/ddalggak/SKILL.md",
];

function runStep(name, command, args, options = {}) {
  console.log(`\n[verify-package] ${name}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      ...(options.env || {}),
    },
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
    const stdout = result.stdout ? `\nstdout:\n${result.stdout}` : "";
    const stderr = result.stderr ? `\nstderr:\n${result.stderr}` : "";
    throw new Error(`${name} failed with exit ${result.status}${stdout}${stderr}`);
  }

  return result;
}

function parsePackJson(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0].files)) {
      throw new Error("unexpected npm pack --json shape");
    }
    return parsed[0];
  } catch (error) {
    throw new Error(`failed to parse npm pack --json output: ${error.message}\noutput:\n${stdout}`);
  }
}

function verifyArtifactContents() {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-npm-cache-"));
  try {
    const result = runStep(
      "npm pack dry-run artifact inspection",
      npmCommand,
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      {
        capture: true,
        env: { npm_config_cache: cacheDir },
      }
    );
    const pack = parsePackJson(result.stdout);
    const included = new Set(pack.files.map((file) => file.path));
    const missing = requiredArtifactPaths.filter((requiredPath) => !included.has(requiredPath));

    if (missing.length > 0) {
      throw new Error(
        `npm artifact is missing required paths:\n${missing.map((item) => `- ${item}`).join("\n")}`
      );
    }

    console.log(
      `[verify-package] artifact ok: ${pack.files.length} files, ${requiredArtifactPaths.length} required paths present`
    );
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

try {
  runStep("npm test", npmCommand, ["test"]);
  runStep("codex skill verifier", npmCommand, ["run", "verify:codex-skill"]);
  runStep("ddalggak readiness eval", npmCommand, ["run", "eval:ddalggak-readiness"]);
  runStep("release helper tests", npmCommand, ["run", "test:release-helpers"]);
  runStep("release drafter tests", npmCommand, ["run", "test:release-drafter"]);
  runStep("manual release bump tests", npmCommand, ["run", "test:manual-release-bump"]);
  runStep("release candidate tests", npmCommand, ["run", "test:release-candidate"]);
  runStep("release publish tests", npmCommand, ["run", "test:release-publish"]);
  verifyArtifactContents();
  console.log("\n[verify-package] passed");
} catch (error) {
  console.error(`\n[verify-package] failed: ${error.message}`);
  process.exitCode = 1;
}
