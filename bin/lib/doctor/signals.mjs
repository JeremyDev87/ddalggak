import path from "node:path";
import { commandDocumentFindings } from "../../../scripts/verify-codex-skill/semantic-anchors.mjs";

import { extractMarkdownSection } from "../../../scripts/lib/markdown-links.mjs";
import { extractSignals, tryReadText } from "./lib.mjs";

const NAMING_SECTION_TITLE = "명명 규칙";

function extractSection(markdown, title) {
  return extractMarkdownSection(markdown, title, { level: 2 });
}

export function checkSignalRegistry(layout) {
  const findings = [];
  if (!layout.sourceRoot || layout.skillText === null) {
    return { findings }; // layout check already reported the missing input
  }

  const registry = new Set(layout.commands.map((cmd) => cmd.completionSignal).filter(Boolean));
  const handoffs = { "worker-brief.md": "LANE_READY", "review-brief.md": "REVIEW_DONE", "fix-brief.md": "FIX_DONE" };
  const roots = new Map([[layout.sourceRootRel, layout.sourceRoot], ...layout.projectionRoots.map((root) => [root.root, root.abs])]);
  for (const [rootRel, root] of roots) {
    const rootRegistry = new Set(registry);
    for (const name of layout.templateFiles || []) {
      const text = tryReadText(path.join(root, "templates", name));
      if (text !== null) for (const signal of extractSignals(text)) rootRegistry.add(signal.raw);
    }
    for (const [template, signal] of Object.entries(handoffs)) {
      const text = tryReadText(path.join(root, "templates", template));
      if (text === null || !extractSignals(text).some(({ raw }) => raw === signal)) {
        findings.push(`missing handoff signal: "${signal}" in ${rootRel}/templates/${template}`);
      }
    }
    const title = rootRel === layout.sourceRootRel ? NAMING_SECTION_TITLE : "Completion Signals";
    const skill = tryReadText(path.join(root, "SKILL.md"));
    const section = skill === null ? null : extractSection(skill, title);
    if (section === null) {
      findings.push(`signal registry: ${rootRel}/SKILL.md has no "## ${title}" section to audit`);
    } else {
      for (const signal of Object.values(handoffs)) {
        if (!extractSignals(section).some(({ raw }) => raw === signal)) {
          findings.push(`missing handoff signal: "${signal}" in ${rootRel}/SKILL.md ${title}`);
        }
      }
      auditSignals(section, `${rootRel}/SKILL.md ${title}`, rootRegistry);
    }
    for (const cmd of layout.commands) {
      if (cmd.malformed || !cmd.commandReference) continue; // layout reports invalid YAML
      const label = `${rootRel}/references/${cmd.commandReference}`;
      const text = tryReadText(path.join(root, "references", cmd.commandReference));
      findings.push(...commandDocumentFindings(text, cmd.doc, label));
      if (text !== null) auditSignals(text, label, rootRegistry);
    }
  }

  function auditSignals(text, label, registry) {
    for (const signal of extractSignals(text)) {
      if (!registry.has(signal.raw)) {
        findings.push(
          `undefined completion signal: "${signal.raw}" is named in ${label} but has no core/commands completion_signal or templates/*.md definition (check space vs underscore spelling)`,
        );
      }
    }
  }
  return { findings };
}
