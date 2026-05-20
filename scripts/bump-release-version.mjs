#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { assertReleaseUpgrade, resolveReleasePlan, updatePackageManifestVersion } from "./lib/release.mjs";

const tag = process.argv[2];
const packageJsonPath = process.argv[3] || "package.json";

if (!tag) {
  console.error("Usage: node scripts/bump-release-version.mjs <tag> [package-json-path]");
  process.exit(1);
}

try {
  const plan = resolveReleasePlan(tag);
  const manifestPath = path.resolve(packageJsonPath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  if (!manifest.version) {
    throw new Error(`${manifestPath} is missing a version field`);
  }

  assertReleaseUpgrade(manifest.version, plan.version);

  const nextManifest = updatePackageManifestVersion(manifest, plan.version);
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  console.log(`version=${plan.version}`);
  console.log(`packageJson=${manifestPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
