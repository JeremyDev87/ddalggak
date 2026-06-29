function finishMarkdown(lines) {
  return `${lines.join("\n").trim()}\n`;
}

function emitJson(value, output = process.stdout) {
  output.write(`${JSON.stringify(value, null, 2)}\n`);
}

function emitMarkdown(markdown, output = process.stdout) {
  output.write(markdown);
}

function emitReport({ format, report, formatMarkdown, output = process.stdout }) {
  if (format === "json") {
    emitJson(report, output);
    return;
  }
  emitMarkdown(formatMarkdown(report), output);
}

function markdownCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).replace(/\|/g, "&#124;").replace(/\r?\n/g, "<br>");
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.map(markdownCell).join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
  ];
}

function pushMarkdownTable(lines, headers, rows) {
  lines.push(...markdownTable(headers, rows));
}

function countSummary(counts, keys = Object.keys(counts)) {
  return keys.map((key) => `${key}=${counts[key] ?? 0}`).join(", ");
}

function emitMarkdownFindings(lines, findings, { empty = "- no findings", formatFinding = (finding) => `- ${finding}` } = {}) {
  if (!findings || findings.length === 0) {
    lines.push(empty);
    return;
  }
  for (const finding of findings) {
    lines.push(formatFinding(finding));
  }
}

export {
  countSummary,
  emitJson,
  emitMarkdown,
  emitMarkdownFindings,
  emitReport,
  finishMarkdown,
  markdownTable,
  pushMarkdownTable,
};
