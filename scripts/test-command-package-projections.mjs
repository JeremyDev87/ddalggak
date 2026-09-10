#!/usr/bin/env node
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";
import { commandContractReference, commandReferenceNames, commandTemplateNames } from "../core/conditional-assets.mjs";
import * as packageRenderer from "./project-runtime-assets/render-package-manifest.mjs";
import { buildExpectedBundle, referencedSupportFiles } from "./verify-hermes-native-e2e.mjs";
import { withTempRepo } from "./test-lib/repo-fixture.mjs";
import { runNodeScript } from "./test-lib/process.mjs";

const rootDir = process.cwd();
const commands = loadCommandContracts(rootDir);
const roots = ["ddalggak", ".codex/skills/ddalggak"];
const packageFiles = packageRenderer.requiredPackageFiles(commands);
const docs = roots.flatMap((root) => commands.map((doc) => `${root}/references/${commandContractReference(doc.command)}`));
assert.equal(docs.length, 42);
for (const file of docs) assert(packageFiles.includes(file), `package omits command document: ${file}`);
for (const file of ["core/command-docs/claude.md", "core/command-docs/codex.md", "core/conditional-assets.mjs", "scripts/project-runtime-assets/render-command-docs.mjs", "scripts/test-command-package-projections.mjs"]) {
  assert(packageFiles.includes(file), `package omits source/test dependency: ${file}`);
}
const evidence = { commands: [], rejections: [], documents: [] };
const hash = (text) => createHash("sha256").update(text).digest("hex");
function run(repo, script, args = [], status = 0, diagnostic) {
  const result = runNodeScript(script, args, { cwd: repo });
  const output = `${result.stdout}${result.stderr}`;
  evidence.commands.push({ command: `node ${script} ${args.join(" ")}`.trim(), cwd: repo, exitCode: result.status, output });
  assert.equal(result.status, status, output);
  if (diagnostic) assert.match(output, diagnostic);
  return result;
}
let disposable;
withTempRepo({ rootDir, prefix: "ddalggak-command-package-", run(repo) {
  disposable = repo;
  run(repo, "scripts/project-runtime-assets.mjs", ["--write"]);
  run(repo, "scripts/verify-projections.mjs");
  for (const file of docs) evidence.documents.push({ file, sha256: hash(readFileSync(path.join(repo, file))) });
  const inventory = packageRenderer.installationInventory(commands);
  assert.deepEqual(inventory, [...new Set(inventory)].sort());
  const actualSupport = ["references", "templates", "scripts"].flatMap((kind) =>
    readdirSync(path.join(repo, "ddalggak", kind)).map((name) => `${kind}/${name}`)).sort();
  assert.deepEqual(inventory, actualSupport, "direct installation inventory covers every shipped support file");
  for (const command of commands) {
    assert(inventory.includes(`references/${commandContractReference(command.command)}`));
    for (const file of commandReferenceNames(command)) assert(inventory.includes(`references/${file}`));
    for (const file of commandTemplateNames(command)) assert(inventory.includes(`templates/${file}`));
  }
  const skillPath = path.join(repo, "ddalggak/SKILL.md");
  writeFileSync(skillPath, `${readFileSync(skillPath, "utf8")}\n${inventory.map((file) => `- [${file}](${file})`).join("\n")}\n`);
  assert.deepEqual(referencedSupportFiles(readFileSync(skillPath, "utf8")), inventory);
  const expected = buildExpectedBundle(repo);
  assert.deepEqual(expected.files, ["SKILL.md", ...inventory].sort());
  evidence.bundle = expected;
  run(repo, "scripts/verify-hermes-skill.mjs");

  const installed = path.join(repo, "skill-only");
  for (const file of expected.files) {
    const target = path.join(installed, file);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(repo, "ddalggak", file), target);
  }
  // Remove the source contracts too: the installed runtime must not read core by accident.
  const core = path.join(repo, "core");
  const savedCore = path.join(repo, "saved-core");
  cpSync(core, savedCore, { recursive: true });
  rmSync(core, { recursive: true });
  assert.equal(existsSync(path.join(installed, "core")), false);
  run(installed, "scripts/verify-review-contract.mjs");
  run(installed, "scripts/test-review-policy-layers.mjs");
  for (const file of inventory) assert(existsSync(path.join(installed, file)), file);
  cpSync(savedCore, core, { recursive: true });
  rmSync(savedCore, { recursive: true });
  rmSync(installed, { recursive: true });

  function mutate(name, file, change, script, diagnostic) {
    const target = path.join(repo, file);
    const original = readFileSync(target, "utf8");
    const changed = change(original);
    assert.notEqual(changed, original, name);
    writeFileSync(target, changed);
    run(repo, script, [], 1, diagnostic);
    assert.equal(readFileSync(target, "utf8"), changed, "verifiers must not write");
    writeFileSync(target, original);
    evidence.rejections.push(name);
  }
  const metadataPath = ".codex/skills/ddalggak/references/command-status.md";
  const original = readFileSync(path.join(repo, metadataPath), "utf8");
  const metadata = JSON.parse(original.match(/^```json\n([\s\S]*?)\n```$/m)[1]);
  for (const field of Object.keys(metadata)) {
    mutate(`complete metadata drift: ${field}`, metadataPath, (text) => {
      const wrong = { ...metadata, [field]: null };
      return text.replace(/^```json\n[\s\S]*?\n```$/m, `\x60\x60\x60json\n${JSON.stringify(wrong, null, 2)}\n\x60\x60\x60`);
    }, "scripts/verify-projections.mjs", /command-status\.md.*metadata/);
  }
  for (const file of ["references/command-status.md", "references/start-workflow.md", "scripts/review-contract-policy.mjs"]) {
    const target = path.join(repo, "ddalggak", file);
    const contents = readFileSync(target);
    rmSync(target);
    run(repo, "scripts/verify-hermes-skill.mjs", [], 1, /Hermes support asset missing/);
    assert.throws(() => buildExpectedBundle(repo), /missing expected bundle file/);
    writeFileSync(target, contents);
    evidence.rejections.push(`missing ${file}`);
  }
  mutate("path traversal inventory", "core/projections.yaml", (text) => text.replace("path: references/status.md", "path: references/../status.md"),
    "scripts/verify-projections.mjs", /unsafe.*path/);
  mutate("duplicate metadata block", metadataPath, (text) => `${text}\n\x60\x60\x60json\n{}\n\x60\x60\x60\n`,
    "scripts/verify-projections.mjs", /command-status\.md.*metadata/);
  const orphan = path.join(repo, "ddalggak/references/command-orphan.md");
  writeFileSync(orphan, "# Orphan\n");
  run(repo, "scripts/verify-projections.mjs", [], 1, /command-orphan\.md.*not registered/);
  rmSync(orphan);
  evidence.rejections.push("orphan generated output");

  for (const root of roots) {
    const file = path.join(repo, root, "references/command-status.md");
    const content = readFileSync(file);
    rmSync(file);
    run(repo, "scripts/verify-projections.mjs", [], 1, /command-status\.md.*missing/);
    writeFileSync(file, content);
  }
  // Localized notes remain legal when their locale source is updated and reprojected.
  const locale = path.join(repo, "core/command-docs/codex.md");
  writeFileSync(locale, `${readFileSync(locale, "utf8")}\nLocalized supplemental notes.\n`);
  run(repo, "scripts/project-runtime-assets.mjs", ["--write"]);
  run(repo, "scripts/verify-projections.mjs");
} });
assert.equal(existsSync(disposable), false);
evidence.cleanup = { path: disposable, removed: true };
console.log(JSON.stringify(evidence, null, 2));
console.log("[test:command-package-projections] passed: 42 documents, full metadata parity, direct inventory and skill-only closure");
