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
    "bin/lib/dispatch.mjs",
    "bin/lib/setup.mjs",
    "claude-skills/omo-ulw/SKILL.md",
    "README.md",
    "llms.txt",
    "LICENSE",
  ]);
  for (const doc of commands) {
    for (const ref of doc.required_references || []) {
      base.add(`.codex/skills/ddalggak/references/${ref}`);
      base.add(`ddalggak/references/${ref}`);
    }
    for (const template of doc.required_templates || []) {
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
