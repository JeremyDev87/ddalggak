import path from "node:path";

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

  const section = extractSection(layout.skillText, NAMING_SECTION_TITLE);
  if (section === null) {
    findings.push(
      `signal registry: ${layout.sourceRootRel}/SKILL.md has no "## ${NAMING_SECTION_TITLE}" section to audit`,
    );
    return { findings };
  }

  const registry = new Set();
  for (const cmd of layout.commands) {
    if (cmd.completionSignal) registry.add(cmd.completionSignal);
  }
  for (const name of layout.templateFiles) {
    const text = tryReadText(path.join(layout.sourceRoot, "templates", name));
    if (text === null) continue;
    for (const signal of extractSignals(text)) {
      registry.add(signal.raw);
    }
  }

  for (const signal of extractSignals(section)) {
    if (!registry.has(signal.raw)) {
      findings.push(
        `undefined completion signal: "${signal.raw}" is named in SKILL.md ${NAMING_SECTION_TITLE} but has no core/commands completion_signal or templates/*.md definition (check space vs underscore spelling)`,
      );
    }
  }
  return { findings };
}
