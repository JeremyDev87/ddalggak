// Canonical side-effect boundary vocabulary shared by projection, skill,
// and runtime control-plane verifiers. Keep the policy meaning here only;
// each consumer may still enforce it with its own artifact-specific mechanism.

// Precise AGENTS.md sentinels that indicate granting prohibited authority or
// leaking credential-like values. These are intentionally substring-based for
// the thin projection adapter verifier.
export const sideEffectBoundaryAgentsForbiddenSentinels = Object.freeze([
  "enable auto-merge",
  "allow auto-merge",
  "auto-merge allowed",
  "force-push bypass",
  "force-push allowed",
  "ghp_",
  "npm_",
  "GITHUB_TOKEN =",
  "NPM_TOKEN =",
]);

// Runtime forbidden action labels surfaced in the development-control-plane
// packet. These strings are user-visible evidence vocabulary, not execution
// switches; changing them must keep tests and packet consumers in lock-step.
export const sideEffectBoundaryControlPlaneForbiddenActions = Object.freeze([
  "merge",
  "auto-merge",
  "force-push without explicit current-turn approval",
  "raw prompt or transcript persistence",
  "secret or private log persistence",
  "GitHub mutation payload persistence",
]);

// Semantic guards for hot-path skill anchors whose presence alone is
// insufficient: nearby prose must not invert or relax the boundary.
export const sideEffectBoundarySkillSemanticAnchorGuards = Object.freeze([
  Object.freeze({
    anchor: "Manual merge only",
    description: "manual merge only must not be inverted into auto-merge permission",
    invalidLinePattern:
      /\b(?:auto-?merge|merge)\b.*\b(?:ok|okay|allowed|enabled|permitted|허용|가능|켜도|해도)|\b(?:not|no longer|아니|아님|폐기|제거)\b/i,
  }),
]);
