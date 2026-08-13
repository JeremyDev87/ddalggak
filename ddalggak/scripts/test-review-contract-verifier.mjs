#!/usr/bin/env node

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const tempRoot = mkdtempSync(join(tmpdir(), "ddalggak-review-contract-"));
const candidateRoot = join(tempRoot, "ddalggak");

function run(root, script) {
  return spawnSync(process.execPath, [join(root, "scripts", script)], { cwd: root, encoding: "utf8" });
}

function runGate(root) {
  const verifier = run(root, "verify-review-contract.mjs");
  const layers = run(root, "test-review-policy-layers.mjs");
  return {
    passed: verifier.status === 0 && layers.status === 0,
    output: `${verifier.stdout}${verifier.stderr}${layers.stdout}${layers.stderr}`.trim(),
  };
}

function resetCandidate() {
  rmSync(candidateRoot, { recursive: true, force: true });
  cpSync(sourceRoot, candidateRoot, { recursive: true });
}

function applyMutation(name, file, oldText, newText) {
  const path = join(candidateRoot, file);
  const source = readFileSync(path, "utf8");
  const occurrences = source.split(oldText).length - 1;
  if (occurrences !== 1) throw new Error(`MUTATION_NOT_APPLIED ${name} (${file}): expected one semantic chokepoint, found ${occurrences}`);
  const mutated = source.replace(oldText, newText);
  if (mutated === source) throw new Error(`MUTATION_NOT_APPLIED ${file}: unchanged`);
  writeFileSync(path, mutated);
  if (readFileSync(path, "utf8") === source) throw new Error(`MUTATION_NOT_APPLIED ${file}: readback unchanged`);
}

