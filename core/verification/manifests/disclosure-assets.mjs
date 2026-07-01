// Progressive-disclosure, template-field, payload-root, and admission-header contracts.

export const requiredDisclosureAssetsBySubcommand = {
  start: {
    templates: ["worker-brief.md"],
  },
  review: {
    templates: ["review-brief.md", "fix-brief.md"],
  },
  status: {
    templates: [],
  },
  plan: {
    templates: [],
  },
  issue: {
    templates: ["issue-body.md", "epic-body.md"],
  },
  clean: {
    templates: [],
  },
  ship: {
    templates: [],
  },
  retro: {
    templates: [],
  },
  prompt: {
    templates: [],
  },
  tune: {
    templates: [],
  },
  forge: {
    templates: [],
  },
  spark: {
    templates: [],
  },
  check: {
    templates: [],
  },
  getwiki: {
    templates: [],
  },
  setwiki: {
    templates: [],
  },
  "ulw-loop": {
    templates: [],
  },
  "ulw-plan": {
    templates: [],
  },
  "ulw-research": {
    templates: [],
  },
  "gjc-plan": {
    templates: [],
  },
  "gjc-execute": {
    templates: [],
  },
  "gjc-team": {
    templates: [],
  },
};

export const requiredIssueTemplateFields = [
  "Wiki Context Manifest",
  "Parallelization note",
  "Commit lane suggestion",
  "Owned files",
  "Must not touch",
  "Validation/evidence",
  "Dependencies / blocked by",
];

export const requiredEpicTemplateFields = [
  "Wiki Context Manifest",
  "Parallelization note",
  "Commit lane suggestion",
  "Owned files",
  "Must not touch",
  "Validation/evidence",
  "Dependencies / blocked by",
];

export const skillPayloadRoots = [
  ".codex/skills/ddalggak",
  "ddalggak",
];

export const requiredReferenceAdmissionHeaderFields = [
  "Use when:",
  "Required by:",
  "Side effects:",
  "Do not use when:",
];
// Admission header enforcement targets are not curated here: scripts/verify-codex-skill.mjs
// derives them from the live reference markdown payloads under each skill root (#264, #372).
