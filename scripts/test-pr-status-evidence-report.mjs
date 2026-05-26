#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  buildBundle,
  formatMarkdown,
  parseCheckEvidence,
  parseConversationFreshness,
  parseFormalReviewEvidence,
  parseHumanAction,
  parseMergeStateEvidence,
  sanitizeText,
  sanitizeUrl,
} from "./pr-status-evidence-report.mjs";

const rootDir = process.cwd();
const scriptPath = path.join(rootDir, "scripts", "pr-status-evidence-report.mjs");
const tempRoots = [];

function cleanup() {
  while (tempRoots.length > 0) {
    rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
}
process.on("exit", cleanup);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertIncludes(value, needle, label = "value") {
  assert(
    String(value).includes(needle),
    `expected ${label} to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

function assertNotIncludes(value, needle, label = "value") {
  assert(
    !String(value).includes(needle),
    `expected ${label} not to include ${JSON.stringify(needle)}, got ${JSON.stringify(value)}`,
  );
}

function runCli(input, args = []) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "ddalggak-pr-status-evidence-"));
  tempRoots.push(dir);
  const filePath = path.join(dir, "pr-status.json");
  writeFileSync(filePath, JSON.stringify(input, null, 2), "utf8");
  return spawnSync(process.execPath, [scriptPath, "--input", filePath, ...args], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// ──────────────────────────────────────────────
// Fixture 1: all-green-approved
// all checks pass, formal review APPROVED, head SHA matches
// ──────────────────────────────────────────────
const fixtureAllGreenApproved = {
  headSha: "abc123def456abc123def456abc123def456abc1",
  checks: [
    { workflow: "CI", name: "Verify package / Node 20", conclusion: "success", link: "https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/1" },
    { workflow: "CI", name: "Verify package / Node 22", conclusion: "success", link: "https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/2" },
  ],
  reviewDecision: "APPROVED",
  reviews: [
    {
      state: "APPROVED",
      author: { login: "reviewer1" },
      submittedAt: "2026-05-25T10:00:00Z",
      commit_id: "abc123def456abc123def456abc123def456abc1",
    },
  ],
  mergeStateStatus: "CLEAN",
  branchProtection: {
    requiredApprovingReviewCount: 1,
    requiresStatusChecks: true,
    dismissStaleReviews: true,
  },
  reviewThreads: [],
  codeownersFilePresent: false,
  codeownersErrorsStatus: "api_unavailable_or_not_applicable",
  requiredCodeOwnerReviewStatus: "not_required",
};

// ──────────────────────────────────────────────
// Fixture 2: top-level-approve-comment-only
// APPROVE comment in a COMMENTED review, not a formal approval
// ──────────────────────────────────────────────
const fixtureTopLevelApproveCommentOnly = {
  headSha: "bcd234eff567bcd234eff567bcd234eff567bcd2",
  checks: [
    { workflow: "CI", name: "Verify package / Node 20", conclusion: "success" },
  ],
  reviewDecision: "REVIEW_REQUIRED",
  reviews: [
    {
      state: "COMMENTED",
      body: "Hermes Independent Review — APPROVE conclusion",
      author: { login: "hermes-bot" },
      submittedAt: "2026-05-25T11:00:00Z",
      commit_id: "bcd234eff567bcd234eff567bcd234eff567bcd2",
    },
  ],
  mergeStateStatus: "BLOCKED",
  reviewThreads: [],
};

// ──────────────────────────────────────────────
// Fixture 3: stale-review-sha-mismatch
// Latest APPROVED review has a commit_id that doesn't match the current head SHA
// ──────────────────────────────────────────────
const fixtureStaleReviewShaMismatch = {
  headSha: "newhead1111111111111111111111111111111111",
  checks: [
    { workflow: "CI", name: "Verify package / Node 20", conclusion: "success" },
  ],
  reviewDecision: "APPROVED",
  reviews: [
    {
      state: "APPROVED",
      author: { login: "reviewer1" },
      submittedAt: "2026-05-24T09:00:00Z",
      commit_id: "oldcommit222222222222222222222222222222",
    },
  ],
  mergeStateStatus: "BLOCKED",
  reviewThreads: [],
};

// ──────────────────────────────────────────────
// Fixture 4: pending-check
// One check still pending — not merge-ready
// ──────────────────────────────────────────────
const fixturePendingCheck = {
  headSha: "cde345faa678cde345faa678cde345faa678cde3",
  checks: [
    { workflow: "CI", name: "Verify package / Node 20", conclusion: "success" },
    { workflow: "CI", name: "Verify package / Node 22", status: "in_progress" },
  ],
  reviewDecision: "APPROVED",
  reviews: [
    {
      state: "APPROVED",
      author: { login: "reviewer1" },
      submittedAt: "2026-05-25T10:00:00Z",
      commit_id: "cde345faa678cde345faa678cde345faa678cde3",
    },
  ],
  mergeStateStatus: "CLEAN",
  reviewThreads: [],
};

// ──────────────────────────────────────────────
// Fixture 5: unknown-thread-freshness
// GraphQL reviewThreads unavailable — thread_freshness must remain unknown, not pass
// ──────────────────────────────────────────────
const fixtureUnknownThreadFreshness = {
  headSha: "def456gbb789def456gbb789def456gbb789def4",
  checks: [
    { workflow: "CI", name: "Verify package / Node 20", conclusion: "success" },
  ],
  reviewDecision: "APPROVED",
  reviews: [
    {
      state: "APPROVED",
      author: { login: "reviewer1" },
      submittedAt: "2026-05-25T10:00:00Z",
      commit_id: "def456gbb789def456gbb789def456gbb789def4",
    },
  ],
  mergeStateStatus: "CLEAN",
  // reviewThreads deliberately omitted — simulates GraphQL unavailability
};

// ──────────────────────────────────────────────
// Fixture 6: secret-redaction
// URL contains token=xxx and description has a bearer token
// ──────────────────────────────────────────────
const secret = "ghp_abcdefghijklmnopqrstuvwxyz123456";
const fixtureSecretRedaction = {
  headSha: "efa567hcc890efa567hcc890efa567hcc890efa5",
  checks: [
    {
      workflow: "CI",
      name: `Deploy step token=${secret}`,
      conclusion: "failure",
      link: `https://github.com/JeremyDev87/ddalggak/actions/runs/1/job/1?token=${secret}`,
      description: `Authorization: Bearer ${secret}`,
    },
  ],
  reviewDecision: "APPROVED",
  reviews: [
    {
      state: "APPROVED",
      author: { login: "reviewer1" },
      submittedAt: "2026-05-25T10:00:00Z",
      commit_id: `efa567hcc890efa567hcc890efa567hcc890efa5`,
    },
  ],
  mergeStateStatus: "CLEAN",
  reviewThreads: [],
};

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────
const cases = [
  {
    name: "fixture 1: all-green-approved — checks pass, formal review approved, head SHA match",
    run() {
      const bundle = buildBundle(fixtureAllGreenApproved);

      // Check evidence
      assert(bundle.checkEvidence.overallState === "success", "all checks should be success");
      assert(bundle.checkEvidence.counts.success === 2, "2 successful checks");

      // Formal review
      assert(bundle.formalReviewEvidence.formalReviewApproved === true, "formal review should be approved");
      assert(bundle.formalReviewEvidence.reviewDecision === "APPROVED", "reviewDecision should be APPROVED");
      assert(bundle.formalReviewEvidence.latestMeaningfulReview?.headShaMatch === "match", "head SHA should match");
      assert(bundle.formalReviewEvidence.approveCommentMisuseDetected === false, "no approve comment misuse");

      // Merge state
      assert(bundle.mergeStateEvidence.mergeStateStatus === "CLEAN", "mergeStateStatus should be CLEAN");
      assert(bundle.mergeStateEvidence.branchProtection.status === "present", "branch protection present");
      assert(bundle.mergeStateEvidence.codeowners.filePresent === false, "CODEOWNERS not present");
      assert(bundle.mergeStateEvidence.codeowners.errorsStatus === "api_unavailable_or_not_applicable", "codeowners errors status");

      // Conversation freshness
      assert(bundle.conversationFreshness.threadFreshness === "resolved_or_outdated", "threads resolved");
      assert(bundle.conversationFreshness.unresolvedThreadCount === 0, "no unresolved threads");

      // Human action — all-green means no blockers
      assert(bundle.humanAction.mergeReady === true, "should be merge ready");
      assert(bundle.humanAction.blockers.length === 0, "no blockers");
      assert(bundle.humanAction.manualMergeOnly === true, "manual merge only always true");

      // Markdown output
      const md = formatMarkdown(bundle);
      assertIncludes(md, "formal_review_approved: true", "markdown");
      assertIncludes(md, "merge_ready: true", "markdown");
      assertIncludes(md, "manual_merge_only: true", "markdown");
      assertIncludes(md, "head_sha_match: match", "markdown");
    },
  },
  {
    name: "fixture 2: top-level APPROVE comment is NOT formal approval — formal_review_approved stays false",
    run() {
      const bundle = buildBundle(fixtureTopLevelApproveCommentOnly);

      // COMMENTED review with APPROVE body must not count as formal approval
      assert(bundle.formalReviewEvidence.formalReviewApproved === false, "top-level APPROVE comment must not be formal approval");
      assert(bundle.formalReviewEvidence.approveCommentMisuseDetected === true, "approve comment misuse must be detected");

      // Not merge-ready due to missing formal approval
      assert(bundle.humanAction.mergeReady === false, "not merge-ready without formal approval");
      assert(
        bundle.humanAction.blockers.some((b) => /formal.*review|no.*formal/i.test(b) || /formal review/i.test(b) || b.includes("formal")),
        `should have formal review blocker, got: ${JSON.stringify(bundle.humanAction.blockers)}`,
      );

      // Markdown must include approve_comment_misuse_detected: true
      const md = formatMarkdown(bundle);
      assertIncludes(md, "approve_comment_misuse_detected: true", "markdown");
      assertIncludes(md, "formal_review_approved: false", "markdown");
    },
  },
  {
    name: "fixture 3: stale review SHA mismatch — APPROVED review with old commit_id is a blocker",
    run() {
      const bundle = buildBundle(fixtureStaleReviewShaMismatch);

      assert(bundle.formalReviewEvidence.latestMeaningfulReview?.headShaMatch === "mismatch", "SHA should be mismatch");
      assert(bundle.formalReviewEvidence.formalReviewApproved === false, "stale review must not be formal approval");

      // Blocker must mention stale review or SHA mismatch
      assert(bundle.humanAction.mergeReady === false, "not merge-ready with stale review");
      assert(
        bundle.humanAction.blockers.some((b) => /stale|mismatch|sha/i.test(b)),
        `should have stale review blocker, got: ${JSON.stringify(bundle.humanAction.blockers)}`,
      );

      const md = formatMarkdown(bundle);
      assertIncludes(md, "head_sha_match: mismatch", "markdown");
      assertIncludes(md, "formal_review_approved: false", "markdown");
    },
  },
  {
    name: "fixture 4: pending check — not merge-ready even if review is approved",
    run() {
      const bundle = buildBundle(fixturePendingCheck);

      assert(bundle.checkEvidence.overallState === "pending", "overall state should be pending");
      assert(bundle.checkEvidence.counts.pending === 1, "one pending check");
      assert(bundle.formalReviewEvidence.formalReviewApproved === true, "review is approved");

      // Pending check blocks merge
      assert(bundle.humanAction.mergeReady === false, "not merge-ready with pending check");
      assert(
        bundle.humanAction.blockers.some((b) => /pending/i.test(b)),
        `should have pending check blocker, got: ${JSON.stringify(bundle.humanAction.blockers)}`,
      );

      const md = formatMarkdown(bundle);
      assertIncludes(md, "overall_state: pending", "markdown");
      assertIncludes(md, "merge_ready: false", "markdown");
    },
  },
  {
    name: "fixture 5: unknown thread freshness — thread_freshness=unknown, not promoted to pass",
    run() {
      const bundle = buildBundle(fixtureUnknownThreadFreshness);

      // reviewThreads omitted → unknown
      assert(bundle.conversationFreshness.threadFreshness === "unknown", "thread freshness must be unknown when unavailable");
      assert(bundle.conversationFreshness.unresolvedThreadCount === "unknown", "unresolved count must be unknown");
      assert(bundle.conversationFreshness.caveat !== null, "must have a caveat explaining unavailability");

      // unknown freshness must produce a blocker, not pass
      assert(bundle.humanAction.mergeReady === false, "unknown thread freshness must not be merge-ready");
      assert(
        bundle.humanAction.blockers.some((b) => /thread|freshness|conversation/i.test(b)),
        `should have thread freshness blocker, got: ${JSON.stringify(bundle.humanAction.blockers)}`,
      );

      const md = formatMarkdown(bundle);
      assertIncludes(md, "thread_freshness: unknown", "markdown");
    },
  },
  {
    name: "fixture 6: secret redaction — token in URL and description must be [REDACTED]",
    run() {
      const bundle = buildBundle(fixtureSecretRedaction);
      const serialized = JSON.stringify(bundle);

      // Raw secret must not appear anywhere in serialized output
      assertNotIncludes(serialized, secret, "serialized bundle must not contain raw secret");
      assertIncludes(serialized, "[REDACTED]", "serialized bundle must contain [REDACTED]");

      // Markdown output must also be clean
      const md = formatMarkdown(bundle);
      assertNotIncludes(md, secret, "markdown must not contain raw secret");
      assertIncludes(md, "[REDACTED]", "markdown must contain [REDACTED]");

      // CLI output must also be clean
      const result = runCli(fixtureSecretRedaction);
      assert(result.status === 0, `CLI exited non-zero: ${result.stderr}`);
      assertNotIncludes(result.stdout, secret, "CLI stdout");
      assertIncludes(result.stdout, "[REDACTED]", "CLI stdout");
    },
  },
];

// ──────────────────────────────────────────────
// Runner
// ──────────────────────────────────────────────
let failures = 0;
for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error instanceof Error ? error.stack : String(error));
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`[test-pr-status-evidence-report] passed ${cases.length} cases`);
}
