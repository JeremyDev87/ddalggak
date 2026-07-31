import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  evaluateReviewQuality,
  isContentLightNarrative,
  parseReviewQualityJson,
  validateReviewQualityFixture,
} from "./eval-review-quality/scorer.mjs";
import { requiredPackageFiles } from "../core/verification/manifests/package-files.mjs";

const root = process.cwd();
const fixturePath = `${root}/evals/review-quality/cases.json`;
const fixtureText = readFileSync(fixturePath, "utf8");
const fixture = parseReviewQualityJson(fixtureText);

const failures = validateReviewQualityFixture(fixture);
assert.deepEqual(failures, [], `fixture schema failures:\n${failures.join("\n")}`);

const result = evaluateReviewQuality(fixture);
assert.equal(result.pass, true, result.failures.join("\n"));
assert.equal(result.metrics.totalCases, 12);
assert.equal(result.metrics.seededDefects, 8);
assert.equal(result.metrics.cleanControls, 2);
assert.equal(result.metrics.admissionBlockers, 2);
assert.equal(result.metrics.criticalHighRecall, 1);
assert.equal(result.metrics.cleanControlBlockingFalsePositiveRate, 0);
assert.equal(result.metrics.actionableFindingRate, 1);

for (const relativePath of [
  "ddalggak/references/review-quality-contract.md",
  ".codex/skills/ddalggak/references/review-quality-contract.md",
]) {
  const text = readFileSync(`${root}/${relativePath}`, "utf8");
  for (const marker of [
    "## Review Intake",
    "## Semantic Coverage",
    "## Counterexample Pass",
    "## Finding Contract",
    "## Stable Verdict Vocabulary",
  ]) {
    assert(text.includes(marker), `${relativePath}: missing ${marker}`);
  }
}

const command = readFileSync(`${root}/core/commands/review.yaml`, "utf8");
assert(command.includes("  - review-quality-contract.md\n"));

for (const runtimeRoot of ["ddalggak", ".codex/skills/ddalggak"]) {
  for (const reference of [
    "ci-failure-triage-loop.md",
    "human-review-feedback-loop.md",
    "regression-library.md",
    "security-posture-gate.md",
  ]) {
    const packagedPath = `${runtimeRoot}/references/${reference}`;
    assert(requiredPackageFiles.includes(packagedPath), `${packagedPath}: conditional review reference must remain packaged`);
  }
}

const sessionStateSchema = JSON.parse(readFileSync(`${root}/core/state/session-state.schema.json`, "utf8"));
assert.deepEqual(
  sessionStateSchema.properties.lanes.items.properties.review.properties.final_verdict.enum,
  ["none", "approve", "change request", "comment", "blocked"],
  "session state must persist the Review v2 verdict without conflating GitHub conclusion",
);

const stale = structuredClone(fixture);
stale.cases[0].observed.reviewedHead = "f".repeat(40);
assert.equal(evaluateReviewQuality(stale).pass, false, "stale-head mutation must fail");

const missed = structuredClone(fixture);
missed.cases.find((entry) => entry.kind === "seeded-defect").observed.findings = [];
assert.equal(evaluateReviewQuality(missed).pass, false, "missed seeded defect must fail");

const falsePositive = structuredClone(fixture);
falsePositive.cases.find((entry) => entry.kind === "clean-control").observed.findings.push({
  id: "invented-blocker",
  severity: "high",
  claim: "Invented blocker",
  path: "src/clean.js",
  line: 1,
  failingScenario: "No reproducible failure exists.",
  impact: "Would block a valid change.",
  minimalFix: "None.",
  confidence: "low",
  counterevidenceChecked: "Clean control evidence.",
});
assert.equal(evaluateReviewQuality(falsePositive).pass, false, "clean-control blocker must fail");

const nonActionable = structuredClone(fixture);
delete nonActionable.cases.find((entry) => entry.kind === "seeded-defect").observed.findings[0].minimalFix;
assert.equal(evaluateReviewQuality(nonActionable).pass, false, "non-actionable finding must fail");