const mutations = [
  {
    name: "lifecycle contract anchor",
    file: "references/cross-review-loop.md",
    oldText: "## Lifecycle gate",
    newText: "## Lifecycle",
  },
  {
    name: "merged lifecycle branch",
    file: "scripts/review-contract-policy.mjs",
    oldText: '} else if (input.lifecycle === "MERGED") {',
    newText: '} else if (input.lifecycle === "OPEN") {',
  },
  {
    name: "subreview requires conductor promotion",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (record.authority === "SUBREVIEW") {',
    newText: 'if (false && record.authority === "SUBREVIEW") {',
  },
  {
    name: "accepted decision DROP",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (facts.priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && !unresolvedBlockingEvidence) return finalize(record, "DROP", false);',
    newText: 'if (facts.priorDecision === "__DISABLED__" && !unresolvedBlockingEvidence) return finalize(record, "DROP", false);',
  },
  {
    name: "accepted decision cannot bypass unresolved evidence",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (facts.priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && !unresolvedBlockingEvidence) return finalize(record, "DROP", false);',
    newText: 'if (facts.priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE") return finalize(record, "DROP", false);',
  },
  {
    name: "unknown prior decision blocks publication",
    file: "scripts/review-contract-policy.mjs",
    oldText: '    facts.priorDecision,\n',
    newText: "",
  },
  {
    name: "required process evidence blocks review",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (facts.observedDelta === "PROCESS_GAP" && facts.governingContract === "PROVEN") return finalize(record, "REVIEW_BLOCKED", false);',
    newText: 'if (false && facts.observedDelta === "PROCESS_GAP" && facts.governingContract === "PROVEN") return finalize(record, "REVIEW_BLOCKED", false);',
  },
  {
    name: "accepted decision worsening contradiction",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && (baseState === "WORSENED_OR_EXPOSED" || diffCausality === "WORSENED")) {',
    newText: 'if (false && priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && (baseState === "WORSENED_OR_EXPOSED" || diffCausality === "WORSENED")) {',
  },
  {
    name: "accepted decision proven-counterevidence contradiction",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && counterargumentDisproof === "PROVEN") {',
    newText: 'if (false && priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && counterargumentDisproof === "PROVEN") {',
  },
  {
    name: "base unchanged DROP",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'facts.baseState === "UNCHANGED" && facts.scopeRelation === "OUT_OF_SCOPE" && facts.diffCausality === "UNCHANGED"',
    newText: 'facts.baseState === "ABSENT" && facts.scopeRelation === "OUT_OF_SCOPE" && facts.diffCausality === "UNCHANGED"',
  },
  {
    name: "current-head evidence requirement",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'facts.currentHeadEvidence === "PROVEN" &&',
    newText: 'facts.currentHeadEvidence !== "NOT_APPLICABLE" &&',
  },
  {
    name: "privacy surface DROP",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (facts.observedDelta === "PRIVACY_SURFACE_ONLY" && facts.governingContract !== "PROVEN") return finalize(record, "DROP", false);',
    newText: 'if (facts.observedDelta === "__DISABLED__" && facts.governingContract !== "PROVEN") return finalize(record, "DROP", false);',
  },
  {
    name: "review evidence aggregate blocker",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (input.reviewEvidence.requiredEvidenceMissing || !input.reviewEvidence.substantiveReview || !checksAdmissible || hasReviewBlocker) {',
    newText: 'if (!input.reviewEvidence.substantiveReview || !checksAdmissible || hasReviewBlocker) {',
  },
  {
    name: "review evidence same-process producer provenance",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!producedReviewEvidence.has(input.reviewEvidence)) throw new Error("review evidence lacks evaluator provenance");',
    newText: 'if (false && !producedReviewEvidence.has(input.reviewEvidence)) throw new Error("review evidence lacks evaluator provenance");',
  },
  {
    name: "review evidence lifecycle revision binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (input.reviewEvidence.lifecycle !== input.lifecycle) throw new Error("review evidence lifecycle does not match aggregate lifecycle");',
    newText: 'if (false && input.reviewEvidence.lifecycle !== input.lifecycle) throw new Error("review evidence lifecycle does not match aggregate lifecycle");',
  },
  {
    name: "checks pr_number revision binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of ["pr_number", "lifecycle", "base_sha", "head_sha"]) {',
    newText: 'for (const key of ["lifecycle", "base_sha", "head_sha"]) {',
  },
  {
    name: "checks lifecycle revision binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of ["pr_number", "lifecycle", "base_sha", "head_sha"]) {',
    newText: 'for (const key of ["pr_number", "base_sha", "head_sha"]) {',
  },
  {
    name: "checks base_sha revision binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of ["pr_number", "lifecycle", "base_sha", "head_sha"]) {',
    newText: 'for (const key of ["pr_number", "lifecycle", "head_sha"]) {',
  },
  {
    name: "checks head_sha revision binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of ["pr_number", "lifecycle", "base_sha", "head_sha"]) {',
    newText: 'for (const key of ["pr_number", "lifecycle", "base_sha"]) {',
  },
  {
    name: "candidate review revision binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (candidate.pr_number !== input.reviewEvidence.pr_number || candidate.base_sha !== input.reviewEvidence.base_sha || candidate.head_sha !== input.reviewEvidence.head_sha) {',
    newText: 'if (false && (candidate.pr_number !== input.reviewEvidence.pr_number || candidate.base_sha !== input.reviewEvidence.base_sha || candidate.head_sha !== input.reviewEvidence.head_sha)) {',
  },
  {
    name: "renderer publication decision authority",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!producedPublicationDecisions.has(publicationDecision) || !publicationDecision.publicationEligible) throw new Error("eligible publication decision is required");',
    newText: 'if (!publicationDecision?.publicationEligible) throw new Error("eligible publication decision is required");',
  },
  {
    name: "semantic GAP derivation",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (row.verdict === "GAP" || evidenceState !== "PROVEN") evidenceGapCount += 1;',
    newText: 'if (evidenceState !== "PROVEN") evidenceGapCount += 1;',
  },
  {
    name: "counterexample violation-pass blocker",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (derivedStatus !== "PASSED") evidenceGapCount += 1;',
    newText: 'if (false && derivedStatus !== "PASSED") evidenceGapCount += 1;',
  },
  {
    name: "counterexample status/actual coherence",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (record.counterexample.status !== derivedStatus) throw new Error("counterexample status contradicts actual result");',
    newText: 'if (false && record.counterexample.status !== derivedStatus) throw new Error("counterexample status contradicts actual result");',
  },
  {
    name: "counterexample restoration proof blocker",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (restorationState !== "PROVEN") evidenceGapCount += 1;',
    newText: 'if (false && restorationState !== "PROVEN") evidenceGapCount += 1;',
  },
  {
    name: "review evidence schema file-local anchor",
    file: "references/cross-review-loop.md",
    oldText: "## Review evidence schema v3",
    newText: "## Review evidence",
  },
  {
    name: "delegated review brief authority anchor",
    file: "references/cross-review-loop.md",
    oldText: "## Review brief",
    newText: "## Delegated notes",
  },
  {
    name: "candidate same-process producer provenance",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!producedCandidates.has(candidate)) throw new Error("candidate lacks evaluator provenance");',
    newText: 'if (false && !producedCandidates.has(candidate)) throw new Error("candidate lacks evaluator provenance");',
  },
  {
    name: "duplicate candidate identity rejection",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (candidateIds.has(candidate.candidate_id)) throw new Error(`duplicate candidate_id: ${candidate.candidate_id}`);',
    newText: 'if (false && candidateIds.has(candidate.candidate_id)) throw new Error(`duplicate candidate_id: ${candidate.candidate_id}`);',
  },
  {
    name: "finding aggregate-member provenance",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!aggregateMembers.get(aggregate)?.has(input.candidate)) throw new Error("candidate is not a member of aggregate");',
    newText: 'if (false && !aggregateMembers.get(input.aggregate)?.has(input.candidate)) throw new Error("candidate is not a member of aggregate");',
  },
  {
    name: "exact evidence-gap cardinality",
    file: "scripts/review-contract-policy.mjs",
    oldText: '    + input.candidates.filter((candidate) => candidate.disposition === "REVIEW_BLOCKED").length\n',
    newText: '    + Number(hasReviewBlocker)\n',
  },
  {
    name: "aggregate result immutability",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  Object.freeze(result.counts);\n  Object.freeze(result);\n  producedAggregates.add(result);\n',
    newText: '  Object.freeze(result.counts);\n  producedAggregates.add(result);\n',
  },
  {
    name: "aggregate counts immutability",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  Object.freeze(result.counts);\n',
    newText: "",
  },
  {
    name: "rendered evidence-gap coherence",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (evidenceGapCount !== aggregate.evidenceGapCount) throw new Error("evidenceGapCount does not match aggregate");',
    newText: 'if (false && evidenceGapCount !== aggregate.evidenceGapCount) throw new Error("evidenceGapCount does not match aggregate");',
  },
  {
    name: "not-applicable checks justification",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (record.status === "NOT_APPLICABLE") validateSingleLine("checks justification", record.justification, 240);',
    newText: 'if (false && input.checksStatus === "NOT_APPLICABLE") validateSingleLine("checksJustification", input.checksJustification, 240);',
  },
  {
    name: "terminal checks aggregate blocker",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (input.reviewEvidence.requiredEvidenceMissing || !input.reviewEvidence.substantiveReview || !checksAdmissible || hasReviewBlocker) {',
    newText: 'if (input.reviewEvidence.requiredEvidenceMissing || !input.reviewEvidence.substantiveReview || hasReviewBlocker) {',
  },
  {
    name: "admitted-only severity counts",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (key in counts && (candidate.disposition === "BLOCKING" || candidate.disposition === "NON_BLOCKING")) counts[key] += 1;',
    newText: 'if (key in counts && candidate.disposition !== "DROP") counts[key] += 1;',
  },
  {
    name: "aggregate finding-severity coherence",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (severityCount !== aggregate.admittedFindingCount) throw new Error("aggregate severity count does not match admitted findings");',
    newText: 'if (false && severityCount !== aggregate.admittedFindingCount) throw new Error("aggregate severity count does not match admitted findings");',
  },
  {
    name: "aggregate checks-status coherence",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (aggregate.reviewCompletionEligible && aggregate.checksStatus !== "PASS" && aggregate.checksStatus !== "NOT_APPLICABLE") {',
    newText: 'if (false && aggregate.reviewCompletionEligible && aggregate.checksStatus !== "PASS" && aggregate.checksStatus !== "NOT_APPLICABLE") {',
  },
  {
    name: "publication write authority",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'publicationEligible: contentEligible && writeAuthorized,',
    newText: 'publicationEligible: contentEligible,',
  },
  {
    name: "publication receipt producer provenance",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!producedPublicationReceipts.has(publicationReceipt)) throw new Error("publication receipt lacks evaluator provenance");',
    newText: 'if (false && !producedPublicationReceipts.has(publicationReceipt)) throw new Error("publication receipt lacks evaluator provenance");',
  },
  {
    name: "publication pr_number live binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of PUBLICATION_RECEIPT_FIELDS) {',
    newText: 'for (const key of ["lifecycle", "base_sha", "head_sha"]) {',
  },
  {
    name: "publication lifecycle live binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of PUBLICATION_RECEIPT_FIELDS) {',
    newText: 'for (const key of ["pr_number", "base_sha", "head_sha"]) {',
  },
  {
    name: "publication base_sha live binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of PUBLICATION_RECEIPT_FIELDS) {',
    newText: 'for (const key of ["pr_number", "lifecycle", "head_sha"]) {',
  },
  {
    name: "publication head_sha live binding",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'for (const key of PUBLICATION_RECEIPT_FIELDS) {',
    newText: 'for (const key of ["pr_number", "lifecycle", "base_sha"]) {',
  },
  {
    name: "finding admission pr/base/head section",
    file: "references/cross-review-loop.md",
    oldText: "pr_number:\nbase_sha:\nhead_sha:\n",
    newText: "pr_number\nbase_sha:\nhead_sha:\n",
  },
  {
    name: "renderer decision producer provenance",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!producedPublicationDecisions.has(publicationDecision) || !publicationDecision.publicationEligible) throw new Error("eligible publication decision is required");',
    newText: 'if (!publicationDecision?.publicationEligible) throw new Error("eligible publication decision is required");',
  },
  {
    name: "aggregate producer provenance",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!producedAggregates.has(aggregate)) throw new Error("aggregate result lacks producer provenance");',
    newText: 'if (false && !producedAggregates.has(aggregate)) throw new Error("aggregate result lacks producer provenance");',
  },
  {
    name: "public leak token validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  "Candidate ledger",\n',
    newText: "",
  },
  {
    name: "internal gate label validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  "Quality Lens Router",\n',
    newText: "",
  },
  {
    name: "case-insensitive internal token validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (value.toLowerCase().includes(token.toLowerCase())) throw new Error(`prohibited public token: ${token}`);',
    newText: 'if (value.includes(token)) throw new Error(`prohibited public token: ${token}`);',
  },
  {
    name: "cross-platform host path validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  ["host-local path", /(?:\\/Users\\/|\\/(?:private\\/)?var\\/folders\\/|\\/(?:private\\/)?tmp\\/|\\/home\\/|\\/root\\/|\\/Volumes\\/|~(?:[^\\s\\/`\'"]+)?\\/|\\$HOME\\/|[A-Z]:[\\\\/]Users[\\\\/])[^\\s`\'"\\])}]*/i],\n',
    newText: "",
  },
  {
    name: "profile-local path validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  ["profile-local path", /(?:^|[^\\p{L}\\p{N}])\\.hermes\\/[^\\s`\'"\\])}]*/iu],\n',
    newText: "",
  },
  {
    name: "repository and private URI validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  ["repository or private URI", /(?:^|[^\\p{L}\\p{N}])(?:[A-Za-z][A-Za-z0-9+.-]*:\\/\\/\\S+|[gG][iI][tT]@[A-Za-z0-9.-]+:[^\\s`]+|(?:[A-Za-z0-9-]+\\.)+[A-Za-z]{2,}\\/[^\\s`]+|(?:[\\p{L}\\p{N}_.-]+\\/){1,2}[\\p{L}\\p{N}_.-]+#\\d+\\b)/u],\n',
    newText: "",
  },
  {
    name: "session compatibility assignment delimiters",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'const PUBLIC_ASSIGNMENT_DELIMITER = "[:=\\\\uFE13\\\\uFE55\\\\uFF1A\\\\u207C\\\\u208C\\\\uFE66\\\\uFF1D]";',
    newText: 'const PUBLIC_ASSIGNMENT_DELIMITER = "[:=]";',
  },
  {
    name: "raw plus canonical public scan",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  for (const scanned of canonical === value ? [value] : [value, canonical]) {',
    newText: '  for (const scanned of [canonical]) {',
  },
  {
    name: "Unicode-normalized public validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '    .normalize("NFKC")',
    newText: '    .normalize("NFC")',
  },

  {
    name: "Unicode slash-confusable public validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '    .replace(/[\\u2044\\u2215\\u29f8]/g, "/");',
    newText: ";",
  },
  {
    name: "bearer credential leak pattern",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  ["credential material", /\\b(?:authorization\\s*:|bearer\\s+[A-Za-z0-9._\\[\\]-]+|token\\s*=|password\\s*=)/i],\n',
    newText: "",
  },
  {
    name: "obfuscated credential assignment validator",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  ["obfuscated credential assignment", OBFUSCATED_CREDENTIAL_ASSIGNMENT],\n',
    newText: "",
  },
  {
    name: "provider token leak pattern",
    file: "scripts/review-contract-policy.mjs",
    oldText: '  ["provider token material", /\\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\\b/],\n',
    newText: "",
  },
  {
    name: "public review structural allowlist",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (lines.length !== 11 || lines[1] !== "" || lines[9] !== "") throw new Error("review body must match the deterministic allowlist");',
    newText: 'if (false && (lines.length !== 11 || lines[1] !== "" || lines[9] !== "")) throw new Error("review body must match the deterministic allowlist");',
  },
  {
    name: "public marker count coherence",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (marker[5] !== publicCounts[1] || marker[6] !== publicCounts[2] || marker[7] !== publicGaps[1]) throw new Error("review marker does not match public counts");',
    newText: 'if (false && (marker[5] !== publicCounts[1] || marker[6] !== publicCounts[2] || marker[7] !== publicGaps[1])) throw new Error("review marker does not match public counts");',
  },
  {
    name: "public finding structural allowlist",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (sentences.length !== 2 || sentences.join("") !== body) throw new Error("finding body must contain exactly two complete sentences");',
    newText: 'if (false && (sentences.length !== 2 || sentences.join("") !== body)) throw new Error("finding body must contain exactly two complete sentences");',
  },
  {
    name: "classified evidence detail",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!match) throw new Error(`${name} requires classified evidence detail`);',
    newText: 'if (!match) return value;',
  },
  {
    name: "authority enum",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'const AUTHORITIES = new Set(["CONDUCTOR", "SUBREVIEW"]);',
    newText: 'const AUTHORITIES = new Set(["CONDUCTOR", "SUBREVIEW", "unknown"]);',
  },
  {
    name: "severity-delta coherence",
    file: "scripts/review-contract-policy.mjs",
    oldText: 'if (!defectDelta && record.severity !== "NONE") throw new Error("severity requires a defect delta");',
    newText: 'if (false && !defectDelta && record.severity !== "NONE") throw new Error("severity requires a defect delta");',
  },
];

try {
  resetCandidate();
  const baseline = runGate(candidateRoot);
  if (!baseline.passed) throw new Error(`baseline contract should pass\n${baseline.output}`);

  for (const mutation of mutations) {
    resetCandidate();
    applyMutation(mutation.name, mutation.file, mutation.oldText, mutation.newText);
    const result = runGate(candidateRoot);
    if (result.passed) throw new Error(`${mutation.name}: semantic mutation survived verifier and focused policy test`);
  }

  console.log(`[test-review-contract-verifier] passed: baseline + ${mutations.length} applied semantic mutation probes`);
} catch (error) {
  console.error(`[test-review-contract-verifier] failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
