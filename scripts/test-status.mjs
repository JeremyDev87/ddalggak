import { createHash } from "node:crypto";

import {
  assert,
  assertExit,
  assertIncludes,
  assertShowDocIncludes,
  assertStdout,
  loadCommandContracts,
  makeTempHome,
  parseJsonStdout,
  readFileSync,
  readdirSync,
  rmSync,
  runCli,
  runStatusWithSessionState,
  skillDirFor,
  symlinkSync,
  validSessionState,
  validPhaseLedger,
  writeDoctorFixture,
  writeExistingInstall,
  writeFileSync,
  existsSync,
  listNames,
  llmsIndex,
  os,
  path,
  pkg,
  readInstalledManifest,
  readme,
  rootDir,
  sha256File,
  DOCTOR_FIXTURE_ROOTS,
  writeSessionStateFixture,
} from "./test-lib/cli-fixtures.mjs";

const PHASE_PLAN = "# phase continuity fixture\n";
const PHASE_PLAN_HASH = `sha256:${createHash("sha256")
  .update(Buffer.from(PHASE_PLAN, "utf8"))
  .digest("hex")}`;

function writePhaseState(overrides = {}) {
  const base = validSessionState();
  const state = validSessionState({
    phase: "phase-1",
    lanes: base.lanes.map((lane) => ({
      ...lane,
      artifacts: { ...(lane.artifacts || {}), plan: "plan.md" },
    })),
    phase_ledger: validPhaseLedger({ plan_hash: PHASE_PLAN_HASH }),
    ...overrides,
  });
  return writeSessionStateFixture(
    `${JSON.stringify(state, null, 2)}\n`,
    { "plan.md": PHASE_PLAN },
  );
}

