import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const RUNTIME_AUTHORITY_PATTERNS = [
  /auto[\s-]?merge\s*=\s*true/i,
  /approved\s*=\s*true/i,
  /execute\s*=\s*true/i,
  /runtime[\s-]?authority\s*=\s*true/i,
];

export function discoverIssueTemplateFiles(templateDir) {
  if (!existsSync(templateDir)) {
    return { exists: false, configFile: path.join(templateDir, "config.yml"), formFiles: [] };
  }

  const configFile = path.join(templateDir, "config.yml");
  const formFiles = readdirSync(templateDir)
    .filter((file) => file.endsWith(".yml") && file !== "config.yml")
    .sort()
    .map((file) => ({ file, path: path.join(templateDir, file) }));

  return { exists: true, configFile, formFiles };
}

export function readTextFile(filePath) {
  return readFileSync(filePath, "utf8");
}

export function hasConfigKey(configContent, key) {
  return new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`, "m").test(configContent);
}

export function hasFieldId(content, fieldId) {
  return new RegExp(`\\bid:\\s*${escapeRegExp(fieldId)}\\b`).test(content);
}

export function parseYamlStringList(content, key) {
  const inline = content.match(new RegExp(`^${escapeRegExp(key)}:\\s*\\[([^\\]]*)\\]`, "m"));
  if (inline) {
    return inline[1]
      .split(",")
      .map((value) => stripYamlScalar(value.trim()))
      .filter((value) => value.length > 0);
  }

  const block = content.match(new RegExp(`^${escapeRegExp(key)}:\\s*\\n((?:\\s+-\\s+.+\\n?)+)`, "m"));
  if (!block) {
    return null;
  }

  return block[1]
    .split(/\n/)
    .map((line) => line.match(/^\s+-\s+(.+)\s*$/)?.[1] || "")
    .map((value) => stripYamlScalar(value.trim()))
    .filter((value) => value.length > 0);
}

export function containsAny(content, needles) {
  return needles.some((needle) => content.includes(needle));
}

export function findRuntimeAuthorityPatterns(content) {
  return RUNTIME_AUTHORITY_PATTERNS.filter((pattern) => pattern.test(content));
}

function stripYamlScalar(value) {
  return value.replace(/^['"]|['"]$/g, "").trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
