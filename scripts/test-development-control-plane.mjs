import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDdalggakDevelopmentPacket,
  ddalggakIssueContextFromGhJson,
  executePreparedWorkerDispatch,
  normalizeApprovalSource,
  parseGithubIssueCommentApproval,
  prepareDdalggakWorkerDispatch,
  runDdalggakDispatchWithApproval,
} from "../core/development-control-plane.mjs";

const tempRoots = [];
function makeTempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-dev-control-plane-"));
  tempRoots.push(root);
  return root;
}
function cleanup() {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
}
process.on("exit", cleanup);

function issue(overrides = {}) {
  return {
    number: 200,
    title: "Dobby 개발 control-plane approval/evidence seam 반영",
    url: "https://github.com/JeremyDev87/ddalggak/issues/200",
    body: "## Acceptance Criteria\n- [ ] marker without raw transcript",
    labels: [{ name: "feat" }],
    comments: [],
    ...overrides,
  };
}

function packetFixture(overrides = {}) {
  const root = makeTempRoot();
  mkdirSync(path.join(root, "core"), { recursive: true });
  const issueContext = ddalggakIssueContextFromGhJson(issue(overrides.issue || {}));
  return buildDdalggakDevelopmentPacket({
    issueContext,
    repoRoot: root,
    repo: "JeremyDev87/ddalggak",
    runId: "issue-200-test",
    plannedFiles: ["core/development-control-plane.mjs"],
    validationCommands: ["node scripts/test-development-control-plane.mjs"],
    evidenceDir: path.join(root, ".evidence"),
    subcommand: "start",
    ...overrides.packet,
  });
}

