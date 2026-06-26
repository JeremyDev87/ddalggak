#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { escapeRegExp } from "./lib/escape-regexp.mjs";
import { parseSimpleYaml, SIMPLE_YAML_SUPPORTED_FORMS } from "./lib/parse-simple-yaml.mjs";
import { runNodeScript } from "./test-lib/process.mjs";
import { copyRepoWithoutGitAndNodeModules } from "./test-lib/repo-fixture.mjs";

const rootDir = process.cwd();
const fixtureDir = path.join(rootDir, "tests", "fixtures", "verify-robustness");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertJsonEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(actualJson === expectedJson, `${message}: expected ${expectedJson}, got ${actualJson}`);
}

function assertMatch(name, pattern, text, expected) {
  const match = text.match(pattern);
  assert(match?.[1] === expected, `${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(match?.[1])}`);
}

function runProjectionVerifier(cwd) {
  return runNodeScript("scripts/verify-projections.mjs", [], { cwd });
}

function runCodexSkillVerifier(cwd) {
  return runNodeScript("scripts/verify-codex-skill.mjs", [], { cwd });
}

function runProjectRuntimeAssets(cwd, args = []) {
  return runNodeScript("scripts/project-runtime-assets.mjs", args, { cwd });
}

function runRuntimeAssetGenerator(cwd) {
  return runProjectRuntimeAssets(cwd, ["--check"]);
}

function runTokenBudgetReport(cwd, extraArgs = []) {
  return runNodeScript("scripts/project-runtime-assets.mjs", ["--report", ...extraArgs], { cwd });
}

function copyRepo() {
  return copyRepoWithoutGitAndNodeModules({ rootDir, prefix: "ddalggak-verify-robustness-" });
}

const specialInputs = JSON.parse(readFileSync(path.join(fixtureDir, "special-regexp-inputs.json"), "utf8"));

{
  const expectedIds = [
    "top-level-scalar",
    "empty-top-level-list",
    "two-space-list",
    "two-space-nested-mapping",
  ];
  assertJsonEqual(
    SIMPLE_YAML_SUPPORTED_FORMS.map((entry) => entry.id),
    expectedIds,
    "simple YAML supported-form matrix ids",
  );
  for (const entry of SIMPLE_YAML_SUPPORTED_FORMS) {
    assert(entry.description.length > 0, `${entry.id}: description is required`);
    assertJsonEqual(parseSimpleYaml(entry.sample, entry.id), entry.expected, `${entry.id}: sample parse`);
  }
}

{
  const frontmatter = `${specialInputs.frontmatterKey}: ddalggak\nnameXwithYspecial: wrong\n`;
  assertMatch(
    "frontmatter key regex escapes metacharacters",
    new RegExp(`^${escapeRegExp(specialInputs.frontmatterKey)}:\\s*(.+?)\\s*$`, "m"),
    frontmatter,
    "ddalggak",
  );

  const arrays = `const ${specialInputs.constName} = ["literal"];\nconst requiredXitems = ["wrong"];`;
  assertMatch(
    "const name regex escapes metacharacters",
    new RegExp(String.raw`const ${escapeRegExp(specialInputs.constName)} = \[([\s\S]*?)\];`),
    arrays,
    '"literal"',
  );

  const block = [
    `<!-- ddalggak:generated:start ${specialInputs.generatedBlockName} -->`,
    "body",
    `<!-- ddalggak:generated:end ${specialInputs.generatedBlockName} -->`,
  ].join("\n");
  assertMatch(
    "generated block name regex escapes metacharacters",
    new RegExp(
      `<!-- ddalggak:generated:start ${escapeRegExp(specialInputs.generatedBlockName)} -->\\n([\\s\\S]*?)\\n<!-- ddalggak:generated:end ${escapeRegExp(specialInputs.generatedBlockName)} -->`,
    ),
    block,
    "body",
  );

  const form = `id: ${specialInputs.fieldId}\nid: sourceXofYtruth`;
  assert(
    new RegExp(`\\bid:\\s*${escapeRegExp(specialInputs.fieldId)}\\b`).test(form),
    "field id regex escapes metacharacters",
  );

  const fixtureText = `{"value":"prefix ${specialInputs.rawPayloadPattern} suffix"}`;
  assert(
    new RegExp(`:\\s*"[^"]*${escapeRegExp(specialInputs.rawPayloadPattern)}[^"]*"`).test(fixtureText),
    "readiness pattern regex escapes metacharacters",
  );
}

