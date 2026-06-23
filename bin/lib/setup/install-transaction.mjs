import { randomBytes } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  buildInstalledManifest,
  pathExists,
  readInstalledVersion,
} from "../local-payload.mjs";

function timestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return (
    date.getFullYear().toString() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    "-" +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

async function chooseBackupName(dstDir) {
  const base = `${dstDir}.bak.${timestamp()}`;
  if (!(await pathExists(base))) return base;
  const suffix = randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}

async function writeInstalledManifest({ sourceRoot, installedRoot, version }) {
  const installedManifest = await buildInstalledManifest({
    sourceRoot,
    installedRoot,
    version,
  });
  await writeFile(
    join(installedRoot, ".installed-manifest.json"),
    `${JSON.stringify(installedManifest, null, 2)}\n`,
    "utf8",
  );
}

async function backfillInstalledManifest({ sourceRoot, dstDir, version, out }) {
  const manifestPath = join(dstDir, ".installed-manifest.json");
  if (await pathExists(manifestPath)) {
    return false;
  }
  await writeInstalledManifest({
    sourceRoot,
    installedRoot: dstDir,
    version,
  });
  out(`Wrote missing installed manifest → ${manifestPath}`);
  return true;
}

async function stageInstall({ sourceRoot, dstParent, version }) {
  const stagedDir = await mkdtemp(join(dstParent, ".ddalggak-install-"));
  await cp(sourceRoot, stagedDir, { recursive: true, force: true });
  await writeFile(join(stagedDir, ".installed-version"), `${version}\n`, "utf8");
  await writeInstalledManifest({
    sourceRoot,
    installedRoot: stagedDir,
    version,
  });
  return stagedDir;
}

async function replaceWithTrash({ dstDir, dstParent, stagedDir }) {
  const trashName = await mkdtemp(join(dstParent, ".ddalggak-replace-"));
  await rm(trashName, { recursive: true, force: true });
  await rename(dstDir, trashName);
  try {
    await rename(stagedDir, dstDir);
    await rm(trashName, { recursive: true, force: true });
  } catch (error) {
    if (!(await pathExists(dstDir)) && (await pathExists(trashName))) {
      await rename(trashName, dstDir);
    }
    throw error;
  }
}

async function replaceWithBackup({ dstDir, stagedDir, out }) {
  const backupName = await chooseBackupName(dstDir);
  await rename(dstDir, backupName);
  try {
    await rename(stagedDir, dstDir);
  } catch (error) {
    if (!(await pathExists(dstDir)) && (await pathExists(backupName))) {
      await rename(backupName, dstDir);
    }
    throw error;
  }
  out(`Backed up existing install → ${backupName}`);
}

export async function installSkillPayload({
  sourceRoot,
  dstDir,
  version,
  force,
  noBackup,
  out,
}) {
  const dstExists = await pathExists(dstDir);
  const installed = dstExists ? await readInstalledVersion(dstDir) : null;

  if (dstExists && !force && installed === version) {
    await backfillInstalledManifest({ sourceRoot, dstDir, version, out });
    out(`Already up to date (v${version}) at ${dstDir}`);
    return;
  }

  const dstParent = resolve(dstDir, "..");
  await mkdir(dstParent, { recursive: true });

  const stagedDir = await stageInstall({ sourceRoot, dstParent, version });

  if (!dstExists) {
    await rename(stagedDir, dstDir);
    return;
  }

  if (noBackup) {
    await replaceWithTrash({ dstDir, dstParent, stagedDir });
    return;
  }

  await replaceWithBackup({ dstDir, stagedDir, out });
}
