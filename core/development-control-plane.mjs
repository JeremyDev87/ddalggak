import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const REQUIRED_ISSUE_FIELDS = ["body", "labels", "comments", "title", "url"];
const APPROVAL_SOURCES = new Set(["direct", "discord", "workcell", "github-issue-comment"]);
// Module-private brand stamped only by normalizeApprovalSource. Raw object
// literals built elsewhere cannot carry this Symbol, so the execution gate can
// structurally reject any approval that did not pass normalization.
const APPROVAL_BRAND = Symbol("ddalggak.normalized-approval");
// GitHub login charset guard before the value is interpolated into a gh api
// path; blocks "/", ".", whitespace and other path-traversal characters.
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9-]+$/;
const AUTHORIZED_COLLABORATOR_PERMISSIONS = new Set(["admin", "write"]);
const AUTHORIZED_COLLABORATOR_ROLES = new Set(["admin", "maintain", "write"]);
const DEVELOPMENT_CONTROL_PLANE_STATE_GATES = Object.freeze({
  defaultDispatch: "non-executing",
  executionRequiresApproval: true,
  fulfilledRequiresPassingVerification: true,
  contentLightEvidenceOnly: true,
});
const DEVELOPMENT_CONTROL_PLANE_FORBIDDEN_ACTIONS = Object.freeze([
  "merge",
  "auto-merge",
  "force-push without explicit current-turn approval",
  "raw prompt or transcript persistence",
  "secret or private log persistence",
  "GitHub mutation payload persistence",
]);

function failClosed(message, details = {}) {
  const error = new Error(message);
  error.code = "DDALGGAK_CONTROL_PLANE_BLOCKED";
  error.details = details;
  return error;
}

function brandApproval(approval) {
  return { ...approval, [APPROVAL_BRAND]: true };
}

function asArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw failClosed(`live GitHub issue field ${fieldName} must be an array`, { fieldName });
  }
  return value;
}

function requireStateGate(packet, gateName, expectedValue) {
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

function requireForbiddenActions(packet) {
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

function requireControlPlaneSafetyContract(packet) {
  requireStateGate(
    packet,
    "contentLightEvidenceOnly",
    DEVELOPMENT_CONTROL_PLANE_STATE_GATES.contentLightEvidenceOnly,
  );
  requireForbiddenActions(packet);
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
      forbiddenActions: [...DEVELOPMENT_CONTROL_PLANE_FORBIDDEN_ACTIONS],
      validationCommands: validationCommands.map(String),
    },
    stateGates: { ...DEVELOPMENT_CONTROL_PLANE_STATE_GATES },
  };
}

function makeEvidence(packet, overrides = {}) {
  requireControlPlaneSafetyContract(packet);
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
  requireStateGate(
    packet,
    "defaultDispatch",
    DEVELOPMENT_CONTROL_PLANE_STATE_GATES.defaultDispatch,
  );
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

// Line-anchored so a prose mention ("do not dobby:approve yet") inside a
// comment never counts as an approval marker; the marker must stand on its own
// line.
const DOBBY_APPROVE_MARKER = /^dobby:approve\s*$/im;

export function parseGithubIssueCommentApproval(comments, { authorizeApprover } = {}) {
  const normalized = normalizeComments(comments);
  const markers = normalized.filter((comment) => DOBBY_APPROVE_MARKER.test(comment.body));
  if (markers.length === 0) {
    return { approved: false, approvedBy: null, reason: null };
  }
  const latest = markers[markers.length - 1];
  // The comment author is untrusted self-report until an authorizer confirms
  // write access. A missing authorizer, an unauthorized author, or an
  // authorizer failure all fail closed to "not approved".
  const author = latest.author;
  if (typeof authorizeApprover !== "function" || !author) {
    return { approved: false, approvedBy: null, reason: null };
  }
  let authorized = false;
  try {
    authorized = authorizeApprover(author) === true;
  } catch {
    authorized = false;
  }
  if (!authorized) {
    return { approved: false, approvedBy: null, reason: null };
  }
  return {
    approved: true,
    approvedBy: author,
    reason: "dobby:approve marker from authorized issue comment author",
  };
}

// Default authorizer: confirm the comment author holds write access via the
// live collaborator permission API. Any failure (offline, gh error, 404 for a
// non-collaborator, parse error) returns false so authorization fails closed.
export function makeCollaboratorAuthorizer({ repo, ghCommand = "gh" } = {}) {
  if (!repo) {
    return null;
  }
  return (login) => {
    if (typeof login !== "string" || !GITHUB_LOGIN_PATTERN.test(login)) {
      return false;
    }
    const result = spawnSync(
      ghCommand,
      ["api", `repos/${repo}/collaborators/${login}/permission`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    if (result.status !== 0) {
      return false;
    }
    try {
      const parsed = JSON.parse(result.stdout);
      const permission = typeof parsed.permission === "string" ? parsed.permission : null;
      const roleName = typeof parsed.role_name === "string" ? parsed.role_name : null;
      return (
        (permission !== null && AUTHORIZED_COLLABORATOR_PERMISSIONS.has(permission)) ||
        (roleName !== null && AUTHORIZED_COLLABORATOR_ROLES.has(roleName))
      );
    } catch {
      return false;
    }
  };
}

// Resolve the effective comment-approver authorizer: an explicit function or
// allowlist (used by tests/embedders) takes precedence, otherwise build the
// live collaborator authorizer from repo context.
function resolveCommentApprover({ authorizeApprover, authorizedApprovers, repo, ghCommand }) {
  if (typeof authorizeApprover === "function") {
    return authorizeApprover;
  }
  if (authorizedApprovers) {
    const allowlist = new Set(
      Array.isArray(authorizedApprovers) ? authorizedApprovers : [...authorizedApprovers],
    );
    return (login) => allowlist.has(login);
  }
  return makeCollaboratorAuthorizer({ repo, ghCommand });
}

export function normalizeApprovalSource({
  source = "direct",
  approval = {},
  sessionContext = {},
  workcellApprovalFile,
  issueContext,
  authorizeApprover,
  authorizedApprovers,
  repo,
  ghCommand = "gh",
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
    return brandApproval({ source, approved: true, approvedBy: approval.approvedBy, reason: approval.reason });
  }
  if (source === "discord") {
    const approvedBy = sessionContext.actor || sessionContext.user || sessionContext.username;
    const reason = sessionContext.reason || sessionContext.message || "Discord session approval context";
    return brandApproval({
      source,
      approved: Boolean(approvedBy),
      approvedBy: approvedBy || null,
      reason: approvedBy ? reason : null,
    });
  }
  if (source === "workcell") {
    if (!workcellApprovalFile || !existsSync(workcellApprovalFile)) {
      return brandApproval({ source, approved: false, approvedBy: null, reason: null });
    }
    const parsed = JSON.parse(readFileSync(workcellApprovalFile, "utf8"));
    return brandApproval({
      source,
      approved: parsed.approved === true && Boolean(parsed.approved_by || parsed.approvedBy) && Boolean(parsed.reason),
      approvedBy: parsed.approved_by || parsed.approvedBy || null,
      reason: parsed.reason || null,
    });
  }
  const marker = parseGithubIssueCommentApproval(issueContext?.comments || [], {
    authorizeApprover: resolveCommentApprover({ authorizeApprover, authorizedApprovers, repo, ghCommand }),
  });
  return brandApproval({ source, ...marker });
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
  if (approval[APPROVAL_BRAND] !== true || !APPROVAL_SOURCES.has(approval.source)) {
    throw failClosed("approved dispatch requires an approval issued by normalizeApprovalSource", {
      source: approval.source ?? null,
    });
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