{
  const tempDir = copyRepo();
  const result = runRuntimeAssetGenerator(tempDir);
  assert(
    result.status === 0,
    `generator --check on clean copy: expected exit 0, got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
}

{
  const tempDir = copyRepo();
  const result = runProjectRuntimeAssets(tempDir, ["--write"]);
  assert(
    result.status === 0,
    `generator --write for reference grouping regression: expected exit 0, got ${result.status}\n${result.stdout}\n${result.stderr}`,
  );
  const skill = readFileSync(path.join(tempDir, "ddalggak", "SKILL.md"), "utf8");
  const requiredMap = skill.split("<!-- ddalggak:generated:start required-reference-map -->")[1]?.split("<!-- ddalggak:generated:end required-reference-map -->")[0];
  assert(requiredMap, "expected generated required-reference-map block");
  const reviewRow = requiredMap
    .split("\n")
    .find((line) => line.startsWith("| `review` |") && line.includes("cross-review-loop.md"));
  assert(reviewRow, "expected generated required-reference review row");
  const columns = reviewRow.split("|").map((part) => part.trim());
  assert(
    columns[2].includes("cross-review-loop.md") && !columns[2].includes("security-posture-gate.md"),
    `security posture gate must not be rendered as a workflow reference\n${reviewRow}`,
  );
  assert(
    columns[3].includes("security-posture-gate.md"),
    `security posture gate must be rendered as a gate reference\n${reviewRow}`,
  );
}

{
  const tempDir = copyRepo();
  const manifestPath = path.join(tempDir, "core", "verification", "skill-contract-manifest.mjs");
  const manifest = readFileSync(manifestPath, "utf8");
  const drifted = manifest.replace(
    'githubWriteAllowed: false,\n    requiredReferences: ["status.md", "pr-check-evidence-bundle.md"],',
    'githubWriteAllowed: true,\n    requiredReferences: ["status.md", "pr-check-evidence-bundle.md"],',
  );
  assert(drifted !== manifest, "fixture setup: expected to drift status githubWriteAllowed");
  writeFileSync(manifestPath, drifted, "utf8");

  const result = runCodexSkillVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `manifest permission drift must fail, got exit ${result.status}\n${output}`);
  assert(
    output.includes("subcommandExecutionContracts.status.githubWriteAllowed must derive from modePermissionProfiles['read-only']=false"),
    `expected mode permission profile drift diagnostic\n${output}`,
  );
}

{
  const tempDir = copyRepo();
  const manifestPath = path.join(tempDir, "core", "verification", "skill-contract-manifest.mjs");
  const manifest = readFileSync(manifestPath, "utf8");
  const drifted = manifest.replace(
    '  start: {\n    templates: ["worker-brief.md"],',
    '  start: {\n    references: ["start-workflow.md"],\n    templates: ["worker-brief.md"],',
  );
  assert(drifted !== manifest, "fixture setup: expected to add manual start references");
  writeFileSync(manifestPath, drifted, "utf8");

  const result = runCodexSkillVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `manual disclosure references must fail, got exit ${result.status}\n${output}`);
  assert(
    output.includes(
      "requiredDisclosureAssetsBySubcommand.start.references must not be manually curated; derive reference assets from subcommandExecutionContracts.start.requiredReferences",
    ),
    `expected manual reference disclosure diagnostic\n${output}`,
  );
}

{
  const tempDir = copyRepo();
  const startPath = path.join(tempDir, "core", "commands", "start.yaml");
  const start = readFileSync(startPath, "utf8");
  const drifted = start.replace(
    "stop_condition: \"Stop on stale base, missing issue body/comments, duplicate PR, or required files outside the issue-owned scope.\"",
    "stop_condition: \"Stop on stale base only.\"",
  );
  assert(drifted !== start, "fixture setup: expected to drift start stop_condition");
  writeFileSync(startPath, drifted, "utf8");

  const result = runCodexSkillVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `yaml/manifest stop_condition drift must fail, got exit ${result.status}\n${output}`);
  assert(
    output.includes("subcommandExecutionContracts.start.stopCondition drifted from core/commands/start.yaml stop_condition"),
    `expected yaml/manifest stop condition drift diagnostic\n${output}`,
  );
}

{
  const tempDir = copyRepo();
  const issuePath = path.join(tempDir, "core", "commands", "issue.yaml");
  const issue = readFileSync(issuePath, "utf8");
  const drifted = issue.replace("github_write_allowed: true", "github_write_allowed: false");
  assert(drifted !== issue, "fixture setup: expected to drift issue github_write_allowed");
  writeFileSync(issuePath, drifted, "utf8");

  const result = runCodexSkillVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `yaml github_write_allowed drift must fail, got exit ${result.status}\n${output}`);
  assert(
    output.includes("subcommandExecutionContracts.issue.githubWriteAllowed drifted from core/commands/issue.yaml github_write_allowed=false"),
    `expected yaml github_write_allowed drift diagnostic\n${output}`,
  );
}

{
  const tempDir = copyRepo();
  const result = runProjectRuntimeAssets(tempDir, ["--bogus"]);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status !== 0, `unknown option must fail closed, got exit ${result.status}\n${output}`);
  assert(output.includes("unknown option: --bogus"), `unknown option diagnostic missing\n${output}`);
  assert(output.includes("Usage: node scripts/project-runtime-assets.mjs"), `usage output missing\n${output}`);
}

{
  const tempDir = copyRepo();
  const result = runProjectRuntimeAssets(tempDir, ["--write", "--check"]);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status !== 0, `ambiguous --write --check must fail closed, got exit ${result.status}\n${output}`);
  assert(output.includes("--write and --check cannot be used together"), `ambiguous option diagnostic missing\n${output}`);
  assert(output.includes("Usage: node scripts/project-runtime-assets.mjs"), `usage output missing\n${output}`);
}

for (const [fixtureName, expectedMessage] of [
  ["broken-duplicate-key.yaml", "duplicate key: command"],
  ["broken-list-indentation.yaml", "list indentation must be exactly two spaces"],
  ["broken-nested-structure.yaml", "unsupported indentation or nested mapping"],
  ["broken-inline-structure.yaml", "unsupported inline structure for key: required_references"],
]) {
  const tempDir = copyRepo();
  const fixtureText = readFileSync(path.join(fixtureDir, fixtureName), "utf8");
  writeFileSync(path.join(tempDir, "core", "commands", "start.yaml"), fixtureText, "utf8");
  const result = runProjectionVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `${fixtureName}: expected exit 1, got ${result.status}\n${output}`);
  assert(output.includes(expectedMessage), `${fixtureName}: expected output to include ${JSON.stringify(expectedMessage)}\n${output}`);

  const generatorResult = runRuntimeAssetGenerator(tempDir);
  const generatorOutput = `${generatorResult.stdout}\n${generatorResult.stderr}`;
  assert(
    generatorResult.status !== 0,
    `${fixtureName}: expected generator --check to fail closed, got exit ${generatorResult.status}\n${generatorOutput}`,
  );
  assert(
    generatorOutput.includes(expectedMessage),
    `${fixtureName}: expected generator output to include ${JSON.stringify(expectedMessage)}\n${generatorOutput}`,
  );
  assert(
    !generatorOutput.includes("    at "),
    `${fixtureName}: generator must fail with a diagnostic, not a raw stack trace\n${generatorOutput}`,
  );
}

{
  const tempDir = copyRepo();
  const result = runTokenBudgetReport(tempDir, ["--admission"]);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 0, `token budget admission on clean copy: expected exit 0, got ${result.status}\n${output}`);
  assert(output.includes("(root: ddalggak/"), `token budget report must measure the claude root\n${output}`);
  assert(
    output.includes("(root: .codex/skills/ddalggak/"),
    `token budget report must measure the codex root\n${output}`,
  );
  assert(
    output.includes("over-budget 0, missing-budget 0"),
    `token budget admission on clean copy: expected zero findings\n${output}`,
  );
  assert(output.includes("[token-budget] admission gate: pass"), `expected admission pass line\n${output}`);
}

{
  const tempDir = copyRepo();
  const projectionsPath = path.join(tempDir, "core", "projections.yaml");
  const projections = readFileSync(projectionsPath, "utf8");
  const lowered = projections.replace(/^( {4}review:) \d+$/gm, "$1 1");
  assert(lowered !== projections, "fixture setup: expected to lower at least one review budget");
  writeFileSync(projectionsPath, lowered, "utf8");

  const advisory = runTokenBudgetReport(tempDir);
  const advisoryOutput = `${advisory.stdout}\n${advisory.stderr}`;
  assert(
    advisory.status === 0,
    `over-budget advisory report must stay exit 0, got ${advisory.status}\n${advisoryOutput}`,
  );
  assert(advisoryOutput.includes("exceeds budget 1"), `expected over-budget warning in advisory output\n${advisoryOutput}`);

  const admission = runTokenBudgetReport(tempDir, ["--admission"]);
  const admissionOutput = `${admission.stdout}\n${admission.stderr}`;
  assert(
    admission.status === 1,
    `over-budget admission gate must fail, got exit ${admission.status}\n${admissionOutput}`,
  );
  assert(admissionOutput.includes("exceeds budget 1"), `expected over-budget warning in admission output\n${admissionOutput}`);
  assert(
    admissionOutput.includes("[token-budget] admission gate: fail (over-budget 2"),
    `expected admission fail line counting both roots\n${admissionOutput}`,
  );
}

{
  const tempDir = copyRepo();
  const projectionsPath = path.join(tempDir, "core", "projections.yaml");
  const projections = readFileSync(projectionsPath, "utf8");
  const removed = projections.replace(/^ {4}start: \d+\n/m, "");
  assert(removed !== projections, "fixture setup: expected to remove one start budget line");
  writeFileSync(projectionsPath, removed, "utf8");

  const admission = runTokenBudgetReport(tempDir, ["--admission"]);
  const admissionOutput = `${admission.stdout}\n${admission.stderr}`;
  assert(
    admission.status === 1,
    `missing-budget admission gate must fail closed, got exit ${admission.status}\n${admissionOutput}`,
  );
  assert(
    admissionOutput.includes("no budget declared"),
    `expected missing-budget warning in admission output\n${admissionOutput}`,
  );
  assert(
    admissionOutput.includes("missing-budget 1"),
    `expected missing-budget count in summary\n${admissionOutput}`,
  );
}

{
  const tempDir = copyRepo();
  const runtimePath = path.join(tempDir, "core", "runtimes", "claude.yaml");
  const runtime = readFileSync(runtimePath, "utf8");
  const drifted = runtime.replace(
    "projection_roots:\n  - ddalggak\ninstall_targets:\n  - .claude/skills/ddalggak",
    "projection_roots:\n  - ddalggak\n  - .claude/skills/ddalggak\ninstall_targets:\n  - .claude/skills/ddalggak",
  );
  assert(drifted !== runtime, "fixture setup: expected to inject install target into projection_roots");
  writeFileSync(runtimePath, drifted, "utf8");

  const result = runProjectionVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `runtime projection-root drift must fail, got exit ${result.status}\n${output}`);
  assert(
    output.includes("core/runtimes/claude.yaml projection_roots[1] (.claude/skills/ddalggak) is not declared as a root in core/projections.yaml"),
    `expected runtime projection-root drift diagnostic\n${output}`,
  );
}

{
  const tempDir = copyRepo();
  const referencePath = path.join(
    tempDir,
    ".codex",
    "skills",
    "ddalggak",
    "references",
    "simplicity-deletability-gate.md",
  );
  const reference = readFileSync(referencePath, "utf8");
  writeFileSync(referencePath, `${reference}\n<!-- parity drift fixture: codex-only -->\n`, "utf8");

  const codexResult = runCodexSkillVerifier(tempDir);
  const codexOutput = `${codexResult.stdout}\n${codexResult.stderr}`;
  assert(
    codexResult.status === 1,
    `verify-codex-skill must still fail via the projection-aware verifier, got exit ${codexResult.status}\n${codexOutput}`,
  );
  assert(
    codexOutput.includes("projection-aware verifier failed with exit 1"),
    `expected verify-codex-skill to delegate parity failure to verify-projections\n${codexOutput}`,
  );
  assert(
    !codexOutput.includes("Simplicity / Deletability Gate references must match between .codex and ddalggak directories."),
    `direct duplicate Simplicity parity diagnostic must not return\n${codexOutput}`,
  );

  const projectionResult = runProjectionVerifier(tempDir);
  const projectionOutput = `${projectionResult.stdout}\n${projectionResult.stderr}`;
  assert(
    projectionResult.status === 1,
    `must-match parity drift must fail in verify-projections, got exit ${projectionResult.status}\n${projectionOutput}`,
  );
  assert(
    projectionOutput.includes(
      "parity ledger (must-match): references/simplicity-deletability-gate.md differs between ddalggak/ and .codex/skills/ddalggak/",
    ),
    `expected parity-ledger diagnostic\n${projectionOutput}`,
  );
}

{
  const tempDir = copyRepo();
  for (const rootPath of [path.join("ddalggak"), path.join(".codex", "skills", "ddalggak")]) {
    const referencePath = path.join(tempDir, rootPath, "references", "frontend-design-gate.md");
    const reference = readFileSync(referencePath, "utf8");
    const drifted = reference.replace(
      "Required by: Quality Lens Router gate family `frontend-design`.\n",
      "",
    );
    assert(drifted !== reference, `fixture setup: expected to remove frontend-design admission header in ${rootPath}`);
    writeFileSync(referencePath, drifted, "utf8");
  }

  const result = runCodexSkillVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `unrequired reference admission header drift must fail, got exit ${result.status}\n${output}`);
  assert(
    output.includes("ddalggak/references/frontend-design-gate.md missing required reference admission header fields"),
    `expected source-root admission header diagnostic\n${output}`,
  );
  assert(output.includes("Required by:"), `expected missing admission field in diagnostic\n${output}`);
}

{
  const tempDir = copyRepo();
  const referencePath = path.join(tempDir, "ddalggak", "references", "frontend-design-gate.md");
  const reference = readFileSync(referencePath, "utf8");
  const drifted = reference.replace("## review", "## Frontend Design Review Gate");
  assert(drifted !== reference, "fixture setup: expected to drift a canonical gate stage heading");
  writeFileSync(referencePath, drifted, "utf8");

  const result = runCodexSkillVerifier(tempDir);
  const output = `${result.stdout}\n${result.stderr}`;
  assert(result.status === 1, `gate stage-heading drift must fail, got exit ${result.status}\n${output}`);
  assert(
    output.includes("ddalggak/references/frontend-design-gate.md must use canonical stage headings"),
    `expected gate stage-heading diagnostic\n${output}`,
  );
  assert(output.includes("## review"), `expected missing canonical stage in diagnostic\n${output}`);
}

console.log("[test:verify-robustness] passed");