const cases = [
  {
    name: "live issue intake requires body labels comments title url",
    run() {
      for (const field of ["body", "labels", "comments", "title", "url"]) {
        const payload = issue();
        delete payload[field];
        assert.throws(
          () => ddalggakIssueContextFromGhJson(payload),
          /missing required fields|body is required|title is required|url is required|must be an array/,
          `expected missing ${field} to fail closed`,
        );
      }
      const parsed = ddalggakIssueContextFromGhJson(issue());
      assert.deepEqual(parsed.labels, ["feat"]);
      assert.deepEqual(parsed.comments, []);
    },
  },
  {
    name: "prepare dispatch writes initial blocked evidence without worker execution",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const evidence = JSON.parse(readFileSync(prepared.evidencePath, "utf8"));
      assert.equal(evidence.status, "dispatch_prepared");
      assert.equal(evidence.workerExecuted, false);
      assert.equal(evidence.rawPromptStored, false);
      assert.equal(evidence.rawTranscriptStored, false);
      assert.deepEqual(prepared.invocation.environmentKeys, ["DDALGGAK_CONTROL_PLANE_PACKET"]);
    },
  },
  {
    name: "direct approval requires actor and reason before GitHub intake",
    run() {
      assert.throws(
        () =>
          runDdalggakDispatchWithApproval({
            approvalSource: "direct",
            approval: { approved: true, approvedBy: "JeremyDev87" },
            issueRef: "200",
            repoRoot: makeTempRoot(),
            runId: "direct-missing-reason",
            plannedFiles: ["core/development-control-plane.mjs"],
            validationCommands: ["npm test"],
            evidenceDir: path.join(makeTempRoot(), ".evidence"),
            subcommand: "start",
            ghCommand: "definitely-not-called",
          }),
        /direct approval requires/,
      );
    },
  },
  {
    name: "discord approval source derives actor and reason from session context",
    run() {
      assert.deepEqual(
        normalizeApprovalSource({
          source: "discord",
          sessionContext: { actor: "박정욱", reason: "current Discord command" },
        }),
        {
          source: "discord",
          approved: true,
          approvedBy: "박정욱",
          reason: "current Discord command",
        },
      );
      assert.equal(normalizeApprovalSource({ source: "discord" }).approved, false);
    },
  },
  {
    name: "workcell approval source reads approval artifact",
    run() {
      const root = makeTempRoot();
      const file = path.join(root, "approval.json");
      writeFileSync(
        file,
        JSON.stringify({ approved: true, approved_by: "JeremyDev87", reason: "thread approval" }),
        "utf8",
      );
      const approval = normalizeApprovalSource({ source: "workcell", workcellApprovalFile: file });
      assert.equal(approval.approved, true);
      assert.equal(approval.approvedBy, "JeremyDev87");
      assert.equal(approval.reason, "thread approval");
    },
  },
  {
    name: "github issue comment source executes only with dobby approve marker",
    run() {
      const blocked = parseGithubIssueCommentApproval([{ body: "looks good", author: { login: "JeremyDev87" } }]);
      assert.equal(blocked.approved, false);
      const approved = parseGithubIssueCommentApproval([
        { body: "please continue\n\ndobby:approve", author: { login: "JeremyDev87" }, createdAt: "2026-05-26T00:00:00Z" },
      ]);
      assert.equal(approved.approved, true);
      assert.equal(approved.approvedBy, "JeremyDev87");
    },
  },
  {
    name: "missing github issue comment marker remains prepared only",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const approval = normalizeApprovalSource({ source: "github-issue-comment", issueContext: packet.issue });
      const result = executePreparedWorkerDispatch(prepared, approval, {
        runner() {
          throw new Error("runner must not execute without marker");
        },
      });
      assert.equal(result.executed, false);
      assert.equal(result.evidence.status, "blocked");
      assert.equal(result.evidence.nextAction, "pending approval");
    },
  },
  {
    name: "relative planned-file escape fails closed",
    run() {
      assert.throws(
        () => prepareDdalggakWorkerDispatch(packetFixture({ packet: { plannedFiles: ["../outside.js"] } })),
        /authorized file must stay inside repoRoot/,
      );
    },
  },
  {
    name: "default direct approval requires actor and reason before GitHub intake",
    run() {
      assert.throws(
        () =>
          runDdalggakDispatchWithApproval({
            approval: { approved: true, approvedBy: "JeremyDev87" },
            issueRef: "200",
            repoRoot: makeTempRoot(),
            runId: "default-direct-missing-reason",
            plannedFiles: ["core/development-control-plane.mjs"],
            validationCommands: ["npm test"],
            evidenceDir: path.join(makeTempRoot(), ".evidence"),
            subcommand: "start",
            ghCommand: "definitely-not-called",
          }),
        /direct approval requires/,
      );
    },
  },
  {
    name: "approved execution without runner is blocked not fulfilled",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const result = executePreparedWorkerDispatch(prepared, {
        source: "direct",
        approved: true,
        approvedBy: "JeremyDev87",
        reason: "test approval",
      });
      assert.equal(result.executed, false);
      assert.equal(result.evidence.status, "blocked");
      assert.equal(result.evidence.workerExecuted, false);
    },
  },
  {
    name: "unsafe runId path traversal fails closed",
    run() {
      assert.throws(
        () => packetFixture({ packet: { runId: "../../escape" } }),
        /safe filename token/,
      );
    },
  },
  {
    name: "runner exit zero without verification pass is blocked",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const result = executePreparedWorkerDispatch(
        prepared,
        { source: "direct", approved: true, approvedBy: "JeremyDev87", reason: "test approval" },
        { runner: () => ({ status: 0 }) },
      );
      assert.equal(result.executed, true);
      assert.equal(result.evidence.status, "blocked");
      assert.equal(result.evidence.verificationPassed, false);
    },
  },
  {
    name: "final evidence omits raw prompt and transcript",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const result = executePreparedWorkerDispatch(
        prepared,
        { source: "direct", approved: true, approvedBy: "JeremyDev87", reason: "test approval" },
        { runner: () => ({ status: 0, verificationPassed: true }) },
      );
      assert.equal(result.executed, true);
      assert.equal(result.evidence.status, "fulfilled");
      assert.equal(result.evidence.rawPromptStored, false);
      assert.equal(result.evidence.rawTranscriptStored, false);
      assert.equal(result.evidence.githubMutationPayloadStored, false);
      const evidenceText = readFileSync(result.evidencePath, "utf8");
      assert(!evidenceText.includes("raw prompt"));
      assert(!evidenceText.includes("raw transcript"));
    },
  },
];

let failed = 0;
for (const testCase of cases) {
  try {
    testCase.run();
    console.log(`ok - ${testCase.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${testCase.name}`);
    console.error(error && error.stack ? error.stack : String(error));
  }
}
if (failed > 0) {
  process.exitCode = 1;
}
