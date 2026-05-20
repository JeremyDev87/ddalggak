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
  assert(text.includes(expected), `${message}: expected to include ${JSON.stringify(expected)}`);
}

function assertMatches(text, pattern, message) {
  assert(pattern.test(text), `${message}: expected to match ${pattern}`);
}

const tests = [
  {
    name: "release workflow runs for semver tags and manual existing tags",
    run() {
      const workflow = read(".github/workflows/release.yml");
      for (const expected of [
        "name: Release Publish",
        "push:",
        "tags:",
        "- 'v*.*.*'",
        "workflow_dispatch:",
        "tag:",
        "required: true",
        "type: string",
        "INPUT_TAG: ${{ inputs.tag }}",
        "actions/checkout@v5",
        "persist-credentials: false",
        "actions/setup-node@v6",
        "node-version: 24",
      ]) {
        assertIncludes(workflow, expected, `release trigger contract ${expected}`);
      }
      assert(
        !workflow.includes('tag="${{ inputs.tag }}"'),
        "release workflow must not interpolate raw workflow_dispatch tag directly in shell"
      );
    },
  },
  {
    name: "release workflow verifies tagged ref before publish",
    run() {
      const workflow = read(".github/workflows/release.yml");
      const verify = workflow.indexOf("verify_tagged_ref:");
      const publish = workflow.indexOf("publish_to_npm:");
      assert(verify !== -1, "verify job should exist");
      assert(publish !== -1, "publish job should exist");
      assert(verify < publish, "verify job should run before publish job");
      for (const expected of [
        "expected_ref=\"refs/tags/${{ steps.release.outputs.tag }}\"",
        "actual_ref=$(git describe --tags --exact-match HEAD)",
        "package_version=$(node -p \"require('./package.json').version\")",
        "node ./scripts/release-plan.mjs \"${{ steps.target.outputs.tag }}\" >> \"$GITHUB_OUTPUT\"",
        "npm run verify",
        "npm pack --json",
        "npm init -y",
        "npm install \"$tarball_path\"",
        "npx ddalggak --help",
        "npx ddalggak plan --show-doc",
      ]) {
        assertIncludes(workflow, expected, `tagged ref verification contract ${expected}`);
      }
    },
  },
  {
    name: "publish job uses the verified SHA and verified tarball after environment approval",
    run() {
      const workflow = read(".github/workflows/release.yml");
      for (const expected of [
        "sha: ${{ steps.verified_ref.outputs.sha }}",
        "verified_sha=$(git rev-parse HEAD)",
        "echo \"sha=$verified_sha\" >> \"$GITHUB_OUTPUT\"",
        "actions/upload-artifact@v4",
        "name: release-tarball-${{ steps.release.outputs.version }}",
        "path: ${{ steps.pack.outputs.tarball }}",
        "ref: ${{ needs.verify_tagged_ref.outputs.sha }}",
        "expected_sha=\"${{ needs.verify_tagged_ref.outputs.sha }}\"",
        "actions/download-artifact@v5",
        "name: release-tarball-${{ needs.verify_tagged_ref.outputs.version }}",
        "npm publish \"$tarball_path\" --provenance --access public --tag \"${{ needs.verify_tagged_ref.outputs.npm_dist_tag }}\"",
      ]) {
        assertIncludes(workflow, expected, `verified SHA/tarball publish contract ${expected}`);
      }
    },
  },
  {
    name: "publish job is environment-gated and uses trusted publishing before token fallback",
    run() {
      const workflow = read(".github/workflows/release.yml");
      assertMatches(
        workflow,
        /publish_to_npm:[\s\S]*?needs: verify_tagged_ref[\s\S]*?environment:\s*\n\s+name: release[\s\S]*?permissions:[\s\S]*?contents: read[\s\S]*?id-token: write/,
        "publish job must need verification, require release environment, and request id-token for trusted publishing"
      );
      const trusted = workflow.indexOf("Publish package with trusted publishing");
      const token = workflow.indexOf("Publish package with NPM_TOKEN fallback");
      assert(trusted !== -1, "trusted publishing step should exist");
      assert(token !== -1, "NPM_TOKEN fallback step should exist");
      assert(trusted < token, "trusted publishing should be attempted before NPM_TOKEN fallback");
      for (const expected of [
        "npm publish \"$tarball_path\" --provenance --access public --tag \"${{ needs.verify_tagged_ref.outputs.npm_dist_tag }}\"",
        "NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}",
        "npm publish \"$tarball_path\" --access public --tag \"${{ needs.verify_tagged_ref.outputs.npm_dist_tag }}\"",
      ]) {
        assertIncludes(workflow, expected, `publish auth contract ${expected}`);
      }
    },
  },
  {
    name: "publish workflow maps stable and prerelease dist-tags and skips already published exact version",
    run() {
      const workflow = read(".github/workflows/release.yml");
      for (const expected of [
        "npmDistTag",
        "classifyNpmPublishError",
        "already-published",
        "already published; treating rerun as successful skip",
        "Release publish skipped",
        "Release publish completed",
      ]) {
        assertIncludes(workflow, expected, `publish idempotency/dist-tag contract ${expected}`);
      }
    },
  },
  {
    name: "follow-up audit checks GitHub release and npm registry metadata",
    run() {
      const workflow = read(".github/workflows/release-published-follow-up.yml");
      for (const expected of [
        "name: Release Published Follow-up Audit",
        "release:",
        "types: [published]",
        "workflow_dispatch:",
        "tag:",
        "permissions:",
        "contents: read",
        "gh release view \"$tag\"",
        "npm view \"@jeremyfellaz/ddalggak@$version\" --json",
        "metadata.name",
        "metadata.version",
        "metadata.bin.ddalggak",
        "metadata.license",
        "metadata.repository.url",
        "npm registry metadata verified",
      ]) {
        assertIncludes(workflow, expected, `follow-up audit contract ${expected}`);
      }
    },
  },
  {
    name: "README documents approval gate, trusted publishing, fallback, dist-tags, and audit",
    run() {
      const readme = read("README.md");
      for (const expected of [
        "## Release Publish",
        "protected `release` environment approval",
        "trusted publishing",
        "`NPM_TOKEN` fallback",
        "Stable releases publish with the `latest` dist-tag",
        "prereleases publish with the `next` dist-tag",
        "already-published exact versions are treated as a successful skip",
        "## Release Published Follow-up Audit",
        "GitHub release and npm registry metadata",
      ]) {
        assertIncludes(readme, expected, `README release publish/audit contract ${expected}`);
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

console.log(`\nSummary: ${passed}/${tests.length} release publish cases passed.`);

if (failures.length > 0) {
  process.exitCode = 1;
}
