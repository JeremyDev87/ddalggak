export const DOC_LINK_PATTERN = /\b(references|templates)\/[A-Za-z0-9][A-Za-z0-9._-]*\.md\b/g;

export function extractDocLinks(text) {
  const links = new Set();
  for (const match of text.matchAll(DOC_LINK_PATTERN)) {
    links.add(match[0]);
  }
  return [...links].sort();
}

export function extractMarkdownSection(markdown, title, { level = 2 } = {}) {
  const prefix = `${"#".repeat(level)} `;
  const lines = markdown.split("\n");
  let startIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].startsWith(prefix) && lines[i].slice(prefix.length).trim() === title) {
      startIdx = i;
      break;
    }
  }
  if (startIdx === -1) {
    return null;
  }

  const nextSectionPattern = new RegExp(`^#{1,${level}}\\s+`);
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j += 1) {
    if (nextSectionPattern.test(lines[j])) {
      endIdx = j;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}
