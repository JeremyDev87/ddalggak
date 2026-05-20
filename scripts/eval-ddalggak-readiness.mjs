import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const defaultFixturePath = path.join(rootDir, "evals", "ddalggak-readiness", "fixtures.json");
const fixturePath = process.argv[2] ? path.resolve(process.argv[2]) : defaultFixturePath;

const mutationKinds = [
  "create_branch",
  "push_branch",
  "create_pr",
  "create_comment",
  "approve_pr",
  "mark_ready",
];

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
  const issueNumbers = new Set(array(state.openIssues).map((issue) => issue.number));
  return array(state.openPullRequests).some((pullRequest) =>
    array(pullRequest.closingIssues).some((issueNumber) => issueNumbers.has(issueNumber))
  );
}

function hasPriorParsedComment(state) {
  const issueNumbers = new Set(array(state.openIssues).map((issue) => issue.number));
  return array(state.priorComments).some(
    (comment) => issueNumbers.has(comment.issue) && comment.marker === "ddalggak:parsed"
  );
}

function missingRequiredEvidence(pullRequest) {
  const provided = new Set(array(pullRequest?.providedEvidence));
  return array(pullRequest?.requiredEvidence).filter((item) => !provided.has(item));
}

function hasSuccessfulChecks(pullRequest) {
  const checks = array(pullRequest?.checks);
  return checks.length > 0 && checks.every((check) => check.conclusion === "success" || check.conclusion === "skipped");
}

function hasHardConflict(state) {
  return array(state.openIssues).some((issue) => issue.conflict?.hard === true);
}

function result({ decision, prStrategy, readyAllowed, approveAllowed, allowedMutations, reasons }) {
  return { decision, prStrategy, readyAllowed, approveAllowed, allowedMutations: [...allowedMutations], reasons };
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
      `Mutation stopped because cwdRepo=${state.cwdRepo || "<missing>"}, targetRepo=${state.targetRepo || "<missing>"}, targetUrlRepo=${urlRepo || "<none>"}; URL beats cwd.`
    );
    return result({ decision, prStrategy, readyAllowed, approveAllowed, allowedMutations, reasons });
  }

  if (array(state.openIssues).length === 0 && state.requestedCommand === "start") {
    decision = "no_work";
    prStrategy = "none";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.clear();
    reasons.push("No open issue exists, so start must not invent work or mutate GitHub state.");
    return result({ decision, prStrategy, readyAllowed, approveAllowed, allowedMutations, reasons });
  }

  if (hasExistingIssuePr(state) || hasPriorParsedComment(state)) {
    decision = "duplicate_suppressed";
    prStrategy = "existing_pr";
    allowedMutations.clear();
    readyAllowed = false;
    approveAllowed = false;
    reasons.push("Existing issue PR or parsed marker found; duplicate PR/comment creation is forbidden.");
    return result({ decision, prStrategy, readyAllowed, approveAllowed, allowedMutations, reasons });
  }

  if (hasHardConflict(state)) {
    decision = "hard_conflict_blocked";
    prStrategy = "blocked_or_single_pr_conflict_fallback";
    readyAllowed = false;
    approveAllowed = false;
    allowedMutations.delete("create_pr");
    allowedMutations.delete("approve_pr");
    allowedMutations.delete("mark_ready");
    reasons.push("Hard conflict requires blocked/fallback classification, not a default independent PR.");
    return result({ decision, prStrategy, readyAllowed, approveAllowed, allowedMutations, reasons });
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
    return result({ decision, prStrategy, readyAllowed, approveAllowed, allowedMutations, reasons });
  }

  return result({ decision, prStrategy, readyAllowed, approveAllowed, allowedMutations, reasons });
}

function sorted(value) {
  return [...value].sort();
}

function compareScenario(scenario, actual) {
  const failures = [];
  const expected = scenario.expect || {};

  for (const key of ["decision", "prStrategy", "readyAllowed", "approveAllowed"]) {
    if (Object.hasOwn(expected, key) && actual[key] !== expected[key]) {
      failures.push(`${key}: expected ${JSON.stringify(expected[key])}, got ${JSON.stringify(actual[key])}`);
    }
  }

  if (Object.hasOwn(expected, "allowedMutations")) {
    const expectedMutations = sorted(expected.allowedMutations);
    const actualMutations = sorted(actual.allowedMutations);
    if (JSON.stringify(actualMutations) !== JSON.stringify(expectedMutations)) {
      failures.push(
        `allowedMutations: expected ${JSON.stringify(expectedMutations)}, got ${JSON.stringify(actualMutations)}`
      );
    }
  }

  if (Object.hasOwn(expected, "forbiddenMutations")) {
    const actualMutations = new Set(actual.allowedMutations);
    const violations = expected.forbiddenMutations.filter((mutation) => actualMutations.has(mutation));
    if (violations.length > 0) {
      failures.push(`forbiddenMutations still allowed: ${JSON.stringify(violations)}`);
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
        failures.push(`${scenarioName}: unknown mutation in expect.${key}: ${mutation}`);
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
    if (scenario.state.targetUrl && repoFromGitHubUrl(scenario.state.targetUrl) === null) {
      failures.push(`${scenarioName}: targetUrl must be a github.com owner/repo URL`);
    }
    validateMutationList(scenarioName, scenario.expect, "allowedMutations", failures);
    validateMutationList(scenarioName, scenario.expect, "forbiddenMutations", failures);
  }
  return failures;
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
      console.log(`[PASS] ${scenario.name} (${scenario.invariant}) -> ${actual.decision}`);
    } else {
      failures.push(
        `${scenario.name} (${scenario.invariant}) failed:\n${scenarioFailures
          .map((failure) => `  - ${failure}`)
          .join("\n")}\n  reasons: ${actual.reasons.join(" | ") || "<none>"}`
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

console.log(`\n[eval:ddalggak-readiness] passed ${passed}/${fixture.scenarios.length} scenarios`);
