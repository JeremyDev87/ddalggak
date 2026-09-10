#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";
import { commandContractReference } from "../core/conditional-assets.mjs";
import { extractDocSection } from "../bin/lib/dispatch/show-doc.mjs";
import { extractMarkdownSection } from "./lib/markdown-links.mjs";
import { withTempRepo } from "./test-lib/repo-fixture.mjs";
import { runNodeScript } from "./test-lib/process.mjs";
import { allowedArtifactByCommand } from "./project-runtime-assets/render-skill-blocks.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = { claude: "ddalggak", codex: ".codex/skills/ddalggak" };
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const evidence = { runs: [], artifacts: [], rejections: [] };

function snapshot(dir, prefix = "") {
  return Object.fromEntries(readdirSync(path.join(dir, prefix), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(prefix, entry.name);
      return entry.isDirectory() ? Object.entries(snapshot(dir, file))
        : [[file, sha256(readFileSync(path.join(dir, file)))]];
    }));
}

function run(repo, mode, status, diagnostic) {
  const result = runNodeScript("scripts/project-runtime-assets.mjs", [mode], { cwd: repo });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, status, `${mode}: ${output}`);
  if (diagnostic) assert.match(output, diagnostic);
  evidence.runs.push({ cwd: repo, command: `node scripts/project-runtime-assets.mjs ${mode}`, exitCode: result.status, output });
}

function disclosed(file, doc) {
  let output = "";
  assert.equal(extractDocSection(doc.command, { [doc.command]: doc.show_doc_heading }, {
    selectedDocumentPath: file,
    stdout: { write(text) { output += text; } },
    stderr: { write(text) { assert.fail(text); } },
  }), 0);
  return output;
}

