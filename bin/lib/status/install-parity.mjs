import { join } from "node:path";
import {
  listPayloadFiles,
  pathExists,
  payloadChecksum,
  readInstalledManifest,
  readInstalledVersion,
  readPackageVersion,
} from "../local-payload.mjs";

function requiredReferencePaths(sourceFiles) {
  return sourceFiles.filter(
    (file) =>
      file === "SKILL.md" ||
      file.startsWith("references/") ||
      file.startsWith("templates/"),
  );
}

async function missingPaths(root, requiredPaths) {
  const missing = [];
  for (const relPath of requiredPaths) {
    if (!(await pathExists(join(root, relPath)))) missing.push(relPath);
  }
  return missing;
}

function extraInstalledPaths(installedFiles, sourceFiles) {
  const allowedExtra = new Set([
    ".installed-version",
    ".installed-manifest.json",
  ]);
  const sourceSet = new Set(sourceFiles);
  return installedFiles.filter(
    (file) => !sourceSet.has(file) && !allowedExtra.has(file),
  );
}

function determineState({
  installedExists,
  packageVersion,
  installedVersion,
  sourceChecksum,
  installedChecksum,
  missingRequiredPaths,
  extraInstalledPaths,
  installedManifestParseError,
  installedManifestMissing,
}) {
  if (!installedExists) return "not-installed";
  if (installedManifestParseError) return "stale";
  if (installedManifestMissing) return "stale";
  if (installedVersion !== packageVersion) return "stale";
  if (
    !installedChecksum ||
    !sourceChecksum ||
    installedChecksum.sha256 !== sourceChecksum.sha256
  )
    return "stale";
  if (missingRequiredPaths.length > 0) return "stale";
  if (extraInstalledPaths.length > 0) return "stale";
  return "ok";
}

function runtimeEvidence({ minimumNodeMajor }) {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
  const supported = Number.isFinite(nodeMajor) && nodeMajor >= minimumNodeMajor;
  return {
    status: supported ? "ok" : "unsupported",
    nodeVersion: process.versions.node,
    minimumNodeVersion: `>=${minimumNodeMajor}`,
    platform: process.platform,
    arch: process.arch,
    action: supported
      ? "Runtime satisfies ddalggak package requirements."
      : `Use Node.js ${minimumNodeMajor} or newer before running setup/status again.`,
  };
}

function manifestEvidenceStatus({
  installedExists,
  installedManifest,
  installedManifestParseError,
  packageVersion,
}) {
  if (!installedExists) return "not-installed";
  if (installedManifestParseError) return "malformed";
  if (!installedManifest) return "absent";
  if (installedManifest.packageVersion !== packageVersion) return "stale";
  return "present";
}

function nextEvidenceAction({
  state,
  runtime,
  manifestStatus,
  missingRequiredPaths,
  extraInstalledPaths,
  checksumsMatch,
}) {
  if (runtime.status !== "ok") return runtime.action;
  if (state === "not-installed") return "Run `ddalggak setup` to install the local Claude skill.";
  if (manifestStatus === "malformed") return "Run `ddalggak setup` to rewrite the malformed installed manifest.";
  if (manifestStatus === "absent") return "Run `ddalggak setup` to backfill the missing installed manifest.";
  if (manifestStatus === "stale") return "Run `ddalggak setup` to refresh stale package manifest evidence.";
  if (missingRequiredPaths.length > 0) return "Run `ddalggak setup` to restore missing required references/templates.";
  if (extraInstalledPaths.length > 0) return "Remove extra installed payload files or run `ddalggak setup` to replace the skill.";
  if (!checksumsMatch) return "Run `ddalggak setup` to sync the installed payload with the package payload.";
  return "No action needed; runtime, package manifest, and payload evidence are current.";
}

