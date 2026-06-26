export function lineIndent(line) {
  return line.match(/^\s*/)?.[0].length ?? 0;
}

export function indentOf(line) {
  let count = 0;
  for (const char of line) {
    if (char === " ") {
      count += 1;
    } else if (char === "\t") {
      count += 2;
    } else {
      break;
    }
  }
  return count;
}

export function stripComment(line) {
  const hashIndex = line.indexOf("#");
  if (hashIndex === -1) {
    return line;
  }

  // Preserve GitHub expression contents such as `${{ hashFiles(...) }}`.
  const beforeHash = line.slice(0, hashIndex);
  const openBraces = (beforeHash.match(/\$\{\{/g) || []).length;
  const closeBraces = (beforeHash.match(/\}\}/g) || []).length;
  if (openBraces > closeBraces) {
    return line;
  }

  return beforeHash;
}

export function collectBlock(lines, startIndex) {
  const startIndent = lineIndent(lines[startIndex]);
  const entries = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const indent = lineIndent(line);
    if (indent <= startIndent) {
      break;
    }
    entries.push({ line: i + 1, text: trimmed });
  }
  return entries;
}

export function collectBlockLines(lines, startIndex) {
  const startIndent = lineIndent(lines[startIndex]);
  const result = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (lineIndent(line) <= startIndent) {
      break;
    }
    result.push({ lineNo: i + 1, text: trimmed });
  }
  return result;
}

export function extractTopLevelBlocks(lines) {
  const blocks = new Map();
  let currentKey = null;
  let currentLines = [];

  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }
    const indent = indentOf(line);
    const keyMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)?$/);
    if (indent === 0 && keyMatch) {
      if (currentKey !== null) {
        blocks.set(currentKey, currentLines);
      }
      currentKey = keyMatch[1];
      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    blocks.set(currentKey, currentLines);
  }
  return blocks;
}
