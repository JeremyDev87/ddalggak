import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { failClosed } from "./fail-closed.mjs";
import { normalizeComments } from "./issue-context.mjs";

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

function brandApproval(approval) {
  return { ...approval, [APPROVAL_BRAND]: true };
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
    const result = spawnSync(ghCommand, ["api", `repos/${repo}/collaborators/${login}/permission`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
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
    const allowlist = new Set(Array.isArray(authorizedApprovers) ? authorizedApprovers : [...authorizedApprovers]);
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

export function assertNormalizedApproval(approval) {
  if (approval?.[APPROVAL_BRAND] !== true || !APPROVAL_SOURCES.has(approval.source)) {
    throw failClosed("approved dispatch requires an approval issued by normalizeApprovalSource", {
      source: approval?.source ?? null,
    });
  }
}
