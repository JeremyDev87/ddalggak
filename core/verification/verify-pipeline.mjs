// Data-only verify pipeline manifest.
//
// Keep the verification stage order in one place so package.json convenience
// scripts, scripts/verify-package.mjs, and the meta-tests can share the same
// source of truth without duplicating step ordering.

export const verifyPipelineStages = [
  {
    id: "foundation",
    title: "foundation checks",
    steps: [
      {
        label: "npm test",
        command: "npm",
        args: ["test"],
        npmScript: "test",
      },
      {
        label: "verify pipeline entrypoint unit tests",
        command: "npm",
        args: ["run", "test:verify-package"],
        npmScript: "test:verify-package",
      },
      {
        label: "ddalggak doctor diagnostics gate",
        command: process.execPath,
        args: ["bin/ddalggak.js", "doctor"],
      },
      {
        label: "codex skill verifier",
        command: "npm",
        args: ["run", "verify:codex-skill"],
        npmScript: "verify:codex-skill",
      },
      {
        label: "projection verifier",
        command: "npm",
        args: ["run", "verify:projections"],
        npmScript: "verify:projections",
      },
    ],
  },
  {
    id: "runtime-admission",
    title: "runtime admission and robustness",
    steps: [
      {
        label: "subcommand token budget admission gate",
        command: process.execPath,
        args: ["scripts/project-runtime-assets.mjs", "--report", "--admission"],
        options: { capture: true },
      },
      {
        label: "token budget coverage/cap/ceiling rejection tests",
        command: "npm",
        args: ["run", "test:token-budget-coverage"],
        npmScript: "test:token-budget-coverage",
      },
      {
        label: "doctor signal-registry drift rejection tests",
        command: "npm",
        args: ["run", "test:doctor-signal-drift"],
        npmScript: "test:doctor-signal-drift",
      },
      {
        label: "verification robustness regression tests",
        command: "npm",
        args: ["run", "test:verify-robustness"],
        npmScript: "test:verify-robustness",
      },
      {
        label: "runtime asset generated-block drift check",
        command: process.execPath,
        args: ["scripts/project-runtime-assets.mjs", "--check"],
      },
    ],
  },
  {
    id: "readiness",
    title: "reference and readiness gates",
    steps: [
      {
        label: "reference-aware skill anchor tests",
        command: "npm",
        args: ["run", "test:reference-aware-skill-anchors"],
        npmScript: "test:reference-aware-skill-anchors",
      },
      {
        label: "ddalggak readiness eval",
        command: "npm",
        args: ["run", "eval:ddalggak-readiness"],
        npmScript: "eval:ddalggak-readiness",
      },
    ],
  },
  {
    id: "release",
    title: "release helper checks",
    steps: [
      {
        label: "release helper tests",
        command: "npm",
        args: ["run", "test:release-helpers"],
        npmScript: "test:release-helpers",
      },
      {
        label: "release drafter tests",
        command: "npm",
        args: ["run", "test:release-drafter"],
        npmScript: "test:release-drafter",
      },
      {
        label: "manual release bump tests",
        command: "npm",
        args: ["run", "test:manual-release-bump"],
        npmScript: "test:manual-release-bump",
      },
      {
        label: "release candidate tests",
        command: "npm",
        args: ["run", "test:release-candidate"],
        npmScript: "test:release-candidate",
      },
      {
        label: "release publish tests",
        command: "npm",
        args: ["run", "test:release-publish"],
        npmScript: "test:release-publish",
      },
    ],
  },
  {
    id: "workflow",
    title: "security and workflow checks",
    steps: [
      {
        label: "security posture report tests",
        command: "npm",
        args: ["run", "test:security-posture"],
        npmScript: "test:security-posture",
      },
      {
        label: "security posture admission gate",
        command: "npm",
        args: ["run", "verify:security-posture", "--", "--admission"],
        npmScript: "verify:security-posture",
      },
      {
        label: "workflow lint tests",
        command: "npm",
        args: ["run", "test:workflow-lint"],
        npmScript: "test:workflow-lint",
      },
      {
        label: "development control-plane tests",
        command: "npm",
        args: ["run", "test:development-control-plane"],
        npmScript: "test:development-control-plane",
      },
      {
        label: "workflow static lint evidence report",
        command: "npm",
        args: ["run", "verify:workflow-lint"],
        npmScript: "verify:workflow-lint",
      },
      {
        label: "PR check evidence report tests",
        command: "npm",
        args: ["run", "test:pr-check-evidence"],
        npmScript: "test:pr-check-evidence",
      },
      {
        label: "PR status evidence report tests",
        command: "npm",
        args: ["run", "test:pr-status-evidence"],
        npmScript: "test:pr-status-evidence",
      },
      {
        label: "issue forms admission schema verifier",
        command: "npm",
        args: ["run", "verify:issue-forms"],
        npmScript: "verify:issue-forms",
      },
      {
        label: "issue forms fail-closed rejection tests",
        command: "npm",
        args: ["run", "test:issue-forms"],
        npmScript: "test:issue-forms",
      },
      {
        label: "workflow boundary inventory verification",
        command: "npm",
        args: ["run", "verify:workflow-boundary"],
        npmScript: "verify:workflow-boundary",
      },
      {
        label: "workflow boundary fail-closed rejection tests",
        command: "npm",
        args: ["run", "test:workflow-boundary"],
        npmScript: "test:workflow-boundary",
      },
    ],
  },
  {
    id: "coverage",
    title: "coverage meta-check",
    steps: [
      {
        label: "test coverage meta-test (no orphan test scripts)",
        command: "npm",
        args: ["run", "test:test-coverage"],
        npmScript: "test:test-coverage",
      },
    ],
  },
];

export const verifyPipelineSteps = verifyPipelineStages.flatMap((stage) =>
  stage.steps.map((step) => ({
    ...step,
    stageId: stage.id,
    stageTitle: stage.title,
  })),
);

export const verifyPipelineNpmScriptNames = verifyPipelineSteps
  .map((step) => step.npmScript)
  .filter(Boolean);

export const verifyPipelineNpmScriptSet = new Set(verifyPipelineNpmScriptNames);