const rawPayload = structuredClone(fixture);
rawPayload.cases[0].observed.rawPrompt = "forbidden";
assert.equal(evaluateReviewQuality(rawPayload).pass, false, "raw payload field must fail");

const harmlessUnknown = structuredClone(fixture);
harmlessUnknown.cases[0].observed.reviewNotes = "harmless prose still exceeds the content-light schema";
assert.equal(evaluateReviewQuality(harmlessUnknown).pass, false, "unknown observation fields must fail closed");

const missingOwner = structuredClone(fixture);
delete missingOwner.cases.find((entry) => entry.riskTier === "critical" && entry.observed.intakeDecision === "ready-for-review").observed.humanOwner;
assert.equal(evaluateReviewQuality(missingOwner).pass, false, "ready High/Critical review must require a human owner");

const cleanMediumFalsePositive = structuredClone(fixture);
cleanMediumFalsePositive.cases.find((entry) => entry.kind === "clean-control").observed.findings.push({
  id: "invented-medium",
  severity: "medium",
  claim: "Invented non-blocking defect",
  path: "src/clean.js",
  line: 1,
  failingScenario: "No reproducible failure exists.",
  impact: "Would pollute a clean-control review.",
  minimalFix: "None.",
  confidence: "low",
  counterevidenceChecked: "Clean-control evidence.",
});
assert.equal(evaluateReviewQuality(cleanMediumFalsePositive).pass, false, "all clean-control findings must count as false positives");

const missingBlockerReason = structuredClone(fixture);
delete missingBlockerReason.cases.find((entry) => entry.kind === "admission-blocker").observed.blockerReason;
assert.equal(evaluateReviewQuality(missingBlockerReason).pass, false, "blocked intake must include a reason");

const blockedWithFinding = structuredClone(fixture);
blockedWithFinding.cases.find((entry) => entry.kind === "admission-blocker").observed.findings.push({
  id: "invented-blocker",
  severity: "high",
  claim: "Invented blocker before semantic review",
  path: "src/unknown.js",
  line: 1,
  failingScenario: "No review-ready intent or evidence exists.",
  impact: "Could block a valid change without review admission.",
  minimalFix: "Remove the finding and report only the intake blocker.",
  confidence: "low",
  counterevidenceChecked: "No semantic review was admitted.",
});
assert.equal(evaluateReviewQuality(blockedWithFinding).pass, false, "non-ready intake must reject manufactured findings");

const incompleteTopology = structuredClone(fixture);
incompleteTopology.cases = incompleteTopology.cases.filter((entry) => entry.id !== "seed-auth-short-circuit");
assert.equal(evaluateReviewQuality(incompleteTopology).pass, false, "required seeded topology deletion must fail");

const rewrittenExpectation = structuredClone(fixture);
const rewrittenCase = rewrittenExpectation.cases.find((entry) => entry.id === "seed-auth-short-circuit");
rewrittenCase.expected.findings[0].id = "renamed-away-critical-defect";
rewrittenCase.observed.findings[0].id = "renamed-away-critical-defect";
assert.equal(evaluateReviewQuality(rewrittenExpectation).pass, false, "immutable seeded identities must reject coordinated expectation rewrites");

for (const value of ["Cookie: session=synthetic-value", "⁄Users⁄alice⁄private.txt"]) {
  const unsafeDescription = structuredClone(fixture);
  unsafeDescription.description = value;
  assert.equal(evaluateReviewQuality(unsafeDescription).pass, false, "digest-external unsafe description must fail closed");
}

