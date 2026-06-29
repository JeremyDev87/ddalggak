import { readdirSync } from "node:fs";
import path from "node:path";

import { parseSimpleYaml } from "../../../scripts/lib/parse-simple-yaml.mjs";
import {
  contractRequiredList,
  isDirectory,
  listMdFiles,
  parseProjections,
  tryReadText,
} from "./lib.mjs";

export function loadLayout(rootDir) {
  const findings = [];

  const projectionsPath = path.join(rootDir, "core", "projections.yaml");
  const projectionsText = tryReadText(projectionsPath);
  let sourceRootRel = null;
  let projectionRoots = [];
  let parityLedger = [];
  if (projectionsText === null) {
    findings.push("missing core/projections.yaml (cannot resolve source/projection roots)");
  } else {
    const parsed = parseProjections(projectionsText);
    findings.push(...parsed.errors);
    sourceRootRel = parsed.sourceRoot;
    projectionRoots = parsed.projectionRoots.map((entry) => ({
      ...entry,
      abs: path.join(rootDir, entry.root),
    }));
    parityLedger = parsed.parityLedger;
    if (!sourceRootRel) {
      findings.push("core/projections.yaml has no source_root entry");
    }
    if (projectionRoots.length === 0) {
      findings.push("core/projections.yaml declares no projection_roots");
    }
  }

  const sourceRoot = sourceRootRel ? path.join(rootDir, sourceRootRel) : null;
  if (sourceRootRel && !isDirectory(sourceRoot)) {
    findings.push(`source root directory missing: ${sourceRootRel}/`);
  }

  let skillText = null;
  if (sourceRoot && isDirectory(sourceRoot)) {
    skillText = tryReadText(path.join(sourceRoot, "SKILL.md"));
    if (skillText === null) {
      findings.push(`missing ${sourceRootRel}/SKILL.md`);
    }
  }

  const commandsDir = path.join(rootDir, "core", "commands");
  const commands = [];
  if (!isDirectory(commandsDir)) {
    findings.push("missing core/commands/ directory");
  } else {
    const commandFiles = readdirSync(commandsDir)
      .filter((name) => name.endsWith(".yaml"))
      .sort();
    if (commandFiles.length === 0) {
      findings.push("core/commands/ contains no *.yaml command contracts");
    }
    for (const file of commandFiles) {
      const text = tryReadText(path.join(commandsDir, file));
      if (text === null) {
        findings.push(`unreadable command contract: core/commands/${file}`);
        continue;
      }
      const label = `core/commands/${file}`;
      const doc = parseSimpleYaml(text, label, {
        onError: (message) =>
          findings.push(`malformed command contract: ${message}`),
      });
      commands.push({
        file,
        requiredReferences: contractRequiredList(
          doc,
          label,
          "required_references",
          findings,
        ),
        requiredTemplates: contractRequiredList(
          doc,
          label,
          "required_templates",
          findings,
        ),
        completionSignal:
          typeof doc.output_contract?.completion_signal === "string"
            ? doc.output_contract.completion_signal
            : null,
      });
    }
  }

  const referenceFiles =
    (sourceRoot && listMdFiles(path.join(sourceRoot, "references"))) || [];
  const templateFiles =
    (sourceRoot && listMdFiles(path.join(sourceRoot, "templates"))) || [];

  return {
    rootDir,
    findings,
    sourceRoot,
    sourceRootRel,
    projectionRoots,
    parityLedger,
    commands,
    skillText,
    referenceFiles,
    templateFiles,
  };
}