export const cases = [
{
    name: "status --local --json reports not-installed",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(
        status.state === "not-installed",
        `expected not-installed, got ${status.state}`,
      );
      assert(status.ok === false, "expected not-installed status to be non-ok");
      assert(status.installedVersion === null, "expected no installed version");
      assert(
        status.evidence.runtime.status === "ok",
        "expected runtime evidence to report ok",
      );
      assert(
        status.evidence.package.manifest.status === "not-installed",
        "expected manifest evidence to distinguish not-installed",
      );
      assertIncludes(
        status.evidence.nextAction,
        "ddalggak setup",
        "status evidence nextAction",
      );
      assert(
        status.installedClaudeSkillPath ===
          path.join(claudeHome, "skills", "ddalggak"),
        `expected installed path under CLAUDE_HOME, got ${status.installedClaudeSkillPath}`,
      );
    },
  },
{
    name: "status --local --json reports ok after setup",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "ok", `expected ok, got ${status.state}`);
      assert(status.ok === true, "expected ok status");
      assert(
        status.installedVersion === pkg.version,
        "expected installed package version",
      );
      assert(
        status.installedManifest !== null,
        "expected status to expose installed manifest metadata",
      );
      assert(
        status.installedManifest.packageVersion === pkg.version,
        "expected manifest packageVersion in status",
      );
      assert(
        status.installedManifest.sourceRoot === path.join(rootDir, "ddalggak"),
        "expected manifest sourceRoot in status",
      );
      assert(
        status.installedManifest.fileCount > 0,
        "expected manifest file count in status",
      );
      assert(
        status.sourceChecksum === status.installedChecksum,
        "expected source and installed checksum to match after setup",
      );
      assert(
        status.evidence.package.manifest.status === "present",
        "expected present installed manifest evidence after setup",
      );
      assert(
        status.evidence.package.payload.checksumsMatch === true,
        "expected matching package payload evidence after setup",
      );
      assertIncludes(
        status.evidence.nextAction,
        "No action needed",
        "status evidence nextAction",
      );
    },
  },
{
    name: "status --local human reports runtime/package evidence next action",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["status", "--local"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assertIncludes(result.stdout, "evidence:\n", "stdout");
      assertIncludes(result.stdout, "  runtime: ok", "stdout");
      assertIncludes(result.stdout, "  package manifest: not-installed", "stdout");
      assertIncludes(result.stdout, "  next: Run `ddalggak setup`", "stdout");
    },
  },
{
    name: "status --local detects stale checksum",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      writeFileSync(
        path.join(skillDirFor(claudeHome), "SKILL.md"),
        "mutated skill\n",
        "utf8",
      );
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.sourceChecksum !== status.installedChecksum,
        "expected source and installed checksum to differ after mutation",
      );
      assert(
        status.evidence.package.payload.checksumsMatch === false,
        "expected package payload evidence to show checksum drift",
      );
    },
  },
{
    name: "status --local detects missing required reference",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      rmSync(path.join(skillDirFor(claudeHome), "references", "status.md"), {
        force: true,
      });
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.missingRequiredPaths.includes("references/status.md"),
        `expected missing status reference, got ${status.missingRequiredPaths.join(", ")}`,
      );
    },
  },
{
    name: "status --local detects extra installed payload file",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      writeFileSync(
        path.join(skillDirFor(claudeHome), "references", "obsolete.md"),
        "obsolete\n",
        "utf8",
      );
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.extraInstalledPaths.includes("references/obsolete.md"),
        `expected obsolete extra path, got ${status.extraInstalledPaths.join(", ")}`,
      );
    },
  },
{
    name: "status --local --json distinguishes absent installed manifest evidence",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      rmSync(path.join(skillDirFor(claudeHome), ".installed-manifest.json"), {
        force: true,
      });

      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(status.ok === false, "expected absent manifest status to be non-ok");
      assert(
        status.evidence.package.manifest.status === "absent",
        `expected absent manifest evidence, got ${status.evidence.package.manifest.status}`,
      );
      assertIncludes(
        status.evidence.nextAction,
        "backfill the missing installed manifest",
        "status evidence nextAction",
      );
    },
  },
{
    name: "status --local --json distinguishes stale installed manifest evidence",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      const manifestPath = path.join(
        skillDirFor(claudeHome),
        ".installed-manifest.json",
      );
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      manifest.packageVersion = "0.0.0-stale";
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.evidence.package.manifest.status === "stale",
        `expected stale manifest evidence, got ${status.evidence.package.manifest.status}`,
      );
    },
  },
{
    name: "status --local reports malformed installed manifest as stale",
    run() {
      const claudeHome = makeTempHome();
      const install = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(install, 0);
      writeFileSync(
        path.join(skillDirFor(claudeHome), ".installed-manifest.json"),
        "{not json\n",
        "utf8",
      );
      const result = runCli(["status", "--local", "--json"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      const status = parseJsonStdout(result);
      assert(status.state === "stale", `expected stale, got ${status.state}`);
      assert(
        status.installedManifestParseError,
        "expected installed manifest parse error evidence",
      );
      assert(
        status.evidence.package.manifest.status === "malformed",
        "expected malformed installed manifest evidence",
      );
    },
  },
{
    name: "status -- respects dispatch flag terminator before --local",
    run() {
      const result = runCli(["status", "--print", "--", "--local"]);
      assertExit(result, 0);
      assertStdout(result, "/ddalggak status --local\n");
    },
  },
{
    name: "status fallback works without PATH",
    run() {
      const result = runCli(["status"], {
        env: { PATH: "" },
      });
      assertExit(result, 0);
      assertIncludes(`${result.stdout}${result.stderr}`, "not found", "output");
      assertIncludes(result.stdout, "/ddalggak status", "stdout");
    },
  },
{
    name: "status --local --json reports absent session state",
    run() {
      const workspaceRoot = makeTempHome();
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "absent",
        `expected absent session state, got ${status.sessionState.status}`,
      );
      assert(
        status.sessionState.path ===
          path.join(workspaceRoot, ".ddalggak", "session-state.json"),
        `expected session state path under workspace root, got ${status.sessionState.path}`,
      );
      assert(
        status.sessionState.violations.length === 0,
        "expected no violations for absent session state",
      );
    },
  },
{
  name: "status --local --json reports valid session state evidence",
  run() {
    const workspaceRoot = writeSessionStateFixture(
      `${JSON.stringify(validSessionState(), null, 2)}\n`,
    );
    const status = runStatusWithSessionState(workspaceRoot);
    assert(
      status.sessionState.status === "valid",
      `expected valid session state, got ${status.sessionState.status}\nviolations:\n${status.sessionState.violations.join("\n")}`,
    );
    assert(
      status.sessionState.violations.length === 0,
      "expected no violations for valid session state",
    );
    assert(
      typeof status.sessionState.ageHours === "number" &&
        status.sessionState.ageHours >= 0 &&
        status.sessionState.ageHours <
          status.sessionState.staleAfterHours,
      `expected fresh ageHours, got ${status.sessionState.ageHours}`,
    );
    assertIncludes(
      status.sessionState.action,
      "fresh enough to trust",
      "session state action",
    );
  },
},
{
  name: "status --local --json validates a phase ledger and exposes projections",
  run() {
    const workspaceRoot = writePhaseState();
    const status = runStatusWithSessionState(workspaceRoot);
    assert(status.sessionState.status === "valid", `expected valid phase ledger, got ${status.sessionState.status}\n${status.sessionState.violations.join("\n")}`);
    assert(status.sessionState.phaseLedger.status === "valid", "expected valid phase ledger evidence");
    assert(status.sessionState.phaseLedger.currentPhaseId === "phase-1", "expected current phase projection");
    assert(status.sessionState.phaseLedger.nextPhaseId === "phase-2", "expected next phase projection");
  },
},
{
  name: "status --local --json accepts a blocked current phase as resumable",
  run() {
    const ledger = validPhaseLedger({
      plan_hash: PHASE_PLAN_HASH,
      phases: validPhaseLedger().phases.map((phase) => phase.id === "phase-1"
        ? { ...phase, status: "blocked", blocker: "approval pending", attempt_count: 1 }
        : { ...phase, attempt_count: 0 }),
    });
    const status = runStatusWithSessionState(writePhaseState({ phase_ledger: ledger }));
    assert(status.sessionState.status === "valid", `expected blocked current phase to remain resumable, got ${status.sessionState.status}\n${status.sessionState.violations.join("\n")}`);
    assert(status.sessionState.phaseLedger.currentPhaseId === "phase-1", "expected blocked current phase projection");
  },
},
{
  name: "status --local --json accepts a terminal all-completed phase ledger",
  run() {
    const base = validPhaseLedger();
    const terminalLedger = {
      ...base,
      plan_hash: PHASE_PLAN_HASH,
      current_phase_id: "phase-2",
      next_phase_id: null,
      phases: base.phases.map((phase) => ({
        ...phase,
        status: "completed",
        evidence: [`${phase.id} exit evidence`],
      })),
    };
    const status = runStatusWithSessionState(
      writePhaseState({ phase: "phase-2", phase_ledger: terminalLedger }),
    );
    assert(status.sessionState.status === "valid", `expected terminal ledger to be valid, got ${status.sessionState.status}\n${status.sessionState.violations.join("\n")}`);
    assert(status.sessionState.phaseLedger.nextPhaseId === null, "expected terminal next phase projection to be null");
  },
},
{
  name: "status --local --json accepts a single-mode terminal phase ledger",
  run() {
    const singleLedger = {
      mode: "single",
      plan_id: "single-terminal-v1",
      plan_hash: PHASE_PLAN_HASH,
      current_phase_id: "phase-1",
      next_phase_id: null,
      phases: [
        {
          id: "phase-1",
          status: "completed",
          goal: "complete the bounded single phase",
          exit_condition: "single phase evidence is recorded",
          next_phase_id: null,
          evidence: ["single phase exit evidence"],
        },
      ],
    };
    const status = runStatusWithSessionState(
      writePhaseState({ phase: "phase-1", phase_ledger: singleLedger }),
    );
    assert(status.sessionState.status === "valid", `expected single terminal ledger to be valid, got ${status.sessionState.status}\n${status.sessionState.violations.join("\n")}`);
  },
},
{
  name: "status --local --json rejects completed phase without evidence",
  run() {
    const base = validPhaseLedger();
    const terminalLedger = {
      ...base,
      plan_hash: PHASE_PLAN_HASH,
      current_phase_id: "phase-2",
      next_phase_id: null,
      phases: base.phases.map((phase) => ({
        ...phase,
        status: "completed",
        evidence: phase.id === "phase-1" ? [] : [`${phase.id} exit evidence`],
      })),
    };
    const status = runStatusWithSessionState(
      writePhaseState({ phase: "phase-2", phase_ledger: terminalLedger }),
    );
    assert(status.sessionState.status === "invalid", "expected missing completed-phase evidence to be invalid");
    assert(status.sessionState.violations.some((violation) => violation.includes("completed phase requires evidence")), "expected completed evidence violation");
  },
},
{
  name: "status --local --json fails closed on plan artifact hash mismatch",
  run() {
    const workspaceRoot = writePhaseState({
      phase_ledger: validPhaseLedger({ plan_hash: `sha256:${"b".repeat(64)}` }),
    });
    const status = runStatusWithSessionState(workspaceRoot);
    assert(status.sessionState.status === "invalid", "expected plan hash mismatch to be invalid");
    assert(status.sessionState.violations.some((violation) => violation.includes("actual sha256:")), "expected actual plan hash evidence");
  },
},
{
  name: "status --local --json fails closed on phase projection mismatch",
  run() {
    const workspaceRoot = writePhaseState({ phase: "phase-2" });
    const status = runStatusWithSessionState(workspaceRoot);
    assert(status.sessionState.status === "invalid", "expected projection mismatch to be invalid");
    assert(status.sessionState.violations.some((violation) => violation.includes("does not match phase_ledger active phase")), "expected phase projection violation");
  },
},
{
  name: "status --local --json fails closed on duplicate active or unknown next phase",
  run() {
    const base = validPhaseLedger();
    const ledger = {
      ...base,
      next_phase_id: "missing",
      phases: base.phases.map((phase) => ({
        ...phase,
        status: phase.id === "phase-2" ? "in_progress" : phase.status,
        next_phase_id: phase.id === "phase-1" ? "missing" : phase.next_phase_id,
      })),
    };
    const workspaceRoot = writePhaseState({ phase_ledger: ledger });
    const status = runStatusWithSessionState(workspaceRoot);
    assert(status.sessionState.status === "invalid", "expected invalid phase ledger");
    assert(status.sessionState.violations.some((violation) => violation.includes("unknown phase")), "expected unknown next phase violation");
    assert(status.sessionState.violations.some((violation) => violation.includes("exactly one in_progress")), "expected duplicate active phase violation");
  },
},
{
    name: "status --local --json reports malformed session state file",
    run() {
      const workspaceRoot = writeSessionStateFixture("{not json\n");
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "malformed",
        `expected malformed session state, got ${status.sessionState.status}`,
      );
      assert(
        status.sessionState.violations.length > 0,
        "expected parse error evidence for malformed session state",
      );
      assertIncludes(
        status.sessionState.action,
        "valid JSON",
        "session state action",
      );
    },
  },
{
    name: "status --local --json reports schema-invalid session state without touching skill state",
    run() {
      const broken = validSessionState();
      delete broken.phase;
      broken.lanes[0].state = "warp-speed";
      const workspaceRoot = writeSessionStateFixture(
        `${JSON.stringify(broken, null, 2)}\n`,
      );
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "invalid",
        `expected invalid session state, got ${status.sessionState.status}`,
      );
      assert(
        status.sessionState.violations.some((violation) =>
          violation.includes('missing required field "phase"'),
        ),
        `expected missing phase violation, got ${status.sessionState.violations.join("; ")}`,
      );
      assert(
        status.sessionState.violations.some((violation) =>
          violation.startsWith("$.lanes[0].state"),
        ),
        `expected lane state enum violation, got ${status.sessionState.violations.join("; ")}`,
      );
      assert(
        status.state === "not-installed",
        `expected session state judgment not to change skill state, got ${status.state}`,
      );
    },
  },
{
    name: "status --local --json validates next_gate through local schema ref",
    run() {
      const broken = validSessionState();
      broken.lanes[0].next_gate.owner = "robot";
      broken.next_gate.owner = "robot";
      const workspaceRoot = writeSessionStateFixture(
        `${JSON.stringify(broken, null, 2)}\n`,
      );
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "invalid",
        `expected invalid session state, got ${status.sessionState.status}`,
      );
      assert(
        status.sessionState.violations.some((violation) =>
          violation.startsWith("$.lanes[0].next_gate.owner"),
        ),
        `expected lane next_gate owner violation, got ${status.sessionState.violations.join("; ")}`,
      );
      assert(
        status.sessionState.violations.some((violation) =>
          violation.startsWith("$.next_gate.owner"),
        ),
        `expected session next_gate owner violation, got ${status.sessionState.violations.join("; ")}`,
      );
    },
  },
{
    name: "status --local --json reports stale session state by updated_at",
    run() {
      const workspaceRoot = writeSessionStateFixture(
        `${JSON.stringify(
          validSessionState({
            updated_at: new Date(Date.now() - 48 * 36e5).toISOString(),
          }),
          null,
          2,
        )}\n`,
      );
      const status = runStatusWithSessionState(workspaceRoot);
      assert(
        status.sessionState.status === "stale",
        `expected stale session state, got ${status.sessionState.status}\nviolations:\n${status.sessionState.violations.join("\n")}`,
      );
      assert(
        status.sessionState.staleAfterHours === 24,
        `expected schema staleAfterHours 24, got ${status.sessionState.staleAfterHours}`,
      );
      assert(
        status.sessionState.ageHours > status.sessionState.staleAfterHours,
        `expected ageHours beyond threshold, got ${status.sessionState.ageHours}`,
      );
      assertIncludes(
        status.sessionState.action,
        "rebuild it from live git/GitHub state",
        "session state action",
      );
    },
  }
];