let disposable;
withTempRepo({ rootDir, prefix: "ddalggak-command-docs-", run(repo) {
  disposable = repo;
  const commands = loadCommandContracts(repo);
  assert.equal(commands.length, 21);
  const files = Object.values(roots).flatMap((root) => commands.map((doc) =>
    `${root}/references/${commandContractReference(doc.command)}`));
  // This also exercises the migration when the real checkout already has projections.
  for (const file of files) rmSync(path.join(repo, file), { force: true });
  const before = snapshot(repo);
  run(repo, "--check", 1, /command-start\.md/);
  assert.deepEqual(snapshot(repo), before, "--check must not create missing documents");
  run(repo, "--write", 0);
  assert.equal(files.filter((file) => existsSync(path.join(repo, file))).length, 42);
  const generated = snapshot(repo);
  evidence.generatedTreeSha256 = sha256(JSON.stringify(generated));
  run(repo, "--check", 0);
  assert.deepEqual(snapshot(repo), generated, "successful --check must not write");
  run(repo, "--write", 0, /updated 0 file\(s\)/);
  assert.deepEqual(snapshot(repo), generated, "second --write must be idempotent");

  for (const [locale, root] of Object.entries(roots)) {
    const source = readFileSync(path.join(repo, `core/command-docs/${locale}.md`), "utf8");
    for (const doc of commands) {
      const file = `${root}/references/${commandContractReference(doc.command)}`;
      const text = readFileSync(path.join(repo, file), "utf8");
      assert.equal((text.match(/^# Command: /gm) || []).length, 1);
      assert(text.includes(`# Command: ${doc.command}\n`));
      for (const field of ["Use when:", "Required by:", "Side effects:", "Do not use when:"]) {
        assert.equal(text.split("\n").filter((line) => line.startsWith(field)).length, 1, `${file}: admission ${field}`);
      }
      const blocks = [...text.matchAll(/^```json\n([\s\S]*?)\n```$/gm)];
      assert.equal(blocks.length, 1, `${file}: one machine-readable metadata block`);
      const metadata = JSON.parse(blocks[0][1]);
      assert.deepEqual(metadata, {
        ...doc,
        conditional_references: doc.conditional_references || [],
        conditional_templates: doc.conditional_templates || [],
        allowed_artifact: allowedArtifactByCommand[doc.command],
      }, `${file}: complete YAML-derived metadata equality`);
      const fragment = extractMarkdownSection(source.replace(/\n$/, ""), doc.command, { level: 1 });
      const notes = fragment.slice(fragment.indexOf("\n") + 1).trimStart();
      assert.equal(text.slice(text.indexOf("\n## ") + 1), notes, `${file}: shipped locale notes equality`);
      if (locale === "claude") {
        assert.equal(disclosed(path.join(repo, file), doc),
          notes.endsWith("\n") ? notes : `${notes}\n`, `${file}: unchanged show-doc bytes`);
      }
      evidence.artifacts.push({ file, sha256: sha256(text), metadata });
    }
  }
  evidence.sampleDocument = readFileSync(path.join(repo, "ddalggak/references/command-review.md"), "utf8");

  function rejectMutation(name, file, mutate, diagnostic, { repairable = false } = {}) {
    const absolute = path.join(repo, file);
    const original = readFileSync(absolute, "utf8");
    const changed = mutate(original);
    assert.notEqual(changed, original, `${name}: mutation must take effect`);
    writeFileSync(absolute, changed);
    const before = snapshot(repo);
    run(repo, "--check", 1, diagnostic);
    assert.deepEqual(snapshot(repo), before, `${name}: failing --check must not write`);
    if (repairable) {
      run(repo, "--write", 0);
      assert.equal(readFileSync(absolute, "utf8"), original, `${name}: --write must restore projection`);
    } else {
      run(repo, "--write", 1, diagnostic);
      assert.deepEqual(snapshot(repo), before, `${name}: rejected --write must not change any file`);
      writeFileSync(absolute, original);
    }
    evidence.rejections.push({ name, beforeSha256: sha256(JSON.stringify(before)), noWriteOnCheck: true });
  }

  const output = "ddalggak/references/command-review.md";
  for (const permission of ["source_edit_allowed", "github_write_allowed"]) {
    rejectMutation(`${permission} metadata drift`, output,
      (text) => text.replace(`"${permission}": true`, `"${permission}": false`), /command-review\.md/, { repairable: true });
  }
  rejectMutation("completion metadata drift", output,
    (text) => text.replace('"completion_signal": "REVIEW_DONE"', '"completion_signal": "WRONG_DONE"'),
    /command-review\.md/, { repairable: true });
  rejectMutation("Codex metadata drift", ".codex/skills/ddalggak/references/command-status.md",
    (text) => text.replace('"evidence_required": true', '"evidence_required": false'), /command-status\.md/, { repairable: true });
  rejectMutation("duplicate generated marker", output,
    (text) => `${text.split("\n")[0]}\n${text}`, /duplicate generated marker/);
  rejectMutation("foreign output collision", output, () => "# User-owned notes\nDo not overwrite.\n", /output collision/);
  rejectMutation("wrong owner marker", output,
    (text) => text.replace("command-doc:review", "command-doc:status"), /output collision/);

  for (const locale of Object.keys(roots)) {
    const file = `core/command-docs/${locale}.md`;
    rejectMutation(`${locale} missing key`, file, (text) => text.replace(/^# start\n/m, ""), /21 unique command keys/);
    rejectMutation(`${locale} duplicate key`, file, (text) => `${text}\n# start\n`, /21 unique command keys/);
    rejectMutation(`${locale} unknown key`, file, (text) => text.replace(/^# start$/m, "# unknown"), /21 unique command keys/);
    rejectMutation(`${locale} missing H2`, file, (text) => text.replace(/^## [^\n]+\n/m, ""), /locale H2/);
  }

  // A late collision must reject the entire operation, including earlier block/file drift.
  const first = path.join(repo, files[0]);
  const firstText = readFileSync(first, "utf8");
  const skillPath = path.join(repo, "ddalggak/SKILL.md");
  const skillText = readFileSync(skillPath, "utf8");
  const blockMarker = "<!-- ddalggak:generated:start command-index -->";
  assert(skillText.includes(blockMarker));
  writeFileSync(skillPath, skillText.replace(blockMarker, `${blockMarker}\nSTALE_GENERATED_BLOCK`));
  rmSync(first);
  rejectMutation("late collision with earlier missing output", files.at(-1), () => "unowned\n", /output collision/);
  assert.equal(existsSync(first), false);
  run(repo, "--write", 0);
  assert.equal(readFileSync(first, "utf8"), firstText);
  assert.equal(readFileSync(skillPath, "utf8"), skillText, "whole-file generation and block replacements are integrated");

  const fragmentPath = path.join(repo, "core/command-docs/codex.md");
  const fragmentText = readFileSync(fragmentPath, "utf8");
  rmSync(fragmentPath);
  const missingFragment = snapshot(repo);
  run(repo, "--check", 1, /cannot read core\/command-docs\/codex\.md/);
  run(repo, "--write", 1, /cannot read core\/command-docs\/codex\.md/);
  assert.deepEqual(snapshot(repo), missingFragment);
  writeFileSync(fragmentPath, fragmentText);
  evidence.rejections.push({ name: "missing fragment file", noWriteOnCheck: true, noWriteOnWrite: true });

  rmSync(first);
  symlinkSync(path.join(repo, files[1]), first);
  const linked = snapshot(repo);
  run(repo, "--write", 1, /output collision/);
  assert.deepEqual(snapshot(repo), linked, "symlink collision must not overwrite its target");
  rmSync(first);
  writeFileSync(first, firstText);
  evidence.rejections.push({ name: "symlink output collision", noWriteOnWrite: true });

  const unknown = path.join(repo, "ddalggak/references/command-user-owned.md");
  writeFileSync(unknown, "unregistered user file\n");
  const withUnknown = snapshot(repo);
  run(repo, "--write", 0, /updated 0 file\(s\)/);
  assert.deepEqual(snapshot(repo), withUnknown, "never delete unknown files");
  run(repo, "--check", 0);
  evidence.unregisteredFilesPreserved = true;
} });
assert.equal(existsSync(disposable), false, "temporary repo must be cleaned");
evidence.cleanup = { path: disposable, removed: true };
console.log(JSON.stringify(evidence, null, 2));
console.log("[test:command-doc-projections] passed: 42 documents, complete metadata, locale/CLI compatibility, fail-closed generation");
