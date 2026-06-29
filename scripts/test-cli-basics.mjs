import {
  COMMAND_CONTRACT_UNKNOWN_KEY_POLICY,
  assert,
  assertResolveExecutableHelper,
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
  validateCommandContract,
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
  rootDir,
  sha256File,
  DOCTOR_FIXTURE_ROOTS,
} from "./test-lib/cli-fixtures.mjs";

export const cases = [
{
    name: "resolveExecutable finds executable, misses absent command, and keeps Windows candidates",
    async run() {
      await assertResolveExecutableHelper();
    },
  },
{
    name: "--version prints package version",
    run() {
      const result = runCli(["--version"]);
      assertExit(result, 0);
      assertStdout(result, `${pkg.version}\n`);
    },
  },
{
    name: "--help prints usage",
    run() {
      const result = runCli(["--help"]);
      assertExit(result, 0);
      assertIncludes(result.stdout, "Usage", "stdout");
    },
  },
{
    name: "--help derives subcommands from command contracts",
    run() {
      const result = runCli(["--help"]);
      assertExit(result, 0);
      const contracts = loadCommandContracts(rootDir);
      for (const contract of contracts) {
        const purpose = String(contract.purpose).replace(/\.$/, "");
        assertIncludes(
          result.stdout,
          `  ${contract.command.padEnd(20)} ${purpose}`,
          "stdout",
        );
      }
      assert(
        !result.stdout.includes("Run issue-based implementation lanes"),
        "help should use core/commands purpose text, not the old hand-written start description",
      );
      assertIncludes(result.stdout, "  setup                Install legacy Claude Code skill", "stdout");
      assertIncludes(result.stdout, "  status --local       Inspect local source/Codex/installed skill parity", "stdout");
    },
  },
{
    name: "command contract schema validates shared required fields and allows unknown keys",
    run() {
      const failures = validateCommandContract(
        {
          command: "demo",
          show_doc_heading: "Demo",
          source_edit_allowed: false,
          github_write_allowed: false,
          purpose: "Demonstrate shared schema validation.",
          mode: "read-only",
          write_side_effects: "No writes.",
          stop_condition: "Stop after reporting.",
          required_references: [],
          required_templates: [],
          output_contract: {
            completion_signal: "DEMO_DONE",
            evidence_required: true,
          },
          future_metadata: "allowed by policy",
        },
        "core/commands/demo.yaml",
      );
      assert(failures.length === 0, `expected valid contract, got ${failures.join("; ")}`);
      assertIncludes(COMMAND_CONTRACT_UNKNOWN_KEY_POLICY, "unknown top-level keys are allowed", "unknown key policy");
    },
  },
{
    name: "command contract schema reports shared list and output_contract failures",
    run() {
      const failures = validateCommandContract(
        {
          command: "demo",
          show_doc_heading: "Demo",
          source_edit_allowed: "false",
          github_write_allowed: false,
          purpose: "Demonstrate shared schema validation.",
          mode: "read-only",
          write_side_effects: "No writes.",
          stop_condition: "Stop after reporting.",
          required_references: "alpha.md",
          required_templates: [],
          output_contract: {
            completion_signal: "",
            evidence_required: "true",
          },
        },
        "core/commands/demo.yaml",
      );
      assertIncludes(failures.join("\n"), "core/commands/demo.yaml: source_edit_allowed must be a boolean", "schema failures");
      assertIncludes(failures.join("\n"), "core/commands/demo.yaml: required_references must be a list", "schema failures");
      assertIncludes(failures.join("\n"), "core/commands/demo.yaml: output_contract.completion_signal must be a non-empty string", "schema failures");
      assertIncludes(failures.join("\n"), "core/commands/demo.yaml: output_contract.evidence_required must be a boolean", "schema failures");
    },
  },
{
    name: "no args prints help",
    run() {
      const result = runCli();
      assertExit(result, 0);
      assertIncludes(result.stdout, "Usage", "stdout");
    },
  },
{
    name: "unknown command exits 2",
    run() {
      const result = runCli(["bogus"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "Unknown", "stderr");
    },
  },
{
    name: "unknown command suggests close match",
    run() {
      const result = runCli(["stats"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "Did you mean: status?", "stderr");
    },
  },
{
    name: "AI-readable docs index is package-local and points at shipped files",
    run() {
      assert(
        pkg.files?.includes("llms.txt"),
        "expected llms.txt to be included in package artifact boundary",
      );
      for (const required of [
        "# ddalggak AI-readable documentation index",
        "./README.md",
        "./.codex/skills/ddalggak/SKILL.md",
        "./ddalggak/SKILL.md",
        "./scripts/verify-package.mjs",
        "not a crawler directive",
        "Secrets, credentials, private issue comments",
      ]) {
        assertIncludes(llmsIndex, required, "llms.txt");
      }
      for (const missing of [
        "https://docs.github.com/llms.txt",
        "https://modelcontextprotocol.io/llms.txt",
        "Authorization:",
        "Bearer",
      ]) {
        assert(
          !llmsIndex.includes(missing),
          `expected llms.txt not to include external/private runtime token ${JSON.stringify(missing)}`,
        );
      }
    },
  },
{
    name: "package verification contract is release-safe",
    run() {
      assert(
        pkg.scripts?.verify === "node scripts/verify-package.mjs",
        `expected package verify script to run scripts/verify-package.mjs, got ${JSON.stringify(
          pkg.scripts?.verify,
        )}`,
      );
      assert(
        pkg.scripts?.prepublishOnly === "npm run verify",
        `expected prepublishOnly to delegate to npm run verify, got ${JSON.stringify(
          pkg.scripts?.prepublishOnly,
        )}`,
      );
      assert(
        pkg.files?.includes("scripts/"),
        "expected scripts/ to be included in package artifact boundary",
      );
      assert(
        !readme.includes(
          "https://www.npmjs.com/package/@jeremyfellaz/ddalggak",
        ),
        "README must not link to an unpublished npm package as if it is live",
      );
      assert(
        !readme.includes("img.shields.io/npm/"),
        "README must not show npm badges before first publish proves registry visibility",
      );
    },
  }
];
