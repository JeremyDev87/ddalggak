import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const defaultFixturePath = path.join(
  rootDir,
  "evals",
  "ddalggak-readiness",
  "fixtures.json",
);
const fixturePath = process.argv[2]
  ? path.resolve(process.argv[2])
  : defaultFixturePath;

const mutationKinds = [
  "create_branch",
  "push_branch",
  "create_pr",
  "create_comment",
  "approve_pr",
  "mark_ready",
  "edit_source",
  "edit_claude_profile",
  "write_wiki",
];

// Raw/private payload field names that must never appear in fixture data.
const RAW_PAYLOAD_PATTERNS = [
  "rawPrompt",
  "rawOutput",
  "private_diff",
  "privateDiff",
  "token",
  "secret",
  "credential",
];

const knownOutputSections = new Set([
  "Wiki Context Manifest",
  "Queries attempted",
  "Wiki sources read",
  "Unknowns not found in wiki",
  "Non-wiki inference",
  "Quality Lens Router Output",
  "Evidence Contract",
  "Goal / Context",
  "Findings backed by live PR/repo evidence",
  "Findings strengthened by wiki sources",
  "Wiki search failures or gaps",
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function repoFromGitHubUrl(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      return null;
    }
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo) {
      return null;
    }
    return `${owner}/${repo}`;
  } catch {
    return null;
  }
}

function targetRepoMatchesUrl(state) {
  const urlRepo = repoFromGitHubUrl(state.targetUrl);
  return urlRepo === null || urlRepo === state.targetRepo;
}

function sameRepo(state) {
  return state.cwdRepo === state.targetRepo && targetRepoMatchesUrl(state);
}

function hasExistingIssuePr(state) {
  const issueNumbers = new Set(
    array(state.openIssues).map((issue) => issue.number),
  );
  return array(state.openPullRequests).some((pullRequest) =>
    array(pullRequest.closingIssues).some((issueNumber) =>
      issueNumbers.has(issueNumber),
    ),
  );
}

function hasPriorParsedComment(state) {
  const issueNumbers = new Set(
    array(state.openIssues).map((issue) => issue.number),
  );
  return array(state.priorComments).some(
    (comment) =>
      issueNumbers.has(comment.issue) && comment.marker === "ddalggak:parsed",
  );
}

function missingRequiredEvidence(pullRequest) {
  const provided = new Set(array(pullRequest?.providedEvidence));
  return array(pullRequest?.requiredEvidence).filter(
    (item) => !provided.has(item),
  );
}

function hasSuccessfulChecks(pullRequest) {
  const checks = array(pullRequest?.checks);
  return (
    checks.length > 0 &&
    checks.every(
      (check) =>
        check.conclusion === "success" || check.conclusion === "skipped",
    )
  );
}

function hasHardConflict(state) {
  return array(state.openIssues).some((issue) => issue.conflict?.hard === true);
}

function missingOutputSections(state, requiredSections) {
  const outputSections = new Set(array(state.outputSections));
  return array(requiredSections).filter(
    (section) => !outputSections.has(section),
  );
}

function expectedRequiredOutputSections(scenario) {
  return array(scenario.expect?.requiredOutputSections);
}

function result({
  decision,
  prStrategy,
  readyAllowed,
  approveAllowed,
  allowedMutations,
  reasons,
}) {
  return {
    decision,
    prStrategy,
    readyAllowed,
    approveAllowed,
    allowedMutations: [...allowedMutations],
    reasons,
  };
}

