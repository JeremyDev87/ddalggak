import { assert, assertBefore, assertIncludes, assertMatches, readText, readWorkflow } from "./test-lib/workflow-assert.mjs";

const tests = [
  {
    name: "release workflow runs for semver tags and manual existing tags",
    run() {
      const workflow = readWorkflow("release");
      for (const expected of [
        "name: Release Publish",
        "push:",
        "tags:",
        '- "v*.*.*"',
        "workflow_dispatch:",
        "tag:",
        "required: true",
        "type: string",
        "INPUT_TAG: ${{ inputs.tag }}",
        "actions/checkout@93cb6efe18208431cddfb8368fd83d5badbf9bfd",
        "persist-credentials: false",
        "actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e",
        "node-version: 24",
      ]) {
        assertIncludes(
          workflow,
          expected,
          `release trigger contract ${expected}`,
        );
      }
      assert(
        !workflow.includes('tag="${{ inputs.tag }}"'),
        "release workflow must not interpolate raw workflow_dispatch tag directly in shell",
      );
    },
  },

  {
    name: "release workflow delegates semver tag validation to release helper",
    run() {
      const workflow = readWorkflow("release");
      assertIncludes(
        workflow,
        'node ./scripts/release-plan.mjs "$tag" >/dev/null',
        "release helper should validate the selected tag before target checkout",
      );
      assertIncludes(
        workflow,
        'node ./scripts/release-plan.mjs "${{ steps.target.outputs.tag }}" >> "$GITHUB_OUTPUT"',
        "release helper should own release metadata after target checkout",
      );
      assert(
        !workflow.includes("=~ ^v(0|[1-9][0-9]*)"),
        "release workflow must not duplicate the JS semver regex in bash",
      );
      assert(
        !workflow.includes("tag must be an existing v-prefixed semver tag"),
        "release workflow should use release-plan.mjs error text for tag policy",
      );
      assertBefore(
        workflow,
        'node ./scripts/release-plan.mjs "$tag" >/dev/null',
        'ref: ${{ steps.target.outputs.tag }}',
        "release helper must validate workflow_dispatch tag input before checking out that ref",
      );
    },
  },
  {
    name: "release workflow verifies tagged ref before publish",
    run() {
      const workflow = readWorkflow("release");
      assertBefore(
        workflow,
        "verify_tagged_ref:",
        "publish_to_npm:",
        "verify job should run before publish job",
      );
      for (const expected of [
        'expected_ref="refs/tags/${{ steps.release.outputs.tag }}"',
        "actual_ref=$(git describe --tags --exact-match HEAD)",
        "package_version=$(node -p \"require('./package.json').version\")",
        'node ./scripts/release-plan.mjs "${{ steps.target.outputs.tag }}" >> "$GITHUB_OUTPUT"',
        "npm run verify",
        "Pack and smoke install release artifact",
        'node ./scripts/release-pack-smoke.mjs --github-output "$GITHUB_OUTPUT" --sha256',
      ]) {
        assertIncludes(
          workflow,
          expected,
          `tagged ref verification contract ${expected}`,
        );
      }
    },
  },
  {
    name: "release pack/smoke script owns package smoke commands and sha output",
    run() {
      const script = readText("scripts/release-pack-smoke.mjs");
      for (const expected of [
        'execFileSync("npm", ["pack", "--json"]',
        'run("npm", ["init", "-y"]',
        'run("npm", ["install", tarballPath]',
        '["ddalggak", "--help"]',
        '["ddalggak", "plan", "--show-doc"]',
        '["ddalggak", "setup", "--dry-run"]',
        '["ddalggak", "status", "--local", "--json"]',
        "tarball_sha256",
        "--github-output",
      ]) {
        assertIncludes(script, expected, `release pack/smoke script contract ${expected}`);
      }
    },
  },
  {
    name: "publish job uses the verified SHA and verified tarball after environment approval",
    run() {
      const workflow = readWorkflow("release");
      for (const expected of [
        "sha: ${{ steps.verified_ref.outputs.sha }}",
        "verified_sha=$(git rev-parse HEAD)",
        'echo "sha=$verified_sha" >> "$GITHUB_OUTPUT"',
        "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
        "name: release-tarball-${{ steps.release.outputs.version }}",
        "path: ${{ steps.pack.outputs.tarball }}",
        "ref: ${{ needs.verify_tagged_ref.outputs.sha }}",
        'expected_sha="${{ needs.verify_tagged_ref.outputs.sha }}"',
        "actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0",
        "name: release-tarball-${{ needs.verify_tagged_ref.outputs.version }}",
        'npm publish "$tarball_path" --provenance --access public --tag "${{ needs.verify_tagged_ref.outputs.npm_dist_tag }}"',
      ]) {
        assertIncludes(
          workflow,
          expected,
          `verified SHA/tarball publish contract ${expected}`,
        );
      }
    },
  },
  {
    name: "publish job is environment-gated and uses trusted publishing before token fallback",
    run() {
      const workflow = readWorkflow("release");
      assertMatches(
        workflow,
        /publish_to_npm:[\s\S]*?needs: verify_tagged_ref[\s\S]*?environment:\s*\n\s+name: release[\s\S]*?permissions:[\s\S]*?contents: read[\s\S]*?id-token: write/,
        "publish job must need verification, require release environment, and request id-token for trusted publishing",
      );
      assertBefore(
        workflow,
        "Publish package with trusted publishing",
        "Publish package with NPM_TOKEN fallback",
        "trusted publishing should be attempted before NPM_TOKEN fallback",
      );
      for (const expected of [
        'npm publish "$tarball_path" --provenance --access public --tag "${{ needs.verify_tagged_ref.outputs.npm_dist_tag }}"',
        "NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}",
        'npm publish "$tarball_path" --access public --tag "${{ needs.verify_tagged_ref.outputs.npm_dist_tag }}"',
      ]) {
        assertIncludes(workflow, expected, `publish auth contract ${expected}`);
      }
    },
  },
  {
    name: "publish workflow maps stable and prerelease dist-tags and skips already published exact version",
    run() {
      const workflow = readWorkflow("release");
      for (const expected of [
        "npmDistTag",
        "classifyNpmPublishError",
        "already-published",
        "already published; treating rerun as successful skip",
        "Release publish skipped",
        "Release publish completed",
      ]) {
        assertIncludes(
          workflow,
          expected,
          `publish idempotency/dist-tag contract ${expected}`,
        );
      }
    },
  },
  {
    name: "follow-up audit checks GitHub release and npm registry metadata",
    run() {
      const workflow = readWorkflow("release-published-follow-up");
      for (const expected of [
        "name: Release Published Follow-up Audit",
        "release:",
        "types: [published]",
        "workflow_dispatch:",
        "tag:",
        "permissions:",
        "contents: read",
        'gh release view "$tag"',
        'npm view "@jeremyfellaz/ddalggak@$version" --json',
        "metadata.name",
        "metadata.version",
        "metadata.bin.ddalggak",
        "metadata.license",
        "metadata.repository.url",
        "npm registry metadata verified",
      ]) {
        assertIncludes(
          workflow,
          expected,
          `follow-up audit contract ${expected}`,
        );
      }
    },
  },
  {
    name: "follow-up audit contains content-light provenance/signature evidence step",
    run() {
      const workflow = readWorkflow("release-published-follow-up");
      for (const expected of [
        "Post-publish provenance/signature evidence",
        "npm audit signatures",
        "registry_signature_status",
        "token_fallback_used",
        "provenance_status",
        "provenance-limited",
        "trusted-publishing-path",
        "node_npm_requirement_status",
        "trusted_publisher_identity_status",
        "workflow_filename_match",
        "environment_protection_status",
        "continue-on-error: true",
        "provenance/attestation confirms publish-time identity binding only",
        "not assert semantic correctness",
        "unknown/unavailable fields remain unresolved and are not promoted to pass",
      ]) {
        assertIncludes(
          workflow,
          expected,
          `provenance evidence step contract ${expected}`,
        );
      }
      // Trusted publishing path and token fallback path must produce different provenance_status values
      assert(
        workflow.includes("provenance_status=\"provenance-limited\"") &&
          workflow.includes("provenance_status=\"trusted-publishing-path\""),
        "provenance_status must differ between trusted-publishing and token-fallback paths",
      );
      // NPM_TOKEN secret value must not be echoed or printed
      assert(
        !workflow.includes("echo.*NPM_TOKEN") &&
          !workflow.includes("echo $NPM_TOKEN") &&
          !workflow.includes("echo \"$NPM_TOKEN\""),
        "NPM_TOKEN secret value must not be echoed in workflow",
      );
    },
  },
  {
    name: "follow-up audit contains tarball artifact integrity/retention evidence step",
    run() {
      const workflow = readWorkflow("release-published-follow-up");
      for (const expected of [
        "Tarball artifact integrity/retention evidence",
        "release_tarball_artifact_name",
        "artifact_id",
        "artifact_digest",
        "download_digest_validation",
        "retention_days",
        "hidden_files_included",
        "overwrite_policy",
        "attestation_status",
        "continue-on-error: true",
        "unknown/unavailable fields remain unresolved and are not promoted to pass",
      ]) {
        assertIncludes(
          workflow,
          expected,
          `artifact integrity evidence step contract ${expected}`,
        );
      }
      // unknown fields must not be promoted to pass (the caveat line must be present)
      assertIncludes(
        workflow,
        "unknown/unavailable fields remain unresolved and are not promoted to pass",
        "artifact evidence step must include unknown-not-promoted-to-pass caveat",
      );
      // attestation_status unknown/unverified must remain distinguishable from verified
      assert(
        workflow.includes("attestation_status=\"verified\"") ||
          workflow.includes('attestation_status="verified"'),
        "attestation_status must have a verified branch (not just unknown)",
      );
    },
  },
  {
    name: "README documents approval gate, trusted publishing, fallback, dist-tags, and audit",
    run() {
      const readme = readText("README.md");
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
        assertIncludes(
          readme,
          expected,
          `README release publish/audit contract ${expected}`,
        );
      }
    },
  },
  {
    name: "README Follow-up Audit section documents provenance evidence and semantic-safety caveat",
    run() {
      const readme = readText("README.md");
      for (const expected of [
        "provenance",
        "semantic safety",
        "provenance-limited",
        "token_fallback_used",
        "registry_signature_status",
        "attestation_status",
      ]) {
        assertIncludes(
          readme,
          expected,
          `README provenance/audit evidence contract ${expected}`,
        );
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
  `\nSummary: ${passed}/${tests.length} release publish cases passed.`,
);

if (failures.length > 0) {
  process.exitCode = 1;
}
