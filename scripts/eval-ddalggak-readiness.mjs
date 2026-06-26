// ddalggak readiness eval — verification boundary.
//
// What this eval verifies:
// - Deterministic decision-policy invariants over mock JSON scenarios in
//   evals/ddalggak-readiness/fixtures.json (no GitHub mutation, no LLM call).
// - Contract-derived expectations: source-edit permissions and required
//   reference coverage are loaded from core/commands/*.yaml at eval time, so
//   a command contract change fails this eval until fixtures are reconciled.
//
// What this eval does NOT verify:
// - Real LLM behavior, prompt quality, or live GitHub/CI side effects.
// - That an actual skill run loaded the references it claims; scenario state
//   is mock input, not a recorded run.
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadCommandContracts as loadCoreCommandContracts } from "../bin/lib/command-contracts.mjs";
import { escapeRegExp } from "./lib/escape-regexp.mjs";

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


const READINESS_DECISIONS = Object.freeze({
  ready_for_issue_pr: { outcomeClass: "ready", readyAllowed: true, approveAllowed: true, meaning: "Issue context is eligible for an independent issue PR." },
  repo_mismatch_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Target repository does not match the current repository or target URL." },
  no_work: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "No open issue exists for a start run, so no PR work may be invented." },
  source_edit_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Requested command is not allowed to edit repository source." },
  output_contract_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Required output sections are missing." },
  reference_contract_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Required references from the command contract were not loaded." },
  clean_unmerged_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Clean attempted to delete an unmerged target covered by the clean stop condition." },
  clean_local_cleanup_allowed: { outcomeClass: "local_only", readyAllowed: false, approveAllowed: false, meaning: "Only local cleanup is allowed; no PR readiness or approval outcome applies." },
  parity_claim_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Installed/source/Codex parity evidence is incomplete." },
  wiki_readonly_violation: { outcomeClass: "violation", readyAllowed: false, approveAllowed: false, meaning: "getwiki attempted a wiki mutation despite read-only routing." },
  wiki_readonly_delegate: { outcomeClass: "delegate", readyAllowed: true, approveAllowed: true, meaning: "getwiki delegates to the read-only wiki retrieval workflow." },
  wiki_write_approval_required: { outcomeClass: "approval_required", readyAllowed: false, approveAllowed: false, meaning: "setwiki cannot write until explicit user approval exists." },
  profile_dry_run_only: { outcomeClass: "dry_run", readyAllowed: true, approveAllowed: true, meaning: "Profile proposal is dry-run only; mutation is not part of the default outcome." },
  projection_drift_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Projection drift blocks approval or ready transition." },
  no_authority_escalation: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Issue or PR prose cannot escalate runtime authority." },
  retention_boundary_violation: { outcomeClass: "violation", readyAllowed: false, approveAllowed: false, meaning: "Raw/private payload retention violates the retention boundary." },
  parser_fail_closed: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Malformed or ambiguous structured evidence must fail closed." },
  duplicate_suppressed: { outcomeClass: "suppressed", readyAllowed: false, approveAllowed: false, meaning: "An existing issue PR or parsed marker suppresses duplicate work." },
  hard_conflict_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Hard conflict requires blocked/fallback classification instead of default PR creation." },
  evidence_gap_blocked: { outcomeClass: "blocked", readyAllowed: false, approveAllowed: false, meaning: "Required evidence is missing, so readiness and approval are blocked." },
});

function decisionOutcome(decision, outcomeOverride = {}) {
  const registered = READINESS_DECISIONS[decision];
  if (!registered) {
    console.error(`[eval:ddalggak-readiness] unregistered decision code: ${decision}`);
    process.exit(1);
  }
  return { ...registered, ...outcomeOverride };
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}


// Load canonical command contracts so fixture expectations derive from the
// real artifacts instead of values hardcoded in this eval (fail-closed). The
// shared loader owns YAML parsing and schema validation so eval/projection/
// runtime-asset surfaces cannot drift on command contract shape.
function loadCommandContracts() {
  let docs;
  try {
    docs = loadCoreCommandContracts(rootDir);
  } catch (error) {
    console.error(`[eval:ddalggak-readiness] ${error.message}`);
    process.exit(1);
  }

  const contracts = new Map();
  for (const doc of docs) {
    contracts.set(doc.command, {
      command: doc.command,
      file: `core/commands/${doc.command}.yaml`,
      sourceEditAllowed: doc.source_edit_allowed,
      mode: doc.mode,
      stopCondition: doc.stop_condition,
      requiredReferences: doc.required_references,
    });
  }

  if (contracts.size === 0) {
    console.error(
      "[eval:ddalggak-readiness] no command contracts found in core/commands",
    );
    process.exit(1);
  }
  return contracts;
}

