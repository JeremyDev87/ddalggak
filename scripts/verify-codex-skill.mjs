import { checks as cliReadmeDriftChecks } from "./verify-codex-skill/cli-readme-drift.mjs";
import { checks as frontmatterChecks } from "./verify-codex-skill/frontmatter.mjs";
import { checks as hotPathBudgetChecks } from "./verify-codex-skill/hot-path-budget.mjs";
import { checks as referenceAdmissionChecks } from "./verify-codex-skill/reference-admission.mjs";
import { runVerifyCodexSkill } from "./verify-codex-skill/runner.mjs";
import { checks as semanticAnchorChecks } from "./verify-codex-skill/semantic-anchors.mjs";

// Keep the executable entrypoint as a small registry/failure-aggregation surface.
// The preserved verifier runner keeps current behavior intact while the domain
// registry names the slices being extracted from this once-monolithic script.
export const verifyCodexSkillDomains = [
  { name: "frontmatter", checks: frontmatterChecks },
  { name: "hot-path-budget", checks: hotPathBudgetChecks },
  { name: "reference-admission", checks: referenceAdmissionChecks },
  { name: "semantic-anchors", checks: semanticAnchorChecks },
  { name: "cli-readme-drift", checks: cliReadmeDriftChecks },
];

runVerifyCodexSkill();
