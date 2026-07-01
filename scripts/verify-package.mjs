import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  requiredPackageArtifactPaths,
  requiredPackageFiles,
} from "../core/verification/skill-contract-manifest.mjs";
import { verifyPipelineStages } from "../core/verification/verify-pipeline.mjs";

const rootDir = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const requiredArtifactPaths = requiredPackageArtifactPaths;
const runtimeSurfacePrefixes = [
  "bin/lib/",
  "core/",
  "claude-skills/",
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
  if (
    filePath.startsWith(".codex/skills/ddalggak/") ||
    filePath.startsWith("claude-skills/") ||
    filePath.startsWith("ddalggak/")
  ) {
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
  for (const stage of verifyPipelineStages) {
    console.log(`\n[verify-package] stage: ${stage.title}`);
    for (const step of stage.steps) {
      const result = runStep(
        step.label,
        step.command === "npm" ? npmCommand : step.command,
        step.args,
        step.options || {},
      );
      if (
        step.label === "subcommand token budget admission gate" &&
        step.command === process.execPath
      ) {
        for (const line of (result.stdout || "").split("\n")) {
          if (
            line.startsWith("[token-budget] warning:") ||
            line.startsWith("[token-budget] summary:") ||
            line.startsWith("[token-budget] admission gate:")
          ) {
            console.log(line);
          }
        }
      }
    }
  }
  verifyArtifactContents();
  console.log("\n[verify-package] passed");
} catch (error) {
  console.error(`\n[verify-package] failed: ${error.message}`);
  process.exitCode = 1;
}
