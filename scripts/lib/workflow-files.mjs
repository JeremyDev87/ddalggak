import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

export function walkYamlFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkYamlFiles(entryPath));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export function collectWorkflowFiles(rootDir) {
  const workflowDir = path.join(rootDir, ".github", "workflows");
  if (!existsSync(workflowDir)) {
    return [];
  }

  return readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort()
    .map((name) => path.join(workflowDir, name));
}