for (const [label, mutate] of [
  ["provider token", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = `Bearer ghp_${"a".repeat(36)}`; }],
  ["labeled short credential", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "Authorization: Basic x"; }],
  ["password assignment", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "password=x"; }],
  ["session cookie assignment", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "Cookie: session=synthetic-value"; }],
  ["slash-confusable POSIX path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "⁄Users⁄alice⁄private.txt"; }],
  ["POSIX absolute path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "/秘密/結果.json"; }],
  ["file URI", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "file:///Users/alice/private/evidence.txt"; }],
  ["Windows absolute path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "C:\\Users\\alice\\private.txt"; }],
  ["Windows rooted path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "\\Users\\alice\\private.txt"; }],
  ["UNC path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "\\\\server\\share\\private.txt"; }],
  ["quoted authorization", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = '\"Authorization\":\"Basic x\"'; }],
  ["quoted absolute path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = 'artifact=\"/opt/private/result.json\"'; }],
  ["HTTPS token query", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/evidence?token=x"; }],
  ["HTTPS secret query", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "source=https://example.test/evidence&secret=x"; }],
  ["HTTPS userinfo", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://alice:pw@example.test/private/result.json"; }],
  ["double-encoded query label", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e?%2574oken=x"; }],
  ["double-encoded bearer value", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e?q=%2542earer%2520x"; }],
  ["double-encoded fragment credential", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e#Authorization%253ABasic%2520x"; }],
  ["nested URL userinfo", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e?next=https%3A%2F%2Falice%3Apw%40inner.test%2Fprivate"; }],
  ["encoded URL path traversal", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/a/%2e%2e/private/result.json"; }],
  ["encoded POSIX path in URL path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/%2FUsers%2Falice%2Fprivate.txt"; }],
  ["encoded file URI in URL path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/file%3A%2F%2F%2FUsers%2Falice%2Fprivate.txt"; }],
  ["encoded Windows path in URL path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/C%3A%5CUsers%5Calice%5Cprivate.txt"; }],
  ["encoded UNC path in URL path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/%5C%5Cserver%5Cshare%5Cprivate.txt"; }],
  ["encoded nested userinfo in URL path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/https%3A%2F%2Falice%3Apw%40inner.test%2Fprivate"; }],
  ["encoded data URI in URL path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/data%3Atext%2Fplain%2Cprivate"; }],
  ["literal URL path traversal", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/a/../private/result.json"; }],
  ["backslash URL path traversal", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = String.raw`https://example.test\a\..\private\result.json`; }],
  ["tab-obfuscated URL userinfo", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://ali\tce:pw@example.test/evidence"; }],
  ["line-feed-obfuscated URL traversal", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/a/.\n./private/result.json"; }],
  ["carriage-return-obfuscated backslash traversal", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test\\a\\.\r.\\private\\result.json"; }],
  ["embedded NUL", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "public\u0000private"; }],
  ["embedded DEL", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "public\u007fprivate"; }],
  ["Unicode line separator", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "public\u2028private"; }],
  ["percent-encoded control", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/a/.%09./private/result.json"; }],
  ["malformed-plus-encoded private path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "%ZZ%2FUsers%2Falice%2Fprivate.txt"; }],
  ["malformed-plus-encoded control", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "%ZZpublic%00private"; }],
  ["malformed-plus-encoded credential label", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e?%ZZ%2574oken=x"; }],
  ["malformed-only credential delimiter", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "token%2G=supersecretvalue"; }],
  ["malformed-only URL query label", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e?token%2G=supersecretvalue"; }],
  ["six-layer malformed credential boundary", (candidate) => {
    let value = "token%2G=supersecretvalue";
    for (let depth = 0; depth < 6; depth += 1) value = encodeURIComponent(value);
    candidate.cases[0].observed.coverage[0].evidence = value;
  }],
  ["array credential query label", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e?token%5B%5D=x"; }],
  ["indexed credential query label", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "https://example.test/e?access_token%5B0%5D=x"; }],
  ["NFKC private path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "／Users／alice／private.txt"; }],
  ["NFKC credential narrative", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "Ａｕｔｈｏｒｉｚａｔｉｏｎ：Ｂａｓｉｃ x"; }],
  ["bracketed absolute path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "[/opt/private/result.json]"; }],
  ["braced Windows rooted path", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "{\\Windows\\System32\\private.txt}"; }],
  ["encoded traversal", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "%2e%2e/private/result.json"; }],
  ["finding path traversal", (candidate) => { candidate.cases[0].observed.findings[0].path = "../../private/file.js"; }],
  ["overlong narrative", (candidate) => { candidate.cases[0].observed.coverage[0].evidence = "x".repeat(1001); }],
]) {
  const candidate = structuredClone(fixture);
  mutate(candidate);
  assert.equal(evaluateReviewQuality(candidate).pass, false, `${label} must fail closed`);
}

for (const value of [
  "Focused test output confirmed the expected branch.",
  "검토 근거는 공개된 합성 예시입니다.",
  "Ｆｏｃｕｓｅｄ public evidence remains safe.",
  "Malformed %ZZ prose without encoded octets remains non-sensitive.",
  "Session review completed without storing credential material.",
  "The ratio is 1⁄2 for this synthetic control.",
  "See https://example.test/evidence?page=1 for provider-neutral evidence.",
  "See https://example.test/evidence?q=hello%20world#section for encoded public evidence.",
  "See https://example.test/evidence?coverage=100%25 for a valid encoded percent.",
  "See https://example.test/evidence?next=https%3A%2F%2Fexample.test%2Fsafe for nested public evidence.",
  "See https://example.test/evidence?filter%5Btag%5D=public for a non-sensitive array query.",
]) {
  assert.equal(isContentLightNarrative(value), true, "clean narrative controls must remain accepted");
}
for (const value of [
  '"Authorization":"Basic x"',
  "Cookie: session=synthetic-value",
  "Set-Cookie：session_id=synthetic-value",
  "s.e.s.s.i.o.n=synthetic-value",
  "⁄Users⁄alice⁄private.txt",
  "∕private∕tmp∕evidence.txt",
  "⧸home⧸alice⧸private.txt",
  'artifact="/opt/private/result.json"',
  "https://example.test/evidence?token=x",
  "source=https://example.test/evidence&secret=x",
  "https://alice:pw@example.test/private/result.json",
  "https://example.test/e?%2574oken=x",
  "https://example.test/e?q=%2542earer%2520x",
  "https://example.test/e#Authorization%253ABasic%2520x",
  "https://example.test/e?next=https%3A%2F%2Falice%3Apw%40inner.test%2Fprivate",
  "https://example.test/a/%2e%2e/private/result.json",
  "https://example.test/a/../private/result.json",
  String.raw`https://example.test\a\..\private\result.json`,
  "https://ali\tce:pw@example.test/evidence",
  "https://example.test/a/.\n./private/result.json",
  "https://example.test\\a\\.\r.\\private\\result.json",
  "public\u0000private",
  "public\u007fprivate",
  "Authoriz\u200Bation: Basic x",
  "public\u2028private",
  "https://example.test/a/.%09./private/result.json",
  "public%00private",
  "public%E2%80%A8private",
  "%ZZ%2FUsers%2Falice%2Fprivate.txt",
  "%ZZpublic%00private",
  "https://example.test/e?%ZZ%2574oken=x",
  "https://example.test/e?token%5B%5D=x",
  "https://example.test/e?access_token%5B0%5D=x",
  "／Users／alice／private.txt",
  "Ａｕｔｈｏｒｉｚａｔｉｏｎ：Ｂａｓｉｃ x",
  "[/opt/private/result.json]",
  "{/opt/private/result.json}",
  ",/opt/private/result.json",
  "{\\Windows\\System32\\private.txt}",
  "[\\\\server\\share\\private.txt]",
  "%2e%2e/private/result.json",
]) {
  assert.equal(isContentLightNarrative(value), false, "hostile narrative variants must fail independently of corpus digest");
}

const noEchoSentinel = `github_pat_${"z".repeat(30)}`;
const noEcho = structuredClone(fixture);
noEcho.cases[0].observed.verdict = noEchoSentinel;
noEcho.cases[0].observed[noEchoSentinel] = "private";
const noEchoResult = evaluateReviewQuality(noEcho);
assert.equal(noEchoResult.pass, false, "invalid private-looking values must fail closed");
assert.equal(noEchoResult.failures.join("\n").includes(noEchoSentinel), false, "privacy failures must not echo candidate-owned values");

const duplicateObservedFinding = structuredClone(fixture);
duplicateObservedFinding.cases[0].observed.findings.push(structuredClone(duplicateObservedFinding.cases[0].observed.findings[0]));
assert.equal(evaluateReviewQuality(duplicateObservedFinding).pass, false, "duplicate observed finding IDs must fail closed");

const duplicateCoverageCriterion = structuredClone(fixture);
duplicateCoverageCriterion.cases[0].observed.coverage.push(structuredClone(duplicateCoverageCriterion.cases[0].observed.coverage[0]));
assert.equal(evaluateReviewQuality(duplicateCoverageCriterion).pass, false, "duplicate semantic coverage criteria must fail closed");

for (const rewrite of [(value) => `${value} `, (value) => ` ${value}`, (value) => value.toUpperCase()]) {
  const candidate = structuredClone(fixture);
  const duplicate = structuredClone(candidate.cases[0].observed.coverage[0]);
  duplicate.criterion = rewrite(duplicate.criterion);
  candidate.cases[0].observed.coverage.push(duplicate);
  assert.equal(evaluateReviewQuality(candidate).pass, false, "semantic criterion duplicates must fail closed");
}

const sparseObservedFinding = structuredClone(fixture);
sparseObservedFinding.cases[0].observed.findings.length += 1;
assert.doesNotThrow(() => evaluateReviewQuality(sparseObservedFinding), "sparse observed findings must not crash the scorer");
assert.equal(evaluateReviewQuality(sparseObservedFinding).pass, false, "sparse observed findings must fail closed");

const coordinatedHeadRewrite = structuredClone(fixture);
coordinatedHeadRewrite.cases[0].currentHead = "f".repeat(40);
coordinatedHeadRewrite.cases[0].observed.reviewedHead = "f".repeat(40);
assert.equal(evaluateReviewQuality(coordinatedHeadRewrite).pass, false, "coordinated head rewrites must fail closed");

const coordinatedSemanticRewrite = structuredClone(fixture);
const semanticCase = coordinatedSemanticRewrite.cases[0];
Object.assign(semanticCase.observed.coverage[0], {
  criterion: "Unrelated valid criterion",
  changedSurface: "Unrelated surface",
  callerImpact: "Unrelated caller",
  failureMode: "Unrelated failure",
  evidence: "Unrelated synthetic evidence",
});
Object.assign(semanticCase.observed.findings[0], {
  claim: "Unrelated claim",
  path: "src/unrelated.js",
  line: 7,
  failingScenario: "Unrelated scenario",
  impact: "Unrelated impact",
  minimalFix: "Unrelated fix",
  counterevidenceChecked: "Unrelated counterevidence",
});
assert.equal(evaluateReviewQuality(coordinatedSemanticRewrite).pass, false, "coordinated semantic rewrites must fail closed");

const duplicateKeySentinel = "private-duplicate-key-sentinel";
const duplicateJson = fixtureText.replace(
  '"version": 1,',
  `"version": 1, "${duplicateKeySentinel}": 1, "${duplicateKeySentinel}": 2,`,
);
assert.throws(
  () => parseReviewQualityJson(duplicateJson),
  (error) => error.message.includes("duplicate object key") && !error.message.includes(duplicateKeySentinel),
  "duplicate JSON keys must fail without echoing candidate-owned key text",
);

console.log("[test:review-quality-eval] passed");
