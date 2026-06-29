import path from "node:path";

import { sideEffectBoundaryControlPlaneForbiddenActions } from "../verification/side-effect-boundary-policy.mjs";
import { failClosed } from "./fail-closed.mjs";

export const DEVELOPMENT_CONTROL_PLANE_STATE_GATES = Object.freeze({
  defaultDispatch: "non-executing",
  executionRequiresApproval: true,
  fulfilledRequiresPassingVerification: true,
  contentLightEvidenceOnly: true,
});
export const DEVELOPMENT_CONTROL_PLANE_FORBIDDEN_ACTIONS = sideEffectBoundaryControlPlaneForbiddenActions;

export function requireStateGate(packet, gateName, expectedValue) {
  const actualValue = packet?.stateGates?.[gateName];
  if (actualValue !== expectedValue) {
    throw failClosed("development control-plane state gate drift", {
      gateName,
      expectedValue,
      actualValue,
    });
  }
  return actualValue;
}

export function requireForbiddenActions(packet) {
  const forbiddenActions = packet?.taskScope?.forbiddenActions;
  if (!Array.isArray(forbiddenActions)) {
    throw failClosed("development control-plane forbiddenActions must be declared", {
      forbiddenActions,
    });
  }
  const missing = DEVELOPMENT_CONTROL_PLANE_FORBIDDEN_ACTIONS.filter(
    (action) => !forbiddenActions.includes(action),
  );
  if (missing.length > 0) {
    throw failClosed("development control-plane forbiddenActions drift", { missing });
  }
  return forbiddenActions;
}

export function requireControlPlaneSafetyContract(packet) {
  requireStateGate(packet, "contentLightEvidenceOnly", DEVELOPMENT_CONTROL_PLANE_STATE_GATES.contentLightEvidenceOnly);
  requireForbiddenActions(packet);
}

export function buildDdalggakDevelopmentPacket({
  issueContext,
  repoRoot,
  repo,
  runId,
  plannedFiles,
  validationCommands,
  evidenceDir,
  subcommand,
}) {
  if (!issueContext) {
    throw failClosed("issue context is required");
  }
  if (!repoRoot || typeof repoRoot !== "string") {
    throw failClosed("repoRoot is required");
  }
  if (!runId || typeof runId !== "string") {
    throw failClosed("runId is required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(runId)) {
    throw failClosed("runId must be a safe filename token", { runId });
  }
  if (!evidenceDir || typeof evidenceDir !== "string") {
    throw failClosed("evidenceDir is required");
  }
  if (!Array.isArray(plannedFiles) || plannedFiles.length === 0) {
    throw failClosed("at least one authorized planned file is required");
  }
  if (!Array.isArray(validationCommands) || validationCommands.length === 0) {
    throw failClosed("at least one validation command is required");
  }
  if (!new Set(["start", "review"]).has(subcommand)) {
    throw failClosed("runtime dispatch only supports start or review", { subcommand });
  }

  return {
    schema: "ddalggak.development_control_plane.v1",
    runId,
    subcommand,
    repo: repo || null,
    repoRoot: path.resolve(repoRoot),
    evidenceDir: path.resolve(evidenceDir),
    issue: issueContext,
    taskScope: {
      authorizedFiles: plannedFiles.map(String),
      forbiddenActions: [...DEVELOPMENT_CONTROL_PLANE_FORBIDDEN_ACTIONS],
      validationCommands: validationCommands.map(String),
    },
    stateGates: { ...DEVELOPMENT_CONTROL_PLANE_STATE_GATES },
  };
}

export function isInsideRepoRoot(repoRoot, file) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedFile = path.resolve(resolvedRoot, file);
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(resolvedRoot + path.sep);
}
