import { readFileSync } from "node:fs";

import { resolveReleasePlan } from "./lib/release.mjs";

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

function readJson(path) {
  return JSON.parse(read(path));
}

const tests = [
  {
    name: "release-drafter config defines changelog categories and skip label",
    run() {
      const config = read(".github/release-drafter.yml");
      for (const expected of [
        "exclude-labels:",
        "- \"skip-changelog\"",
        "title: \"Features\"",
        "- \"feat\"",
        "- \"enhancement\"",
        "title: \"Bug Fixes\"",
        "- \"bug\"",
        "- \"fix\"",
        "title: \"Documentation\"",
        "- \"documentation\"",
        "- \"docs\"",
        "title: \"Tests\"",
        "- \"test\"",
        "title: \"CI / Release\"",
        "- \"ci\"",
        "- \"release\"",
        "title: \"Maintenance\"",
        "- \"chore\"",
        "- \"maintenance\"",
        "change-template:",
        "This draft is updated automatically",
      ]) {
        assertIncludes(config, expected, `release-drafter config contract ${expected}`);
      }
    },
  },
  {
    name: "release-drafter workflow supports push and manual dry-run inputs",
    run() {
      const workflow = read(".github/workflows/release-drafter.yml");
      for (const expected of [
        "name: Release Drafter",
        "push:",
        "branches:",
        "- master",
        "workflow_dispatch:",
        "target_ref:",
        "dry_run:",
        "contents: write",
        "pull-requests: write",
        "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
        "persist-credentials: false",
        "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
        "node-version: 24",
        "node ./scripts/release-plan.mjs \"$tag\" >> \"$GITHUB_OUTPUT\"",
        "draft_tag=\"draft-${tag}\"",
        "draftName=Draft $tag",
        "Non-dry-run manual draft updates must target master.",
        "release-drafter/release-drafter@6db134d15f3909ccc9eefd369f02bd1e9cffdf97 # v6",
        "Dry-run release draft summary",
      ]) {
        assertIncludes(workflow, expected, `release-drafter workflow contract ${expected}`);
      }
      assertMatches(
        workflow,
        /if: \$\{\{ github\.event_name == 'workflow_dispatch' && !inputs\.dry_run && inputs\.target_ref != 'master' \}\}/,
        "manual non-dry-run master guard"
      );
      assertMatches(
        workflow,
        /- name: Update release draft[\s\S]*?if: \$\{\{ !\(github\.event_name == 'workflow_dispatch' && inputs\.dry_run\) \}\}/,
        "release drafter mutation step must be skipped during manual dry-run"
      );
      assert(
        !/^\s*dry-run:/m.test(workflow),
        "workflow must not pass unsupported dry-run input to release-drafter action"
      );
      assert(
        workflow.indexOf("Guard live draft updates to master") < workflow.indexOf("Checkout repository"),
        "manual non-dry-run master guard should run before checkout"
      );
    },
  },
  {
    name: "release-drafter draft metadata derives from current package version",
    run() {
      const pkg = readJson("package.json");
      const tag = `v${pkg.version}`;
      const plan = resolveReleasePlan(tag);
      assert(plan.version === pkg.version, "release-plan should resolve package version");
      assert(`draft-${plan.tag}` === `draft-v${pkg.version}`, "draft tag should be draft-v<version>");
      assert(`Draft ${plan.tag}` === `Draft v${pkg.version}`, "draft name should be Draft v<version>");
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

console.log(`\nSummary: ${passed}/${tests.length} release drafter cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
