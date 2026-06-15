import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDdalggakDevelopmentPacket,
  ddalggakIssueContextFromGhJson,
  executePreparedWorkerDispatch,
  makeCollaboratorAuthorizer,
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
      const approval = normalizeApprovalSource({
        source: "discord",
        sessionContext: { actor: "박정욱", reason: "current Discord command" },
      });
      assert.equal(approval.source, "discord");
      assert.equal(approval.approved, true);
      assert.equal(approval.approvedBy, "박정욱");
      assert.equal(approval.reason, "current Discord command");
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
    name: "github issue comment approval requires an authorized marker author",
    run() {
      const authorize = (login) => login === "JeremyDev87";
      // No marker at all stays blocked regardless of authorizer.
      const blocked = parseGithubIssueCommentApproval(
        [{ body: "looks good", author: { login: "JeremyDev87" } }],
        { authorizeApprover: authorize },
      );
      assert.equal(blocked.approved, false);
      // Marker by an authorized collaborator approves with the verified author.
      const approved = parseGithubIssueCommentApproval(
        [{ body: "please continue\n\ndobby:approve", author: { login: "JeremyDev87" }, createdAt: "2026-05-26T00:00:00Z" }],
        { authorizeApprover: authorize },
      );
      assert.equal(approved.approved, true);
      assert.equal(approved.approvedBy, "JeremyDev87");
      // Marker by an unauthorized (non-collaborator) author fails closed.
      const unauthorized = parseGithubIssueCommentApproval(
        [{ body: "dobby:approve", author: { login: "drive-by-contributor" } }],
        { authorizeApprover: authorize },
      );
      assert.equal(unauthorized.approved, false);
      assert.equal(unauthorized.approvedBy, null);
      // No authorizer configured fails closed even for a real marker.
      const noAuthorizer = parseGithubIssueCommentApproval([
        { body: "dobby:approve", author: { login: "JeremyDev87" } },
      ]);
      assert.equal(noAuthorizer.approved, false);
    },
  },
  {
    name: "collaborator authorizer authorizes write access and fails closed otherwise",
    run() {
      const root = makeTempRoot();
      // Fake gh: returns permission JSON keyed by the login in the api path so
      // both the authorized (write) and denied (read/404) branches are exercised
      // without touching the network.
      const fakeGh = path.join(root, "fake-gh.mjs");
      writeFileSync(
        fakeGh,
        [
          "#!/usr/bin/env node",
          'const parts = (process.argv[3] || "").split("/");',
          "const login = parts[parts.length - 2];",
          'if (login === "maintainer") { process.stdout.write(JSON.stringify({ permission: "write", role_name: "write" })); }',
          'else if (login === "triager") { process.stdout.write(JSON.stringify({ permission: "read", role_name: "triage" })); }',
          "else { process.exit(1); }",
          "",
        ].join("\n"),
        "utf8",
      );
      chmodSync(fakeGh, 0o755);
      const authorize = makeCollaboratorAuthorizer({ repo: "JeremyDev87/ddalggak", ghCommand: fakeGh });
      assert.equal(authorize("maintainer"), true);
      assert.equal(authorize("triager"), false);
      assert.equal(authorize("ghost"), false); // non-collaborator → non-zero exit → fail closed
      assert.equal(authorize("../etc/passwd"), false); // login pattern guard rejects before any spawn
      assert.equal(makeCollaboratorAuthorizer({}), null); // no repo → no authorizer
      assert.equal(
        makeCollaboratorAuthorizer({ repo: "o/r", ghCommand: "definitely-not-a-real-cmd-xyz" })("maintainer"),
        false, // spawn error → fail closed
      );
    },
  },
  {
    name: "inline dobby:approve mention is not an approval marker",
    run() {
      const inline = parseGithubIssueCommentApproval(
        [{ body: "let's not dobby:approve yet", author: { login: "JeremyDev87" } }],
        { authorizeApprover: () => true },
      );
      assert.equal(inline.approved, false);
    },
  },
  {
    name: "github issue comment normalization authorizes via allowlist and brands the approval",
    run() {
      const issueContext = ddalggakIssueContextFromGhJson(
        issue({
          comments: [{ body: "dobby:approve", author: { login: "JeremyDev87" }, createdAt: "2026-05-26T00:00:00Z" }],
        }),
      );
      const approved = normalizeApprovalSource({
        source: "github-issue-comment",
        issueContext,
        authorizedApprovers: ["JeremyDev87"],
      });
      assert.equal(approved.approved, true);
      assert.equal(approved.approvedBy, "JeremyDev87");
      // The branded approval drives a real execution path end to end.
      const packet = packetFixture({
        issue: { comments: [{ body: "dobby:approve", author: { login: "JeremyDev87" } }] },
      });
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const executed = executePreparedWorkerDispatch(prepared, approved, {
        runner: () => ({ status: 0, verificationPassed: true }),
      });
      assert.equal(executed.executed, true);
      assert.equal(executed.evidence.status, "fulfilled");
      // A non-allowlisted author on the same marker fails closed.
      const denied = normalizeApprovalSource({
        source: "github-issue-comment",
        issueContext: ddalggakIssueContextFromGhJson(
          issue({ comments: [{ body: "dobby:approve", author: { login: "outsider" } }] }),
        ),
        authorizedApprovers: ["JeremyDev87"],
      });
      assert.equal(denied.approved, false);
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
      const result = executePreparedWorkerDispatch(
        prepared,
        normalizeApprovalSource({
          source: "direct",
          approval: { approved: true, approvedBy: "JeremyDev87", reason: "test approval" },
        }),
      );
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
        normalizeApprovalSource({
          source: "direct",
          approval: { approved: true, approvedBy: "JeremyDev87", reason: "test approval" },
        }),
        { runner: () => ({ status: 0 }) },
      );
      assert.equal(result.executed, true);
      assert.equal(result.evidence.status, "blocked");
      assert.equal(result.evidence.verificationPassed, false);
    },
  },
  {
    name: "un-normalized raw approval is rejected before execution",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      let runnerCalled = false;
      assert.throws(
        () =>
          executePreparedWorkerDispatch(
            prepared,
            { source: "direct", approved: true, approvedBy: "JeremyDev87", reason: "forged approval" },
            {
              runner() {
                runnerCalled = true;
                return { status: 0, verificationPassed: true };
              },
            },
          ),
        /issued by normalizeApprovalSource/,
      );
      assert.equal(runnerCalled, false);
    },
  },
  {
    name: "final evidence omits raw prompt and transcript",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const result = executePreparedWorkerDispatch(
        prepared,
        normalizeApprovalSource({
          source: "direct",
          approval: { approved: true, approvedBy: "JeremyDev87", reason: "test approval" },
        }),
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
