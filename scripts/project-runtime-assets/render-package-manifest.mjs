import { readFileSync } from "node:fs";
import { commandContractReference, commandReferenceNames, commandTemplateNames } from "../../core/conditional-assets.mjs";
import { parseProjections } from "../../bin/lib/doctor/lib.mjs";

export function assertSafeInstallationPath(file) {
  if (typeof file !== "string" || /[\s\\%?#]/.test(file)
    || file.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`unsafe installation path: ${file}`);
  }
}

// Installation inventory, not a runtime read list. The ledger survives missing files;
// deriving this from directory contents would silently bless an incomplete bundle.
export function installationInventory(commands, {
  root = "claude",
  projectionsText = readFileSync(new URL("../../core/projections.yaml", import.meta.url), "utf8"),
} = {}) {
  if (!["claude", "codex"].includes(root)) throw new Error(`unknown installation root: ${root}`);
  const { parityLedger, errors } = parseProjections(projectionsText);
  if (errors.length) throw new Error(errors.join("\n"));
  const files = new Set();
  for (const entry of parityLedger) {
    assertSafeInstallationPath(entry.path);
    if (entry.class === "root-specific" && entry.root !== root) continue;
    if (/^(references|templates|scripts|assets|examples)\//.test(entry.path)) files.add(entry.path);
  }
  for (const doc of commands) {
    files.add(`references/${commandContractReference(doc.command)}`);
    for (const name of commandReferenceNames(doc)) files.add(`references/${name}`);
    for (const name of commandTemplateNames(doc)) files.add(`templates/${name}`);
  }
  for (const file of files) assertSafeInstallationPath(file);
  return [...files].sort();
}

export function requiredPackageFiles(commands) {
  const base = new Set([
    ".codex/skills/ddalggak/SKILL.md",
    ".codex/skills/ddalggak/agents/openai.yaml",
    "scripts/project-runtime-assets.mjs",
    "core/command-docs/claude.md",
    "core/command-docs/codex.md",
    "scripts/project-runtime-assets/render-command-docs.mjs",
    "scripts/test-command-package-projections.mjs",
    "scripts/test-command-doc-projections.mjs",
    "scripts/test-command-doc-fragments.mjs",
    "scripts/test-selected-command-assets.mjs",
    "scripts/test-skill-loading-baseline.mjs",
    "scripts/test-skill-loading-fixtures.mjs",
    "scripts/test-skill-loading-session-failure.mjs",
    "scripts/test-skill-loading-ui-failure.mjs",
    "scripts/test-skill-loading-quality-report.mjs",
    "scripts/test-skill-loading-runtime.mjs",
    "scripts/eval-skill-loading.mjs",
    "scripts/skill-loading/quality-report.mjs",
    "scripts/skill-loading/run-config.mjs",
    "scripts/skill-loading/capture-extension.mjs",
    "scripts/skill-loading/offline-provider.mjs",
    "scripts/skill-loading/runtime-adapter.mjs",
    "evals/skill-loading/README.md",
    "scripts/test-lib/repo-fixture.mjs",
    "scripts/test-lib/temp.mjs",
    "scripts/test-lib/process.mjs",
    "scripts/lib/parse-simple-yaml.mjs",
    "scripts/lib/command-contract-schema.mjs",
    "scripts/lib/markdown-links.mjs",
    "bin/lib/command-contracts.mjs",
    "bin/lib/dispatch/show-doc.mjs",
    "bin/lib/doctor/lib.mjs",
    "evals/skill-loading/baseline-manifest.json",
    "evals/skill-loading/fixtures.json",
    "evals/skill-loading/fixtures/backend/app.mjs",
    "evals/skill-loading/fixtures/backend/oracle.json",
    "evals/skill-loading/fixtures/backend/oracle.mjs",
    "evals/skill-loading/fixtures/backend/prompt.md",
    "evals/skill-loading/fixtures/backend/server.mjs",
    "evals/skill-loading/fixtures/backend/solution/app.mjs",
    "evals/skill-loading/fixtures/internal-review/after/src/analytics.mjs",
    "evals/skill-loading/fixtures/internal-review/after/src/export.mjs",
    "evals/skill-loading/fixtures/internal-review/after/src/load.mjs",
    "evals/skill-loading/fixtures/internal-review/before/src/analytics.mjs",
    "evals/skill-loading/fixtures/internal-review/before/src/export.mjs",
    "evals/skill-loading/fixtures/internal-review/before/src/load.mjs",
    "evals/skill-loading/fixtures/internal-review/context.md",
    "evals/skill-loading/fixtures/internal-review/oracle.json",
    "evals/skill-loading/fixtures/internal-review/oracle.mjs",
    "evals/skill-loading/fixtures/internal-review/prompt.md",
    "evals/skill-loading/fixtures/public-body-review/after/src/analytics.mjs",
    "evals/skill-loading/fixtures/public-body-review/after/src/export.mjs",
    "evals/skill-loading/fixtures/public-body-review/after/src/load.mjs",
    "evals/skill-loading/fixtures/public-body-review/before/src/analytics.mjs",
    "evals/skill-loading/fixtures/public-body-review/before/src/export.mjs",
    "evals/skill-loading/fixtures/public-body-review/before/src/load.mjs",
    "evals/skill-loading/fixtures/public-body-review/context.md",
    "evals/skill-loading/fixtures/public-body-review/inputs.json",
    "evals/skill-loading/fixtures/public-body-review/oracle.json",
    "evals/skill-loading/fixtures/public-body-review/oracle.mjs",
    "evals/skill-loading/fixtures/public-body-review/prompt.md",
    "evals/skill-loading/fixtures/status/README.md",
    "evals/skill-loading/fixtures/status/gh.mjs",
    "evals/skill-loading/fixtures/status/oracle.json",
    "evals/skill-loading/fixtures/status/oracle.mjs",
    "evals/skill-loading/fixtures/status/prompt.md",
    "evals/skill-loading/fixtures/status/state.json",
    "evals/skill-loading/fixtures/ui/DESIGN.md",
    "evals/skill-loading/fixtures/ui/browser-check.mjs",
    "evals/skill-loading/fixtures/ui/index.html",
    "evals/skill-loading/fixtures/ui/oracle.json",
    "evals/skill-loading/fixtures/ui/prompt.md",
    "evals/skill-loading/fixtures/ui/server.mjs",
    "evals/skill-loading/fixtures/ui/solution/index.html",
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
  for (const [root, prefix] of [["claude", "ddalggak"], ["codex", ".codex/skills/ddalggak"]]) {
    for (const file of installationInventory(commands, { root })) base.add(`${prefix}/${file}`);
  }
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
