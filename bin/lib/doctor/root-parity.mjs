import path from "node:path";

import { isDirectory, isFile, listMdFiles } from "./lib.mjs";

// Existence-only parity over the shared skill surface. Content parity is
// deliberately out of scope (parity ledger owns byte/checksum comparison).
function collectParitySurface(absRoot) {
  if (!isDirectory(absRoot)) {
    return null;
  }
  const surface = new Set();
  if (isFile(path.join(absRoot, "SKILL.md"))) {
    surface.add("SKILL.md");
  }
  for (const dir of ["references", "templates"]) {
    const names = listMdFiles(path.join(absRoot, dir));
    if (names === null) continue;
    for (const name of names) {
      surface.add(`${dir}/${name}`);
    }
  }
  return surface;
}

export function checkRootParity(layout) {
  const findings = [];
  if (layout.projectionRoots.length < 2) {
    return { findings }; // nothing to compare; layout check reports empty roots
  }

  const surfaces = layout.projectionRoots.map((entry) => ({
    ...entry,
    files: collectParitySurface(entry.abs),
  }));

  for (const surface of surfaces) {
    if (surface.files === null) {
      findings.push(
        `projection root missing: ${surface.root}/ (declared as "${surface.name}" in core/projections.yaml)`,
      );
    }
  }

  const present = surfaces.filter((surface) => surface.files !== null);
  if (present.length < 2) {
    return { findings };
  }

  const union = new Set();
  for (const surface of present) {
    for (const file of surface.files) union.add(file);
  }
  const parityByPath = new Map(
    layout.parityLedger
      .filter((entry) => entry.path)
      .map((entry) => [entry.path, entry]),
  );
  for (const file of [...union].sort()) {
    const have = present.filter((surface) => surface.files.has(file));
    if (have.length === present.length) continue;
    const ledgerEntry = parityByPath.get(file);
    if (
      ledgerEntry?.class === "root-specific" &&
      have.length === 1 &&
      have[0].name === ledgerEntry.root
    ) {
      continue;
    }
    for (const missing of present.filter((surface) => !surface.files.has(file))) {
      findings.push(
        `missing in ${missing.root}: ${file} (present in ${have
          .map((surface) => surface.root)
          .join(", ")})`,
      );
    }
  }
  return { findings };
}
