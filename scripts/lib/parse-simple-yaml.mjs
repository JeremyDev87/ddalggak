function parseScalar(value) {
  if (value === "true" || value === "false") return value === "true";
  return value.replace(/^"|"$/g, "");
}

// Fail-closed simple-YAML parser shared by the generator and the verifier (#240/#242).
// Without onError, any parse error throws so callers cannot silently consume a
// misread document; with onError, every error is delegated (the verifier collects
// all of them) and the partial document is still returned for follow-up checks.
export function parseSimpleYaml(text, label = "YAML", { onError } = {}) {
  const errors = [];
  const fail = onError ?? ((message) => errors.push(message));
  const doc = {};
  let activeBlock = null;
  const seenKeys = new Set();
  const nestedSeenKeysByParent = new Map();
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    if (/\t/.test(line)) {
      fail(`${label} line ${lineNumber}: tabs are unsupported indentation`);
      continue;
    }

    const top = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (top) {
      const [, key, rawValue] = top;
      activeBlock = null;
      if (seenKeys.has(key)) {
        fail(`${label} line ${lineNumber}: duplicate key: ${key}`);
        continue;
      }
      seenKeys.add(key);

      const value = rawValue.trim();
      if (value === "") {
        doc[key] = [];
        activeBlock = key;
      } else if (value === "[]") {
        doc[key] = [];
      } else if (/^[\[\{]/.test(value)) {
        fail(`${label} line ${lineNumber}: unsupported inline structure for key: ${key}`);
      } else {
        doc[key] = parseScalar(value);
      }
      continue;
    }

    const nestedField = line.match(/^ {2}([A-Za-z0-9_-]+):\s*(.+)$/);
    if (nestedField) {
      if (!activeBlock) {
        fail(`${label} line ${lineNumber}: nested mapping without an active top-level key`);
        continue;
      }
      if (Array.isArray(doc[activeBlock]) && doc[activeBlock].length > 0) {
        fail(`${label} line ${lineNumber}: cannot mix list items and nested mapping under ${activeBlock}`);
        continue;
      }
      if (Array.isArray(doc[activeBlock])) {
        doc[activeBlock] = {};
        nestedSeenKeysByParent.set(activeBlock, new Set());
      }
      const [, nestedKey, rawValue] = nestedField;
      const nestedSeenKeys = nestedSeenKeysByParent.get(activeBlock) || new Set();
      nestedSeenKeysByParent.set(activeBlock, nestedSeenKeys);
      if (nestedSeenKeys.has(nestedKey)) {
        fail(`${label} line ${lineNumber}: duplicate nested key under ${activeBlock}: ${nestedKey}`);
        continue;
      }
      nestedSeenKeys.add(nestedKey);

      const value = rawValue.trim();
      if (value === "" || /^[\[\{]/.test(value)) {
        fail(`${label} line ${lineNumber}: unsupported nested structure for ${activeBlock}.${nestedKey}`);
        continue;
      }
      doc[activeBlock][nestedKey] = parseScalar(value);
      continue;
    }

    if (/^ {2}\[\]\s*$/.test(line)) {
      if (!activeBlock || !Array.isArray(doc[activeBlock]) || doc[activeBlock].length > 0) {
        fail(`${label} line ${lineNumber}: standalone empty list marker must belong to an empty top-level list`);
      }
      continue;
    }

    const indentedListItem = line.match(/^(\s*)-\s+(.+)$/);
    if (indentedListItem) {
      const [, indent, item] = indentedListItem;
      if (indent.length !== 2) {
        fail(`${label} line ${lineNumber}: list indentation must be exactly two spaces`);
        continue;
      }
      if (!activeBlock) {
        fail(`${label} line ${lineNumber}: list item without an active top-level list`);
        continue;
      }
      if (!Array.isArray(doc[activeBlock])) {
        fail(`${label} line ${lineNumber}: cannot mix nested mapping and list items under ${activeBlock}`);
        continue;
      }
      if (/^[A-Za-z0-9_-]+:\s*/.test(item.trim())) {
        fail(`${label} line ${lineNumber}: nested mapping list items are unsupported`);
        continue;
      }
      doc[activeBlock].push(item.trim().replace(/^"|"$/g, ""));
      continue;
    }

    if (/^\s+/.test(line)) {
      fail(`${label} line ${lineNumber}: unsupported indentation or nested mapping: ${line.trim()}`);
      continue;
    }

    fail(`${label} line ${lineNumber}: unsupported YAML line: ${line.trim()}`);
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  return doc;
}
