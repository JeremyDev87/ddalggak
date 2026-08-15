#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { commandReferenceNames, commandTemplateNames } from "../core/conditional-assets.mjs";
import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";

const rootDir = process.cwd();
const skillRoot = path.join(rootDir, "ddalggak");
const skillPath = path.join(skillRoot, "SKILL.md");
const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch (error) {
    fail(`missing or unreadable: ${path.relative(rootDir, filePath)} (${error.message})`);
    return "";
  }
}

function frontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    fail("ddalggak/SKILL.md must start with YAML frontmatter");
    return "";
  }
  return match[1];
}

function scalar(block, key) {
  const match = block.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) return null;
  return match[1].replace(/^(["'])([\s\S]*)\1$/, "$2");
}

function explicitSupportLinks(text) {
  const links = new Set();
  for (const match of text.matchAll(/(?:\]\(|`|(?:^|[\s"']))((?:references|templates|scripts|assets|examples)\/[^\s)`"'<>]+)/gm)) {
    const relPath = match[1].replace(/[.,;:]+$/, "");
    if (relPath.split("/").includes("..")) {
      fail(`ddalggak/SKILL.md contains unsafe support path: ${relPath}`);
      continue;
    }
    links.add(relPath);
  }
  return links;
}

function requiredCommandAssets(skillText) {
  const assets = new Set();
  for (const command of loadCommandContracts(rootDir)) {
    for (const reference of commandReferenceNames(command)) {
      const relPath = `references/${reference}`;
      assets.add(relPath);
      if (!skillText.includes(relPath)) {
        fail(`ddalggak/SKILL.md does not link required asset for ${command.command}: ${relPath}`);
      }
    }
    for (const template of commandTemplateNames(command)) {
      const relPath = `templates/${template}`;
      assets.add(relPath);
      if (!skillText.includes(relPath)) {
        fail(`ddalggak/SKILL.md does not link required asset for ${command.command}: ${relPath}`);
      }
    }
  }
  return assets;
}

function packedPaths() {
  const cacheDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-hermes-pack-"));
  try {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(
      npmCommand,
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      {
        cwd: rootDir,
        env: { ...process.env, npm_config_cache: cacheDir },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (result.status !== 0) {
      fail(`npm pack --dry-run failed with exit ${result.status}: ${result.stderr || result.stdout}`);
      return new Set();
    }
    try {
      const report = JSON.parse(result.stdout);
      if (!Array.isArray(report) || !Array.isArray(report[0]?.files)) {
        throw new Error("unexpected npm pack JSON shape");
      }
      return new Set(report[0].files.map((file) => file.path));
    } catch (error) {
      fail(`cannot parse npm pack --dry-run JSON: ${error.message}`);
      return new Set();
    }
  } finally {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}

const skillText = readText(skillPath);
const header = frontmatter(skillText);
if (scalar(header, "name") !== "ddalggak") {
  fail("ddalggak/SKILL.md frontmatter name must be ddalggak");
}
const description = scalar(header, "description");
if (!description || !description.startsWith("Use ")) {
  fail("ddalggak/SKILL.md frontmatter description must be a non-empty 'Use ...' discovery trigger");
}

const requiredAssets = requiredCommandAssets(skillText);
for (const linkedPath of explicitSupportLinks(skillText)) requiredAssets.add(linkedPath);

for (const relPath of requiredAssets) {
  if (!existsSync(path.join(skillRoot, relPath))) {
    fail(`Hermes support asset missing: ddalggak/${relPath}`);
  }
}

const packed = packedPaths();
for (const relPath of ["SKILL.md", ...requiredAssets]) {
  const packagePath = `ddalggak/${relPath}`;
  if (!packed.has(packagePath)) {
    fail(`Hermes support asset missing from npm package: ${packagePath}`);
  }
}

if (failures.length > 0) {
  console.error("[verify:hermes-skill] failed");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `[verify:hermes-skill] passed: shared ddalggak root, ${requiredAssets.size} reachable support assets, npm package inclusion`,
);
