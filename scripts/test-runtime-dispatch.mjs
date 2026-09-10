import { pathToFileURL } from "node:url";
import strictAssert from "node:assert/strict";
import { extractDocSection } from "../bin/lib/dispatch/show-doc.mjs";
import { extractMarkdownSection } from "./lib/markdown-links.mjs";
import { withTempRepo } from "./test-lib/repo-fixture.mjs";
import { runNodeScript } from "./test-lib/process.mjs";

import {
  assert,
  assertDispatchSlashHelpers,
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
  rootDir,
  readInstalledManifest,
  readme,
  sha256File,
  DOCTOR_FIXTURE_ROOTS,
} from "./test-lib/cli-fixtures.mjs";

export const cases = [
  {
    name: "show-doc extracts only the H2 from an explicit selected document and fails closed",
    run() {
      const temp = makeTempHome();
      const selectedDocumentPath = path.join(temp, "command-review.md");
      const headings = { review: "Cross-Review Loop" };
      const capture = (command = "review") => {
        let stdout = "";
        let stderr = "";
        const status = extractDocSection(command, headings, {
          selectedDocumentPath,
          stdout: { write(text) { stdout += text; } },
          stderr: { write(text) { stderr += text; } },
        });
        return { status, stdout, stderr };
      };
      try {
        writeFileSync(selectedDocumentPath, "# Command: review\nmetadata sentinel\n## CROSS-REVIEW LOOP\nSELECTED_REVIEW\n### Nested\nnested body\n## Other\nSIBLING_SENTINEL\n");
        const selected = capture();
        assertExit(selected, 0);
        assertStdout(selected, "## CROSS-REVIEW LOOP\nSELECTED_REVIEW\n### Nested\nnested body\n");
        strictAssert.equal(selected.stderr, "");
        writeFileSync(selectedDocumentPath, "## Cross-Review Loop\nEOF_SENTINEL");
        assertStdout(capture(), "## Cross-Review Loop\nEOF_SENTINEL\n");
        writeFileSync(selectedDocumentPath, "## Other\nNO_SELECTED_H2\n");
        const missingHeading = capture();
        assertExit(missingHeading, 1);
        assertStdout(missingHeading, "");
        assertIncludes(missingHeading.stderr, selectedDocumentPath, "missing H2 diagnostic");
        assertIncludes(missingHeading.stderr, headings.review, "missing H2 diagnostic");
        rmSync(selectedDocumentPath);
        const missingFile = capture();
        assertExit(missingFile, 1);
        assertStdout(missingFile, "");
        assertIncludes(missingFile.stderr, selectedDocumentPath, "missing file diagnostic");
        for (const command of ["unsupported", "../review", "toString"]) {
          const unsupported = capture(command);
          assertExit(unsupported, 1);
          assertStdout(unsupported, "");
          assertIncludes(unsupported.stderr, command, "unsupported diagnostic");
          strictAssert(!unsupported.stderr.includes(selectedDocumentPath), "reject unsupported commands before I/O");
        }
      } finally {
        rmSync(temp, { recursive: true, force: true });
      }
      strictAssert(!existsSync(temp));
    },
  },
  {
    name: "show-doc selects all 21 command filenames independently, including shared-heading GJC keys",
    run() {
      let disposable;
      withTempRepo({ rootDir, prefix: "ddalggak-selected-cli-", run(repo) {
        disposable = repo;
        assertExit(runNodeScript("scripts/project-runtime-assets.mjs", ["--write"], { cwd: repo }), 0);
        const cli = (command) => runNodeScript("bin/ddalggak.js", [command, "--show-doc", "--no-update"], { cwd: repo });
        const contracts = loadCommandContracts(repo);
        strictAssert.equal(contracts.length, 21);
        for (const doc of contracts) {
          // The expected path is independent of the production filename helper.
          const file = path.join(repo, "ddalggak", "references", `command-${doc.command}.md`);
          const text = readFileSync(file, "utf8");
          writeFileSync(file, `${text}\nSELECTED_COMMAND_${doc.command}\n`);
        }
        for (const doc of contracts) {
          const file = path.join(repo, "ddalggak", "references", `command-${doc.command}.md`);
          const text = readFileSync(file, "utf8");
          const result = cli(doc.command);
          assertExit(result, 0);
          assertStdout(result, extractMarkdownSection(text, doc.show_doc_heading));
          assertIncludes(result.stdout, `SELECTED_COMMAND_${doc.command}\n`, "command-key sentinel");
          strictAssert.equal(result.stderr, "");
          if (doc.command === "review" || doc.command.startsWith("gjc-")) {
            rmSync(file);
            const missingFile = cli(doc.command);
            assertExit(missingFile, 1);
            assertStdout(missingFile, "");
            assertIncludes(missingFile.stderr, file, "selected file diagnostic");
            writeFileSync(file, text.replace(`## ${doc.show_doc_heading}`, "## UNSELECTED_H2"));
            const missingHeading = cli(doc.command);
            assertExit(missingHeading, 1);
            assertStdout(missingHeading, "");
            assertIncludes(missingHeading.stderr, file, "selected H2 diagnostic");
            assertIncludes(missingHeading.stderr, doc.show_doc_heading, "selected H2 diagnostic");
            writeFileSync(file, text);
          }
        }
        rmSync(path.join(repo, "ddalggak", "SKILL.md"));
        const withoutSkill = cli("review");
        assertExit(withoutSkill, 0);
        assertIncludes(withoutSkill.stdout, "SELECTED_COMMAND_review\n", "selected document without SKILL");
        const unsupported = cli("unsupported");
        assertExit(unsupported, 2);
        assertStdout(unsupported, "");
        assertIncludes(unsupported.stderr, "Unknown command: unsupported", "unsupported command");
      } });
      strictAssert(!existsSync(disposable), "selected CLI fixture must be removed");
    },
  },
{
    name: "dispatch slash helpers quote ambiguous arguments without changing prefixes",
    run() {
      assertDispatchSlashHelpers();
    },
  },
{
    name: "prompt --print emits slash command",
    run() {
      const result = runCli(["prompt", "--print"]);
      assertExit(result, 0);
      assertStdout(result, "/ddalggak prompt\n");
    },
  },
{
    name: "goal-shaping subcommands --print emit slash commands",
    run() {
      for (const [subcommand, arg, expected] of [
        ["tune", "Clarify goal", '/ddalggak tune "Clarify goal"\n'],
        ["forge", "Make criteria", '/ddalggak forge "Make criteria"\n'],
        ["spark", "Write runtime goal", '/ddalggak spark "Write runtime goal"\n'],
      ]) {
        const result = runCli([subcommand, "--print", arg]);
        assertExit(result, 0);
        assertStdout(result, expected);
      }
    },
  },
{
    name: "ulw subcommands --print emit ddalggak-native slash commands",
    run() {
      for (const subcommand of ["ulw-loop", "ulw-plan", "ulw-research"]) {
        const result = runCli([subcommand, "--print", "demo"]);
        assertExit(result, 0);
        assertStdout(result, `/ddalggak ${subcommand} demo\n`);
      }
    },
  },
  {
    name: "ULW phase continuity contract exposes durable state anchors",
    run() {
      const plan = readFileSync(
        path.join(rootDir, "ddalggak", "references", "ulw-plan.md"),
        "utf8",
      );
      const loop = readFileSync(
        path.join(rootDir, "ddalggak", "references", "ulw-loop.md"),
        "utf8",
      );
      const conductor = readFileSync(
        path.join(rootDir, "ddalggak", "templates", "conductor-state.md"),
        "utf8",
      );
      for (const marker of [
        "## Phase Execution Ledger",
        "lanes[].artifacts.plan",
        "phase_ledger.phases[]",
        "sha256:<64 lowercase hex>",
      ]) {
        assertIncludes(plan, marker, `ulw-plan marker ${marker}`);
      }
      for (const marker of [
        "## Durable Phase Continuity Contract",
        "ddalggak state init",
        "optimistic revision checking",
        "Discord/workcell",
      ]) {
        assertIncludes(loop, marker, `ulw-loop marker ${marker}`);
      }
      for (const marker of [
        '"phase_ledger": {',
        '"current_phase_id": "phase-1"',
        '"next_phase_id": "phase-2"',
        "do not infer progress from chat history",
      ]) {
        assertIncludes(conductor, marker, `conductor template marker ${marker}`);
      }
    },
  },
{
    name: "gjc subcommands --print emit ddalggak-native slash commands",
    run() {
      for (const subcommand of ["gjc-plan", "gjc-execute", "gjc-team"]) {
        const result = runCli([subcommand, "--print", "demo task"]);
        assertExit(result, 0);
        assertStdout(result, `/ddalggak ${subcommand} "demo task"\n`);
      }
    },
  },
{
    name: "unsupported research alias remains unsupported",
    run() {
      const unsupportedAlias = ["ultra", "research"].join("");
      const result = runCli([unsupportedAlias, "--print", "demo"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, `Unknown command: ${unsupportedAlias}`, "stderr");
    },
  },
{
    name: "getwiki --print delegates to dedicated slash command",
    run() {
      const result = runCli(["getwiki", "--print", "workflow routing"]);
      assertExit(result, 0);
      assertStdout(result, '/getwiki "workflow routing"\n');
    },
  },
{
    name: "setwiki --print delegates to dedicated slash command",
    run() {
      const result = runCli(["setwiki", "--print", "review this lesson"]);
      assertExit(result, 0);
      assertStdout(result, '/setwiki "review this lesson"\n');
    },
  },
{
    name: "dispatch --print quotes ambiguous args safely",
    run() {
      const result = runCli([
        "plan",
        "--print",
        "simple",
        "two words",
        'quote"here',
        "path\\with\\slashes",
        "line\nbreak",
        "$HOME",
        "`cmd`",
      ]);
      assertExit(result, 0);
      assertStdout(
        result,
        '/ddalggak plan simple "two words" "quote\\"here" "path\\\\with\\\\slashes" "line\\nbreak" "$HOME" "`cmd`"\n',
      );
    },
  },
{
    name: "dispatch -- stops local flag parsing",
    run() {
      const result = runCli([
        "plan",
        "--print",
        "--",
        "--show-doc",
        "two words",
      ]);
      assertExit(result, 0);
      assertStdout(result, '/ddalggak plan --show-doc "two words"\n');
    },
  },
{
    name: "dispatch --show-doc extracts requested section",
    run() {
      const result = runCli(["review", "--show-doc"]);
      assertExit(result, 0);
      assertIncludes(result.stdout, "## Cross-Review Loop", "stdout");
      assertIncludes(
        result.stdout,
        "Full procedure: `references/cross-review-loop.md`",
        "stdout",
      );
      assertIncludes(result.stdout, "Execution contract index:", "stdout");
    },
  },
{
    name: "all subcommands expose compact --show-doc disclosure matrix",
    run() {
      const expectedDisclosures = {
        start: {
          heading: "## Start Workflow",
          fullProcedure: "references/start-workflow.md",
          assets: [
            "templates/worker-brief.md",
          ],
          maxLines: 20,
        },
        review: {
          heading: "## Cross-Review Loop",
          fullProcedure: "references/cross-review-loop.md",
          assets: [
            "templates/review-brief.md",
          ],
          maxLines: 20,
        },
        status: {
          heading: "## Status",
          fullProcedure: "references/status.md",
          assets: [],
          maxLines: 12,
        },
        plan: {
          heading: "## Issue-Ready Plan",
          fullProcedure: "references/issue-ready-plan.md",
          assets: [
            "references/wiki-context-preflight.md",
            "references/wiki-bridge.md",
          ],
          maxLines: 20,
        },
        issue: {
          heading: "## Plan to Issues",
          fullProcedure: "references/plan-to-issues.md",
          assets: [
            "templates/issue-body.md",
            "templates/epic-body.md",
          ],
          maxLines: 12,
        },
        clean: {
          heading: "## Merge Cleanup",
          fullProcedure: "references/merge-cleanup.md",
          assets: [],
          maxLines: 12,
        },
        ship: {
          heading: "## Ship",
          fullProcedure: "references/ship.md",
          assets: [],
          maxLines: 12,
        },
        retro: {
          heading: "## Retrospective",
          fullProcedure: "references/retrospective.md",
          assets: ["references/wiki-bridge.md"],
          maxLines: 12,
        },
        prompt: {
          heading: "## Prompt Optimizer",
          fullProcedure: "references/prompt-optimizer.md",
          assets: [
            "Prompt Safety / Brief Compiler",
            "Prompt Audit",
            "prompt grill-me",
            "Unsafe Prompt Gate",
            "READY_FOR_BRIEF",
            "NEEDS_CLARIFICATION",
            "BLOCKED_UNSAFE",
            "DISCOVERY_ONLY",
            "PROMPT_DONE",
            "source_edit_allowed: false",
          ],
          maxLines: 12,
        },
        tune: {
          heading: "## Tune Goal Brief",
          fullProcedure: "references/tune-goal.md",
          assets: ["source-grounded goal brief", "no source edits"],
          maxLines: 10,
        },
        forge: {
          heading: "## Forge Acceptance Criteria",
          fullProcedure: "references/forge-goal.md",
          assets: ["expected-result", "no source edits"],
          maxLines: 10,
        },
        spark: {
          heading: "## Spark Runtime Goal",
          fullProcedure: "references/spark-goal.md",
          assets: ["copyable runtime goal sentence", "no source edits"],
          maxLines: 10,
        },
        check: {
          heading: "## Local Diff Check",
          fullProcedure: "references/local-diff-check.md",
          assets: [],
          maxLines: 12,
        },
        getwiki: {
          heading: "## GetWiki Bridge",
          fullProcedure: "references/wiki-bridge.md",
          assets: [],
          maxLines: 12,
        },
        setwiki: {
          heading: "## SetWiki Bridge",
          fullProcedure: "references/wiki-bridge.md",
          assets: [],
          maxLines: 12,
        },
        "ulw-loop": {
          heading: "## ULW Loop",
          fullProcedure: "references/ulw-loop.md",
          assets: ["source_edit_allowed: true", "github_write_allowed: false", "ULW_LOOP_DONE"],
          maxLines: 12,
        },
        "ulw-plan": {
          heading: "## ULW Plan",
          fullProcedure: "references/ulw-plan.md",
          assets: ["source_edit_allowed: false", "ULW_PLAN_DONE"],
          maxLines: 12,
        },
        "ulw-research": {
          heading: "## ULW Research",
          fullProcedure: "references/ulw-research.md",
          assets: ["source_edit_allowed: false", "ULW_RESEARCH_DONE"],
          maxLines: 12,
        },
        "gjc-plan": {
          heading: "## Gajae-Code Delegation",
          fullProcedure: "references/gajae-code.md",
          assets: ["gjc_delegate_plan", "allow_mutation: false", "GJC_PLAN_DONE"],
          maxLines: 12,
        },
        "gjc-execute": {
          heading: "## Gajae-Code Delegation",
          fullProcedure: "references/gajae-code.md",
          assets: ["gjc_delegate_execute", "explicit user approval", "GJC_EXECUTE_DONE"],
          maxLines: 12,
        },
        "gjc-team": {
          heading: "## Gajae-Code Delegation",
          fullProcedure: "references/gajae-code.md",
          assets: ["gjc_delegate_team", "external GJC visible-session helpers", "GJC_TEAM_DONE"],
          maxLines: 12,
        },
      };

      for (const [subcommand, contract] of Object.entries(expectedDisclosures)) {
        const result = runCli([subcommand, "--show-doc"]);
        assertExit(result, 0);
        assertShowDocIncludes(subcommand, result.stdout, contract.heading);
        assertShowDocIncludes(
          subcommand,
          result.stdout,
          `Full procedure: \`${contract.fullProcedure}\``,
        );
        for (const asset of contract.assets) {
          assertShowDocIncludes(subcommand, result.stdout, asset);
        }
        const lineCount = result.stdout.trim().split("\n").length;
        assert(
          lineCount >= 3,
          `expected ${subcommand} --show-doc to expose a non-empty section`,
        );
        assert(
          lineCount <= contract.maxLines,
          `expected ${subcommand} --show-doc to stay compact (${lineCount}/${contract.maxLines} lines)`,
        );
      }
    },
  }
];

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  let passed = 0;
  const failures = [];
  for (const testCase of cases) {
    try {
      await testCase.run();
      passed += 1;
      console.log(`[PASS] test-runtime-dispatch: ${testCase.name}`);
    } catch (error) {
      failures.push(testCase.name);
      console.error(`[FAIL] test-runtime-dispatch: ${testCase.name}`);
      console.error(error && error.stack ? error.stack : String(error));
    }
  }
  console.log(`\nSummary: ${passed}/${cases.length} runtime dispatch cases passed.`);
  if (failures.length > 0) process.exitCode = 1;
}
