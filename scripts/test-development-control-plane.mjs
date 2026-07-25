import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { makeTempDir } from "./test-lib/temp.mjs";

import { sideEffectBoundaryControlPlaneForbiddenActions } from "../core/verification/side-effect-boundary-policy.mjs";

import {
  buildDdalggakDevelopmentPacket,
  ddalggakIssueContextFromGhJson,
  executePreparedWorkerDispatch,
  makeCollaboratorAuthorizer,
  normalizeApprovalSource,
  parseGithubIssueCommentApproval,
  prepareDdalggakWorkerDispatch,
  readDevelopmentEvidence,
  reduceDevelopmentEvidence,
  runDdalggakDispatchWithApproval,
  writeDevelopmentEvidence,
} from "../core/development-control-plane.mjs";
import {
  makeEvidence,
  recordDevelopmentEvidenceEvents,
} from "../core/development-control-plane/evidence.mjs";

function makeTempRoot() {
  return makeTempDir("ddalggak-dev-control-plane-");
}

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
      assert.deepEqual(packet.stateGates, {
        defaultDispatch: "non-executing",
        executionRequiresApproval: true,
        fulfilledRequiresPassingVerification: true,
        contentLightEvidenceOnly: true,
      });
      assert.deepEqual(packet.taskScope.forbiddenActions, [
        ...sideEffectBoundaryControlPlaneForbiddenActions,
      ]);
    },
  },
  {
    name: "declared state gates and forbidden actions fail closed on drift",
    run() {
      const defaultDispatchDrift = packetFixture();
      defaultDispatchDrift.stateGates.defaultDispatch = "execute-immediately";
      assert.throws(
        () => prepareDdalggakWorkerDispatch(defaultDispatchDrift),
        /state gate drift/,
      );

      const contentLightDrift = packetFixture();
      contentLightDrift.stateGates.contentLightEvidenceOnly = false;
      assert.throws(() => prepareDdalggakWorkerDispatch(contentLightDrift), /state gate drift/);

      const forbiddenActionDrift = packetFixture();
      forbiddenActionDrift.taskScope.forbiddenActions = forbiddenActionDrift.taskScope.forbiddenActions.filter(
        (action) => action !== "merge",
      );
      assert.throws(
        () => prepareDdalggakWorkerDispatch(forbiddenActionDrift),
        /forbiddenActions drift/,
      );

      const executionGateDrift = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(executionGateDrift);
      prepared.packet.stateGates.executionRequiresApproval = false;
      assert.throws(() => executePreparedWorkerDispatch(prepared, null), /state gate drift/);
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
      const repeated = executePreparedWorkerDispatch(prepared, approval, {
        runner() {
          throw new Error("repeated blocked approval must not run");
        },
      });
      assert.equal(repeated.executed, false);
      assert.equal(repeated.duplicate, true);
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
      const repeated = executePreparedWorkerDispatch(
        prepared,
        normalizeApprovalSource({
          source: "direct",
          approval: { approved: true, approvedBy: "JeremyDev87", reason: "test approval" },
        }),
      );
      assert.equal(repeated.executed, false);
      assert.equal(repeated.duplicate, true);
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
  {
    name: "packet and canonical evidence document bind writer budget hash and immutable events",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const document = readDevelopmentEvidence(packet);
      assert.equal(packet.schemaVersion, 1);
      assert.match(packet.writerEpoch, /^[0-9a-f-]{36}$/);
      assert.equal(packet.writerProcessId, process.pid);
      assert.match(packet.packetHash, /^[0-9a-f]{64}$/);
      assert.equal(packet.attemptBudget, 1);
      assert.equal(packet.maxEvents, 32);
      assert.equal(document.schema, "ddalggak.development_run_evidence.v2");
      assert.equal(document.revision, 0);
      assert.equal(document.writerEpoch, packet.writerEpoch);
      assert.equal(document.packetHash, packet.packetHash);
      assert.equal(document.events.length, 2);
      assert.deepEqual(document.events.map((event) => event.type), ["run_started", "dispatch_prepared"]);
      assert.deepEqual(document.events.map((event) => event.sequence), [0, 1]);
      assert(document.events.every((event) => /^[0-9a-f]{64}$/.test(event.eventHash)));
      assert.equal(document.projection.status, "dispatch_prepared");
      assert.equal(prepared.evidence.status, "dispatch_prepared");
      assert.equal(reduceDevelopmentEvidence(document).decision, "pending_approval");
    },
  },
  {
    name: "packet and complete canonical document hashes reject mutable contract or projection tampering",
    run() {
      const changedPacket = packetFixture();
      changedPacket.taskScope.authorizedFiles.push("core/unapproved.mjs");
      assert.throws(
        () => prepareDdalggakWorkerDispatch(changedPacket),
        /packet hash mismatch/,
      );

      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const tampered = JSON.parse(readFileSync(prepared.evidencePath, "utf8"));
      tampered.projection.approvedBy = "tampered-actor";
      tampered.approvedBy = "tampered-actor";
      tampered.exitCode = 0;
      writeFileSync(prepared.evidencePath, `${JSON.stringify(tampered, null, 2)}\n`);
      assert.throws(
        () => readDevelopmentEvidence(packet),
        /document hash mismatch/,
      );
    },
  },
  {
    name: "duplicate approved invocation calls the runner exactly once and returns prior terminal projection",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const approval = normalizeApprovalSource({
        source: "direct",
        approval: { approved: true, approvedBy: "JeremyDev87", reason: "duplicate test" },
      });
      let runnerCalls = 0;
      const runner = () => {
        runnerCalls += 1;
        return { status: 0, verificationPassed: true };
      };
      const first = executePreparedWorkerDispatch(prepared, approval, { runner });
      const second = executePreparedWorkerDispatch(prepared, approval, { runner });
      assert.equal(first.executed, true);
      assert.equal(second.executed, false);
      assert.equal(second.duplicate, true);
      assert.equal(second.evidence.status, "fulfilled");
      assert.equal(runnerCalls, 1);
      assert.equal(readDevelopmentEvidence(packet).projection.status, "fulfilled");
    },
  },
  {
    name: "runner return without durable observation becomes ambiguous and never reruns",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const approval = normalizeApprovalSource({
        source: "direct",
        approval: { approved: true, approvedBy: "JeremyDev87", reason: "fault test" },
      });
      let runnerCalls = 0;
      assert.throws(
        () => executePreparedWorkerDispatch(prepared, approval, {
          runner: () => {
            runnerCalls += 1;
            return { status: 0, verificationPassed: true };
          },
          faultInjector(stage) {
            if (stage === "after-runner-before-observation") throw new Error("simulated process crash");
          },
        }),
        /simulated process crash/,
      );
      const ambiguous = executePreparedWorkerDispatch(prepared, approval, {
        runner() {
          runnerCalls += 1;
          throw new Error("ambiguous invocation must not rerun");
        },
      });
      assert.equal(ambiguous.executed, false);
      assert.equal(ambiguous.duplicate, true);
      assert.equal(ambiguous.evidence.outcomeCertainty, "ambiguous");
      assert.equal(ambiguous.evidence.nextAction, "reconciliation required");
      assert.equal(runnerCalls, 1);
      assert.equal(reduceDevelopmentEvidence(readDevelopmentEvidence(packet)).decision, "reconciliation_required");
    },
  },
  {
    name: "packet writer process ownership fails closed before a cross-process writer can race",
    run() {
      const packet = packetFixture();
      packet.writerProcessId = process.pid + 1;
      assert.throws(
        () => prepareDdalggakWorkerDispatch(packet),
        /writer process ownership mismatch/,
      );
    },
  },
  {
    name: "legacy public evidence writer preserves fulfilled projection semantics",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      writeDevelopmentEvidence(packet, {
        ...prepared.evidence,
        status: "fulfilled",
        workerExecuted: true,
        exitCode: 0,
        verificationPassed: true,
        nextAction: "verification passed",
      });
      const document = readDevelopmentEvidence(packet);
      assert.equal(document.projection.status, "fulfilled");
      assert.equal(document.projection.workerExecuted, true);
      assert.equal(document.projection.exitCode, 0);
      assert.equal(document.projection.verificationPassed, true);
    },
  },
  {
    name: "legacy fulfilled evidence blocks approved execute without a second runner call",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      writeDevelopmentEvidence(packet, {
        ...prepared.evidence,
        status: "fulfilled",
        workerExecuted: true,
        exitCode: 0,
        verificationPassed: true,
        nextAction: "verification passed",
      });
      const approval = normalizeApprovalSource({
        source: "direct",
        approval: { approved: true, approvedBy: "JeremyDev87", reason: "legacy terminal guard" },
      });
      let runnerCalls = 0;
      const result = executePreparedWorkerDispatch(prepared, approval, {
        runner() {
          runnerCalls += 1;
          return { status: 0, verificationPassed: true };
        },
      });
      assert.equal(result.executed, false);
      assert.equal(result.duplicate, true);
      assert.equal(result.evidence.status, "fulfilled");
      assert.equal(result.evidence.decision, "terminal_success");
      assert.equal(runnerCalls, 0);
      assert.equal(reduceDevelopmentEvidence(readDevelopmentEvidence(packet)).budgetRemaining, 1);
    },
  },
  {
    name: "runner exception after an unknown side effect is ambiguous and never reruns",
    run() {
      const packet = packetFixture();
      const prepared = prepareDdalggakWorkerDispatch(packet);
      const approval = normalizeApprovalSource({
        source: "direct",
        approval: { approved: true, approvedBy: "JeremyDev87", reason: "test approval" },
      });
      let sideEffectCount = 0;
      assert.throws(
        () => executePreparedWorkerDispatch(prepared, approval, {
          runner() {
            sideEffectCount += 1;
            throw new Error("runner transport failed after unknown side effect");
          },
        }),
        /runner transport failed/,
      );
      const document = readDevelopmentEvidence(packet);
      assert.equal(reduceDevelopmentEvidence(document).decision, "reconciliation_required");
      assert.equal(document.projection.outcomeCertainty, "ambiguous");
      const repeated = executePreparedWorkerDispatch(prepared, approval, {
        runner() {
          sideEffectCount += 1;
          return { status: 0, verificationPassed: true };
        },
      });
      assert.equal(repeated.executed, false);
      assert.equal(repeated.duplicate, true);
      assert.equal(sideEffectCount, 1);
    },
  },
  {
    name: "event replay is idempotent while conflicting event ids and sensitive payloads fail closed",
    run() {
      const packet = packetFixture();
      prepareDdalggakWorkerDispatch(packet);
      const before = readDevelopmentEvidence(packet);
      const existing = before.events[0];
      const replay = recordDevelopmentEvidenceEvents(packet, {
        events: [existing],
        projection: before.projection,
        expectedRevision: before.revision,
      });
      assert.equal(replay.document.revision, before.revision);
      assert.throws(
        () => recordDevelopmentEvidenceEvents(packet, {
          events: [{ ...existing, reason: "conflicting replay" }],
          projection: before.projection,
          expectedRevision: before.revision,
        }),
        /conflicting duplicate event/,
      );
      assert.throws(
        () => recordDevelopmentEvidenceEvents(packet, {
          events: [{
            eventId: `${packet.runId}:sensitive`,
            recordedAt: "2026-07-25T00:00:00.000Z",
            type: "run_stopped",
            budgetCost: 0,
            outcomeCertainty: "certain",
            failureClass: null,
            evidenceRefs: [],
            reason: "blocked",
            rawPrompt: "must never be persisted",
          }],
          projection: before.projection,
          expectedRevision: before.revision,
        }),
        /content-light|unsupported event field/,
      );
    },
  },
  {
    name: "atomic replacement leaves old or new complete canonical evidence across injected crashes",
    run() {
      const packet = packetFixture();
      prepareDdalggakWorkerDispatch(packet);
      const before = readDevelopmentEvidence(packet);
      const event = {
        eventId: `${packet.runId}:manual-stop`,
        recordedAt: "2026-07-25T00:00:00.000Z",
        type: "run_stopped",
        budgetCost: 0,
        outcomeCertainty: "certain",
        failureClass: "manual_test",
        evidenceRefs: [],
        reason: "manual test",
      };
      assert.throws(
        () => recordDevelopmentEvidenceEvents(packet, {
          events: [event],
          projection: { ...before.projection, status: "blocked" },
          expectedRevision: before.revision,
          faultInjector(stage) {
            if (stage === "before-rename") throw new Error("before rename crash");
          },
        }),
        /before rename crash/,
      );
      assert.equal(readDevelopmentEvidence(packet).revision, before.revision);
      assert.throws(
        () => recordDevelopmentEvidenceEvents(packet, {
          events: [event],
          projection: { ...before.projection, status: "blocked" },
          expectedRevision: before.revision,
          faultInjector(stage) {
            if (stage === "after-rename") throw new Error("after rename crash");
          },
        }),
        /after rename crash/,
      );
      const after = readDevelopmentEvidence(packet);
      assert.equal(after.revision, before.revision + 1);
      assert.equal(after.events.at(-1).eventId, event.eventId);
      assert.equal(after.projection.status, "blocked");
    },
  },
  {
    name: "exclusive initial publish never leaves a partial canonical document",
    run() {
      const packet = packetFixture();
      const evidence = makeEvidence(packet, {
        status: "dispatch_prepared",
        approved: false,
        workerExecuted: false,
        nextAction: "pending approval",
      });
      const evidencePath = path.join(packet.evidenceDir, `${packet.runId}.json`);
      assert.throws(
        () => writeDevelopmentEvidence(packet, evidence, {
          faultInjector(stage) {
            if (stage === "before-initial-publish") throw new Error("before initial publish crash");
          },
        }),
        /before initial publish crash/,
      );
      assert.equal(existsSync(evidencePath), false);
      writeDevelopmentEvidence(packet, evidence);
      assert.equal(readDevelopmentEvidence(packet).projection.status, "dispatch_prepared");

      const afterPublishPacket = packetFixture({ packet: { runId: "issue-200-after-publish" } });
      const afterPublishEvidence = makeEvidence(afterPublishPacket, {
        status: "dispatch_prepared",
        approved: false,
        workerExecuted: false,
        nextAction: "pending approval",
      });
      assert.throws(
        () => writeDevelopmentEvidence(afterPublishPacket, afterPublishEvidence, {
          faultInjector(stage) {
            if (stage === "after-initial-publish") throw new Error("after initial publish crash");
          },
        }),
        /after initial publish crash/,
      );
      assert.equal(readDevelopmentEvidence(afterPublishPacket).projection.status, "dispatch_prepared");
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
