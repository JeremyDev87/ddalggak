import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_ISSUE_FIELDS = ["body", "labels", "comments", "title", "url"];
const APPROVAL_SOURCES = new Set(["direct", "discord", "workcell", "github-issue-comment"]);

function failClosed(message, details = {}) {
  const error = new Error(message);
  error.code = "DDALGGAK_CONTROL_PLANE_BLOCKED";
  error.details = details;
  return error;
}

function asArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw failClosed(`live GitHub issue field ${fieldName} must be an array`, { fieldName });
  }
  return value;
}

function normalizeLabels(labels) {
  return asArray(labels, "labels").map((label) => {
    if (typeof label === "string") return label;
    if (label && typeof label.name === "string") return label.name;
    throw failClosed("live GitHub issue labels must be strings or objects with name", { label });
  });
}

function normalizeComments(comments) {
  return asArray(comments, "comments").map((comment) => {
    if (typeof comment === "string") {
      return { body: comment, author: null, createdAt: null };
    }
    if (!comment || typeof comment.body !== "string") {
      throw failClosed("live GitHub issue comments must include body", { comment });
    }
    return {
      body: comment.body,
      author:
        typeof comment.author?.login === "string"
          ? comment.author.login
          : typeof comment.author === "string"
            ? comment.author
            : null,
      createdAt: typeof comment.createdAt === "string" ? comment.createdAt : null,
    };
  });
}

export function ddalggakIssueContextFromGhJson(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw failClosed("live GitHub issue payload must be an object");
  }
  const missing = REQUIRED_ISSUE_FIELDS.filter((field) => !(field in payload));
  if (missing.length > 0) {
    throw failClosed("live GitHub issue payload is missing required fields", { missing });
  }
  if (typeof payload.body !== "string" || payload.body.trim() === "") {
    throw failClosed("live GitHub issue body is required before worker dispatch");
  }
  if (typeof payload.title !== "string" || payload.title.trim() === "") {
    throw failClosed("live GitHub issue title is required before worker dispatch");
  }
  if (typeof payload.url !== "string" || !payload.url.includes("/issues/")) {
    throw failClosed("live GitHub issue url is required before worker dispatch");
  }

  return {
    number: payload.number ?? null,
    title: payload.title,
    url: payload.url,
    body: payload.body,
    labels: normalizeLabels(payload.labels),
    comments: normalizeComments(payload.comments),
  };
}

export function fetchGhIssueViewJson(issueRef, { repo, ghCommand = "gh" } = {}) {
  if (!issueRef) {
    throw failClosed("issue reference is required");
  }
  const args = [
    "issue",
    "view",
    String(issueRef),
    "--json",
    "body,labels,comments,title,url,number",
  ];
  if (repo) {
    args.push("--repo", repo);
  }
  const result = spawnSync(ghCommand, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw failClosed("gh issue view failed before worker dispatch", {
      status: result.status,
      stderr: result.stderr.trim(),
    });
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw failClosed("gh issue view returned invalid JSON", { message: error.message });
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
      forbiddenActions: [
        "merge",
        "auto-merge",
        "force-push without explicit current-turn approval",
        "raw prompt or transcript persistence",
        "secret or private log persistence",
        "GitHub mutation payload persistence",
      ],
      validationCommands: validationCommands.map(String),
    },
    stateGates: {
      defaultDispatch: "non-executing",
      executionRequiresApproval: true,
      fulfilledRequiresPassingVerification: true,
      contentLightEvidenceOnly: true,
    },
  };
}

function makeEvidence(packet, overrides = {}) {
  return {
    schema: "ddalggak.development_run_evidence.v1",
    runId: packet.runId,
    repo: packet.repo,
    repoRoot: packet.repoRoot,
    issueUrl: packet.issue.url,
    subcommand: packet.subcommand,
    evidencePolicy: "content-light",
    rawPromptStored: false,
    rawTranscriptStored: false,
    githubMutationPayloadStored: false,
    ...overrides,
  };
}

export function writeDevelopmentEvidence(packet, evidence) {
  if (!packet?.evidenceDir) {
    throw failClosed("packet evidenceDir is required before evidence write");
  }
  mkdirSync(packet.evidenceDir, { recursive: true });
  const evidencePath = path.join(packet.evidenceDir, `${packet.runId}.json`);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidencePath;
}

function isInsideRepoRoot(repoRoot, file) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedFile = path.resolve(resolvedRoot, file);
  return resolvedFile === resolvedRoot || resolvedFile.startsWith(resolvedRoot + path.sep);
}

export function prepareDdalggakWorkerDispatch(packet) {
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

export function parseGithubIssueCommentApproval(comments) {
  const normalized = normalizeComments(comments);
  const markers = normalized.filter((comment) => /(^|\s)dobby:approve(\s|$)/i.test(comment.body));
  if (markers.length === 0) {
    return { approved: false, approvedBy: null, reason: null };
  }
  const latest = markers[markers.length - 1];
  return {
    approved: true,
    approvedBy: latest.author || "github-issue-comment",
    reason: "dobby:approve marker in live issue comment",
  };
}

export function normalizeApprovalSource({
  source = "direct",
  approval = {},
  sessionContext = {},
  workcellApprovalFile,
  issueContext,
} = {}) {
  if (!APPROVAL_SOURCES.has(source)) {
    throw failClosed("unsupported approval source", { source });
  }
  if (source === "direct") {
    if (approval.approved !== true || !approval.approvedBy || !approval.reason) {
      throw failClosed("direct approval requires approved=true, approvedBy, and reason before GitHub intake", {
        source,
      });
    }
    return { source, approved: true, approvedBy: approval.approvedBy, reason: approval.reason };
  }
  if (source === "discord") {
    const approvedBy = sessionContext.actor || sessionContext.user || sessionContext.username;
    const reason = sessionContext.reason || sessionContext.message || "Discord session approval context";
    return {
      source,
      approved: Boolean(approvedBy),
      approvedBy: approvedBy || null,
      reason: approvedBy ? reason : null,
    };
  }
  if (source === "workcell") {
    if (!workcellApprovalFile || !existsSync(workcellApprovalFile)) {
      return { source, approved: false, approvedBy: null, reason: null };
    }
    const parsed = JSON.parse(readFileSync(workcellApprovalFile, "utf8"));
    return {
      source,
      approved: parsed.approved === true && Boolean(parsed.approved_by || parsed.approvedBy) && Boolean(parsed.reason),
      approvedBy: parsed.approved_by || parsed.approvedBy || null,
      reason: parsed.reason || null,
    };
  }
  const marker = parseGithubIssueCommentApproval(issueContext?.comments || []);
  return { source, ...marker };
}

export function executePreparedWorkerDispatch(prepared, approval, { runner } = {}) {
  if (!approval?.approved || !approval.approvedBy || !approval.reason) {
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
  const verificationPassed = result.verificationPassed === true;
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
  });
  return executePreparedWorkerDispatch(prepared, approval, { runner: options.runner });
}
