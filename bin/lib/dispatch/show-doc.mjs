// --show-doc section extraction for ddalggak dispatch.
// zero-dep, ESM only.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultSkillPath = path.join(__dirname, "..", "..", "..", "ddalggak", "SKILL.md");

// SKILL.md에서 첫 매칭 H2 섹션부터 다음 H2 직전까지 추출.
export function extractDocSection(subcmd, docSection, options = {}) {
  const stderr = options.stderr || process.stderr;
  const stdout = options.stdout || process.stdout;
  const skillPath = options.skillPath || defaultSkillPath;
  const header = docSection[subcmd];
  if (!header) {
    stderr.write(`no doc section for: ${subcmd}\n`);
    return 1;
  }

  let body;
  try {
    body = readFileSync(skillPath, "utf8");
  } catch {
    stderr.write(`SKILL.md not found at ${skillPath}\n`);
    return 1;
  }

  const lines = body.split("\n");
  const targetLower = header.toLowerCase();

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      const title = line.slice(3).trim().toLowerCase();
      if (title === targetLower) {
        startIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) {
    stderr.write(`no doc section for: ${subcmd}\n`);
    return 1;
  }

  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (lines[j].startsWith("## ")) {
      endIdx = j;
      break;
    }
  }

  const section = lines.slice(startIdx, endIdx).join("\n");
  stdout.write(section.endsWith("\n") ? section : section + "\n");
  return 0;
}
