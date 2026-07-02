import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") return false;
    throw error;
  }
}

export function readPackageVersion(packageJsonPath) {
  return JSON.parse(readFileSync(packageJsonPath, "utf8")).version;
}

export async function readInstalledVersion(installedRoot) {
  try {
    return (
      (await readFile(join(installedRoot, ".installed-version"), "utf8")).trim() ||
      null
    );
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

export async function readInstalledManifest(installedRoot) {
  try {
    const manifest = JSON.parse(
      await readFile(join(installedRoot, ".installed-manifest.json"), "utf8"),
    );
    if (
      !manifest ||
      typeof manifest !== "object" ||
      !Array.isArray(manifest.files)
    ) {
      return { manifest: null, parseError: "unexpected manifest shape" };
    }
    return { manifest, parseError: null };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { manifest: null, parseError: null };
    }
    return {
      manifest: null,
      parseError: error && error.message ? error.message : String(error),
    };
  }
}

// macOS/editor junk that must never enter a copied skill payload or its manifest.
// Filtered at the single file-walk below so copy, manifest, and checksum all agree
// on the same file set. Basename match catches junk at any nesting depth.
export const IGNORED_PAYLOAD_NAMES = new Set([".DS_Store"]);

export function isIgnoredPayloadEntry(name) {
  return IGNORED_PAYLOAD_NAMES.has(name);
}

// Install-time metadata the installer writes into the destination but that is not
// part of the source payload. Single source of truth so drift detection here and
// status --local parity (install-parity extraInstalledPaths) never disagree.
export const INSTALL_METADATA_NAMES = new Set([
  ".installed-version",
  ".installed-manifest.json",
]);

export async function listPayloadFiles(root, { missingRoot = "throw" } = {}) {
  const files = [];
  async function visit(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (missingRoot === "empty" && error && error.code === "ENOENT") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (isIgnoredPayloadEntry(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(abs);
      } else if (entry.isFile()) {
        files.push(relative(root, abs).replaceAll("\\", "/"));
      }
    }
  }
  await visit(root);
  return files;
}

export async function payloadChecksum(root, expectedFiles = null) {
  if (!(await pathExists(root))) return null;
  const files =
    expectedFiles || (await listPayloadFiles(root, { missingRoot: "empty" }));
  const aggregate = createHash("sha256");
  for (const relPath of files) {
    let fileHash;
    try {
      const bytes = await readFile(join(root, relPath));
      fileHash = createHash("sha256").update(bytes).digest("hex");
    } catch (error) {
      if (error && error.code === "ENOENT") {
        fileHash = "MISSING";
      } else {
        throw error;
      }
    }
    aggregate.update(relPath);
    aggregate.update("\0");
    aggregate.update(fileHash);
    aggregate.update("\0");
  }
  return { sha256: aggregate.digest("hex"), files };
}

// True when the installed payload's content no longer matches source at the same
// version — the gap that version-only skip logic misses. Mirrors the staleness
// definition status --local uses (install-parity): changed/missing source files
// AND extra installed files, ignoring install metadata (.installed-*).
export async function payloadDrifted(sourceRoot, installedRoot) {
  const source = await payloadChecksum(sourceRoot);
  if (!source) return false;
  const installed = await payloadChecksum(installedRoot, source.files);
  if (!installed || installed.sha256 !== source.sha256) return true;
  const installedFiles = await listPayloadFiles(installedRoot, {
    missingRoot: "empty",
  });
  const sourceSet = new Set(source.files);
  return installedFiles.some(
    (f) => !sourceSet.has(f) && !INSTALL_METADATA_NAMES.has(f),
  );
}

export async function buildInstalledManifest({ sourceRoot, installedRoot, version }) {
  const sourceFiles = await listPayloadFiles(sourceRoot);
  const files = [];
  for (const relPath of sourceFiles) {
    const bytes = await readFile(join(installedRoot, relPath));
    files.push({
      path: relPath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  return {
    packageVersion: version,
    installedAt: new Date().toISOString(),
    sourceRoot,
    files,
  };
}
