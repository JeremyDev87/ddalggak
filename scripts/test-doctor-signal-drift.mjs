// Committed rejection-behaviour regression for the doctor signal-registry
// space/underscore hardening (#280). doctor previously normalized "REVIEW DONE"
// to "REVIEW_DONE" before matching, so a reintroduced spaced spelling was
// silently accepted and the drift it should flag stayed hidden. Each case copies
// the repo into a temp tree, optionally reintroduces a spaced signal in the
// SKILL.md naming section, runs `ddalggak doctor` there, and asserts the gate's
// pass/fail — so a refactor that re-collapses the spellings is caught instead of
// quietly degrading the registry check to a no-op.
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { loadCommandContracts } from "../bin/lib/command-contracts.mjs";
import { loadLayout } from "../bin/lib/doctor/layout.mjs";
import { checkSignalRegistry } from "../bin/lib/doctor/signals.mjs";
import path from "node:path";

import { extractDocLinks, extractMarkdownSection } from "./lib/markdown-links.mjs";
import { runNodeScript } from "./test-lib/process.mjs";
import { withTempRepo as withRepo } from "./test-lib/repo-fixture.mjs";

function withTempRepo(name, fn) {
  return withRepo(name, (tempDir) => {
    assertPass("temporary command projection", runNodeScript("scripts/project-runtime-assets.mjs", ["--write"], { cwd: tempDir }));
    return fn(tempDir);
  });
}

const rootDir = process.cwd();
function runDoctor(tempDir) {
  return runNodeScript("bin/ddalggak.js", ["doctor"], { cwd: tempDir, env: { ...process.env, DDALGGAK_NO_UPDATE: "1" } });
}

function replaceInFile(filePath, from, to) {
  const text = readFileSync(filePath, "utf8");
  if (!text.includes(from)) {
    throw new Error(`${path.relative(rootDir, filePath)} did not contain expected probe text: ${from}`);
  }
  writeFileSync(filePath, text.split(from).join(to));
}

function assertPass(name, result) {
  if (result.status !== 0) {
    throw new Error(
      `${name}: expected doctor to pass, got ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

function assertFail(name, result, expectedMessage) {
  if (result.status === 0) {
    throw new Error(`${name}: expected doctor to fail, but it passed\nstdout:\n${result.stdout}`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(expectedMessage)) {
    throw new Error(
      `${name}: expected failure output to include ${JSON.stringify(expectedMessage)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }
  console.log(`[PASS] ${name}`);
}

const SKILL = "ddalggak/SKILL.md";

{
  const links = extractDocLinks([
    "See `references/start-workflow.md` and templates/worker-brief.md.",
    "Duplicate references/start-workflow.md should be deduped.",
    "Ignore references/not-md.txt while matching nested/path/references/nope.md basename-style.",
  ].join("\n"));
  const expected = ["references/nope.md", "references/start-workflow.md", "templates/worker-brief.md"];
  if (JSON.stringify(links) !== JSON.stringify(expected)) {
    throw new Error(`markdown link extractor drifted: expected ${JSON.stringify(expected)}, got ${JSON.stringify(links)}`);
  }
  const section = extractMarkdownSection("# Root\n\n## 명명 규칙\nbody\n\n### keep\nnested\n\n## Next\nstop", "명명 규칙");
  if (section !== "## 명명 규칙\nbody\n\n### keep\nnested\n") {
    throw new Error(`markdown section extractor drifted: ${JSON.stringify(section)}`);
  }
  console.log("[PASS] markdown doc link and section helpers are shared and deterministic");
}

withTempRepo("missing owning completion signal is rejected", (tempDir) => {
  replaceInFile(path.join(tempDir, "ddalggak/references/command-status.md"),
    '"completion_signal": "STATUS_DONE"', '"completion_signal": ""');
  assertFail("missing owning completion signal is rejected", runDoctor(tempDir), "command metadata drift");
});

// Baseline: an unmutated copy must pass so the failing case proves the mutation,
// not a broken temp tree.
withTempRepo("baseline doctor passes on an unmutated copy", (tempDir) => {
  assertPass("baseline doctor passes on an unmutated copy", runDoctor(tempDir));
});

// Drift: reintroducing the legacy spaced spelling in the naming section must be
// flagged. Under the old normalizing behaviour "REVIEW DONE" collapsed to the
// defined "REVIEW_DONE" and passed silently; the hardening keeps them distinct.
withTempRepo("spaced completion signal in naming section is flagged", (tempDir) => {
  replaceInFile(
    path.join(tempDir, SKILL),
    "LANE_READY, REVIEW_DONE, and FIX_DONE",
    "LANE_READY, REVIEW DONE, and FIX_DONE",
  );
  assertFail(
    "spaced completion signal in naming section is flagged",
    runDoctor(tempDir),
    'undefined completion signal: "REVIEW DONE"',
  );
});

for (const mutation of ["missing-owner", "deleted-signal", "undefined-signal", "allowed-artifact"]) {
  withTempRepo(`all 21 command owners reject ${mutation} in both roots`, (tempDir) => {
    const commands = loadCommandContracts(tempDir);
    assert.equal(commands.length, 21);
    assert.deepEqual(checkSignalRegistry(loadLayout(tempDir)).findings, []);
    const labels = [];
    for (const root of ["ddalggak", ".codex/skills/ddalggak"]) {
      for (const doc of commands) {
        const label = `${root}/references/command-${doc.command}.md`;
        labels.push(label);
        const file = path.join(tempDir, label);
        const text = readFileSync(file, "utf8");
        if (mutation === "missing-owner") {
          rmSync(file);
        } else if (mutation === "undefined-signal") {
          writeFileSync(file, `${text}\nUNREGISTERED_DONE\n`);
        } else {
          const block = text.match(/^```json\n([\s\S]*?)^```/m);
          const metadata = JSON.parse(block[1]);
          if (mutation === "deleted-signal") delete metadata.output_contract.completion_signal;
          else metadata.allowed_artifact = "arbitrary repository edits";
          writeFileSync(file, text.replace(block[1], `${JSON.stringify(metadata, null, 2)}\n`));
        }
      }
    }
    const result = runNodeScript("bin/ddalggak.js", ["doctor", "--json", "--no-update"], { cwd: tempDir });
    assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
    const findings = JSON.parse(result.stdout).checks["signal-registry"].findings;
    for (const label of labels) {
      assert.ok(findings.some((finding) => finding.includes(label) && finding.includes(mutation === "missing-owner" ? "missing required command owner" : mutation === "undefined-signal" ? "undefined completion signal" : "command metadata drift")), `${label}: ${findings.join("\n")}`);
    }
    console.log(`[PASS] 42 command owners reject ${mutation} through doctor CLI`);
  });
}

withTempRepo("handoff signals require their template owner in both roots", (tempDir) => {
  for (const root of ["ddalggak", ".codex/skills/ddalggak"]) {
    for (const [file, signal] of [["worker-brief.md", "LANE_READY"], ["review-brief.md", "REVIEW_DONE"], ["fix-brief.md", "FIX_DONE"]]) {
      replaceInFile(path.join(tempDir, root, "templates", file), signal, "REMOVED_TOKEN");
    }
  }
  const result = runDoctor(tempDir);
  for (const signal of ["LANE_READY", "REVIEW_DONE", "FIX_DONE"]) {
    assertFail(`handoff ${signal} cannot inherit a YAML or sibling definition`, result, `missing handoff signal: "${signal}"`);
  }
});

console.log("\n[test:doctor-signal-drift] passed");
