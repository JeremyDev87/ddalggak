import { commandReferenceNames, commandTemplateNames } from "../../core/conditional-assets.mjs";

export function requiredPackageFiles(commands) {
  const base = new Set([
    ".codex/skills/ddalggak/SKILL.md",
    ".codex/skills/ddalggak/agents/openai.yaml",
    "scripts/project-runtime-assets.mjs",
    "scripts/project-runtime-assets/load-contracts.mjs",
    "scripts/project-runtime-assets/render-skill-blocks.mjs",
    "scripts/project-runtime-assets/render-package-manifest.mjs",
    "scripts/project-runtime-assets/token-budget-report.mjs",
    "core/token-budgets.yaml",
    "core/conditional-assets.mjs",
    "core/verification/side-effect-boundary-policy.mjs",
    "core/verification/skill-contract-manifest.mjs",
    "core/verification/manifests/README.md",
    "core/verification/manifests/disclosure-assets.mjs",
    "core/verification/manifests/gate-contracts.mjs",
    "core/verification/manifests/hot-path.mjs",
    "core/verification/manifests/package-files.mjs",
    "core/verification/manifests/reference-anchors.mjs",
    "core/verification/manifests/subcommands.mjs",
    "ddalggak/SKILL.md",
    "bin/ddalggak.js",
    "bin/lib/auto-update.mjs",
    "bin/lib/cli-main.mjs",
    "bin/lib/dispatch.mjs",
    "bin/lib/setup.mjs",
    "core/ulw-loop/ATTRIBUTION.md",
    "core/ulw-loop/runtime.mjs",
    "core/ulw-loop/vendor/LICENSE",
    "core/ulw-loop/vendor/NOTICE",
    "core/ulw-loop/vendor/SOURCE.json",
    "core/ulw-loop/vendor/dist/cli-commands.js",
    "core/ulw-loop/vendor/dist/cli.js",
    "core/ulw-loop/vendor/dist/stop-resume-hook.js",
    "core/ulw-plan/SOURCE.json",
    "core/ulw-plan/runtime.mjs",
    "core/ulw-research/SOURCE.json",
    "core/ulw-research/runtime.mjs",
    "scripts/test-ulw-runtime-parity.mjs",
    ".codex/skills/ddalggak/references/review-admission-fixtures.json",
    ".codex/skills/ddalggak/references/review-output-contract.md",
    ".codex/skills/ddalggak/scripts/review-contract-policy.mjs",
    ".codex/skills/ddalggak/scripts/test-review-contract-exhaustive.mjs",
    ".codex/skills/ddalggak/scripts/test-review-contract-verifier.mjs",
    ".codex/skills/ddalggak/scripts/test-review-finding-two-sentence.mjs",
    ".codex/skills/ddalggak/scripts/test-review-policy-layers.mjs",
    ".codex/skills/ddalggak/scripts/verify-review-contract.mjs",
    "ddalggak/references/review-admission-fixtures.json",
    "ddalggak/references/review-output-contract.md",
    "ddalggak/scripts/review-contract-policy.mjs",
    "ddalggak/scripts/test-review-contract-exhaustive.mjs",
    "ddalggak/scripts/test-review-contract-verifier.mjs",
    "ddalggak/scripts/test-review-finding-two-sentence.mjs",
    "ddalggak/scripts/test-review-policy-layers.mjs",
    "ddalggak/scripts/verify-review-contract.mjs",
    "README.md",
    "llms.txt",
    "LICENSE",
  ]);
  for (const doc of commands) {
    base.add(`core/commands/${doc.command}.yaml`);
    for (const ref of commandReferenceNames(doc)) {
      base.add(`.codex/skills/ddalggak/references/${ref}`);
      base.add(`ddalggak/references/${ref}`);
    }
    for (const template of commandTemplateNames(doc)) {
      base.add(`.codex/skills/ddalggak/templates/${template}`);
      base.add(`ddalggak/templates/${template}`);
    }
  }
  return [...base].sort();
}

export function renderRequiredPackageFiles(commands) {
  return [
    "export const requiredPackageFiles = [",
    ...requiredPackageFiles(commands).map((file) => `  ${JSON.stringify(file)},`),
    "];",
  ].join("\n");
}

export function packageManifestProjection(commands) {
  return {
    path: "core/verification/manifests/package-files.mjs",
    blocks: [["package-required-asset-list", renderRequiredPackageFiles(commands)]],
  };
}
