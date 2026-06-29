import path from "node:path";

import { extractDocLinks } from "../../../scripts/lib/markdown-links.mjs";
import { isFile, tryReadText } from "./lib.mjs";

export function checkReachability(layout) {
  const findings = [];
  if (!layout.sourceRoot) {
    return { findings };
  }

  const reached = new Set();
  const queue = [];
  const seed = (key) => {
    if (!reached.has(key)) {
      reached.add(key);
      queue.push(key);
    }
  };

  if (layout.skillText !== null) {
    for (const link of extractDocLinks(layout.skillText)) seed(link);
  }
  for (const cmd of layout.commands) {
    for (const name of cmd.requiredReferences) seed(`references/${name}`);
    for (const name of cmd.requiredTemplates) seed(`templates/${name}`);
  }

  while (queue.length > 0) {
    const key = queue.pop();
    const text = tryReadText(path.join(layout.sourceRoot, key));
    if (text === null) continue; // dead-pointer check reports missing targets
    for (const link of extractDocLinks(text)) seed(link);
  }

  for (const name of layout.referenceFiles) {
    if (!reached.has(`references/${name}`)) {
      findings.push(
        `orphan reference: ${layout.sourceRootRel}/references/${name} (unreachable from SKILL.md or core/commands required_references)`,
      );
    }
  }
  for (const name of layout.templateFiles) {
    if (!reached.has(`templates/${name}`)) {
      findings.push(
        `orphan template: ${layout.sourceRootRel}/templates/${name} (unreachable from SKILL.md or core/commands required_templates)`,
      );
    }
  }
  return { findings };
}

export function checkDeadPointers(layout) {
  const findings = [];
  if (!layout.sourceRoot) {
    return { findings };
  }

  const sources = [];
  if (layout.skillText !== null) {
    sources.push({
      label: `${layout.sourceRootRel}/SKILL.md`,
      text: layout.skillText,
    });
  }
  for (const name of layout.referenceFiles) {
    const text = tryReadText(path.join(layout.sourceRoot, "references", name));
    if (text !== null) {
      sources.push({
        label: `${layout.sourceRootRel}/references/${name}`,
        text,
      });
    }
  }
  for (const name of layout.templateFiles) {
    const text = tryReadText(path.join(layout.sourceRoot, "templates", name));
    if (text !== null) {
      sources.push({
        label: `${layout.sourceRootRel}/templates/${name}`,
        text,
      });
    }
  }

  for (const source of sources) {
    for (const link of extractDocLinks(source.text)) {
      if (!isFile(path.join(layout.sourceRoot, link))) {
        findings.push(
          `dead pointer: ${source.label} -> ${link} (not found under ${layout.sourceRootRel}/)`,
        );
      }
    }
  }

  for (const cmd of layout.commands) {
    for (const name of cmd.requiredReferences) {
      if (!isFile(path.join(layout.sourceRoot, "references", name))) {
        findings.push(
          `dead pointer: core/commands/${cmd.file} required_references -> references/${name} (not found under ${layout.sourceRootRel}/)`,
        );
      }
    }
    for (const name of cmd.requiredTemplates) {
      if (!isFile(path.join(layout.sourceRoot, "templates", name))) {
        findings.push(
          `dead pointer: core/commands/${cmd.file} required_templates -> templates/${name} (not found under ${layout.sourceRootRel}/)`,
        );
      }
    }
  }
  return { findings };
}
