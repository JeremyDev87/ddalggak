#!/usr/bin/env node
// PR status evidence bundle — 5-section read-only report
// Sections: checkEvidence / formalReviewEvidence / mergeStateEvidence / conversationFreshness / humanAction
// Input:  --input <fixture-json>
// Output: --markdown (default) | --json
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);

import { sanitizeText, sanitizeUrl } from "./lib/secret-scrub.mjs";
import { normalizeChecks } from "./lib/check-evidence.mjs";

// ──────────────────────────────────────────────
// Arg parser
// ──────────────────────────────────────────────
function parseArgs(argv) {
  const options = { input: null, format: "markdown" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") {
      const value = argv[index + 1];
      if (!value) throw new Error("--input requires a JSON file path");
      options.input = value;
      index += 1;
    } else if (arg === "--json") {
      options.format = "json";
    } else if (arg === "--markdown") {
      options.format = "markdown";
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (!options.input) throw new Error("--input is required");
  return options;
}

// ──────────────────────────────────────────────
// Section 1: Check evidence
// ──────────────────────────────────────────────
function parseCheckEvidence(data) {
  const checks = normalizeChecks(data).map(({ name, workflow, state, failureType, detailsUrl }) => ({
    name,
    workflow,
    state,
    failureType,
    detailsUrl,
  }));

  const counts = { success: 0, failure: 0, pending: 0, skipped: 0, unknown: 0 };
  for (const c of checks) {
    counts[c.state] = (counts[c.state] || 0) + 1;
  }

  let overallState;
  if (counts.failure > 0) overallState = "failure";
  else if (counts.pending > 0) overallState = "pending";
  else if (counts.unknown > 0) overallState = "unknown";
  else if (checks.length === 0) overallState = "unknown";
  else overallState = "success";

  return { overallState, checkCount: checks.length, counts, checks };
}

// ──────────────────────────────────────────────
// Section 2: Formal review evidence
// ──────────────────────────────────────────────
function parseFormalReviewEvidence(data) {
  // reviewDecision: APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED | null | unknown
  const rawDecision = data?.reviewDecision ?? data?.review_decision ?? null;
  const reviewDecision = rawDecision ? sanitizeText(String(rawDecision).toUpperCase()) : "unknown";

  // Detect top-level APPROVE comment pattern (must NOT count as formal approval)
  // A formal review requires a reviews[] entry with state=APPROVED, not just a comment body
  const latestReviews = Array.isArray(data?.reviews)
    ? data.reviews
    : Array.isArray(data?.latestReviews)
      ? data.latestReviews
      : [];

  // Find the most recent meaningful review (APPROVED, CHANGES_REQUESTED)
  const meaningfulStates = new Set(["APPROVED", "CHANGES_REQUESTED"]);
  const sortedReviews = [...latestReviews].sort((a, b) => {
    const ta = a.submittedAt || a.submitted_at || "";
    const tb = b.submittedAt || b.submitted_at || "";
    return tb.localeCompare(ta);
  });
  const latestMeaningful = sortedReviews.find((r) => meaningfulStates.has(String(r.state || "").toUpperCase())) || null;

  let latestReview = null;
  if (latestMeaningful) {
    const reviewState = String(latestMeaningful.state || "").toUpperCase();
    const reviewCommitId = sanitizeText(latestMeaningful.commit_id || latestMeaningful.commitId || null);
    const headSha = sanitizeText(data?.headSha || data?.head_sha || data?.head?.sha || null);
    // Stale review detection: commit_id of review != current head SHA
    let headShaMatch = "unknown";
    if (reviewCommitId && headSha) {
      headShaMatch = reviewCommitId === headSha ? "match" : "mismatch";
    }
    latestReview = {
      state: reviewState,
      author: sanitizeText(latestMeaningful.author?.login || latestMeaningful.user?.login || latestMeaningful.reviewer || null),
      submittedAt: sanitizeText(latestMeaningful.submittedAt || latestMeaningful.submitted_at || null),
      commitId: reviewCommitId,
      headShaMatch,
    };
  }

  // formal_review_approved: true only if a formal APPROVED review exists with head SHA match (or unknown SHA)
  // Top-level APPROVE comment in reviews[].state = "COMMENTED" does NOT count
  let formalReviewApproved = false;
  if (latestReview && latestReview.state === "APPROVED") {
    // If SHA mismatch, not approved (stale)
    if (latestReview.headShaMatch === "mismatch") {
      formalReviewApproved = false;
    } else {
      formalReviewApproved = true;
    }
  }

  // Check for top-level APPROVE comment impersonation:
  // reviews with state=COMMENTED whose body contains APPROVE (not a formal review)
  const approveCommentCount = latestReviews.filter(
    (r) => String(r.state || "").toUpperCase() === "COMMENTED" &&
      /\bAPPROVE\b/.test(String(r.body || "")),
  ).length;

  return {
    reviewDecision,
    formalReviewApproved,
    approveCommentMisuseDetected: approveCommentCount > 0,
    latestMeaningfulReview: latestReview,
  };
}

// ──────────────────────────────────────────────
// Section 3: Merge state / branch protection / rulesets / CODEOWNERS
// ──────────────────────────────────────────────
function parseMergeStateEvidence(data) {
  const mergeStateStatus = sanitizeText(
    data?.mergeStateStatus || data?.merge_state_status || null,
  ) || "unknown";

  // Branch protection (legacy)
  const bp = data?.branchProtection || data?.branch_protection || null;
  let branchProtection;
  if (bp === null || bp === undefined) {
    branchProtection = { status: "unknown" };
  } else {
    branchProtection = {
      status: "present",
      requiredApprovingReviewCount: bp.requiredApprovingReviewCount ?? bp.required_approving_review_count ?? "unknown",
      requiresStatusChecks: bp.requiresStatusChecks ?? bp.requires_status_checks ?? "unknown",
      requiresConversationResolution: bp.requiresConversationResolution ?? bp.requires_conversation_resolution ?? "unknown",
      dismissStaleReviews: bp.dismissStaleReviews ?? bp.dismiss_stale_reviews ?? "unknown",
    };
  }

  // Rulesets
  const rawRulesets = Array.isArray(data?.activeRulesets)
    ? data.activeRulesets
    : Array.isArray(data?.active_rulesets)
      ? data.active_rulesets
      : null;

  let rulesets;
  if (rawRulesets === null) {
    rulesets = { status: "unknown" };
  } else if (rawRulesets.length === 0) {
    rulesets = { status: "none" };
  } else {
    rulesets = {
      status: "present",
      count: rawRulesets.length,
      enforcement: rawRulesets.map((r) => sanitizeText(r.enforcement || r.enforcement_status || "unknown")),
      bypassActorsPresent: rawRulesets.some((r) => Array.isArray(r.bypass_actors) ? r.bypass_actors.length > 0 : (r.bypassActors?.length > 0)),
      mergeQueueRequired: rawRulesets.some((r) => r.merge_queue_required || r.mergeQueueRequired),
    };
  }

  // CODEOWNERS
  const codeownersFilePresent = data?.codeownersFilePresent ?? data?.codeowners_file_present ?? "unknown";
  const codeownersErrorsStatus = sanitizeText(
    data?.codeownersErrorsStatus || data?.codeowners_errors_status || "unknown",
  );
  const requiredCodeOwnerReviewStatus = sanitizeText(
    data?.requiredCodeOwnerReviewStatus || data?.required_code_owner_review_status || "unknown",
  );

  return {
    mergeStateStatus,
    branchProtection,
    rulesets,
    codeowners: {
      filePresent: codeownersFilePresent,
      errorsStatus: codeownersErrorsStatus,
      requiredReviewStatus: requiredCodeOwnerReviewStatus,
    },
  };
}

// ──────────────────────────────────────────────
// Section 4: Conversation freshness (review threads)
// ──────────────────────────────────────────────
function parseConversationFreshness(data) {
  // reviewThreads from GraphQL or similar
  const rawThreads = Array.isArray(data?.reviewThreads)
    ? data.reviewThreads
    : Array.isArray(data?.review_threads)
      ? data.review_threads
      : null;

  if (rawThreads === null) {
    // Cannot determine thread state — must remain unknown, not pass
    return {
      threadFreshness: "unknown",
      unresolvedThreadCount: "unknown",
      nonOutdatedUnresolvedCount: "unknown",
      caveat: "GraphQL reviewThreads unavailable — cannot verify conversation resolution",
    };
  }

  const unresolvedThreads = rawThreads.filter(
    (t) => t.isResolved === false || t.is_resolved === false,
  );
  const nonOutdatedUnresolved = unresolvedThreads.filter(
    (t) => t.isOutdated === false || t.is_outdated === false,
  );

  const threadFreshness = nonOutdatedUnresolved.length > 0 ? "has_unresolved" : "resolved_or_outdated";

  return {
    threadFreshness,
    unresolvedThreadCount: unresolvedThreads.length,
    nonOutdatedUnresolvedCount: nonOutdatedUnresolved.length,
    caveat: null,
  };
}

// ──────────────────────────────────────────────
// Section 5: Human action / merge blocker
// ──────────────────────────────────────────────
function parseHumanAction(checkEvidence, reviewEvidence, mergeEvidence, freshnessEvidence) {
  const blockers = [];
  const notes = [];

  // Check blockers
  if (checkEvidence.overallState === "failure") {
    blockers.push("one or more checks failing");
  } else if (checkEvidence.overallState === "pending") {
    blockers.push("one or more checks still pending");
  } else if (checkEvidence.overallState === "unknown") {
    blockers.push("check state unknown — manual inspection required");
  }

  // Review blockers
  if (!reviewEvidence.formalReviewApproved) {
    if (reviewEvidence.latestMeaningfulReview?.headShaMatch === "mismatch") {
      blockers.push("latest APPROVED review is stale (commit_id mismatch with head SHA)");
    } else if (reviewEvidence.reviewDecision === "CHANGES_REQUESTED") {
      blockers.push("reviewer has requested changes");
    } else {
      blockers.push("no formal GitHub review approval on current head");
    }
  }

  if (reviewEvidence.approveCommentMisuseDetected) {
    notes.push("top-level APPROVE comment detected — does NOT constitute formal GitHub review approval");
  }

  // Conversation freshness blockers
  if (freshnessEvidence.threadFreshness === "has_unresolved") {
    blockers.push(`${freshnessEvidence.nonOutdatedUnresolvedCount} unresolved non-outdated review thread(s) remain`);
  } else if (freshnessEvidence.threadFreshness === "unknown") {
    blockers.push("review thread freshness unknown — cannot confirm conversation resolution");
  }

  // Merge state blockers
  if (mergeEvidence.mergeStateStatus === "BLOCKED" || mergeEvidence.mergeStateStatus === "BEHIND") {
    blockers.push(`mergeStateStatus is ${mergeEvidence.mergeStateStatus}`);
  } else if (mergeEvidence.mergeStateStatus === "unknown") {
    notes.push("mergeStateStatus unavailable — verify manually before merge");
  }

  // Rulesets
  if (mergeEvidence.rulesets.status === "unknown") {
    notes.push("active ruleset state unknown — API unavailable or insufficient permissions");
  } else if (mergeEvidence.rulesets.status === "present") {
    if (mergeEvidence.rulesets.mergeQueueRequired) {
      blockers.push("merge queue required by active ruleset — direct merge not available");
    }
  }

  // CODEOWNERS
  if (mergeEvidence.codeowners.requiredReviewStatus === "missing") {
    blockers.push("required code owner review not satisfied");
  }

  const mergeReady = blockers.length === 0;

  return {
    manualMergeOnly: true,
    mergeReady,
    blockers,
    notes,
  };
}

// ──────────────────────────────────────────────
// Bundle
// ──────────────────────────────────────────────
function buildBundle(data) {
  const checkEvidence = parseCheckEvidence(data);
  const formalReviewEvidence = parseFormalReviewEvidence(data);
  const mergeStateEvidence = parseMergeStateEvidence(data);
  const conversationFreshness = parseConversationFreshness(data);
  const humanAction = parseHumanAction(
    checkEvidence,
    formalReviewEvidence,
    mergeStateEvidence,
    conversationFreshness,
  );

  return {
    checkEvidence,
    formalReviewEvidence,
    mergeStateEvidence,
    conversationFreshness,
    humanAction,
    caveats: [
      "manual merge only — this report does not constitute merge approval",
      "raw CI logs, raw review body, private workflow output intentionally excluded",
      "unknown fields are not promoted to pass — human verification required",
      "secret-like values in URLs, names, descriptions are [REDACTED]",
    ],
  };
}

// ──────────────────────────────────────────────
// Markdown formatter
// ──────────────────────────────────────────────
function formatMarkdown(bundle) {
  const lines = [];
  lines.push("# PR status evidence bundle");
  lines.push("");

  // Section 1: Checks
  lines.push("## 1. Check evidence");
  const ce = bundle.checkEvidence;
  lines.push(`- overall_state: ${ce.overallState}`);
  lines.push(`- checks: ${ce.checkCount}`);
  lines.push(`- success=${ce.counts.success}, failure=${ce.counts.failure}, pending=${ce.counts.pending}, skipped=${ce.counts.skipped}, unknown=${ce.counts.unknown}`);
  if (ce.checks.length > 0) {
    for (const c of ce.checks) {
      const wf = c.workflow ? `${c.workflow} / ` : "";
      const url = c.detailsUrl ? ` (${c.detailsUrl})` : "";
      const ft = c.state === "failure" ? `; ${c.failureType}` : "";
      lines.push(`  - ${wf}${c.name}: ${c.state.toUpperCase()}${ft}${url}`);
    }
  }
  lines.push("");

  // Section 2: Formal review
  lines.push("## 2. Formal review evidence");
  const re = bundle.formalReviewEvidence;
  lines.push(`- review_decision: ${re.reviewDecision}`);
  lines.push(`- formal_review_approved: ${re.formalReviewApproved}`);
  lines.push(`- approve_comment_misuse_detected: ${re.approveCommentMisuseDetected}`);
  if (re.latestMeaningfulReview) {
    const lr = re.latestMeaningfulReview;
    lines.push(`- latest_meaningful_review:`);
    lines.push(`  - state: ${lr.state}`);
    lines.push(`  - author: ${lr.author ?? "unknown"}`);
    lines.push(`  - submitted_at: ${lr.submittedAt ?? "unknown"}`);
    lines.push(`  - commit_id: ${lr.commitId ?? "unknown"}`);
    lines.push(`  - head_sha_match: ${lr.headShaMatch}`);
  } else {
    lines.push("- latest_meaningful_review: none");
  }
  lines.push("");

  // Section 3: Merge state / branch protection
  lines.push("## 3. Merge state / branch protection / ruleset evidence");
  const me = bundle.mergeStateEvidence;
  lines.push(`- merge_state_status: ${me.mergeStateStatus}`);
  lines.push(`- branch_protection: ${me.branchProtection.status}`);
  if (me.branchProtection.status === "present") {
    lines.push(`  - required_approving_review_count: ${me.branchProtection.requiredApprovingReviewCount}`);
    lines.push(`  - requires_status_checks: ${me.branchProtection.requiresStatusChecks}`);
    lines.push(`  - dismiss_stale_reviews: ${me.branchProtection.dismissStaleReviews}`);
  }
  lines.push(`- rulesets: ${me.rulesets.status}`);
  if (me.rulesets.status === "present") {
    lines.push(`  - count: ${me.rulesets.count}`);
    lines.push(`  - enforcement: ${me.rulesets.enforcement.join(", ")}`);
    lines.push(`  - bypass_actors_present: ${me.rulesets.bypassActorsPresent}`);
    lines.push(`  - merge_queue_required: ${me.rulesets.mergeQueueRequired}`);
  }
  lines.push(`- codeowners_file_present: ${me.codeowners.filePresent}`);
  lines.push(`- codeowners_errors_status: ${me.codeowners.errorsStatus}`);
  lines.push(`- required_code_owner_review_status: ${me.codeowners.requiredReviewStatus}`);
  lines.push("");

  // Section 4: Conversation freshness
  lines.push("## 4. Conversation freshness");
  const cf = bundle.conversationFreshness;
  lines.push(`- thread_freshness: ${cf.threadFreshness}`);
  lines.push(`- unresolved_thread_count: ${cf.unresolvedThreadCount}`);
  lines.push(`- non_outdated_unresolved_count: ${cf.nonOutdatedUnresolvedCount}`);
  if (cf.caveat) {
    lines.push(`- caveat: ${cf.caveat}`);
  }
  lines.push("");

  // Section 5: Human action
  lines.push("## 5. Human action / merge blocker");
  const ha = bundle.humanAction;
  lines.push(`- manual_merge_only: ${ha.manualMergeOnly}`);
  lines.push(`- merge_ready: ${ha.mergeReady}`);
  if (ha.blockers.length > 0) {
    lines.push("- blockers:");
    for (const b of ha.blockers) {
      lines.push(`  - ${b}`);
    }
  } else {
    lines.push("- blockers: none");
  }
  if (ha.notes.length > 0) {
    lines.push("- notes:");
    for (const n of ha.notes) {
      lines.push(`  - ${n}`);
    }
  }
  lines.push("");

  // Caveats
  lines.push("## Caveats");
  for (const c of bundle.caveats) {
    lines.push(`- ${c}`);
  }

  return `${lines.join("\n").trim()}\n`;
}

// ──────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────
function main() {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const input = JSON.parse(readFileSync(inputPath, "utf8"));
  const bundle = buildBundle(input);
  if (options.format === "json") {
    process.stdout.write(`${JSON.stringify(bundle, null, 2)}\n`);
  } else {
    process.stdout.write(formatMarkdown(bundle));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  try {
    main();
  } catch (error) {
    console.error(`[pr-status-evidence-report] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

export {
  buildBundle,
  formatMarkdown,
  parseCheckEvidence,
  parseConversationFreshness,
  parseFormalReviewEvidence,
  parseHumanAction,
  parseMergeStateEvidence,
  sanitizeText,
  sanitizeUrl,
};
