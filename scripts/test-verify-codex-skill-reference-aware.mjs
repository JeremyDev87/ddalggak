import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

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
    fn(tempDir);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

withTempRepo("reference-only anchor can leave SKILL.md", (tempDir) => {
  for (const skillRelativePath of [".codex/skills/ddalggak/SKILL.md", "ddalggak/SKILL.md"]) {
    replaceInFile(
      path.join(tempDir, skillRelativePath),
      "Counterargument Pass",
      "Counterargument guardrail is intentionally verified from references only",
    );
  }
  assertPass("reference-only anchor can leave SKILL.md", runVerifier(tempDir));
});

withTempRepo("hot-path anchor must remain in SKILL.md", (tempDir) => {
  for (const skillRelativePath of [".codex/skills/ddalggak/SKILL.md", "ddalggak/SKILL.md"]) {
    replaceInFile(path.join(tempDir, skillRelativePath), "URL beats cwd", "URL target contract moved away");
  }
  assertFail("hot-path anchor must remain in SKILL.md", runVerifier(tempDir), "hot-path anchors missing from");
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
    "must exist for Core Invariants parity",
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

console.log("\n[test:reference-aware-skill-anchors] passed");