function buildEvidence({
  state,
  packageVersion,
  installedVersion,
  installedExists,
  installedManifest,
  installedManifestParseError,
  sourceChecksum,
  installedChecksum,
  sourceFiles,
  installedFiles,
  missingRequiredPaths,
  extraInstalledPaths,
  minimumNodeMajor,
}) {
  const runtime = runtimeEvidence({ minimumNodeMajor });
  const manifestStatus = manifestEvidenceStatus({
    installedExists,
    installedManifest,
    installedManifestParseError,
    packageVersion,
  });
  const checksumsMatch = Boolean(
    sourceChecksum &&
      installedChecksum &&
      sourceChecksum.sha256 === installedChecksum.sha256,
  );
  const packageEvidence = {
    status: state,
    packageVersion,
    installedVersion,
    manifest: {
      status: manifestStatus,
      packageVersion: installedManifest?.packageVersion || null,
      installedAt: installedManifest?.installedAt || null,
      fileCount: installedManifest?.files?.length || 0,
      parseError: installedManifestParseError ? true : false,
    },
    payload: {
      sourceFileCount: sourceFiles.length,
      installedFileCount: installedFiles.length,
      checksumsMatch,
      missingRequiredCount: missingRequiredPaths.length,
      extraInstalledCount: extraInstalledPaths.length,
    },
  };
  const nextAction = nextEvidenceAction({
    state,
    runtime,
    manifestStatus,
    missingRequiredPaths,
    extraInstalledPaths,
    checksumsMatch,
  });
  return {
    runtime,
    package: packageEvidence,
    nextAction,
  };
}

export async function collectInstallParity({
  packageJsonPath,
  sourcePayloadRoot,
  codexPayloadRoot,
  installedClaudeSkillPath,
  minimumNodeMajor,
}) {
  const packageVersion = readPackageVersion(packageJsonPath);
  const installedExists = await pathExists(installedClaudeSkillPath);
  const sourceChecksum = await payloadChecksum(sourcePayloadRoot);
  const sourceFiles = sourceChecksum ? sourceChecksum.files : [];
  const codexChecksum = await payloadChecksum(codexPayloadRoot, sourceFiles);
  const installedFiles = installedExists
    ? await listPayloadFiles(installedClaudeSkillPath, { missingRoot: "empty" })
    : [];
  const installedManifestResult = installedExists
    ? await readInstalledManifest(installedClaudeSkillPath)
    : { manifest: null, parseError: null };
  const installedManifest = installedManifestResult.manifest;
  const extraPaths = installedExists
    ? extraInstalledPaths(installedFiles, sourceFiles)
    : [];
  const installedChecksum = installedExists
    ? await payloadChecksum(installedClaudeSkillPath, sourceFiles)
    : null;
  const missingRequiredPaths = installedExists
    ? await missingPaths(
        installedClaudeSkillPath,
        requiredReferencePaths(sourceFiles),
      )
    : requiredReferencePaths(sourceFiles);
  const installedVersion =
    installedManifest?.packageVersion ||
    (installedExists
      ? await readInstalledVersion(installedClaudeSkillPath)
      : null);
  const state = determineState({
    installedExists,
    packageVersion,
    installedVersion,
    sourceChecksum,
    installedChecksum,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
    installedManifestParseError: installedManifestResult.parseError,
    installedManifestMissing:
      installedExists && !installedManifest && !installedManifestResult.parseError,
  });
  const evidence = buildEvidence({
    state,
    packageVersion,
    installedVersion,
    installedExists,
    installedManifest,
    installedManifestParseError: installedManifestResult.parseError,
    sourceChecksum,
    installedChecksum,
    sourceFiles,
    installedFiles,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
    minimumNodeMajor,
  });

  return {
    ok: state === "ok",
    state,
    packageVersion,
    sourceChecksum,
    codexChecksum,
    installedChecksum,
    sourceFileCount: sourceChecksum ? sourceChecksum.files.length : 0,
    installedFileCount: installedFiles.length,
    installedVersion,
    installedManifest: installedManifest
      ? {
          packageVersion: installedManifest.packageVersion || null,
          installedAt: installedManifest.installedAt || null,
          sourceRoot: installedManifest.sourceRoot || null,
          fileCount: installedManifest.files.length,
        }
      : null,
    installedManifestParseError: installedManifestResult.parseError,
    missingRequiredPaths,
    extraInstalledPaths: extraPaths,
    evidence,
  };
}
