const LIFECYCLES = new Set(["OPEN", "MERGED", "CLOSED_UNMERGED"]);
const AUTHORITIES = new Set(["CONDUCTOR", "SUBREVIEW"]);
const SEVERITIES = new Set(["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const CHECK_STATUSES = new Set(["PASS", "FAIL", "PENDING", "NOT_APPLICABLE"]);
const DELTAS = new Set(["NONE", "DEFECT", "STYLE_DIFFERENCE", "PRIVACY_SURFACE_ONLY", "PRIVACY_EXPOSURE", "PROCESS_GAP"]);
const CONTRACT_STATES = new Set(["PROVEN", "NOT_APPLICABLE", "UNKNOWN"]);
const SCOPE_RELATIONS = new Set(["IN_SCOPE", "OUT_OF_SCOPE", "UNKNOWN"]);
const PRIOR_DECISIONS = new Set(["NONE", "ACCEPTED_NO_COUNTEREVIDENCE", "ACCEPTED_WITH_COUNTEREVIDENCE", "UNKNOWN"]);
const BASE_STATES = new Set(["ABSENT", "UNCHANGED", "WORSENED_OR_EXPOSED", "UNKNOWN"]);
const EVIDENCE_STATES = new Set(["PROVEN", "NOT_APPLICABLE", "UNKNOWN"]);
const CAUSALITY_STATES = new Set(["NEW", "WORSENED", "UNCHANGED", "UNRELATED", "UNKNOWN"]);
const IMPACT_STATES = new Set(["PROVEN", "NOT_PROVEN", "NOT_APPLICABLE", "UNKNOWN"]);
const COUNTERARGUMENT_STATES = new Set(["ADDRESSED", "NOT_APPLICABLE", "UNKNOWN"]);
const DISPROOF_STATES = new Set(["PROVEN", "NOT_PROVEN", "NOT_APPLICABLE", "UNKNOWN"]);
const CORRECTION_STATES = new Set(["PROPOSED", "NOT_APPLICABLE", "UNKNOWN"]);
const CANDIDATE_DISPOSITIONS = new Set(["CANDIDATE", "DROP", "QUESTION", "NON_BLOCKING", "BLOCKING", "REVIEW_BLOCKED"]);
const FINAL_DISPOSITIONS = new Set(["DROP", "QUESTION", "NON_BLOCKING", "BLOCKING", "REVIEW_BLOCKED"]);

export const ADMISSION_SCHEMA_VERSION = 3;
export const ADMISSION_FIELDS = Object.freeze([
  "candidate_id",
  "authority",
  "lifecycle",
  "observed_delta",
  "governing_contract",
  "scope_relation",
  "prior_decision",
  "base_state",
  "current_head_evidence",
  "diff_causality",
  "impact",
  "counterargument",
  "counterargument_disproof",
  "minimum_correction",
  "severity",
  "disposition",
  "publication_eligible",
]);

const admissionFieldSet = new Set(ADMISSION_FIELDS);
const producedCandidates = new WeakSet();
const producedAggregates = new WeakSet();
const aggregateMembers = new WeakMap();
const OUTCOMES = Object.freeze({
  OPEN: new Set(["APPROVE", "CHANGES_REQUESTED", "BLOCKED"]),
  MERGED: new Set(["NO_FOLLOW_UP", "FOLLOW_UP_REQUIRED", "BLOCKED"]),
  CLOSED_UNMERGED: new Set(["NO_ACTION", "FOLLOW_UP_REQUIRED", "BLOCKED"]),
});
const PROHIBITED_PUBLIC_TOKENS = Object.freeze([
  "Wiki Context Manifest",
  "Candidate ledger",
  "candidate_id",
  "governing_contract",
  "counterargument_disproof",
  "Gate / Wiki / Scope",
  "Internal manifests",
  "ULW_LOOP_DONE",
  "Quality Lens Router",
  "Evidence Contract",
  "Simplicity / Deletability Gate",
  "Core Invariants",
  "checksStatus",
  "writeAuthorized",
  "publicationEligible",
  "reviewCompletionEligible",
  "requiredEvidenceMissing",
  "substantiveReview",
  "Admission schema",
  "candidate disposition",
  "active profile:",
]);
const PUBLIC_ASSIGNMENT_DELIMITER = "[:=\\uFE13\\uFE55\\uFF1A\\u207C\\u208C\\uFE66\\uFF1D]";
const OBFUSCATED_CREDENTIAL_KEYS = [
  "authorization",
  "sessiontoken",
  "sessionid",
  "clientsecret",
  "accesstoken",
  "setcookie",
  "password",
  "session",
  "apikey",
  "cookie",
  "secret",
  "token",
].map((key) => [...key].map((letter) => `[${letter}${letter.toUpperCase()}]`).join("[^\\p{L}\\p{N}]*"));
const OBFUSCATED_CREDENTIAL_ASSIGNMENT = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${OBFUSCATED_CREDENTIAL_KEYS.join("|")})\\s*${PUBLIC_ASSIGNMENT_DELIMITER}\\s*\\S+`,
  "u",
);
const PROHIBITED_PUBLIC_PATTERNS = Object.freeze([
  ["host-local path", /(?:\/Users\/|\/(?:private\/)?var\/folders\/|\/(?:private\/)?tmp\/|\/home\/|\/root\/|\/Volumes\/|~(?:[^\s\/`'"]+)?\/|\$HOME\/|[A-Z]:[\\/]Users[\\/])[^\s`'"\])}]*/i],
  ["profile-local path", /(?:^|[^\p{L}\p{N}])\.hermes\/[^\s`'"\])}]*/iu],
  ["repository or private URI", /(?:^|[^\p{L}\p{N}])(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+|[gG][iI][tT]@[A-Za-z0-9.-]+:[^\s`]+|(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}\/[^\s`]+|(?:[\p{L}\p{N}_.-]+\/){1,2}[\p{L}\p{N}_.-]+#\d+\b)/u],
  ["credential material", /\b(?:authorization\s*:|bearer\s+[A-Za-z0-9._\[\]-]+|token\s*=|password\s*=)/i],
  ["obfuscated credential assignment", OBFUSCATED_CREDENTIAL_ASSIGNMENT],
  ["provider token material", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/],
  ["private key material", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i],
]);

function requireEnum(name, value, allowed) {
  if (!allowed.has(value)) throw new Error(`unknown ${name}: ${value}`);
}

function classifiedToken(name, value, allowed) {
  if (typeof value !== "string") throw new Error(`${name} requires classified evidence detail`);
  const match = value.match(/^([A-Z_]+):\s*(\S.*)$/);
  if (!match) throw new Error(`${name} requires classified evidence detail`);
  requireEnum(name, match[1], allowed);
  return match[1];
}

function token(value) {
  return value.slice(0, value.indexOf(":"));
}

export function validateAdmissionRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error("admission record must be an object");
  for (const key of Object.keys(record)) {
    if (!admissionFieldSet.has(key)) throw new Error(`unknown admission field: ${key}`);
  }
  for (const key of ADMISSION_FIELDS) {
    if (!(key in record)) throw new Error(`missing admission field: ${key}`);
  }
  if (typeof record.candidate_id !== "string" || !record.candidate_id.trim()) throw new Error("candidate_id must be a non-empty string");
  requireEnum("authority", record.authority, AUTHORITIES);
  requireEnum("lifecycle", record.lifecycle, LIFECYCLES);
  const observedDelta = classifiedToken("observed delta", record.observed_delta, DELTAS);
  classifiedToken("governing contract", record.governing_contract, CONTRACT_STATES);
  classifiedToken("scope relation", record.scope_relation, SCOPE_RELATIONS);
  const priorDecision = classifiedToken("prior decision", record.prior_decision, PRIOR_DECISIONS);
  const baseState = classifiedToken("base state", record.base_state, BASE_STATES);
  classifiedToken("current-head evidence", record.current_head_evidence, EVIDENCE_STATES);
  const diffCausality = classifiedToken("diff causality", record.diff_causality, CAUSALITY_STATES);
  classifiedToken("impact", record.impact, IMPACT_STATES);
  classifiedToken("counterargument", record.counterargument, COUNTERARGUMENT_STATES);
  const counterargumentDisproof = classifiedToken("counterargument disproof", record.counterargument_disproof, DISPROOF_STATES);
  classifiedToken("minimum correction", record.minimum_correction, CORRECTION_STATES);
  requireEnum("severity", record.severity, SEVERITIES);
  requireEnum("disposition", record.disposition, CANDIDATE_DISPOSITIONS);
  if (typeof record.publication_eligible !== "boolean") throw new Error("publication_eligible must be boolean");
  if (record.disposition === "CANDIDATE" && record.publication_eligible) throw new Error("unresolved candidate cannot be publication eligible");
  const defectDelta = observedDelta === "DEFECT" || observedDelta === "PRIVACY_EXPOSURE";
  if (!defectDelta && record.severity !== "NONE") throw new Error("severity requires a defect delta");
  if (defectDelta && record.severity === "NONE") throw new Error("defect delta requires a non-NONE severity");
  if (priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && (baseState === "WORSENED_OR_EXPOSED" || diffCausality === "WORSENED")) {
    throw new Error("accepted-no-counterevidence contradicts current-head worsening");
  }
  if (priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && counterargumentDisproof === "PROVEN") {
    throw new Error("accepted-no-counterevidence contradicts proven counterevidence");
  }
  return record;
}

function finalize(record, disposition, publicationEligible) {
  const result = Object.freeze({ ...record, disposition, publication_eligible: publicationEligible });
  producedCandidates.add(result);
  return result;
}

export function evaluateCandidate(record) {
  validateAdmissionRecord(record);
  if (record.disposition !== "CANDIDATE") throw new Error("candidate evaluator requires CANDIDATE disposition");

  const facts = {
    observedDelta: token(record.observed_delta),
    governingContract: token(record.governing_contract),
    scopeRelation: token(record.scope_relation),
    priorDecision: token(record.prior_decision),
    baseState: token(record.base_state),
    currentHeadEvidence: token(record.current_head_evidence),
    diffCausality: token(record.diff_causality),
    impact: token(record.impact),
    counterargument: token(record.counterargument),
    counterargumentDisproof: token(record.counterargument_disproof),
    minimumCorrection: token(record.minimum_correction),
  };

  if (record.authority === "SUBREVIEW") {
    return finalize(record, "REVIEW_BLOCKED", false);
  }
  const unresolvedBlockingEvidence = [
    facts.governingContract,
    facts.scopeRelation,
    facts.priorDecision,
    facts.baseState,
    facts.currentHeadEvidence,
    facts.diffCausality,
    facts.impact,
    facts.counterargument,
    facts.counterargumentDisproof,
    facts.minimumCorrection,
  ].includes("UNKNOWN");
  if (facts.observedDelta === "PROCESS_GAP" && facts.governingContract === "PROVEN") return finalize(record, "REVIEW_BLOCKED", false);
  if (facts.priorDecision === "ACCEPTED_NO_COUNTEREVIDENCE" && !unresolvedBlockingEvidence) return finalize(record, "DROP", false);
  if (facts.baseState === "UNCHANGED" && facts.scopeRelation === "OUT_OF_SCOPE" && facts.diffCausality === "UNCHANGED") {
    return finalize(record, "DROP", false);
  }
  if (facts.observedDelta === "PROCESS_GAP" && facts.governingContract !== "PROVEN") return finalize(record, "DROP", false);
  if (facts.observedDelta === "PRIVACY_SURFACE_ONLY" && facts.governingContract !== "PROVEN") return finalize(record, "DROP", false);
  if (facts.observedDelta === "STYLE_DIFFERENCE" && facts.governingContract !== "PROVEN") return finalize(record, "DROP", false);

  if (unresolvedBlockingEvidence && (record.severity === "HIGH" || record.severity === "CRITICAL")) {
    return finalize(record, "REVIEW_BLOCKED", false);
  }

  const provenDefect =
    (facts.observedDelta === "DEFECT" || facts.observedDelta === "PRIVACY_EXPOSURE") &&
    facts.governingContract === "PROVEN" &&
    facts.currentHeadEvidence === "PROVEN" &&
    (facts.diffCausality === "NEW" || facts.diffCausality === "WORSENED") &&
    facts.impact === "PROVEN" &&
    facts.counterargument === "ADDRESSED" &&
    facts.counterargumentDisproof === "PROVEN" &&
    facts.minimumCorrection === "PROPOSED";

  if (provenDefect && (record.severity === "HIGH" || record.severity === "CRITICAL")) return finalize(record, "BLOCKING", true);
  if (provenDefect) return finalize(record, "NON_BLOCKING", true);
  return finalize(record, "QUESTION", false);
}

function validateAggregateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("aggregate input must be an object");
  requireEnum("lifecycle", input.lifecycle, LIFECYCLES);
  if (!Array.isArray(input.candidates)) throw new Error("candidates must be an array");
  const candidateIds = new Set();
  for (const candidate of input.candidates) {
    if (!producedCandidates.has(candidate)) throw new Error("candidate lacks evaluator provenance");
    validateAdmissionRecord(candidate);
    if (candidateIds.has(candidate.candidate_id)) throw new Error(`duplicate candidate_id: ${candidate.candidate_id}`);
    candidateIds.add(candidate.candidate_id);
    if (!FINAL_DISPOSITIONS.has(candidate.disposition)) throw new Error("aggregate requires final candidate dispositions");
    if (candidate.lifecycle !== input.lifecycle) throw new Error("candidate lifecycle does not match aggregate lifecycle");
  }
  for (const key of ["requiredEvidenceMissing", "substantiveReview"]) {
    if (typeof input[key] !== "boolean") throw new Error(`${key} must be boolean`);
  }
  requireEnum("checks status", input.checksStatus, CHECK_STATUSES);
  if (input.checksStatus === "NOT_APPLICABLE") validateSingleLine("checksJustification", input.checksJustification, 240);
}

export function aggregateReview(input) {
  validateAggregateInput(input);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const candidate of input.candidates) {
    const key = candidate.severity.toLowerCase();
    if (key in counts && (candidate.disposition === "BLOCKING" || candidate.disposition === "NON_BLOCKING")) counts[key] += 1;
  }
  const hasReviewBlocker = input.candidates.some((candidate) => candidate.disposition === "REVIEW_BLOCKED");
  const blockingCount = input.candidates.filter((candidate) => candidate.disposition === "BLOCKING").length;
  const admittedFindingCount = input.candidates.filter((candidate) => candidate.disposition === "BLOCKING" || candidate.disposition === "NON_BLOCKING").length;

  let outcome;
  let reviewCompletionEligible;
  const checksAdmissible = input.checksStatus === "PASS" || input.checksStatus === "NOT_APPLICABLE";
  if (input.requiredEvidenceMissing || !input.substantiveReview || !checksAdmissible || hasReviewBlocker) {
    outcome = "BLOCKED";
    reviewCompletionEligible = false;
  } else if (input.lifecycle === "OPEN") {
    if (blockingCount > 0) {
      outcome = "CHANGES_REQUESTED";
      reviewCompletionEligible = true;
    } else {
      outcome = "APPROVE";
      reviewCompletionEligible = true;
    }
  } else if (input.lifecycle === "MERGED") {
    outcome = admittedFindingCount > 0 ? "FOLLOW_UP_REQUIRED" : "NO_FOLLOW_UP";
    reviewCompletionEligible = true;
  } else {
    outcome = admittedFindingCount > 0 ? "FOLLOW_UP_REQUIRED" : "NO_ACTION";
    reviewCompletionEligible = true;
  }

  const result = {
    lifecycle: input.lifecycle,
    checksStatus: input.checksStatus,
    outcome,
    reviewCompletionEligible,
    counts,
    blockingCount,
    admittedFindingCount,
    evidenceGapCount: Number(input.requiredEvidenceMissing) + input.candidates.filter((candidate) => candidate.disposition === "REVIEW_BLOCKED").length,
  };
  validateAggregateShape(result);
  Object.freeze(result.counts);
  Object.freeze(result);
  producedAggregates.add(result);
  aggregateMembers.set(result, new Set(input.candidates));
  return result;
}

function requireNonNegativeInteger(name, value) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function validateAggregateShape(aggregate) {
  if (!aggregate || typeof aggregate !== "object" || Array.isArray(aggregate)) throw new Error("aggregate result must be an object");
  requireEnum("lifecycle", aggregate.lifecycle, LIFECYCLES);
  requireEnum("checks status", aggregate.checksStatus, CHECK_STATUSES);
  if (!OUTCOMES[aggregate.lifecycle].has(aggregate.outcome)) throw new Error("outcome is invalid for lifecycle");
  if (typeof aggregate.reviewCompletionEligible !== "boolean") throw new Error("reviewCompletionEligible must be boolean");
  if (!aggregate.counts || typeof aggregate.counts !== "object" || Array.isArray(aggregate.counts)) throw new Error("aggregate counts are required");
  for (const severity of ["critical", "high", "medium", "low"]) requireNonNegativeInteger(`counts.${severity}`, aggregate.counts[severity]);
  for (const field of ["blockingCount", "admittedFindingCount", "evidenceGapCount"]) requireNonNegativeInteger(field, aggregate[field]);
  const severityCount = aggregate.counts.critical + aggregate.counts.high + aggregate.counts.medium + aggregate.counts.low;
  if (severityCount !== aggregate.admittedFindingCount) throw new Error("aggregate severity count does not match admitted findings");
  if (aggregate.blockingCount > aggregate.admittedFindingCount) throw new Error("aggregate blocking count exceeds admitted findings");
  if ((aggregate.outcome === "APPROVE" || aggregate.outcome === "NO_FOLLOW_UP" || aggregate.outcome === "NO_ACTION") && aggregate.blockingCount !== 0) {
    throw new Error("positive aggregate outcome cannot contain blocking findings");
  }
  if (aggregate.outcome === "CHANGES_REQUESTED" && aggregate.blockingCount === 0) throw new Error("CHANGES_REQUESTED requires a blocking finding");
  if (aggregate.outcome === "FOLLOW_UP_REQUIRED" && aggregate.admittedFindingCount === 0) throw new Error("FOLLOW_UP_REQUIRED requires an admitted finding");
  if ((aggregate.outcome === "NO_FOLLOW_UP" || aggregate.outcome === "NO_ACTION") && aggregate.admittedFindingCount !== 0) {
    throw new Error("no-action aggregate outcome cannot contain admitted findings");
  }
  if ((aggregate.outcome === "BLOCKED") === aggregate.reviewCompletionEligible) throw new Error("aggregate completion eligibility contradicts outcome");
  if (aggregate.reviewCompletionEligible && aggregate.checksStatus !== "PASS" && aggregate.checksStatus !== "NOT_APPLICABLE") {
    throw new Error("completion-eligible aggregate requires passing or not-applicable checks");
  }
  return aggregate;
}

export function validateAggregateResult(aggregate) {
  validateAggregateShape(aggregate);
  if (!producedAggregates.has(aggregate)) throw new Error("aggregate result lacks producer provenance");
  return aggregate;
}

export function decidePublication({ aggregate, writeAuthorized }) {
  validateAggregateResult(aggregate);
  if (typeof writeAuthorized !== "boolean") throw new Error("writeAuthorized must be boolean");
  const contentEligible = aggregate.reviewCompletionEligible && (
    aggregate.lifecycle === "OPEN"
      ? aggregate.outcome === "APPROVE" || aggregate.outcome === "CHANGES_REQUESTED"
      : aggregate.outcome === "FOLLOW_UP_REQUIRED"
  );
  return {
    contentEligible,
    writeAuthorized,
    publicationEligible: contentEligible && writeAuthorized,
  };
}

function validatePublicTokens(value) {
  for (const token of PROHIBITED_PUBLIC_TOKENS) {
    if (value.toLowerCase().includes(token.toLowerCase())) throw new Error(`prohibited public token: ${token}`);
  }
}

export function validatePublicContent(value) {
  const canonical = value
    .normalize("NFKC")
    .replace(/[\u2044\u2215\u29f8]/g, "/");
  for (const scanned of canonical === value ? [value] : [value, canonical]) {
    validatePublicTokens(scanned);
    for (const [label, pattern] of PROHIBITED_PUBLIC_PATTERNS) {
      if (pattern.test(scanned)) throw new Error(`prohibited public pattern: ${label}`);
    }
  }
}

function validateSingleLine(name, value, maxLength) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
  if (/\r|\n/.test(value)) throw new Error(`${name} must be one line`);
  if (value.length > maxLength) throw new Error(`${name} exceeds ${maxLength} characters`);
  validatePublicContent(value);
}

export function renderPublicReview({ aggregate, prNumber, headSha, evidenceGapCount, reason, nextAction }) {
  validateAggregateResult(aggregate);
  if (!Number.isInteger(prNumber) || prNumber < 1) throw new Error("prNumber must be a positive integer");
  if (typeof headSha !== "string" || !/^[0-9a-f]{40}$/i.test(headSha)) throw new Error("headSha must be a full 40-character hex SHA");
  if (!Number.isInteger(evidenceGapCount) || evidenceGapCount < 0) throw new Error("evidenceGapCount must be a non-negative integer");
  if (evidenceGapCount !== aggregate.evidenceGapCount) throw new Error("evidenceGapCount does not match aggregate");
  validateSingleLine("reason", reason, 160);
  validateSingleLine("nextAction", nextAction, 160);
  const counts = aggregate.counts ?? { critical: 0, high: 0, medium: 0, low: 0 };
  const body = [
    `## ddalggak review — ${aggregate.outcome}`,
    "",
    `Lifecycle: \`${aggregate.lifecycle}\``,
    `Outcome: \`${aggregate.outcome}\``,
    `├─ PR: #${prNumber} @ \`${headSha.slice(0, 7)}\``,
    `├─ Proven blockers: Critical ${counts.critical ?? 0} / High ${counts.high ?? 0}`,
    `├─ Evidence gaps: ${evidenceGapCount}`,
    `├─ 핵심 이유: ${reason}`,
    `└─ Next: ${nextAction}`,
    "",
    `<!-- ddalggak-review-contract:v3 pr=${prNumber} head=${headSha} lifecycle=${aggregate.lifecycle} outcome=${aggregate.outcome} critical=${counts.critical ?? 0} high=${counts.high ?? 0} gaps=${evidenceGapCount} -->`,
  ].join("\n");
  validatePublicReview(body);
  return body;
}

export function renderPublicFinding(input) {
  if (!input?.aggregate || !input?.candidate) throw new Error("aggregate and candidate are required");
  validateAggregateResult(input.aggregate);
  if (!producedCandidates.has(input.candidate)) throw new Error("candidate lacks evaluator provenance");
  if (!aggregateMembers.get(input.aggregate)?.has(input.candidate)) throw new Error("candidate is not a member of aggregate");
  if (!input.candidate.publication_eligible || !["BLOCKING", "NON_BLOCKING"].includes(input.candidate.disposition)) {
    throw new Error("candidate is not publication eligible");
  }
  const detail = (value) => value.slice(value.indexOf(":") + 1).trim();
  const fields = {
    symptom: detail(input.candidate.observed_delta),
    violatedContract: detail(input.candidate.governing_contract),
    evidence: detail(input.candidate.current_head_evidence),
    impact: detail(input.candidate.impact),
    smallestCorrection: detail(input.candidate.minimum_correction),
  };
  for (const [name, value] of Object.entries(fields)) validateSingleLine(name, value, 240);
  const body = [
    `**Symptom:** ${fields.symptom}`,
    `**Violated contract:** ${fields.violatedContract}`,
    `**Current-head evidence:** ${fields.evidence}`,
    `**Impact:** ${fields.impact}`,
    `**Smallest correction:** ${fields.smallestCorrection}`,
  ].join("\n");
  validatePublicFinding(body);
  return body;
}

export function validatePublicFinding(body) {
  if (typeof body !== "string" || !body.trim()) throw new Error("public finding body must be a non-empty string");
  validatePublicContent(body);
  const labels = ["Symptom", "Violated contract", "Current-head evidence", "Impact", "Smallest correction"];
  const lines = body.split("\n");
  if (lines.length !== labels.length) throw new Error("finding body must match the deterministic allowlist");
  for (let index = 0; index < labels.length; index += 1) {
    const prefix = `**${labels[index]}:** `;
    if (!lines[index].startsWith(prefix)) throw new Error("finding body must match the deterministic allowlist");
    validateSingleLine(labels[index], lines[index].slice(prefix.length), 240);
  }
  return { valid: true };
}

export function validatePublicReview(body) {
  if (typeof body !== "string" || !body.trim()) throw new Error("public review body must be a non-empty string");
  validatePublicContent(body);
  const lines = body.split("\n");
  if (lines.length !== 11 || lines[1] !== "" || lines[9] !== "") throw new Error("review body must match the deterministic allowlist");
  const headingOutcome = lines[0].match(/^## ddalggak review — ([A-Z_]+)$/)?.[1];
  const lifecycle = lines[2].match(/^Lifecycle: `([^`]+)`$/)?.[1];
  const outcome = lines[3].match(/^Outcome: `([^`]+)`$/)?.[1];
  const publicPr = lines[4].match(/^├─ PR: #(\d+) @ `([0-9a-f]{7})`$/i);
  const publicCounts = lines[5].match(/^├─ Proven blockers: Critical (\d+) \/ High (\d+)$/);
  const publicGaps = lines[6].match(/^├─ Evidence gaps: (\d+)$/);
  const reason = lines[7].match(/^├─ 핵심 이유: (.+)$/)?.[1];
  const nextAction = lines[8].match(/^└─ Next: (.+)$/)?.[1];
  if (!headingOutcome || !publicPr || !publicCounts || !publicGaps || !reason || !nextAction) throw new Error("review body must match the deterministic allowlist");
  validateSingleLine("reason", reason, 160);
  validateSingleLine("nextAction", nextAction, 160);
  requireEnum("lifecycle", lifecycle, LIFECYCLES);
  if (!OUTCOMES[lifecycle].has(outcome) || headingOutcome !== outcome) throw new Error("public outcome is invalid for lifecycle");
  const marker = lines[10].match(/^<!-- ddalggak-review-contract:v3 pr=(\d+) head=([0-9a-f]{40}) lifecycle=([^ ]+) outcome=([^ ]+) critical=(\d+) high=(\d+) gaps=(\d+) -->$/i);
  if (!marker) throw new Error("missing or malformed terminal review marker");
  if (marker[3] !== lifecycle || marker[4] !== outcome) throw new Error("review marker does not match public lifecycle/outcome");
  if (marker[1] !== publicPr[1] || !marker[2].toLowerCase().startsWith(publicPr[2].toLowerCase())) throw new Error("review marker does not match public PR/head");
  if (marker[5] !== publicCounts[1] || marker[6] !== publicCounts[2] || marker[7] !== publicGaps[1]) throw new Error("review marker does not match public counts");
  return { valid: true, lifecycle, outcome };
}
