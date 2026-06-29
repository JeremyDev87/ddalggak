import { readdirSync, readFileSync, statSync } from "node:fs";

// Matches completion-signal tokens in both spellings: the canonical underscore
// form ("ISSUE_PR_READY") and the legacy spaced form ("REVIEW DONE"). Both
// spellings are still DETECTED so a reintroduced spaced form is not silently
// dropped; the registry below keys on the raw spelling (no space->underscore
// normalization) so a spaced token no longer matches an underscore definition
// and surfaces as drift instead of being hidden (#280).
const SIGNAL_TOKEN_PATTERN = /\b[A-Z][A-Z_]*[ _](?:DONE|READY)\b/g;

export function isDirectory(targetPath) {
  const stats = statSync(targetPath, { throwIfNoEntry: false });
  return Boolean(stats && stats.isDirectory());
}

export function isFile(targetPath) {
  const stats = statSync(targetPath, { throwIfNoEntry: false });
  return Boolean(stats && stats.isFile());
}

export function tryReadText(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

export function listMdFiles(dirPath) {
  if (!isDirectory(dirPath)) {
    return null;
  }
  return readdirSync(dirPath)
    .filter((name) => name.endsWith(".md"))
    .sort();
}

export function extractSignals(text) {
  // Key on the raw spelling so "REVIEW DONE" and "REVIEW_DONE" stay distinct;
  // collapsing them hid spelling drift the registry should flag (#280).
  const byRaw = new Map();
  for (const match of text.matchAll(SIGNAL_TOKEN_PATTERN)) {
    const raw = match[0];
    if (!byRaw.has(raw)) {
      byRaw.set(raw, { raw });
    }
  }
  return [...byRaw.values()];
}

// Minimal reader for core/projections.yaml: source_root, name/root pairs under
// projection_roots, and parity_ledger entries doctor needs to distinguish
// shared skill files from ledger-declared root-specific files. The file holds
// more sections than doctor consumes (parity targets, token budgets); those
// stay ignored, but unsupported structures inside the consumed sections are
// reported instead of silently dropped (#265).
export function parseProjections(text) {
  const lines = text.split(/\r?\n/);
  let sourceRoot = null;
  const projectionRoots = [];
  const parityLedger = [];
  const errors = [];
  let inProjectionRoots = false;
  let inParityLedger = false;
  let currentName = null;
  let currentLedgerEntry = null;
  const malformed = (lineNumber, message) => {
    errors.push(`core/projections.yaml line ${lineNumber}: ${message}`);
  };
  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const line = lines[index].replace(/\s+#.*$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const topLevel = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (topLevel) {
      inProjectionRoots = topLevel[1] === "projection_roots";
      inParityLedger = topLevel[1] === "parity_ledger";
      if ((inProjectionRoots || inParityLedger) && topLevel[2].trim() !== "") {
        malformed(
          lineNumber,
          `unsupported inline structure for key: ${topLevel[1]}`,
        );
      }
      if (topLevel[1] === "source_root") {
        sourceRoot = topLevel[2].trim().replace(/^"|"$/g, "");
      }
      currentName = null;
      currentLedgerEntry = null;
      continue;
    }

    if (inParityLedger) {
      const itemLine = line.match(/^\s*-\s+path:\s*(.+)$/);
      if (itemLine) {
        currentLedgerEntry = {
          path: itemLine[1].trim().replace(/^"|"$/g, ""),
        };
        parityLedger.push(currentLedgerEntry);
        continue;
      }
      const fieldLine = line.match(/^\s{4,}([A-Za-z0-9_-]+):\s*(.+)$/);
      if (fieldLine && currentLedgerEntry) {
        currentLedgerEntry[fieldLine[1]] = fieldLine[2]
          .trim()
          .replace(/^"|"$/g, "");
        continue;
      }
      malformed(lineNumber, `unparseable parity_ledger line: ${line.trim()}`);
      continue;
    }

    if (!inProjectionRoots) continue;

    const nameLine = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (nameLine) {
      currentName = nameLine[1];
      continue;
    }
    const fieldLine = line.match(/^\s{4,}([A-Za-z0-9_-]+):\s*(.+)$/);
    if (fieldLine && currentName) {
      if (fieldLine[1] === "root") {
        projectionRoots.push({
          name: currentName,
          root: fieldLine[2].trim().replace(/^"|"$/g, ""),
        });
      }
      continue;
    }
    malformed(lineNumber, `unparseable projection_roots line: ${line.trim()}`);
  }
  return { sourceRoot, projectionRoots, parityLedger, errors };
}

// parseSimpleYaml accepts a scalar value for these keys; doctor needs lists,
// and silently coercing a scalar to [] would drop required assets from every
// downstream check — report it as malformed instead.
export function contractRequiredList(doc, label, key, findings) {
  const value = doc[key];
  if (value === undefined) return [];
  if (Array.isArray(value)) return value;
  findings.push(`malformed command contract: ${label}: ${key} must be a list`);
  return [];
}
