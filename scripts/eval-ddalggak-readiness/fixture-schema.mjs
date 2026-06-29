// Fixture schema and privacy validation for ddalggak readiness eval fixtures.
import { escapeRegExp } from "../lib/escape-regexp.mjs";
import {
  READINESS_DECISIONS,
  array,
  commandContracts,
  isObject,
  knownOutputSections,
  mutationKinds,
  repoFromGitHubUrl,
} from "./policy.mjs";

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

export function validateFixture(fixture) {
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
