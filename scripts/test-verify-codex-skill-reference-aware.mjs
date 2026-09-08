import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";
import { commandDocumentFindings } from "./verify-codex-skill/semantic-anchors.mjs";
import { extractMarkdownSection as extractSection } from "./lib/markdown-links.mjs";

const rootDir = process.cwd();
const nodeCommand = process.execPath;

function copyRepo() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-reference-aware-"));
  cpSync(rootDir, tempDir, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(rootDir, source);
      return !relative.split(path.sep).some((part) => part === ".git" || part === "node_modules");
    },
  });
  return tempDir;
}

function runVerifier(tempDir) {
  return spawnSync(nodeCommand, ["scripts/verify-codex-skill.mjs"], {
    cwd: tempDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      DDALGGAK_NO_UPDATE: "1",
      npm_config_cache: process.env.npm_config_cache || path.join(os.tmpdir(), "ddalggak-npm-cache"),
    },
  });
}

function replaceInFile(filePath, from, to) {
  const text = readFileSync(filePath, "utf8");
  if (!text.includes(from)) {
    throw new Error(`${path.relative(rootDir, filePath)} did not contain expected probe text: ${from}`);
  }
  writeFileSync(filePath, text.split(from).join(to));
}

function assertPass(name, result) {
  if (result.status !== 0) {
    throw new Error(
      `${name}: expected verifier to pass, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

function assertFail(name, result, expectedMessage) {
  if (result.status === 0) {
    throw new Error(`${name}: expected verifier to fail, but it passed\nstdout:\n${result.stdout}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(expectedMessage)) {
    throw new Error(
      `${name}: expected failure output to include ${JSON.stringify(expectedMessage)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

function withTempRepo(name, fn) {
  const tempDir = copyRepo();
  try {
    const generated = spawnSync(nodeCommand, ["scripts/project-runtime-assets.mjs", "--write"], {
      cwd: tempDir, encoding: "utf8", env: { ...process.env, DDALGGAK_NO_UPDATE: "1" },
    });
    assertPass("temporary command projection", generated);
    fn(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

withTempRepo("complete metadata and per-owner contracts for all 21 commands", (tempDir) => {
  const commands = loadCommandContracts(tempDir);
  assert.equal(commands.length, 21);
  let mutations = 0;
  for (const root of ["ddalggak", ".codex/skills/ddalggak"]) {
    for (const doc of commands) {
      const label = `${root}/references/command-${doc.command}.md`;
      const text = readFileSync(path.join(tempDir, label), "utf8");
      assert.deepEqual(commandDocumentFindings(text, doc, label), []);
      assert.deepEqual(commandDocumentFindings(`${text}\nLocalized supplementary notes.\n`, doc, label), []);
      const block = text.match(/^```json\n([\s\S]*?)^```/m);
      const metadata = JSON.parse(block[1]);
      const reject = (changed) => {
        const findings = commandDocumentFindings(text.replace(block[1], `${JSON.stringify(changed, null, 2)}\n`), doc, label);
        assert.ok(findings.some((finding) => finding.includes(label) && finding.includes("command metadata drift")), `${label}: ${JSON.stringify(changed)}`);
        mutations++;
      };
      for (const key of Object.keys(metadata)) {
        const deleted = structuredClone(metadata);
        delete deleted[key];
        reject(deleted);
        const changed = structuredClone(metadata);
        changed[key] = typeof changed[key] === "boolean" ? !changed[key] : typeof changed[key] === "number" ? changed[key] + 1 : Array.isArray(changed[key]) ? [...changed[key], "UNDECLARED.md"] : typeof changed[key] === "object" ? { ...changed[key], completion_signal: "UNDEFINED_DONE" } : `${changed[key]} drift`;
        reject(changed);
      }
      reject({ ...metadata, undeclared_field: true });
      assert.ok(commandDocumentFindings(null, doc, label).some((finding) => finding.includes("missing required command owner")));
      assert.ok(commandDocumentFindings(`${text}\n${block[0]}\n`, doc, label).some((finding) => finding.includes("exactly one JSON block")));
      assert.ok(commandDocumentFindings(text.replace(block[1], "invalid JSON\n"), doc, label).some((finding) => finding.includes("command metadata drift")));
      const sibling = commands.find((candidate) => candidate.command !== doc.command);
      assert.ok(commandDocumentFindings(text, sibling, label).length > 0);
    }
  }
  console.log(`[PASS] 42 owner documents, ${mutations} complete-metadata rejection controls`);
});

withTempRepo("command anchors cannot be rescued by SKILL or sibling documents", (tempDir) => {
  for (const root of ["ddalggak", ".codex/skills/ddalggak"]) {
    const owner = path.join(tempDir, root, "references/command-review.md");
    replaceInFile(owner, "Execution contract index:", "Removed owner index:");
  }
  assertFail("command anchors cannot be rescued by SKILL or sibling documents", runVerifier(tempDir), "compact contract missing anchor: Execution contract index:");
});

withTempRepo("may-localize notes retain independent prose", (tempDir) => {
  const fragments = path.join(tempDir, "core/command-docs/codex.md");
  const section = extractSection(readFileSync(fragments, "utf8"), "status", { level: 1 });
  assert.ok(section);
  replaceInFile(fragments, section, `${section}\nLocalized supplementary notes.\n`);
  assertPass("localized source projection", spawnSync(nodeCommand, ["scripts/project-runtime-assets.mjs", "--write"], { cwd: tempDir, encoding: "utf8" }));
  assertPass("may-localize notes retain independent prose", runVerifier(tempDir));
});

withTempRepo("command metadata is checked at its owner", (tempDir) => {
  const owner = path.join(tempDir, "ddalggak/references/command-status.md");
  replaceInFile(owner, '"source_edit_allowed": false', '"source_edit_allowed": true');
  assertFail("command metadata is checked at its owner", runVerifier(tempDir), "command metadata drift");
});

withTempRepo("reference-only anchor can leave SKILL.md", (tempDir) => {
  for (const skillRelativePath of [".codex/skills/ddalggak/SKILL.md", "ddalggak/SKILL.md"]) {
    const skillPath = path.join(tempDir, skillRelativePath);
    if (readFileSync(skillPath, "utf8").includes("Counterargument Pass")) {
      replaceInFile(
        skillPath,
        "Counterargument Pass",
        "Counterargument guardrail is intentionally verified from references only",
      );
    }
  }
  assertPass("reference-only anchor can leave SKILL.md", runVerifier(tempDir));
});

withTempRepo("hot-path anchor must remain in SKILL.md", (tempDir) => {
  for (const skillRelativePath of [".codex/skills/ddalggak/SKILL.md", "ddalggak/SKILL.md"]) {
    replaceInFile(path.join(tempDir, skillRelativePath), "URL beats cwd", "URL target contract moved away");
  }
  assertFail("hot-path anchor must remain in SKILL.md", runVerifier(tempDir), "hot-path anchors missing from");
});

withTempRepo("hot-path invariant anchor cannot be semantically inverted", (tempDir) => {
  for (const skillRelativePath of [".codex/skills/ddalggak/SKILL.md", "ddalggak/SKILL.md"]) {
    replaceInFile(
      path.join(tempDir, skillRelativePath),
      "Manual merge only",
      "Manual merge only? 아니, auto-merge OK",
    );
  }
  assertFail(
    "hot-path invariant anchor cannot be semantically inverted",
    runVerifier(tempDir),
    "semantic inversion near required anchor 'Manual merge only'",
  );
});

withTempRepo("router reference-owned anchor must remain in references", (tempDir) => {
  for (const referenceRelativePath of [
    ".codex/skills/ddalggak/references/quality-lens-router.md",
    "ddalggak/references/quality-lens-router.md",
  ]) {
    replaceInFile(
      path.join(tempDir, referenceRelativePath),
      "Domain gate is a lens, not a mandate",
      "Domain gate text removed from this reference",
    );
  }
  assertFail(
    "router reference-owned anchor must remain in references",
    runVerifier(tempDir),
    "preserve these details in the appropriate references/* file instead of re-expanding SKILL.md",
  );
});

withTempRepo("evidence reference-owned anchor must remain in references", (tempDir) => {
  for (const referenceRelativePath of [
    ".codex/skills/ddalggak/references/evidence-contract.md",
    "ddalggak/references/evidence-contract.md",
  ]) {
    replaceInFile(
      path.join(tempDir, referenceRelativePath),
      "not-applicable: <reason>",
      "not-applicable reason placeholder removed",
    );
  }
  assertFail(
    "evidence reference-owned anchor must remain in references",
    runVerifier(tempDir),
    "preserve these details in the appropriate references/* file instead of re-expanding SKILL.md",
  );
});

withTempRepo("core invariants reference must exist in both payload roots", (tempDir) => {
  for (const referenceRelativePath of [
    ".codex/skills/ddalggak/references/core-invariants.md",
    "ddalggak/references/core-invariants.md",
  ]) {
    rmSync(path.join(tempDir, referenceRelativePath), { force: true });
  }
  assertFail(
    "core invariants reference must exist in both payload roots",
    runVerifier(tempDir),
    "ddalggak/references/core-invariants.md must exist for Core Invariants contract verification.",
  );
});

withTempRepo("required references must keep admission headers", (tempDir) => {
  for (const referenceRelativePath of [
    ".codex/skills/ddalggak/references/start-workflow.md",
    "ddalggak/references/start-workflow.md",
  ]) {
    replaceInFile(path.join(tempDir, referenceRelativePath), "Use when:", "Missing use trigger:");
  }
  assertFail(
    "required references must keep admission headers",
    runVerifier(tempDir),
    "missing required reference admission header fields",
  );
});

const routerReferenceRelativePaths = [
  ".codex/skills/ddalggak/references/quality-lens-router.md",
  "ddalggak/references/quality-lens-router.md",
];
const routerInputsSectionBody = `Inspect all available signals before selecting gates:

- user request text;
- GitHub issue body and comments;
- PR file list;
- diff paths and changed symbols;
- repository and product conventions that outrank generic rules.`;

withTempRepo("section kept as heading-only must fail", (tempDir) => {
  for (const referenceRelativePath of routerReferenceRelativePaths) {
    replaceInFile(path.join(tempDir, referenceRelativePath), routerInputsSectionBody, "");
  }
  assertFail("section kept as heading-only must fail", runVerifier(tempDir), "must keep a substantive body");
});

withTempRepo("section-scoped anchors require their owning heading", (tempDir) => {
  for (const referenceRelativePath of routerReferenceRelativePaths) {
    replaceInFile(path.join(tempDir, referenceRelativePath), "## Priority Order", "## Priorities");
  }
  assertFail(
    "section-scoped anchors require their owning heading",
    runVerifier(tempDir),
    "required section heading missing",
  );
});

withTempRepo("anchor moved to an unrelated section must fail", (tempDir) => {
  for (const referenceRelativePath of routerReferenceRelativePaths) {
    const referencePath = path.join(tempDir, referenceRelativePath);
    replaceInFile(referencePath, "This priority is exact. For example,", "For example,");
    replaceInFile(
      referencePath,
      "Backend-only work must not receive frontend/UI/domain gates",
      "This priority is exact. Backend-only work must not receive frontend/UI/domain gates",
    );
  }
  assertFail(
    "anchor moved to an unrelated section must fail",
    runVerifier(tempDir),
    "must appear under this heading",
  );
});

withTempRepo("router activation keywords must stay aligned with gate references", (tempDir) => {
  for (const referenceRelativePath of routerReferenceRelativePaths) {
    replaceInFile(path.join(tempDir, referenceRelativePath), "responsive, screenshot,", "responsive,");
  }
  assertFail(
    "router activation keywords must stay aligned with gate references",
    runVerifier(tempDir),
    "Quality Lens Router Activate when cell for frontend-design is missing gate activation contract keyword(s)",
  );
});

withTempRepo("gate Activation sections must keep router contract keywords", (tempDir) => {
  for (const referenceRelativePath of [
    ".codex/skills/ddalggak/references/vercel-agent-skills-gates.md",
    "ddalggak/references/vercel-agent-skills-gates.md",
  ]) {
    replaceInFile(path.join(tempDir, referenceRelativePath), "React Native/Expo/mobile performance", "React Native/Expo/native performance");
  }
  assertFail(
    "gate Activation sections must keep router contract keywords",
    runVerifier(tempDir),
    "vercel-agent-skills-gates.md ## Activation for vercel-agent-skills is missing router activation contract keyword(s)",
  );
});

console.log("\n[test:reference-aware-skill-anchors] passed");
