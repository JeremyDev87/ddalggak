// --show-doc section extraction for ddalggak dispatch.
// zero-dep, ESM only.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { commandContractReference } from "../../../core/conditional-assets.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const referenceDir = path.join(__dirname, "..", "..", "..", "ddalggak", "references");

// Select by command key, then extract the matching H2 through the next H2.
export function extractDocSection(subcmd, docSection, options = {}) {
  const stderr = options.stderr || process.stderr;
  const stdout = options.stdout || process.stdout;
  if (!Object.hasOwn(docSection, subcmd)) {
    stderr.write(`no doc section for: ${subcmd}\n`);
    return 1;
  }

  const header = docSection[subcmd];
  const selectedDocumentPath = options.selectedDocumentPath
    || path.join(referenceDir, commandContractReference(subcmd));
  let body;
  try {
    body = readFileSync(selectedDocumentPath, "utf8");
  } catch (error) {
    stderr.write(`cannot read command document at ${selectedDocumentPath}: ${error.message}\n`);
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
    stderr.write(`no doc section for: ${subcmd} (${header}) in ${selectedDocumentPath}\n`);
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
