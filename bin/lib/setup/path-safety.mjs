import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";

// System-root children we never want as effective claudeHome.
const SYSTEM_ROOT_CHILDREN = new Set([
  "/",
  "/etc",
  "/usr",
  "/bin",
  "/sbin",
  "/var",
  "/boot",
  "/dev",
  "/proc",
  "/sys",
  "/root",
  "/lib",
  "/lib64",
  "/opt",
  "/private/etc",
  "/private/var",
]);

function isAtFilesystemRoot(pathname) {
  return resolve(pathname) === resolve(pathname, "..");
}

function isSameOrDescendant(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function systemPathMatch(candidate) {
  for (const systemPath of SYSTEM_ROOT_CHILDREN) {
    if (systemPath === "/" || systemPath === "/var" || systemPath === "/private/var") {
      if (candidate === systemPath) return systemPath;
      continue;
    }
    if (isSameOrDescendant(systemPath, candidate)) return systemPath;
  }
  return null;
}

export async function resolvePhysicalPath(pathname) {
  const absolutePath = resolve(pathname);
  let probe = absolutePath;

  while (true) {
    try {
      const physicalProbe = await realpath(probe);
      const rel = relative(probe, absolutePath);
      return rel ? resolve(physicalProbe, rel) : physicalProbe;
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const parent = resolve(probe, "..");
        if (parent === probe) return absolutePath;
        probe = parent;
        continue;
      }
      throw error;
    }
  }
}

export function safetyCheck(claudeHomeInput, claudeHomeResolved, dstResolved) {
  const rel = relative(claudeHomeResolved, dstResolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    return "target escapes CLAUDE_HOME";
  }

  if (isAtFilesystemRoot(claudeHomeResolved)) {
    return `CLAUDE_HOME resolves to filesystem root (${claudeHomeResolved})`;
  }
  if (claudeHomeResolved === resolve(homedir())) {
    return `CLAUDE_HOME resolves to user home directory (${claudeHomeResolved})`;
  }
  const systemPath = systemPathMatch(claudeHomeResolved);
  if (systemPath) {
    return `CLAUDE_HOME resolves under system directory (${systemPath}): ${claudeHomeResolved}`;
  }

  const hasDotDot = claudeHomeInput.split(/[\\/]/).some((segment) => segment === "..");
  if (hasDotDot) {
    let probe = claudeHomeResolved;
    while (true) {
      if (systemPathMatch(probe)) {
        return `CLAUDE_HOME traverses into system directory via "..": ${claudeHomeInput} → ${claudeHomeResolved}`;
      }
      const parent = resolve(probe, "..");
      if (parent === probe) break;
      probe = parent;
    }
  }

  return null;
}
