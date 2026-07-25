import { assertNormalizedApproval, normalizeApprovalSource } from "./approval.mjs";
import {
  makeEvidence,
  readDevelopmentEvidence,
  recordDevelopmentEvidenceEvents,
  reduceDevelopmentEvidence,
  writeDevelopmentEvidence,
} from "./evidence.mjs";
import { ddalggakIssueContextFromGhJson, fetchGhIssueViewJson } from "./issue-context.mjs";
import {
  DEVELOPMENT_CONTROL_PLANE_STATE_GATES,
  buildDdalggakDevelopmentPacket,
  isInsideRepoRoot,
  requireControlPlaneSafetyContract,
  requireStateGate,
} from "./packet.mjs";
import { failClosed } from "./fail-closed.mjs";

function now() {
  return new Date().toISOString();
}

function event(packet, suffix, type, overrides = {}) {
  return {
    eventId: suffix.startsWith(`${packet.runId}:`) ? suffix : `${packet.runId}:${suffix}`,
    recordedAt: now(),
    type,
    budgetCost: type === "budget_reserved" ? 1 : 0,
    outcomeCertainty: "not_applicable",
    failureClass: null,
    evidenceRefs: [],
    ...overrides,
  };
}

function record(packet, document, events, projectionOverrides = {}, faultInjector) {
  const projection = makeEvidence(packet, {
    ...document.projection,
    ...projectionOverrides,
  });
  return recordDevelopmentEvidenceEvents(packet, {
    events,
    projection,
    expectedRevision: document.revision,
    faultInjector,
  });
}

function duplicateInvocationResult(prepared, document) {
  const reduction = reduceDevelopmentEvidence(document);
  return {
    ...prepared,
    evidence: {
      ...document.projection,
      status: reduction.status,
      nextAction: reduction.nextAction,
      outcomeCertainty: reduction.outcomeCertainty,
      decision: reduction.decision,
    },
    evidencePath: prepared.evidencePath,
    executed: false,
    duplicate: true,
  };
}

