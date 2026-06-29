import { assertNormalizedApproval, normalizeApprovalSource } from "./approval.mjs";
import { makeEvidence, writeDevelopmentEvidence } from "./evidence.mjs";
import { ddalggakIssueContextFromGhJson, fetchGhIssueViewJson } from "./issue-context.mjs";
import {
  DEVELOPMENT_CONTROL_PLANE_STATE_GATES,
  buildDdalggakDevelopmentPacket,
  isInsideRepoRoot,
  requireControlPlaneSafetyContract,
  requireStateGate,
} from "./packet.mjs";
import { failClosed } from "./fail-closed.mjs";

export function prepareDdalggakWorkerDispatch(packet) {
  requireStateGate(packet, "defaultDispatch", DEVELOPMENT_CONTROL_PLANE_STATE_GATES.defaultDispatch);
  requireControlPlaneSafetyContract(packet);
  for (const file of packet.taskScope.authorizedFiles) {
    if (!isInsideRepoRoot(packet.repoRoot, file)) {
      throw failClosed("authorized file must stay inside repoRoot", { file, repoRoot: packet.repoRoot });
    }
  }
  const invocation = {
    workerProfile: "claude-code",
    cwd: packet.repoRoot,
    commandShape: {
      command: "claude",
      args: [`/ddalggak ${packet.subcommand}`, "<control-plane-packet>"],
    },
    environmentKeys: ["DDALGGAK_CONTROL_PLANE_PACKET"],
    controlPlanePacket: packet,
  };
  const evidence = makeEvidence(packet, {
    status: "dispatch_prepared",
    approved: false,
    workerExecuted: false,
    nextAction: "pending approval",
    commandShape: invocation.commandShape,
  });
  const evidencePath = writeDevelopmentEvidence(packet, evidence);
  return { packet, invocation, evidence, evidencePath };
}

export function executePreparedWorkerDispatch(prepared, approval, { runner } = {}) {
  const approvalRequired = requireStateGate(
    prepared.packet,
    "executionRequiresApproval",
    DEVELOPMENT_CONTROL_PLANE_STATE_GATES.executionRequiresApproval,
  );
  requireControlPlaneSafetyContract(prepared.packet);
  if (approvalRequired && (!approval?.approved || !approval.approvedBy || !approval.reason)) {
    const evidence = makeEvidence(prepared.packet, {
      status: "blocked",
      approved: false,
      workerExecuted: false,
      nextAction: "pending approval",
      approvalSource: approval?.source || null,
    });
    const evidencePath = writeDevelopmentEvidence(prepared.packet, evidence);
    return { ...prepared, evidence, evidencePath, executed: false };
  }

  // Defense in depth: an approval claiming approved=true must have been issued
  // by normalizeApprovalSource (carries the module-private brand) and name a
  // recognized source. A raw object literal cannot forge the brand, so a
  // hand-built approval that bypasses normalization is rejected loudly.
  assertNormalizedApproval(approval);

  if (typeof runner !== "function") {
    const evidence = makeEvidence(prepared.packet, {
      status: "blocked",
      approved: true,
      approvedBy: approval.approvedBy,
      approvalReason: approval.reason,
      workerExecuted: false,
      nextAction: "explicit worker runner required for approved execution",
      approvalSource: approval.source || null,
    });
    const evidencePath = writeDevelopmentEvidence(prepared.packet, evidence);
    return { ...prepared, evidence, evidencePath, executed: false };
  }

  const result = runner(prepared.invocation);
  const exitCode = typeof result.status === "number" ? result.status : 1;
  const verificationRequired = requireStateGate(
    prepared.packet,
    "fulfilledRequiresPassingVerification",
    DEVELOPMENT_CONTROL_PLANE_STATE_GATES.fulfilledRequiresPassingVerification,
  );
  const verificationPassed = verificationRequired ? result.verificationPassed === true : true;
  const fulfilled = exitCode === 0 && verificationPassed;
  const evidence = makeEvidence(prepared.packet, {
    status: fulfilled ? "fulfilled" : "blocked",
    approved: true,
    approvedBy: approval.approvedBy,
    approvalReason: approval.reason,
    workerExecuted: true,
    commandShape: prepared.invocation.commandShape,
    cwd: prepared.invocation.cwd,
    workerProfile: prepared.invocation.workerProfile,
    exitCode,
    verificationPassed,
    nextAction: fulfilled ? "verification passed" : "inspect worker or verification result",
  });
  const evidencePath = writeDevelopmentEvidence(prepared.packet, evidence);
  return { ...prepared, evidence, evidencePath, executed: true, exitCode };
}

export function prepareDdalggakDispatchFromLiveGithubIssue(options) {
  const payload = fetchGhIssueViewJson(options.issueRef, {
    repo: options.repo,
    ghCommand: options.ghCommand,
  });
  const issueContext = ddalggakIssueContextFromGhJson(payload);
  const packet = buildDdalggakDevelopmentPacket({ ...options, issueContext });
  return prepareDdalggakWorkerDispatch(packet);
}

export function runDdalggakDispatchWithApproval(options) {
  const approvalSource = options.approvalSource || "direct";
  if (approvalSource === "direct") {
    normalizeApprovalSource({ source: "direct", approval: options.approval || {} });
  }
  const payload = fetchGhIssueViewJson(options.issueRef, {
    repo: options.repo,
    ghCommand: options.ghCommand,
  });
  const issueContext = ddalggakIssueContextFromGhJson(payload);
  const packet = buildDdalggakDevelopmentPacket({ ...options, issueContext });
  const prepared = prepareDdalggakWorkerDispatch(packet);
  const approval = normalizeApprovalSource({
    source: approvalSource,
    approval: options.approval || {},
    sessionContext: options.sessionContext || {},
    workcellApprovalFile: options.workcellApprovalFile,
    issueContext,
    authorizeApprover: options.authorizeApprover,
    authorizedApprovers: options.authorizedApprovers,
    repo: options.repo,
    ghCommand: options.ghCommand,
  });
  return executePreparedWorkerDispatch(prepared, approval, { runner: options.runner });
}
