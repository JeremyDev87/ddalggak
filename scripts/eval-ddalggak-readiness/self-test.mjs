// Known-good/known-bad self-test for the readiness fixture validator.
import process from "node:process";

import { validateFixture } from "./fixture-schema.mjs";

export function runFixtureValidationSelfTest() {
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
          requestedCommand: "imaginary-command",
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runFixtureValidationSelfTest();
}
