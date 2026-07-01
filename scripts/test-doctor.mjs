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
  sha256File,
  DOCTOR_FIXTURE_ROOTS,
} from "./test-lib/cli-fixtures.mjs";

export const cases = [
{
    name: "doctor passes on clean fixture",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 0);
      assertIncludes(result.stdout, "doctor: all checks passed", "stdout");
      assertIncludes(result.stdout, "not checked", "stdout");
    },
  },
{
    name: "doctor root-parity honors ledger root-specific files",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const result = runCli(["doctor", "--root", fixtureRoot, "--json"]);
      assertExit(result, 0);
      const report = parseJsonStdout(result);
      assert(report.checks["root-parity"].ok === true, "expected root-parity to pass");
      assert(
        !result.stdout.includes("references/claude-only.md"),
        "expected ledger root-specific file not to be reported as missing",
      );
    },
  },
{
    name: "doctor detects orphan reference",
    run() {
      const fixtureRoot = writeDoctorFixture();
      for (const root of DOCTOR_FIXTURE_ROOTS) {
        writeFileSync(
          path.join(fixtureRoot, root, "references", "orphan.md"),
          "# orphan\n",
          "utf8",
        );
      }
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "orphan reference: ddalggak/references/orphan.md",
        "stdout",
      );
    },
  },
{
    name: "doctor detects dead pointer",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const alphaPath = path.join(
        fixtureRoot,
        "ddalggak",
        "references",
        "alpha.md",
      );
      writeFileSync(
        alphaPath,
        `${readFileSync(alphaPath, "utf8")}\nAlso read \`references/missing.md\`.\n`,
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "dead pointer: ddalggak/references/alpha.md -> references/missing.md",
        "stdout",
      );
    },
  },
{
    name: "doctor detects undefined completion signal",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const skillPath = path.join(fixtureRoot, "ddalggak", "SKILL.md");
      writeFileSync(
        skillPath,
        readFileSync(skillPath, "utf8").replace(
          "LANE DONE.",
          "LANE DONE and PHANTOM DONE.",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        'undefined completion signal: "PHANTOM DONE"',
        "stdout",
      );
    },
  },
{
    name: "doctor detects file missing across projection roots",
    run() {
      const fixtureRoot = writeDoctorFixture();
      rmSync(
        path.join(
          fixtureRoot,
          ".codex",
          "skills",
          "ddalggak",
          "references",
          "alpha.md",
        ),
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "missing in .codex/skills/ddalggak: references/alpha.md (present in ddalggak)",
        "stdout",
      );
    },
  },
{
    name: "doctor detects unregistered single-root reference file",
    run() {
      const fixtureRoot = writeDoctorFixture();
      writeFileSync(
        path.join(
          fixtureRoot,
          "ddalggak",
          "references",
          "unregistered.md",
        ),
        "# Unregistered reference\n",
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "missing in .codex/skills/ddalggak: references/unregistered.md (present in ddalggak)",
        "stdout",
      );
    },
  },
{
    name: "doctor reports malformed command contract structure",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const contractPath = path.join(
        fixtureRoot,
        "core",
        "commands",
        "start.yaml",
      );
      writeFileSync(
        contractPath,
        readFileSync(contractPath, "utf8").replace(
          "required_references:\n  - wiki-context-preflight.md\n  - alpha.md",
          "required_references: [alpha.md]",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "malformed command contract: core/commands/start.yaml line 2: unsupported inline structure for key: required_references",
        "stdout",
      );
    },
  },
{
    name: "doctor reports non-list required_references",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const contractPath = path.join(
        fixtureRoot,
        "core",
        "commands",
        "start.yaml",
      );
      writeFileSync(
        contractPath,
        readFileSync(contractPath, "utf8").replace(
          "required_references:\n  - wiki-context-preflight.md\n  - alpha.md",
          "required_references: alpha.md",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "malformed command contract: core/commands/start.yaml: required_references must be a list",
        "stdout",
      );
    },
  },
{
    name: "doctor reports unparseable parity_ledger line",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const projectionsPath = path.join(
        fixtureRoot,
        "core",
        "projections.yaml",
      );
      writeFileSync(
        projectionsPath,
        readFileSync(projectionsPath, "utf8").replace(
          "  - path: SKILL.md\n    class: may-localize",
          "  - SKILL.md",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "core/projections.yaml line 10: unparseable parity_ledger line: - SKILL.md",
        "stdout",
      );
    },
  },
{
    name: "doctor reports inline projections section structure",
    run() {
      const fixtureRoot = writeDoctorFixture();
      const projectionsPath = path.join(
        fixtureRoot,
        "core",
        "projections.yaml",
      );
      writeFileSync(
        projectionsPath,
        readFileSync(projectionsPath, "utf8").replace(
          "parity_ledger:",
          "parity_ledger: [{path: SKILL.md}]",
        ),
        "utf8",
      );
      const result = runCli(["doctor", "--root", fixtureRoot]);
      assertExit(result, 1);
      assertIncludes(
        result.stdout,
        "core/projections.yaml line 9: unsupported inline structure for key: parity_ledger",
        "stdout",
      );
    },
  },
{
    name: "doctor --json reports machine-readable contract",
    run() {
      const cleanRoot = writeDoctorFixture();
      const clean = runCli(["doctor", "--root", cleanRoot, "--json"]);
      assertExit(clean, 0);
      const cleanReport = parseJsonStdout(clean);
      assert(cleanReport.ok === true, "expected clean fixture to report ok");
      for (const check of [
        "layout",
        "reachability",
        "dead-pointer",
        "signal-registry",
        "root-parity",
      ]) {
        assert(
          cleanReport.checks[check]?.ok === true,
          `expected clean ${check} check, got ${JSON.stringify(cleanReport.checks[check])}`,
        );
      }
      assert(
        Array.isArray(cleanReport.notChecked) &&
          cleanReport.notChecked.length > 0,
        "expected notChecked disclosure in doctor JSON output",
      );

      const brokenRoot = writeDoctorFixture();
      rmSync(
        path.join(
          brokenRoot,
          ".codex",
          "skills",
          "ddalggak",
          "templates",
          "brief.md",
        ),
      );
      const broken = runCli(["doctor", "--root", brokenRoot, "--json"]);
      assertExit(broken, 1);
      const brokenReport = parseJsonStdout(broken);
      assert(
        brokenReport.ok === false,
        "expected broken fixture to report not ok",
      );
      assert(
        brokenReport.findings.some(
          (finding) =>
            finding.check === "root-parity" &&
            finding.message.includes("templates/brief.md"),
        ),
        `expected root-parity finding for removed template, got ${JSON.stringify(brokenReport.findings)}`,
      );
    },
  },
{
    name: "doctor rejects unknown option and missing root",
    run() {
      const unknown = runCli(["doctor", "--bogus"]);
      assertExit(unknown, 2);
      assertIncludes(unknown.stderr, "Unknown option: --bogus", "stderr");

      const missingRoot = runCli([
        "doctor",
        "--root",
        path.join(makeTempHome(), "missing-subdir"),
      ]);
      assertExit(missingRoot, 2);
      assertIncludes(missingRoot.stderr, "not a directory", "stderr");
    },
  }
];
