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

import {
  array,
  commandContracts,
  decideScenario,
  isObject,
  missingOutputSections,
} from "./eval-ddalggak-readiness/policy.mjs";
import { validateFixture } from "./eval-ddalggak-readiness/fixture-schema.mjs";
import { runFixtureValidationSelfTest } from "./eval-ddalggak-readiness/self-test.mjs";

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

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
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
