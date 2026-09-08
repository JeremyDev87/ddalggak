import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";
import {
  commandReferenceNames,
  commandTemplateNames,
  parseConditionalAssetSpec,
} from "../core/conditional-assets.mjs";
import { validateCommandContract } from "./lib/command-contract-schema.mjs";
import { requiredPackageFiles } from "./project-runtime-assets/render-package-manifest.mjs";

const commands = loadCommandContracts(process.cwd());
const byName = new Map(commands.map((doc) => [doc.command, doc]));

for (const name of ["plan", "start", "review"]) {
  const doc = byName.get(name);
  assert(doc, `missing ${name} command contract`);
  assert.equal(validateCommandContract(doc, name).length, 0, `${name} contract must validate`);
  assert((doc.conditional_references || []).length > 0, `${name} needs conditional references`);
  const references = commandReferenceNames(doc);
  assert.equal(new Set(references).size, references.length, `${name} reference assets must be unique`);
  const templates = commandTemplateNames(doc);
  assert.equal(new Set(templates).size, templates.length, `${name} template assets must be unique`);
}
console.log("[PASS] plan/start/review expose valid base + conditional assets");

assert(!byName.get("plan").required_references.includes("deep-interview-readiness-gate.md"));
assert(byName.get("plan").conditional_references.includes("ambiguous-intent=deep-interview-readiness-gate.md"));
assert.equal(byName.get("start").required_templates.length, 0);
assert(byName.get("start").conditional_templates.includes("delegated-work=worker-brief.md"));
assert(byName.get("review").conditional_references.includes("package-workflow-release-or-security-posture=security-posture-gate.md"));
console.log("[PASS] expensive gates/templates are absent from the base hot path and activation-bound");

assert.deepEqual(parseConditionalAssetSpec("package-workflow-release-or-security-posture=security-posture-gate.md"), {
  activation: "package-workflow-release-or-security-posture",
  asset: "security-posture-gate.md",
});
for (const invalid of [
  "missing-separator.md",
  "UPPER=gate.md",
  "activation=../gate.md",
  "activation=gate.txt",
  "activation=one=two.md",
]) {
  assert.throws(() => parseConditionalAssetSpec(invalid), /must/);
}
console.log("[PASS] conditional specs reject ambiguous and traversal-prone forms");

const invalidContract = {
  ...byName.get("plan"),
  conditional_references: [
    "ambiguous-intent=deep-interview-readiness-gate.md",
    "ambiguous-intent=deep-interview-readiness-gate.md",
  ],
};
assert(validateCommandContract(invalidContract, "invalid").some((failure) => failure.includes("duplicate")));
const duplicateBase = {
  ...byName.get("plan"),
  conditional_references: ["always=evidence-contract.md"],
};
assert(validateCommandContract(duplicateBase, "invalid").some((failure) => failure.includes("must not also be listed")));
console.log("[PASS] schema fails closed on duplicate or base-overlapping assets");

for (const kind of ["references", "templates"]) {
  const required = `required_${kind}`;
  const conditional = `conditional_${kind}`;
  for (const invalid of ["../gate.md", "nested/gate.md", "nested\\gate.md", "gate.txt", "gate.md\n", "gate..md", "", null, 1]) {
    assert(validateCommandContract({ ...byName.get("plan"), [required]: [invalid] }, "invalid").length > 0);
  }
  assert(validateCommandContract({ ...byName.get("plan"), [required]: ["gate.md", "gate.md"] }, "invalid").length > 0);
  assert(validateCommandContract({ ...byName.get("plan"), [conditional]: ["alpha=gate.md", "alpha=gate.md"] }, "invalid").length > 0);
  assert(validateCommandContract({ ...byName.get("plan"), [required]: ["gate.md"], [conditional]: ["alpha=gate.md"] }, "invalid").length > 0);
  assert.deepEqual(validateCommandContract({ ...byName.get("plan"), [conditional]: ["alpha=gate.md", "beta=gate.md"] }, "valid"), []);
}
console.log("[PASS] schema validates required basenames/duplicates and preserves conditional OR declarations in both kinds");

const packaged = new Set(requiredPackageFiles(commands));
for (const doc of [byName.get("plan"), byName.get("start"), byName.get("review")]) {
  for (const reference of commandReferenceNames(doc)) {
    assert(packaged.has(`ddalggak/references/${reference}`));
    assert(packaged.has(`.codex/skills/ddalggak/references/${reference}`));
  }
  for (const template of commandTemplateNames(doc)) {
    assert(packaged.has(`ddalggak/templates/${template}`));
    assert(packaged.has(`.codex/skills/ddalggak/templates/${template}`));
  }
}
console.log("[PASS] conditional assets remain in both package projection roots");

const reviewContractAssets = [
  "references/review-admission-fixtures.json",
  "references/review-output-contract.md",
  "scripts/review-contract-policy.mjs",
  "scripts/test-review-contract-exhaustive.mjs",
  "scripts/test-review-contract-verifier.mjs",
  "scripts/test-review-finding-two-sentence.mjs",
  "scripts/test-review-policy-layers.mjs",
  "scripts/verify-review-contract.mjs",
];
for (const root of ["ddalggak", ".codex/skills/ddalggak"]) {
  for (const asset of reviewContractAssets) assert(packaged.has(`${root}/${asset}`), `${root}/${asset}: review contract asset must remain package-required`);
}
console.log("[PASS] deterministic review contract assets remain package-required in both roots");

for (const root of ["ddalggak", ".codex/skills/ddalggak"]) {
  const review = readFileSync(`${root}/references/command-review.md`, "utf8");
  const metadata = JSON.parse(review.match(/^```json\n([\s\S]*?)\n```$/m)[1]);
  assert(metadata.conditional_templates.includes("delegated-review=review-brief.md"));
  assert(!metadata.conditional_templates.includes("structured-review=review-brief.md"));
  if (root === "ddalggak") assert(review.includes("activation evidence applies"));
  else assert(review.includes("activation-bound optional gates"));
}
console.log("[PASS] rendered command owners keep conditional routing and prose aligned");

const router = readFileSync("ddalggak/references/quality-lens-router.md", "utf8");
assert(router.includes("`security-posture` | Package manifests/admission"));
assert(router.includes("CI/workflows, release/publish"));
assert(router.includes("Application-only code/docs/tests touching none of those surfaces"));
assert(router.includes("`security-posture` | `references/security-posture-gate.md`"));
console.log("[PASS] security posture routing is fail-closed for package/workflow/release surfaces");

console.log("\n[test:conditional-command-assets] passed");
