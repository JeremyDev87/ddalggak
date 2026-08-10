#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { initState, transitionState } from "../bin/lib/state.mjs";
import { validPhaseLedger, validSessionState } from "./test-lib/cli-fixtures.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const roots = [];
const makeRoot = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "ddalggak-state-writer-"));
  roots.push(root);
  return root;
};
const planHash = (text) => `sha256:${createHash("sha256").update(text.replace(/\r\n?/g, "\n")).digest("hex")}`;

function fixture() {
  const root = makeRoot();
  const plan = "# Plan\n\n- phase one\n- phase two\n";
  mkdirSync(path.join(root, ".hermes", "plans"), { recursive: true });
  writeFileSync(path.join(root, ".hermes", "plans", "plan.md"), plan, "utf8");
  const hash = planHash(plan);
  const ledger = validPhaseLedger({ plan_hash: hash });
  const state = validSessionState({
    phase: "phase-1",
    phase_ledger: ledger,
    lanes: [{
      state: "implementing",
      artifacts: { plan: ".hermes/plans/plan.md" },
    }],
  });
  const draft = path.join(root, "draft.json");
  writeFileSync(draft, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return { root, draft, hash };
}

try {
  {
    const { root, draft, hash } = fixture();
    const initialized = await initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash });
    assert.equal(initialized.changed, true);
    assert.equal(initialized.state.revision, 0);
    assert.equal(initialized.state.phase_ledger.phases[0].attempt_count, 1);
    assert.equal(initialized.state.phase_ledger.phases[1].attempt_count, 0);
    assert.equal(existsSync(path.join(root, ".ddalggak", "session-state.json")), true);
    console.log("[PASS] init validates the plan and atomically creates revision zero");

    const completed = await transitionState({
      workspaceRoot: root,
      expectedRevision: 0,
      transitionId: "complete-phase-1",
      phaseId: "phase-1",
      status: "completed",
      evidence: ["evidence/phase-1.json"],
    });
    assert.equal(completed.state.revision, 1);
    assert.equal(completed.state.phase, "phase-2");
    assert.equal(completed.state.phase_ledger.phases[1].status, "in_progress");

    const replay = await transitionState({
      workspaceRoot: root,
      expectedRevision: 0,
      transitionId: "complete-phase-1",
      phaseId: "phase-1",
      status: "completed",
      evidence: ["evidence/phase-1.json"],
    });
    assert.equal(replay.changed, false);
    assert.equal(replay.state.revision, 1);
    console.log("[PASS] transition advances the projection and exact replay is idempotent");

    await assert.rejects(
      transitionState({ workspaceRoot: root, expectedRevision: 0, transitionId: "new-id", phaseId: "phase-2", status: "blocked", blocker: "waiting" }),
      /revision mismatch/,
    );
    await assert.rejects(
      transitionState({ workspaceRoot: root, expectedRevision: 0, transitionId: "complete-phase-1", phaseId: "phase-1", status: "skipped" }),
      /transition id payload mismatch/,
    );
    console.log("[PASS] stale revisions and transition-id payload collisions fail closed");

    const blocked = await transitionState({ workspaceRoot: root, expectedRevision: 1, transitionId: "block-phase-2", phaseId: "phase-2", status: "blocked", blocker: "approval pending" });
    assert.equal(blocked.state.revision, 2);
    assert.equal(blocked.state.phase_ledger.phases[1].status, "blocked");
    const retried = await transitionState({ workspaceRoot: root, expectedRevision: 2, transitionId: "retry-phase-2", phaseId: "phase-2", status: "in_progress" });
    assert.equal(retried.state.phase_ledger.phases[1].attempt_count, 2);
    assert.equal(retried.state.phase_ledger.phases[1].blocker, undefined);
    console.log("[PASS] blocked phases remain resumable and retry count is monotonic");

    const terminal = await transitionState({ workspaceRoot: root, expectedRevision: 3, transitionId: "complete-phase-2", phaseId: "phase-2", status: "completed", evidence: ["evidence/phase-2.json"] });
    assert.equal(terminal.state.revision, 4);
    assert.equal(terminal.state.phase_ledger.next_phase_id, null);
    await assert.rejects(
      transitionState({ workspaceRoot: root, expectedRevision: 4, transitionId: "mutate-terminal", phaseId: "phase-2", status: "blocked", blocker: "late" }),
      /terminal ledger/,
    );
    assert.equal(existsSync(path.join(root, ".ddalggak", "session-state.json.lock")), false);
    assert.equal(existsSync(path.join(root, ".ddalggak", "session-state.json.tmp")), false);
    console.log("[PASS] terminal ledgers are immutable and temporary artifacts are cleaned");
  }

  {
    const { root, draft } = fixture();
    await assert.rejects(
      initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: `sha256:${"0".repeat(64)}` }),
      /plan hash mismatch/,
    );
    assert.equal(existsSync(path.join(root, ".ddalggak", "session-state.json")), false);
    console.log("[PASS] init rejects a mismatched expected plan hash without writing state");
  }

  {
    const { root, draft, hash } = fixture();
    await initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash });
    await assert.rejects(
      transitionState({ workspaceRoot: root, expectedRevision: 0, transitionId: "skip-without-evidence", phaseId: "phase-1", status: "skipped" }),
      /skipped phase requires evidence/,
    );
    assert.equal(JSON.parse(readFileSync(path.join(root, ".ddalggak", "session-state.json"), "utf8")).revision, 0);
    console.log("[PASS] skipped transitions require audit evidence and do not advance state");
  }

  {
    const { root, draft, hash } = fixture();
    const state = JSON.parse(readFileSync(draft, "utf8"));
    state.phase_ledger.phases.reverse();
    writeFileSync(draft, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash });
    await transitionState({ workspaceRoot: root, expectedRevision: 0, transitionId: "reverse-complete-1", phaseId: "phase-1", status: "completed", evidence: ["evidence/reverse-1.json"] });
    const terminal = await transitionState({ workspaceRoot: root, expectedRevision: 1, transitionId: "reverse-complete-2", phaseId: "phase-2", status: "completed", evidence: ["evidence/reverse-2.json"] });
    assert.equal(terminal.state.phase_ledger.current_phase_id, "phase-2");
    assert.equal(terminal.state.phase_ledger.next_phase_id, null);
    console.log("[PASS] terminal projection follows the graph sink instead of array order");
  }

  {
    const { root, draft, hash } = fixture();
    mkdirSync(path.join(root, ".ddalggak"), { recursive: true });
    writeFileSync(path.join(root, ".ddalggak", "session-state.json.lock"), `${JSON.stringify({ pid: 2147483647, created_at: "2000-01-01T00:00:00.000Z" })}\n`, "utf8");
    const result = await initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash });
    assert.equal(result.state.revision, 0);
    assert.equal(existsSync(path.join(root, ".ddalggak", "session-state.json.lock")), false);
    console.log("[PASS] stale dead-owner locks are recovered without weakening live exclusion");
  }

  {
    const { root, draft, hash } = fixture();
    mkdirSync(path.join(root, ".ddalggak"), { recursive: true });
    const lockPath = path.join(root, ".ddalggak", "session-state.json.lock");
    writeFileSync(lockPath, `${JSON.stringify({ id: "live-owner", pid: process.pid, created_at: new Date().toISOString() })}\n`, "utf8");
    await assert.rejects(
      initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash }),
      /state lock already exists/,
    );
    assert.equal(existsSync(lockPath), true);
    rmSync(lockPath, { force: true });
    console.log("[PASS] live-owner locks remain exclusive and are never reclaimed");
  }

  {
    const { root, draft, hash } = fixture();
    await initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash });
    await transitionState({ workspaceRoot: root, expectedRevision: 0, transitionId: "skip-phase-1", phaseId: "phase-1", status: "skipped", evidence: ["evidence/skip-reason-1.json"] });
    const terminal = await transitionState({ workspaceRoot: root, expectedRevision: 1, transitionId: "skip-phase-2", phaseId: "phase-2", status: "skipped", evidence: ["evidence/skip-reason-2.json"] });
    assert.equal(terminal.state.phase_ledger.next_phase_id, null);
    assert.equal(terminal.state.phase_ledger.phases.every((phase) => phase.evidence.length > 0), true);
    console.log("[PASS] evidence-backed skipped phases can form an auditable terminal ledger");
  }

  {
    const { root, draft, hash } = fixture();
    const state = JSON.parse(readFileSync(draft, "utf8"));
    state.access_token = ["github", "pat", "a".repeat(24)].join("_");
    writeFileSync(draft, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    await assert.rejects(
      initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash }),
      /secret-bearing field is forbidden/,
    );
    assert.equal(existsSync(path.join(root, ".ddalggak", "session-state.json")), false);
    console.log("[PASS] state writes reject secret-bearing fields without persisting the draft");
  }

  {
    const { root, draft, hash } = fixture();
    await initState({ workspaceRoot: root, draftPath: draft, expectedPlanHash: hash });
    await assert.rejects(
      transitionState({
        workspaceRoot: root,
        expectedRevision: 0,
        transitionId: "secret-blocker",
        phaseId: "phase-1",
        status: "blocked",
        blocker: `Bearer ${"a".repeat(24)}`,
      }),
      /token-like secret value is forbidden/,
    );
    assert.equal(JSON.parse(readFileSync(path.join(root, ".ddalggak", "session-state.json"), "utf8")).revision, 0);
    console.log("[PASS] transition payloads reject token-like values without advancing revision");
  }

  {
    const { root, draft, hash } = fixture();
    const result = spawnSync(process.execPath, ["bin/ddalggak.js", "state", "init", "--from", draft, "--expected-plan-hash", hash], {
      cwd: path.resolve(__dirname, ".."),
      env: { ...process.env, DDALGGAK_WORKSPACE_ROOT: root },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /STATE_INIT revision=0/);
    console.log("[PASS] public CLI routes state init to the deterministic writer");
  }

  console.log("\n[test:state-writer] passed");
} finally {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
}