export function prepareDdalggakWorkerDispatch(packet) {
  requireStateGate(packet, "defaultDispatch", DEVELOPMENT_CONTROL_PLANE_STATE_GATES.defaultDispatch);
  requireControlPlaneSafetyContract(packet);
  for (const file of packet.taskScope.authorizedFiles) {
    if (!isInsideRepoRoot(packet.repoRoot, file)) {
      throw failClosed("authorized file must stay inside repoRoot", { file, repoRoot: packet.repoRoot });
    }
  }
  const invocationId = `${packet.runId}:${packet.subcommand}:runtime-dispatch`;
  const invocation = {
    invocationId,
    attemptId: `${invocationId}:attempt-1`,
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
  const document = readDevelopmentEvidence(packet);
  return { packet, invocation, evidence: document.projection, evidencePath };
}

export function executePreparedWorkerDispatch(prepared, approval, { runner, faultInjector } = {}) {
  const approvalRequired = requireStateGate(
    prepared.packet,
    "executionRequiresApproval",
    DEVELOPMENT_CONTROL_PLANE_STATE_GATES.executionRequiresApproval,
  );
  requireControlPlaneSafetyContract(prepared.packet);
  const packet = prepared.packet;
  const invocationId = prepared.invocation.invocationId;
  const attemptId = prepared.invocation.attemptId;
  let document = readDevelopmentEvidence(packet);

  if (approvalRequired && (!approval?.approved || !approval.approvedBy || !approval.reason)) {
    const approvalBlockedId = `${invocationId}:approval-blocked`;
    if (document.events.some((item) => item.eventId === approvalBlockedId)) {
      return duplicateInvocationResult(prepared, document);
    }
    const recorded = record(packet, document, [
      event(packet, `${invocationId}:approval-blocked`, "approval_blocked", {
        invocationId,
        outcomeCertainty: "not_applicable",
        failureClass: "approval_required",
        reason: "pending approval",
      }),
    ], {
      status: "blocked",
      approved: false,
      workerExecuted: false,
      nextAction: "pending approval",
      approvalSource: approval?.source || null,
    });
    return {
      ...prepared,
      evidence: recorded.document.projection,
      evidencePath: recorded.evidencePath,
      executed: false,
    };
  }

  // A successful approval must carry the module-private brand from
  // normalizeApprovalSource. Raw object literals cannot authorize execution.
  assertNormalizedApproval(approval);

  const priorIntent = document.events.find(
    (item) => item.type === "side_effect_intent_recorded" && item.invocationId === invocationId,
  );
  if (priorIntent) {
    return duplicateInvocationResult(prepared, document);
  }

  if (typeof runner !== "function") {
    const missingRunnerId = `${invocationId}:missing-runner`;
    if (document.events.some((item) => item.eventId === missingRunnerId)) {
      return duplicateInvocationResult(prepared, document);
    }
    const recorded = record(packet, document, [
      event(packet, `${invocationId}:missing-runner`, "run_stopped", {
        invocationId,
        attemptId,
        outcomeCertainty: "certain",
        failureClass: "runner_required",
        reason: "explicit worker runner required for approved execution",
      }),
    ], {
      status: "blocked",
      approved: true,
      approvedBy: approval.approvedBy,
      approvalReason: approval.reason,
      workerExecuted: false,
      nextAction: "explicit worker runner required for approved execution",
      approvalSource: approval.source || null,
    });
    return {
      ...prepared,
      evidence: recorded.document.projection,
      evidencePath: recorded.evidencePath,
      executed: false,
    };
  }

  const reduction = reduceDevelopmentEvidence(document);
  if (reduction.budgetRemaining < 1) {
    return {
      ...prepared,
      evidence: {
        ...document.projection,
        status: "blocked",
        nextAction: "attempt budget exhausted",
        decision: "budget_exhausted",
      },
      evidencePath: prepared.evidencePath,
      executed: false,
    };
  }

  const reserved = record(packet, document, [
    event(packet, `${invocationId}:budget-reserved`, "budget_reserved", {
      invocationId,
      attemptId,
      reason: "single development attempt reserved",
    }),
    event(packet, `${invocationId}:side-effect-intent`, "side_effect_intent_recorded", {
      invocationId,
      attemptId,
      outcomeCertainty: "pending",
      sideEffectClass: "local_worker_process",
      reason: "approved local worker invocation",
    }),
  ], {
    approved: true,
    approvedBy: approval.approvedBy,
    approvalReason: approval.reason,
    approvalSource: approval.source || null,
    commandShape: prepared.invocation.commandShape,
    cwd: prepared.invocation.cwd,
    workerProfile: prepared.invocation.workerProfile,
  });
  document = reserved.document;

  let result;
  try {
    result = runner(prepared.invocation);
  } catch (error) {
    const recorded = record(packet, document, [
      event(packet, `${invocationId}:run-stopped`, "run_stopped", {
        invocationId,
        attemptId,
        outcomeCertainty: "ambiguous",
        failureClass: "runner_exception_outcome_ambiguous",
        reason: "runner exception left side-effect outcome unknown; reconciliation required",
      }),
    ], {
      approved: true,
      approvedBy: approval.approvedBy,
      approvalReason: approval.reason,
      approvalSource: approval.source || null,
    });
    error.developmentEvidencePath = recorded.evidencePath;
    throw error;
  }

  faultInjector?.("after-runner-before-observation");

  const exitCode = typeof result?.status === "number" ? result.status : 1;
  const verificationRequired = requireStateGate(
    packet,
    "fulfilledRequiresPassingVerification",
    DEVELOPMENT_CONTROL_PLANE_STATE_GATES.fulfilledRequiresPassingVerification,
  );
  const verificationPassed = verificationRequired ? result?.verificationPassed === true : true;
  const fulfilled = exitCode === 0 && verificationPassed;
  const recorded = record(packet, document, [
    event(packet, `${invocationId}:execution-observed`, "execution_observed", {
      invocationId,
      attemptId,
      outcomeCertainty: "certain",
      failureClass: exitCode === 0 ? null : "runner_failed",
      exitCode,
      reason: exitCode === 0 ? "runner exited successfully" : "runner exited unsuccessfully",
    }),
    event(packet, `${invocationId}:verification-recorded`, "verification_recorded", {
      invocationId,
      attemptId,
      outcomeCertainty: "certain",
      failureClass: verificationPassed ? null : "verification_failed",
      verificationPassed,
      reason: verificationPassed ? "verification passed" : "verification did not pass",
    }),
    event(packet, `${invocationId}:run-stopped`, "run_stopped", {
      invocationId,
      attemptId,
      outcomeCertainty: "certain",
      failureClass: fulfilled ? null : "worker_or_verification_failed",
      reason: fulfilled ? "verification passed" : "inspect worker or verification result",
    }),
  ], {
    approved: true,
    approvedBy: approval.approvedBy,
    approvalReason: approval.reason,
    approvalSource: approval.source || null,
    commandShape: prepared.invocation.commandShape,
    cwd: prepared.invocation.cwd,
    workerProfile: prepared.invocation.workerProfile,
  });

  return {
    ...prepared,
    evidence: recorded.document.projection,
    evidencePath: recorded.evidencePath,
    executed: true,
    exitCode,
  };
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
  return executePreparedWorkerDispatch(prepared, approval, {
    runner: options.runner,
    faultInjector: options.faultInjector,
  });
}