const commandContracts = loadCommandContracts();
const sourceEditAllowedCommands = new Set(
  [...commandContracts.values()]
    .filter((contract) => contract.sourceEditAllowed === true)
    .map((contract) => contract.command),
);

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
  outcomeOverride,
  allowedMutations,
  reasons,
}) {
  const outcome = decisionOutcome(decision, outcomeOverride);
  return {
    decision,
    prStrategy,
    readyAllowed: outcome.readyAllowed,
    approveAllowed: outcome.approveAllowed,
    allowedMutations: [...allowedMutations],
    reasons,
  };
}

function decideScenario(scenario) {
  const state = scenario.state || {};
  const allowedMutations = new Set(mutationKinds);
  let decision = "ready_for_issue_pr";
  let prStrategy = "independent_issue_pr";
  const reasons = [];

  if (!sameRepo(state)) {
    decision = "repo_mismatch_blocked";
    prStrategy = "blocked";
    allowedMutations.clear();
    const urlRepo = repoFromGitHubUrl(state.targetUrl);
    reasons.push(
      `Mutation stopped because cwdRepo=${state.cwdRepo || "<missing>"}, targetRepo=${state.targetRepo || "<missing>"}, targetUrlRepo=${urlRepo || "<none>"}; URL beats cwd.`,
    );
    return result({
      decision,
      prStrategy,
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
    allowedMutations.clear();
    reasons.push(
      "No open issue exists, so start must not invent work or mutate GitHub state.",
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  // Derived from core/commands/*.yaml source_edit_allowed, not hardcoded here.
  if (
    state.attemptedSourceEdit &&
    !sourceEditAllowedCommands.has(state.requestedCommand)
  ) {
    decision = "source_edit_blocked";
    prStrategy = "blocked";
    allowedMutations.delete("edit_source");
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      `${state.requestedCommand || "<unknown>"} must not edit repository source files.`,
    );
    return result({
      decision,
      prStrategy,
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
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      `${state.requestedCommand || "<unknown>"} output is missing required sections: ${outputSectionGaps.join(", ")}.`,
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  // Required-reference coverage derives from the live command contract; a
  // contract change fails fixtures until they are reconciled.
  const referenceContract = commandContracts.get(state.requestedCommand);
  if (referenceContract && Array.isArray(state.loadedReferences)) {
    const loadedReferences = new Set(state.loadedReferences);
    const missingReferences = referenceContract.requiredReferences.filter(
      (reference) => !loadedReferences.has(reference),
    );
    if (missingReferences.length > 0) {
      decision = "reference_contract_blocked";
      prStrategy = "blocked";
      allowedMutations.delete("approve_pr");
      allowedMutations.delete("mark_ready");
      reasons.push(
        `${state.requestedCommand} run is missing required references from ${referenceContract.file}: ${missingReferences.join(", ")}.`,
      );
      return result({
        decision,
        prStrategy,
        allowedMutations,
        reasons,
      });
    }
  }

  // clean stop_condition derives from core/commands/clean.yaml; if the
  // contract stops declaring unmerged, the blocked fixture fails and forces
  // explicit reconciliation.
  if (state.requestedCommand === "clean" && isObject(state.cleanOperation)) {
    const cleanContract = commandContracts.get("clean");
    const contractStopsOnUnmerged =
      typeof cleanContract?.stopCondition === "string" &&
      cleanContract.stopCondition.toLowerCase().includes("unmerged");
    const deletionTargets = array(state.cleanOperation.deletionTargets);
    const unmergedTargets = deletionTargets.filter(
      (target) => target?.merged !== true,
    );
    allowedMutations.clear();
    if (unmergedTargets.length > 0 && contractStopsOnUnmerged) {
      decision = "clean_unmerged_blocked";
      prStrategy = "blocked";
      reasons.push(
        `clean must stop on unmerged branches per ${cleanContract.file} stop_condition: ${unmergedTargets
          .map((target) => target?.branch || "<unknown>")
          .join(", ")}.`,
      );
    } else if (unmergedTargets.length > 0) {
      decision = "clean_local_cleanup_allowed";
      prStrategy = "none";
      reasons.push(
        `clean contract no longer declares an unmerged stop_condition; reconcile fixtures with ${cleanContract?.file || "core/commands/clean.yaml"}.`,
      );
    } else {
      decision = "clean_local_cleanup_allowed";
      prStrategy = "none";
      reasons.push(
        "clean targets all have live merge evidence; local cleanup only, no GitHub mutation.",
      );
    }
    return result({
      decision,
      prStrategy,
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
    allowedMutations.clear();
    reasons.push(
      "Installed/source/Codex skill parity claim requires all status values to be ok.",
    );
    return result({
      decision,
      prStrategy,
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
    allowedMutations.delete("write_wiki");
    reasons.push(
      "setwiki write workflow requires explicit approval before wiki mutation.",
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  if (state.claudeProfileProposal?.dryRun === true) {
    decision = "profile_dry_run_only";
    allowedMutations.delete("edit_claude_profile");
    const outcomeOverride = {};
    if (state.claudeProfileProposal.attemptedMutation === true) {
      outcomeOverride.readyAllowed = false;
      outcomeOverride.approveAllowed = false;
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
      outcomeOverride,
      allowedMutations,
      reasons,
    });
  }

  if (state.projectionCheck?.status === "drift") {
    decision = "projection_drift_blocked";
    prStrategy = "blocked";
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      `Projection drift detected in ${array(state.projectionCheck.changedGeneratedBlocks).join(", ") || "generated blocks"}.`,
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  // source-authority: issue/PR body text must not be treated as runtime decision authority.
  if (state.sourceAuthorityCheck?.issueBodyContainsApprovalDirective === true) {
    decision = "no_authority_escalation";
    prStrategy = "blocked";
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Issue body text must not be treated as runtime decision authority.",
    );
    return result({
      decision,
      prStrategy,
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
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Raw or private payload retention is forbidden; retention boundary violated.",
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  // parser-fail-closed: malformed/ambiguous structured evidence block must block approval.
  if (state.parserCheck?.status === "malformed") {
    decision = "parser_fail_closed";
    prStrategy = "blocked";
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Malformed or ambiguous evidence block must not be approved; parser fail-closed.",
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  if (hasExistingIssuePr(state) || hasPriorParsedComment(state)) {
    decision = "duplicate_suppressed";
    prStrategy = "existing_pr";
    allowedMutations.clear();
    reasons.push(
      "Existing issue PR or parsed marker found; duplicate PR/comment creation is forbidden.",
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  if (hasHardConflict(state)) {
    decision = "hard_conflict_blocked";
    prStrategy = "blocked_or_single_pr_conflict_fallback";
    allowedMutations.delete("create_pr");
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(
      "Hard conflict requires blocked/fallback classification, not a default independent PR.",
    );
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  const evidenceGaps = missingRequiredEvidence(state.pullRequest);
  if (state.pullRequest && evidenceGaps.length > 0) {
    decision = "evidence_gap_blocked";
    prStrategy = "existing_pr";
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push(`Missing required evidence: ${evidenceGaps.join(", ")}.`);
    if (!hasSuccessfulChecks(state.pullRequest)) {
      reasons.push("Checks are not terminal success/skipped.");
    }
    return result({
      decision,
      prStrategy,
      allowedMutations,
      reasons,
    });
  }

  return result({
    decision,
    prStrategy,
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

  // Bidirectional contract match: the fixture's loadedReferences must equal
  // the live contract list, so adding OR removing a required_references entry
  // in core/commands/*.yaml fails this scenario until it is reconciled.
  if (expected.loadedReferencesMatchContract === true) {
    const contract = commandContracts.get(scenario.state?.requestedCommand);
    if (!contract) {
      failures.push(
        "loadedReferencesMatchContract requires a command with a core/commands contract",
      );
    } else {
      const loadedReferences = new Set(array(scenario.state?.loadedReferences));
      const requiredReferences = new Set(contract.requiredReferences);
      const missing = contract.requiredReferences.filter(
        (reference) => !loadedReferences.has(reference),
      );
      const extra = [...loadedReferences].filter(
        (reference) => !requiredReferences.has(reference),
      );
      if (missing.length > 0 || extra.length > 0) {
        failures.push(
          `loadedReferencesMatchContract: fixture diverges from ${contract.file} (missing: ${JSON.stringify(missing)}, extra: ${JSON.stringify(extra)})`,
        );
      }
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
    if (Object.hasOwn(scenario.expect, "decision") && !READINESS_DECISIONS[scenario.expect.decision]) {
      failures.push(
        `${scenarioName}: expect.decision is not registered: ${scenario.expect.decision}`,
      );
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
    if (
      Object.hasOwn(scenario.expect, "loadedReferencesMatchContract") &&
      scenario.expect.loadedReferencesMatchContract !== true
    ) {
      failures.push(
        `${scenarioName}: expect.loadedReferencesMatchContract must be boolean true when present`,
      );
    }
    if (Object.hasOwn(scenario.state, "loadedReferences")) {
      if (
        !Array.isArray(scenario.state.loadedReferences) ||
        scenario.state.loadedReferences.some(
          (reference) =>
            typeof reference !== "string" || reference.length === 0,
        )
      ) {
        failures.push(
          `${scenarioName}: state.loadedReferences must be an array of non-empty strings`,
        );
      }
      if (!commandContracts.has(scenario.state.requestedCommand)) {
        failures.push(
          `${scenarioName}: state.loadedReferences requires a command with a core/commands contract, got: ${scenario.state.requestedCommand || "<missing>"}`,
        );
      }
    }
    if (Object.hasOwn(scenario.state, "cleanOperation")) {
      if (scenario.state.requestedCommand !== "clean") {
        failures.push(
          `${scenarioName}: state.cleanOperation applies only to clean scenarios`,
        );
      }
      const deletionTargets = scenario.state.cleanOperation?.deletionTargets;
      if (
        !isObject(scenario.state.cleanOperation) ||
        !Array.isArray(deletionTargets) ||
        deletionTargets.length === 0 ||
        deletionTargets.some(
          (target) =>
            !isObject(target) ||
            typeof target.branch !== "string" ||
            target.branch.length === 0 ||
            typeof target.merged !== "boolean",
        )
      ) {
        failures.push(
          `${scenarioName}: state.cleanOperation.deletionTargets must be a non-empty array of { branch: string, merged: boolean }`,
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
            const valuePattern = new RegExp(`:\\s*"[^"]*${escapeRegExp(pattern)}[^"]*"`);
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
  const invalidLoadedReferences = validateFixture({
    version: 1,
    scenarios: [
      {
        name: "invalid-loaded-references",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
          requestedCommand: "getwiki",
          loadedReferences: ["wiki-context-preflight.md"],
        },
        expect: {
          decision: "wiki_readonly_delegate",
          loadedReferencesMatchContract: "true",
        },
      },
      {
        name: "invalid-clean-operation",
        invariant: "self-test",
        state: {
          cwdRepo: "JeremyDev87/ddalggak",
          targetRepo: "JeremyDev87/ddalggak",
          requestedCommand: "status",
          cleanOperation: { deletionTargets: [] },
        },
        expect: { decision: "ready_for_issue_pr" },
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
    ],
  });
  if (
    !invalidMutation.some((failure) => failure.includes("unknown mutation")) ||
    !invalidOutput.some((failure) => failure.includes("unknown output section")) ||
    !invalidLoadedReferences.some((failure) =>
      failure.includes("requires a command with a core/commands contract"),
    ) ||
    !invalidLoadedReferences.some((failure) =>
      failure.includes("applies only to clean scenarios"),
    ) ||
    !invalidLoadedReferences.some((failure) =>
      failure.includes("deletionTargets must be a non-empty array"),
    ) ||
    !invalidLoadedReferences.some((failure) =>
      failure.includes(
        "loadedReferencesMatchContract must be boolean true when present",
      ),
    )
  ) {
    console.error("[eval:ddalggak-readiness:self-test] failed");
    console.error(
      "- expected known-bad fixture validation to reject unknown mutation, output section, contract-less loadedReferences, and malformed cleanOperation fields",
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
