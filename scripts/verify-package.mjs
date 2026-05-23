import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { requiredPackageFiles } from "../core/verification/skill-contract-manifest.mjs";

const rootDir = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const requiredArtifactPaths = [
  "package.json",
  "README.md",
  "LICENSE",
  "bin/ddalggak.js",
  "bin/lib/dispatch.mjs",
  "bin/lib/profile.mjs",
  "bin/lib/setup.mjs",
  "bin/lib/status.mjs",
  "scripts/project-runtime-assets.mjs",
  "scripts/smoke.mjs",
  "scripts/verify-codex-skill.mjs",
  "scripts/verify-package.mjs",
  "scripts/verify-projections.mjs",
  "scripts/test-verify-codex-skill-reference-aware.mjs",
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
  "templates/claude-profile-hermes.md",
  "ddalggak/SKILL.md",
  "ddalggak/references/wiki-bridge.md",
  ".codex/skills/ddalggak/SKILL.md",
  ".codex/skills/ddalggak/agents/openai.yaml",
  ".codex/skills/ddalggak/references/wiki-bridge.md",
  "core/projections.yaml",
  "core/commands/start.yaml",
  "core/commands/review.yaml",
  "core/runtimes/claude.yaml",
  "core/runtimes/codex.yaml",
  "core/runtimes/hermes.yaml",
  "core/verification/skill-contract-manifest.mjs",
];
const runtimeSurfacePrefixes = [
  "bin/lib/",
  "core/",
  "ddalggak/",
  ".codex/skills/ddalggak/",
  "scripts/project-runtime-assets.mjs",
  "scripts/verify-projections.mjs",
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
    throw new Error(
      `${name} failed with exit ${result.status}${stdout}${stderr}`,
    );
  }

  return result;
}

function parsePackJson(stdout) {
  try {
    const parsed = JSON.parse(stdout);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      !Array.isArray(parsed[0].files)
    ) {
      throw new Error("unexpected npm pack --json shape");
    }
    return parsed[0];
  } catch (error) {
    throw new Error(
      `failed to parse npm pack --json output: ${error.message}\noutput:\n${stdout}`,
    );
  }
}

function artifactCategory(filePath) {
  if (filePath.startsWith(".codex/skills/ddalggak/") || filePath.startsWith("ddalggak/")) {
    return "skill-payload";
  }
  if (filePath.startsWith("core/") || filePath.startsWith("bin/lib/")) {
    return "runtime-surface";
  }
  if (filePath.startsWith("scripts/") || filePath.startsWith("evals/")) {
    return "verification-harness";
  }
  if (filePath.startsWith("templates/")) {
    return "support-template";
  }
  return "package-root";
}

function formatList(items) {
  return items.length === 0 ? "  - none" : items.map((item) => `  - ${item}`).join("\n");
}

function emitArtifactEvidence({ pack, included, expected }) {
  const packedPaths = pack.files.map((file) => file.path).sort();
  const expectedSet = new Set(expected);
  const missing = expected.filter((requiredPath) => !included.has(requiredPath));
  const groupedMissing = new Map();
  for (const filePath of missing) {
    const category = artifactCategory(filePath);
    groupedMissing.set(category, [...(groupedMissing.get(category) || []), filePath]);
  }
  const runtimeSurface = packedPaths.filter((filePath) =>
    runtimeSurfacePrefixes.some((prefix) => filePath.startsWith(prefix)),
  );
  const packageOnlyExtra = packedPaths.filter((filePath) => !expectedSet.has(filePath));
  const runtimePackageOnlyExtra = packageOnlyExtra.filter((filePath) =>
    runtimeSurfacePrefixes.some((prefix) => filePath.startsWith(prefix)),
  );
  const generatedManifestOnly = requiredPackageFiles.filter(
    (filePath) => !requiredArtifactPaths.includes(filePath),
  );
  const staticOnly = requiredArtifactPaths.filter(
    (filePath) => !requiredPackageFiles.includes(filePath),
  );
  const staleGeneratedBlock = 0;

  console.log("[verify-package] artifact surface report");
  console.log(`  packed files: ${pack.files.length}`);
  console.log(`  required files: ${expected.length}`);
  console.log(`  runtime surface files: ${runtimeSurface.length}`);
  console.log("[verify-package] drift classes");
  console.log(`  missing-required: ${missing.length}`);
  console.log(`  package-only-extra: ${packageOnlyExtra.length}`);
  console.log(`  runtime-package-only-extra: ${runtimePackageOnlyExtra.length}`);
  console.log(`  stale-generated-block: ${staleGeneratedBlock}`);
  console.log(`  generated-manifest-only: ${generatedManifestOnly.length}`);
  console.log(`  static-package-check-only: ${staticOnly.length}`);
  console.log("[verify-package] package-only-extra paths");
  console.log(formatList(packageOnlyExtra.slice(0, 25)));
  console.log("[verify-package] generated-manifest-only paths");
  console.log(formatList(generatedManifestOnly.slice(0, 25)));
  console.log("[verify-package] static-package-check-only paths");
  console.log(formatList(staticOnly.slice(0, 25)));

  if (missing.length > 0) {
    const sections = [...groupedMissing.entries()]
      .map(([category, files]) => `${category}:\n${formatList(files)}`)
      .join("\n");
    throw new Error(`npm artifact is missing required paths by category:\n${sections}`);
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
      },
    );
    const pack = parsePackJson(result.stdout);
    const included = new Set(pack.files.map((file) => file.path));
    const expected = [...new Set([...requiredArtifactPaths, ...requiredPackageFiles])].sort();

    emitArtifactEvidence({ pack, included, expected });

    console.log(
      `[verify-package] artifact ok: ${pack.files.length} files, ${expected.length} required paths present`,
    );
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

try {
  runStep("npm test", npmCommand, ["test"]);
  runStep("codex skill verifier", npmCommand, ["run", "verify:codex-skill"]);
  runStep("projection verifier", npmCommand, ["run", "verify:projections"]);
  runStep("runtime asset generated-block drift check", process.execPath, [
    "scripts/project-runtime-assets.mjs",
    "--check",
  ]);
  runStep("reference-aware skill anchor tests", npmCommand, [
    "run",
    "test:reference-aware-skill-anchors",
  ]);
  runStep("ddalggak readiness eval", npmCommand, [
    "run",
    "eval:ddalggak-readiness",
  ]);
  runStep("release helper tests", npmCommand, ["run", "test:release-helpers"]);
  runStep("release drafter tests", npmCommand, ["run", "test:release-drafter"]);
  runStep("manual release bump tests", npmCommand, [
    "run",
    "test:manual-release-bump",
  ]);
  runStep("release candidate tests", npmCommand, [
    "run",
    "test:release-candidate",
  ]);
  runStep("release publish tests", npmCommand, ["run", "test:release-publish"]);
  verifyArtifactContents();
  console.log("\n[verify-package] passed");
} catch (error) {
  console.error(`\n[verify-package] failed: ${error.message}`);
  process.exitCode = 1;
}
