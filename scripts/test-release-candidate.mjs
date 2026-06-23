import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertIncludes(text, expected, message) {
  assert(
    text.includes(expected),
    `${message}: expected to include ${JSON.stringify(expected)}`,
  );
}

function assertMatches(text, pattern, message) {
  assert(pattern.test(text), `${message}: expected to match ${pattern}`);
}

const tests = [
  {
    name: "release candidate workflow has push and manual exact-SHA triggers",
    run() {
      const workflow = read(".github/workflows/release-candidate.yml");
      for (const expected of [
        "name: Release Candidate Verification",
        "push:",
        "paths:",
        "- package.json",
        "workflow_dispatch:",
        "target_sha:",
        "required: true",
        "type: string",
        "contents: read",
        "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
        "persist-credentials: false",
        "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
        "node-version: 24",
        "INPUT_TARGET_SHA: ${{ inputs.target_sha }}",
      ]) {
        assertIncludes(
          workflow,
          expected,
          `workflow trigger/SHA contract ${expected}`,
        );
      }
    },
  },
  {
    name: "manual dispatch validates and checks out the exact target SHA",
    run() {
      const workflow = read(".github/workflows/release-candidate.yml");
      assertMatches(
        workflow,
        /Validate manual target SHA[\s\S]*?INPUT_TARGET_SHA: \$\{\{ inputs\.target_sha \}\}[\s\S]*?\^\[0-9a-fA-F\]\{40\}\$/,
        "manual SHA input must be env-scoped and 40-hex validated",
      );
      assertMatches(
        workflow,
        /Resolve target SHA[\s\S]*?target_sha="\$GITHUB_SHA"[\s\S]*?if \[ -n "\$INPUT_TARGET_SHA" \]; then[\s\S]*?target_sha="\$INPUT_TARGET_SHA"/,
        "metadata step should prefer manual target_sha over event SHA",
      );
      assertMatches(
        workflow,
        /Verify checkout SHA[\s\S]*?actual_sha=\$\(git rev-parse HEAD\)[\s\S]*?expected_sha="\$\{\{ steps\.target\.outputs\.target_sha \}\}"[\s\S]*?\[ "\$actual_sha" != "\$expected_sha" \]/,
        "workflow must fail if checkout HEAD differs from target SHA",
      );
      assert(
        !workflow.includes("${{ inputs.target_sha }}") ||
          workflow.includes("INPUT_TARGET_SHA: ${{ inputs.target_sha }}"),
        "workflow must not interpolate raw target_sha directly into shell commands",
      );
    },
  },
  {
    name: "package.json version change detection skips unchanged package edits with summary",
    run() {
      const workflow = read(".github/workflows/release-candidate.yml");
      for (const expected of [
        'base_version=$(git show "$before_sha:package.json"',
        "candidate_version=$(node -p \"require('./package.json').version\")",
        "version_changed=false",
        "version_changed=true",
        "Release candidate verification skipped",
        "package.json changed without a version bump",
        "if: ${{ steps.candidate.outputs.version_changed == 'true' }}",
      ]) {
        assertIncludes(
          workflow,
          expected,
          `version change/skip contract ${expected}`,
        );
      }
    },
  },
  {
    name: "existing release tag fails before package smoke verification",
    run() {
      const workflow = read(".github/workflows/release-candidate.yml");
      const tagCheck = workflow.indexOf("Check release tag availability");
      const smoke = workflow.indexOf("Pack and smoke install release candidate");
      assert(
        tagCheck !== -1,
        "workflow should check whether the release tag already exists",
      );
      assert(smoke !== -1, "workflow should pack and smoke install the package");
      assert(
        tagCheck < smoke,
        "tag existence check should happen before smoke install",
      );
      assertMatches(
        workflow,
        /git ls-remote --exit-code --tags origin "refs\/tags\/\$\{\{ steps\.candidate\.outputs\.tag \}\}"[\s\S]*?status=\$\?[\s\S]*?\[ "\$status" -eq 0 \][\s\S]*?already exists[\s\S]*?\[ "\$status" -eq 2 \][\s\S]*?is available[\s\S]*?Failed to check release tag availability/,
        "tag check must fail closed on remote/auth/network errors while allowing only ls-remote exit 2 as available",
      );
    },
  },
  {
    name: "candidate verification delegates pack/smoke to the shared release script",
    run() {
      const workflow = read(".github/workflows/release-candidate.yml");
      const script = read("scripts/release-pack-smoke.mjs");
      for (const expected of [
        "npm run verify",
        "Pack and smoke install release candidate",
        'node ./scripts/release-pack-smoke.mjs --github-output "$GITHUB_OUTPUT"',
      ]) {
        assertIncludes(workflow, expected, `pack/smoke workflow contract ${expected}`);
      }
      for (const expected of [
        'execFileSync("npm", ["pack", "--json"]',
        'run("npm", ["init", "-y"]',
        'run("npm", ["install", tarballPath]',
        '["ddalggak", "--help"]',
        '["ddalggak", "plan", "--show-doc"]',
        '["ddalggak", "setup", "--dry-run"]',
        '["ddalggak", "status", "--local", "--json"]',
      ]) {
        assertIncludes(script, expected, `pack/smoke script contract ${expected}`);
      }
    },
  },
  {
    name: "summary records verified SHA, version, next tag, and tarball",
    run() {
      const workflow = read(".github/workflows/release-candidate.yml");
      for (const expected of [
        "Release candidate verified",
        "verified SHA",
        "version",
        "next tag",
        "tarball",
        "${{ steps.candidate.outputs.target_sha }}",
        "${{ steps.candidate.outputs.version }}",
        "${{ steps.candidate.outputs.tag }}",
      ]) {
        assertIncludes(workflow, expected, `summary contract ${expected}`);
      }
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

console.log(
  `\nSummary: ${passed}/${tests.length} release candidate cases passed.`,
);

if (failures.length > 0) {
  process.exitCode = 1;
}