function decideScenario(scenario) {
  const state = scenario.state || {};
  const allowedMutations = new Set(mutationKinds);
  let decision = "ready_for_issue_pr";
  let prStrategy = "independent_issue_pr";
  let readyAllowed = true;
  let approveAllowed = true;
  const reasons = [];

  if (!sameRepo(state)) {
    decision = "repo_mismatch_blocked";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.clear();
    const urlRepo = repoFromGitHubUrl(state.targetUrl);
    reasons.push(
      `Mutation stopped because cwdRepo=${state.cwdRepo || "<missing>"}, targetRepo=${state.targetRepo || "<missing>"}, targetUrlRepo=${urlRepo || "<none>"}; URL beats cwd.`,
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (
    array(state.openIssues).length === 0 &&
    state.requestedCommand === "start"
  ) {
    decision = "no_work";
    prStrategy = "none";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.clear();
    reasons.push(
      "No open issue exists, so start must not invent work or mutate GitHub state.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (
    state.attemptedSourceEdit &&
    !["start", "review"].includes(state.requestedCommand)
  ) {
    decision = "source_edit_blocked";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("edit_source");
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      `${state.requestedCommand || "<unknown>"} must not edit repository source files.`,
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  const outputSectionGaps = missingOutputSections(
    state,
    expectedRequiredOutputSections(scenario),
  );
  if (outputSectionGaps.length > 0) {
    decision = "output_contract_blocked";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      `${state.requestedCommand || "<unknown>"} output is missing required sections: ${outputSectionGaps.join(", ")}.`,
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  const installedSkill = state.installedSkill;
  if (
    installedSkill &&
    [
      installedSkill.sourceStatus,
      installedSkill.codexStatus,
      installedSkill.installedStatus,
    ].some((status) => status !== "ok")
  ) {
    decision = "parity_claim_blocked";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.clear();
    reasons.push(
      "Installed/source/Codex skill parity claim requires all status values to be ok.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (state.requestedCommand === "getwiki") {
    if (
      state.wikiOperation?.attemptedMutation === true ||
      state.wikiOperation?.mode === "write"
    ) {
      decision = "wiki_readonly_violation";
      readyAllowed = false;
      approveAllowed = false;
      allowedMutations.delete("write_wiki");
      reasons.push(
        "getwiki is read-only retrieval and must not mutate wiki files.",
      );
    } else {
      decision = "wiki_readonly_delegate";
      allowedMutations.clear();
      reasons.push(
        "getwiki delegates to the dedicated read-only wiki retrieval workflow.",
      );
    }
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (
    state.requestedCommand === "setwiki" &&
    state.wikiOperation?.approved !== true
  ) {
    decision = "wiki_write_approval_required";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("write_wiki");
    reasons.push(
      "setwiki write workflow requires explicit approval before wiki mutation.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (state.claudeProfileProposal?.dryRun === true) {
    decision = "profile_dry_run_only";
    allowedMutations.delete("edit_claude_profile");
    if (state.claudeProfileProposal.attemptedMutation === true) {
      readyAllowed = false;
      approveAllowed = false;
      reasons.push(
        "Claude profile dry-run proposal must not mutate ~/.claude/CLAUDE.md.",
      );
    } else {
      reasons.push(
        "Claude profile proposal is dry-run only; ~/.claude/CLAUDE.md is not mutated.",
      );
    }
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (state.projectionCheck?.status === "drift") {
    decision = "projection_drift_blocked";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      `Projection drift detected in ${array(state.projectionCheck.changedGeneratedBlocks).join(", ") || "generated blocks"}.`,
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  // source-authority: issue/PR body text must not be treated as runtime decision authority.
  if (state.sourceAuthorityCheck?.issueBodyContainsApprovalDirective === true) {
    decision = "no_authority_escalation";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Issue body text must not be treated as runtime decision authority.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  // retention-boundary: raw/private payload retention attempt must be blocked.
  if (
    state.retentionCheck?.attemptedRetention === true &&
    array(state.retentionCheck?.retainedFields).length > 0
  ) {
    decision = "retention_boundary_violation";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Raw or private payload retention is forbidden; retention boundary violated.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  // parser-fail-closed: malformed/ambiguous structured evidence block must block approval.
  if (state.parserCheck?.status === "malformed") {
    decision = "parser_fail_closed";
    prStrategy = "blocked";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Malformed or ambiguous evidence block must not be approved; parser fail-closed.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (hasExistingIssuePr(state) || hasPriorParsedComment(state)) {
    decision = "duplicate_suppressed";
    prStrategy = "existing_pr";
    allowedMutations.clear();
    readyAllowed = false;
    approveAllowed = false;
    reasons.push(
      "Existing issue PR or parsed marker found; duplicate PR/comment creation is forbidden.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  if (hasHardConflict(state)) {
    decision = "hard_conflict_blocked";
    prStrategy = "blocked_or_single_pr_conflict_fallback";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("create_pr");
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Hard conflict requires blocked/fallback classification, not a default independent PR.",
    );
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  const evidenceGaps = missingRequiredEvidence(state.pullRequest);
  if (state.pullRequest && evidenceGaps.length > 0) {
    decision = "evidence_gap_blocked";
    prStrategy = "existing_pr";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(`Missing required evidence: ${evidenceGaps.join(", ")}.`);
    if (!hasSuccessfulChecks(state.pullRequest)) {
      reasons.push("Checks are not terminal success/skipped.");
    }
    return result({
      decision,
      prStrategy,
      readyAllowed,
      approveAllowed,
      allowedMutations,
      reasons,
    });
  }

  return result({
    decision,
    prStrategy,
    readyAllowed,
    approveAllowed,
    allowedMutations,
    reasons,
  });
}

function sorted(value) {
  return [...value].sort();
}

function compareScenario(scenario, actual) {
  const failures = [];
  const expected = scenario.expect || {};

  for (const key of [
    "decision",
    "prStrategy",
    "readyAllowed",
    "approveAllowed",
  ]) {
    if (Object.hasOwn(expected, key) && actual[key] !== expected[key]) {
      failures.push(
        `${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(actual[key])}`,
      );
    }
  }

  if (Object.hasOwn(expected, "allowedMutations")) {
    const expectedMutations = sorted(expected.allowedMutations);
    const actualMutations = sorted(actual.allowedMutations);
    if (JSON.stringify(actualMutations) !== JSON.stringify(expectedMutations)) {
      failures.push(
        `allowedMutations: expected ${JSON.stringify(expectedMutations)}, got ${JSON.stringify(actualMutations)}`,
      );
    }
  }

  if (Object.hasOwn(expected, "forbiddenMutations")) {
    const actualMutations = new Set(actual.allowedMutations);
    const violations = expected.forbiddenMutations.filter((mutation) =>
      actualMutations.has(mutation),
    );
    if (violations.length > 0) {
      failures.push(
        `forbiddenMutations still allowed: ${JSON.stringify(violations)}`,
      );
    }
  }

  if (Object.hasOwn(expected, "requiredOutputSections")) {
    const missingSections = missingOutputSections(
      scenario.state || {},
      expected.requiredOutputSections,
    );
    if (
      missingSections.length > 0 &&
      actual.decision !== "output_contract_blocked"
    ) {
      failures.push(
        `requiredOutputSections missing from state.outputSections: ${JSON.stringify(missingSections)}`,
      );
    }
  }

  if (actual.decision !== "ready_for_issue_pr" && actual.reasons.length === 0) {
    failures.push("blocked/non-ready decision must include an explicit reason");
  }

  if (Object.hasOwn(expected, "reasonIncludes")) {
    for (const expectedReason of expected.reasonIncludes) {
      if (!actual.reasons.some((reason) => reason.includes(expectedReason))) {
        failures.push(
          `reasonIncludes: expected an actual reason containing ${JSON.stringify(expectedReason)}, got ${JSON.stringify(actual.reasons)}`,
        );
      }
    }
  }

  // evalFixture mustNotContain: verify forbidden strings are absent from the scenario result
  if (isObject(scenario.evalFixture)) {
    const resultText = JSON.stringify(actual);
    for (const forbidden of array(scenario.evalFixture.mustNotContain)) {
      if (resultText.includes(forbidden)) {
        failures.push(
          `evalFixture.mustNotContain: forbidden string "${forbidden}" found in scenario result`,
        );
      }
    }
  }

  return failures;
}

function validateMutationList(scenarioName, expect, key, failures) {
  if (Object.hasOwn(expect, key)) {
    if (!Array.isArray(expect[key])) {
      failures.push(`${scenarioName}: expect.${key} must be an array`);
      return;
    }
    for (const mutation of expect[key]) {
      if (!mutationKinds.includes(mutation)) {
        failures.push(
          `${scenarioName}: unknown mutation in expect.${key}: ${mutation}`,
        );
      }
    }
  }
}

function validateFixture(fixture) {
  const failures = [];
  if (!isObject(fixture)) {
    return ["fixture root must be an object"];
  }
  if (fixture.version !== 1) {
    failures.push("fixture version must be 1");
  }
  if (!Array.isArray(fixture.scenarios) || fixture.scenarios.length < 3) {
    failures.push("fixture must include at least 3 scenarios");
  }
  for (const scenario of array(fixture.scenarios)) {
    const scenarioName = scenario?.name || "<unknown>";
    if (!isObject(scenario)) {
      failures.push("scenario must be an object");
      continue;
    }
    if (!scenario.name) {
      failures.push("scenario missing name");
    }
    if (!scenario.invariant) {
      failures.push(`${scenarioName}: missing invariant`);
    }
    if (!isObject(scenario.state) || !isObject(scenario.expect)) {
      failures.push(`${scenarioName}: state and expect must be objects`);
      continue;
    }
    if (
      scenario.state.targetUrl &&
      repoFromGitHubUrl(scenario.state.targetUrl) === null
    ) {
      failures.push(
        `${scenarioName}: targetUrl must be a github.com owner/repo URL`,
      );
    }
    validateMutationList(
      scenarioName,
      scenario.expect,
      "allowedMutations",
      failures,
    );
    validateMutationList(
      scenarioName,
      scenario.expect,
      "forbiddenMutations",
      failures,
    );
    if (Object.hasOwn(scenario.expect, "requiredOutputSections")) {
      if (!Array.isArray(scenario.expect.requiredOutputSections)) {
        failures.push(
          `${scenarioName}: expect.requiredOutputSections must be an array`,
        );
      }
      if (!Array.isArray(scenario.state.outputSections)) {
        failures.push(
          `${scenarioName}: state.outputSections must be an array when requiredOutputSections is set`,
        );
      }
      if (!["plan", "review"].includes(scenario.state.requestedCommand)) {
        failures.push(
          `${scenarioName}: requiredOutputSections applies only to plan/review scenarios`,
        );
      }
      for (const section of array(scenario.expect.requiredOutputSections)) {
        if (!knownOutputSections.has(section)) {
          failures.push(
            `${scenarioName}: unknown output section in expect.requiredOutputSections: ${section}`,
          );
        }
      }
    }
    if (Object.hasOwn(scenario.expect, "reasonIncludes")) {
      if (!Array.isArray(scenario.expect.reasonIncludes)) {
        failures.push(`${scenarioName}: expect.reasonIncludes must be an array`);
      }
      for (const expectedReason of array(scenario.expect.reasonIncludes)) {
        if (typeof expectedReason !== "string" || expectedReason.length === 0) {
          failures.push(
            `${scenarioName}: expect.reasonIncludes entries must be non-empty strings`,
          );
        }
      }
    }
    for (const section of array(scenario.state.outputSections)) {
      if (!knownOutputSections.has(section)) {
        failures.push(
          `${scenarioName}: unknown output section in state.outputSections: ${section}`,
        );
      }
    }

    // evalFixture optional metadata validation
    if (Object.hasOwn(scenario, "evalFixture")) {
      if (!isObject(scenario.evalFixture)) {
        failures.push(`${scenarioName}: evalFixture must be an object`);
      } else {
        const ef = scenario.evalFixture;
        if (ef.schemaVersion !== 1) {
          failures.push(`${scenarioName}: evalFixture.schemaVersion must be 1`);
        }
        const knownAxes = new Set([
          "source_authority",
          "structured_schema",
          "parser_fail_closed",
          "review_completeness",
          "ux_rendering",
          "retention_boundary",
        ]);
        if (ef.axis && !knownAxes.has(ef.axis)) {
          failures.push(
            `${scenarioName}: evalFixture.axis unknown: ${ef.axis}`,
          );
        }
        const knownEvaluators = new Set([
          "deterministic_assertion",
          "llm_judge_optional",
          "manual_review_required",
        ]);
        if (ef.evaluator && !knownEvaluators.has(ef.evaluator)) {
          failures.push(
            `${scenarioName}: evalFixture.evaluator unknown: ${ef.evaluator}`,
          );
        }
        // mustNotContain must not contain actual raw/private payload values
        for (const forbidden of array(ef.mustNotContain)) {
          if (typeof forbidden !== "string" || forbidden.length === 0) {
            failures.push(
              `${scenarioName}: evalFixture.mustNotContain entries must be non-empty strings`,
            );
          }
        }
        // Verify that the fixture's state/expect do not contain raw payload patterns
        const fixtureText = JSON.stringify({ state: scenario.state, expect: scenario.expect });
        for (const pattern of RAW_PAYLOAD_PATTERNS) {
          if (fixtureText.includes(`"${pattern}"`)) {
            // Allow known non-value occurrences (e.g., pattern is listed as a key to check, not actual data)
            // Only flag if the pattern appears as a value string, not as a key or mustNotContain entry
            const valuePattern = new RegExp(`:\\s*"[^"]*${pattern}[^"]*"`);
            if (valuePattern.test(fixtureText)) {
              failures.push(
                `${scenarioName}: fixture state/expect contains raw/private payload pattern as value: ${pattern}`,
              );
            }
          }
        }
      }
    }
  }
  return failures;
}

function runFixtureValidationSelfTest() {
  const invalidMutation = validateFixture({
    version: 1,
    scenarios: [
      {
        name: "invalid-mutation",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
        },
        expect: { forbiddenMutations: ["teleport_pr"] },
      },
      {
        name: "valid-filler-a",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
        },
        expect: { decision: "ready_for_issue_pr" },
      },
      {
        name: "valid-filler-b",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
        },
        expect: { decision: "ready_for_issue_pr" },
      },
    ],
  });
  const invalidOutput = validateFixture({
    version: 1,
    scenarios: [
      {
        name: "invalid-output",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
          requestedCommand: "plan",
          outputSections: ["Imaginary Output Section"],
        },
        expect: { requiredOutputSections: ["Imaginary Output Section"] },
      },
      {
        name: "valid-filler-a",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
        },
        expect: { decision: "ready_for_issue_pr" },
      },
      {
        name: "valid-filler-b",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
        },
        expect: { decision: "ready_for_issue_pr" },
      },
    ],
  });
  if (
    !invalidMutation.some((failure) => failure.includes("unknown mutation")) ||
    !invalidOutput.some((failure) => failure.includes("unknown output section"))
  ) {
    console.error("[eval:ddalggak-readiness:self-test] failed");
    console.error(
      "- expected known-bad fixture validation to reject unknown mutation and output section fields",
    );
    process.exit(1);
  }
  console.log(
    "[eval:ddalggak-readiness:self-test] passed: known-bad fixtures fail closed",
  );
}

if (process.argv.includes("--self-test")) {
  runFixtureValidationSelfTest();
  process.exit(0);
}

const fixture = readJson(fixturePath);
const failures = validateFixture(fixture);
let passed = 0;

if (failures.length === 0) {
  for (const scenario of fixture.scenarios) {
    const actual = decideScenario(scenario);
    const scenarioFailures = compareScenario(scenario, actual);
    if (scenarioFailures.length === 0) {
      passed += 1;
      console.log(
        `[PASS] ${scenario.name} (${scenario.invariant}) -> ${actual.decision}`,
      );
    } else {
      failures.push(
        `${scenario.name} (${scenario.invariant}) failed:\n${scenarioFailures
          .map((failure) => `  - ${failure}`)
          .join("\n")}\n  reasons: ${actual.reasons.join(" | ") || "<none>"}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("[eval:ddalggak-readiness] failed");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `\n[eval:ddalggak-readiness] passed ${passed}/${fixture.scenarios.length} scenarios`,
);
