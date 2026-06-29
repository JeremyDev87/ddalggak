// Readiness eval policy engine: command contracts, scenario decisions, and decision metadata.
import process from "node:process";

import { loadCommandContracts as loadCoreCommandContracts } from "../../bin/lib/command-contracts.mjs";

export const rootDir = process.cwd();
export const mutationKinds = [
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

export const knownOutputSections = new Set([
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


export const READINESS_DECISIONS = Object.freeze({
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

export function decisionOutcome(decision, outcomeOverride = {}) {
  const registered = READINESS_DECISIONS[decision];
  if (!registered) {
    console.error(`[eval:ddalggak-readiness] unregistered decision code: ${decision}`);
    process.exit(1);
  }
  return { ...registered, ...outcomeOverride };
}

export function array(value) {
  return Array.isArray(value) ? value : [];
}

export function isObject(value) {
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

export const commandContracts = loadCommandContracts();
const sourceEditAllowedCommands = new Set(
  [...commandContracts.values()]
    .filter((contract) => contract.sourceEditAllowed === true)
    .map((contract) => contract.command),
);

export function repoFromGitHubUrl(url) {
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

export function hasSuccessfulChecks(pullRequest) {
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

export function missingOutputSections(state, requiredSections) {
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

export function decideScenario(scenario) {
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
