import { readFileSync } from "node:fs";

import { createManualBumpBranchName, resolveReleasePlan } from "./lib/release.mjs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text, expected, message) {
  assert(text.includes(expected), `${message}: expected to include ${JSON.stringify(expected)}`);
}

function assertMatches(text, pattern, message) {
  assert(pattern.test(text), `${message}: expected to match ${pattern}`);
}

const tests = [
  {
    name: "manual release bump branch names are deterministic and sanitized",
    run() {
      assert(createManualBumpBranchName("v0.2.0", "master") === "release/bump-master-v0.2.0", "master stable branch");
      assert(
        createManualBumpBranchName("v0.2.0-alpha.1", "release/candidate") === "release/bump-release-candidate-v0.2.0-alpha.1",
        "prerelease branch with sanitized base"
      );
    },
  },
  {
    name: "manual release bump workflow has required dispatch inputs and permissions",
    run() {
      const workflow = read(".github/workflows/manual-release-bump.yml");
      for (const expected of [
        "name: Manual Release Bump",
        "workflow_dispatch:",
        "tag:",
        "required: true",
        "base_ref:",
        "default: master",
        "dry_run:",
        "default: false",
        "contents: write",
        "pull-requests: write",
        "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
        "persist-credentials: false",
        "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
        "node-version: 24",
        "INPUT_TAG: ${{ inputs.tag }}",
        "INPUT_BASE_REF: ${{ inputs.base_ref }}",
        "Validate workflow inputs",
      ]) {
        assertIncludes(workflow, expected, `workflow input/permission contract ${expected}`);
      }
    },
  },
  {
    name: "dry-run validates the bump without branch or PR mutation",
    run() {
      const workflow = read(".github/workflows/manual-release-bump.yml");
      for (const expected of [
        "node ./scripts/release-plan.mjs \"$tag\" >> \"$GITHUB_OUTPUT\"",
        "node ./scripts/bump-release-version.mjs \"${{ steps.meta.outputs.tag }}\"",
        "npm run verify",
        "Verify changed files after package verification",
        "Manual release bump dry-run",
        "No branch was pushed and no pull request was created.",
      ]) {
        assertIncludes(workflow, expected, `dry-run validation contract ${expected}`);
      }
      assertMatches(
        workflow,
        /- name: Dry-run summary[\s\S]*?if: \$\{\{ inputs\.dry_run \}\}/,
        "dry-run summary must be gated to dry_run"
      );
      assert(
        !workflow.includes("tag=\"${{ inputs.tag }}\"") && !workflow.includes("\"${{ inputs.base_ref }}\""),
        "workflow must not interpolate raw workflow_dispatch inputs directly inside shell commands"
      );
      assert(
        !/runs-on: ubuntu-latest\n\s+env:\n\s+GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/.test(workflow),
        "workflow must not expose GH_TOKEN at job scope"
      );
      assertMatches(
        workflow,
        /- name: Prepare bump branch[\s\S]*?GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}[\s\S]*?gh auth setup-git/,
        "branch push step should configure git credentials only when mutating"
      );
      assertMatches(
        workflow,
        /- name: Prepare bump branch[\s\S]*?if: \$\{\{ !inputs\.dry_run && steps\.existing_pr\.outputs\.number == '' \}\}/,
        "branch push must be skipped during dry-run"
      );
      assertMatches(
        workflow,
        /- name: Create or reuse draft PR[\s\S]*?if: \$\{\{ !inputs\.dry_run \}\}/,
        "PR mutation must be skipped during dry-run"
      );
    },
  },
  {
    name: "non-dry-run creates or reuses deterministic bump PR with labels",
    run() {
      const workflow = read(".github/workflows/manual-release-bump.yml");
      for (const expected of [
        "createManualBumpBranchName",
        "gh pr list",
        "--head \"${{ steps.meta.outputs.branch }}\"",
        "--base \"$INPUT_BASE_REF\"",
        "--head \"${{ steps.meta.outputs.branch }}\"",
        "--draft",
        "--label skip-changelog",
        "--label release",
        "gh pr edit \"$pr_number\" --add-label skip-changelog --add-label release",
        "git push \"${lease_args[@]}\" -u origin \"${{ steps.meta.outputs.branch }}\"",
        "gh pr edit \"${{ steps.existing_pr.outputs.number }}\"",
        "--body-file pr-body.md",
      ]) {
        assertIncludes(workflow, expected, `non-dry-run PR contract ${expected}`);
      }
    },
  },
  {
    name: "bump PR body explains candidate verification before tag creation before publish approval",
    run() {
      const workflow = read(".github/workflows/manual-release-bump.yml");
      const candidate = workflow.indexOf("candidate verification");
      const tag = workflow.indexOf("tag creation");
      const publish = workflow.indexOf("publish approval");
      assert(candidate !== -1, "PR body should mention candidate verification");
      assert(tag !== -1, "PR body should mention tag creation");
      assert(publish !== -1, "PR body should mention publish approval");
      assert(candidate < tag && tag < publish, "PR body should list candidate verification before tag creation before publish approval");
    },
  },
  {
    name: "current package version can still resolve release metadata",
    run() {
      const pkg = JSON.parse(read("package.json"));
      const plan = resolveReleasePlan(`v${pkg.version}`);
      assert(plan.version === pkg.version, "package version should resolve through release helper");
    },
  },
];

let passed = 0;
const failures = [];

for (const test of tests) {
  try {
    test.run();
    passed += 1;
    console.log(`[PASS] ${test.name}`);
  } catch (error) {
    failures.push({ name: test.name, error });
    console.error(`[FAIL] ${test.name}`);
    console.error(error && error.stack ? error.stack : String(error));
  }
}

console.log(`\nSummary: ${passed}/${tests.length} manual release bump cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
