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
