import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

import { sideEffectBoundaryControlPlaneForbiddenActions } from "../verification/side-effect-boundary-policy.mjs";
import { failClosed } from "./fail-closed.mjs";

export const DEVELOPMENT_CONTROL_PLANE_STATE_GATES = Object.freeze({
  defaultDispatch: "non-executing",
  executionRequiresApproval: true,
  fulfilledRequiresPassingVerification: true,
  contentLightEvidenceOnly: true,
});
export const DEVELOPMENT_CONTROL_PLANE_FORBIDDEN_ACTIONS = sideEffectBoundaryControlPlaneForbiddenActions;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function computeDevelopmentPacketHash(packet) {
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) {
    throw failClosed("development packet must be an object before hashing");
  }
  const { packetHash: _packetHash, ...hashablePacket } = packet;
  return sha256(hashablePacket);
}

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
  if (packet?.writerProcessId !== process.pid) {
    throw failClosed("development packet writer process ownership mismatch", {
      expectedProcessId: process.pid,
      actualProcessId: packet?.writerProcessId,
    });
  }
  requireStateGate(packet, "contentLightEvidenceOnly", DEVELOPMENT_CONTROL_PLANE_STATE_GATES.contentLightEvidenceOnly);
  requireForbiddenActions(packet);
  const computedPacketHash = computeDevelopmentPacketHash(packet);
  if (packet.packetHash !== computedPacketHash) {
    throw failClosed("development packet hash mismatch", {
      expectedPacketHash: computedPacketHash,
      actualPacketHash: packet.packetHash,
    });
  }
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

  const packet = {
    schema: "ddalggak.development_control_plane.v1",
    schemaVersion: 1,
    runId,
    writerEpoch: randomUUID(),
    writerProcessId: process.pid,
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
    attemptBudget: 1,
    maxEvents: 32,
    successCriteriaRefs: [issueContext.url],
    stopRules: [
      "approval_required",
      "attempt_budget_exhausted",
      "outcome_ambiguous",
      "verification_failed",
    ],
  };
  return { ...packet, packetHash: computeDevelopmentPacketHash(packet) };
}

export function isInsideRepoRoot(repoRoot, file) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedFile = path.resolve(resolvedRoot, file);
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(resolvedRoot + path.sep);
}
