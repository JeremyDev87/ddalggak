import { createHash } from "node:crypto";

const CASE_KINDS = new Set(["seeded-defect", "clean-control", "admission-blocker"]);
const RISK_TIERS = new Set(["low", "medium", "high", "critical"]);
const INTAKE_DECISIONS = new Set([
  "ready-for-review",
  "needs-intent",
  "needs-evidence",
  "needs-split",
  "blocked-human-owner",
]);
const VERDICTS = new Set(["approve", "change request", "comment", "blocked"]);
const SEVERITIES = new Set(["critical", "high", "medium", "low"]);
const BLOCKING_SEVERITIES = new Set(["critical", "high"]);
const COVERAGE_VERDICTS = new Set(["covered", "gap", "not-applicable"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);
const RAW_FIELD_PATTERN = /^(rawprompt|rawoutput|privatediff|private_diff|token|secret|credential)$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const SYNTHETIC_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MAX_NARRATIVE_LENGTH = 1000;
const MAX_PATH_LENGTH = 256;
const CANONICAL_CASES_SHA256 = "3c2456134f84187bfae9a654afa433b99d6f18ef7cda1ddc4216802bcb9e2381";
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/giu;
const UNSAFE_CONTENT_CONTROL_PATTERN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const SENSITIVE_QUERY_LABELS = new Set([
  "auth", "authz", "authorization", "token", "credential", "apikey", "accesskey",
  "accesstoken", "password", "secret", "clientsecret", "privatekey", "session",
  "sessionid", "sessiontoken", "cookie", "setcookie",
]);
const ASSIGNMENT_DELIMITER = "[:=\\uFE13\\uFE55\\uFF1A\\u207C\\u208C\\uFE66\\uFF1D]";
const OBFUSCATED_CREDENTIAL_KEYS = [
  "authorization", "sessiontoken", "sessionid", "clientsecret", "accesstoken",
  "setcookie", "password", "session", "apikey", "cookie", "secret", "token",
].map((key) => [...key].map((letter) => `[${letter}${letter.toUpperCase()}]`).join("[^\\p{L}\\p{N}]*"));
const OBFUSCATED_CREDENTIAL_ASSIGNMENT = new RegExp(
  `(?:^|[^\\p{L}\\p{N}])(?:${OBFUSCATED_CREDENTIAL_KEYS.join("|")})\\s*${ASSIGNMENT_DELIMITER}\\s*\\S+`,
  "u",
);
const SECRET_VALUE_PATTERNS = [
  /(?:^|[^A-Za-z0-9_])(?:authorization|authz|auth|token|credential|api[\s_-]*key|access[\s_-]*(?:key|token)|password|secret|client[\s_-]*secret|private[\s_-]*key)\s*["']?\s*[:=]\s*["']?\s*\S+/iu,
  /(?:^|[^A-Za-z0-9_])(?:basic|bearer|token)\s+\S+/iu,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/u,
  OBFUSCATED_CREDENTIAL_ASSIGNMENT,
];
const REQUIRED_CASE_CONTRACTS = new Map([
  ["seed-assertion-weakening", { kind: "seeded-defect", riskTier: "high", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "assertion-weakening", severity: "high" }] }],
  ["seed-silent-fallback", { kind: "seeded-defect", riskTier: "high", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "silent-fallback", severity: "high" }] }],
  ["seed-scope-expansion", { kind: "seeded-defect", riskTier: "high", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "scope-expansion", severity: "high" }] }],
  ["seed-auth-short-circuit", { kind: "seeded-defect", riskTier: "critical", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "auth-short-circuit", severity: "critical" }] }],
  ["seed-stale-evidence-acceptance", { kind: "seeded-defect", riskTier: "high", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "stale-evidence-acceptance", severity: "high" }] }],
  ["seed-guard-false-pass", { kind: "seeded-defect", riskTier: "high", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "guard-false-pass", severity: "high" }] }],
  ["seed-rendered-state-missing", { kind: "seeded-defect", riskTier: "high", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "rendered-state-missing", severity: "high" }] }],
  ["seed-public-api-break", { kind: "seeded-defect", riskTier: "high", intake: "ready-for-review", verdicts: ["change request"], findings: [{ id: "public-api-break", severity: "high" }] }],
  ["clean-direct-validation", { kind: "clean-control", riskTier: "low", intake: "ready-for-review", verdicts: ["approve", "comment"], findings: [] }],
  ["clean-intentional-fallback", { kind: "clean-control", riskTier: "medium", intake: "ready-for-review", verdicts: ["approve", "comment"], findings: [] }],
  ["block-missing-intent", { kind: "admission-blocker", riskTier: "medium", intake: "needs-intent", verdicts: ["blocked"], findings: [] }],
  ["block-missing-critical-owner", { kind: "admission-blocker", riskTier: "critical", intake: "blocked-human-owner", verdicts: ["blocked"], findings: [] }],
]);
const REQUIRED_CASE_IDS = new Set(REQUIRED_CASE_CONTRACTS.keys());

const ROOT_KEYS = new Set(["version", "description", "cases"]);
const CASE_KEYS = new Set(["id", "kind", "riskTier", "currentHead", "expected", "observed"]);
const EXPECTED_KEYS = new Set(["intakeDecision", "allowedVerdicts", "findings"]);
const EXPECTED_FINDING_KEYS = new Set(["id", "severity"]);
const OBSERVED_KEYS = new Set([
  "reviewedHead",
  "intakeDecision",
  "verdict",
  "coverage",
  "findings",
  "humanOwner",
  "blockerReason",
]);
const COVERAGE_KEYS = new Set([
  "criterion",
  "changedSurface",
  "callerImpact",
  "failureMode",
  "evidence",
  "verdict",
]);

const FINDING_TEXT_FIELDS = [
  "id",
  "claim",
  "path",
  "failingScenario",
  "impact",
  "minimalFix",
  "counterevidenceChecked",
];
const COVERAGE_TEXT_FIELDS = [
  "criterion",
  "changedSurface",
  "callerImpact",
  "failureMode",
  "evidence",
];
const FINDING_KEYS = new Set([...FINDING_TEXT_FIELDS, "severity", "line", "confidence"]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalCasesDigest(cases) {
  try {
    return createHash("sha256").update(stableJson(cases)).digest("hex");
  } catch {
    return null;
  }
}

class JsonDuplicateKeyScanner {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  scan() {
    this.skipWhitespace();
    this.scanValue();
    this.skipWhitespace();
    if (this.index !== this.text.length) throw new Error("fixture JSON is invalid");
  }

  skipWhitespace() {
    while (/\s/u.test(this.text[this.index] ?? "")) this.index += 1;
  }

  consume(expected) {
    if (this.text[this.index] !== expected) throw new Error("fixture JSON is invalid");
    this.index += 1;
  }

  scanString() {
    const start = this.index;
    this.consume('"');
    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.text.slice(start, this.index));
        } catch {
          throw new Error("fixture JSON is invalid");
        }
      }
      if (character === "\\") this.index += 2;
      else {
        if (character.codePointAt(0) < 0x20) throw new Error("fixture JSON is invalid");
        this.index += 1;
      }
    }
    throw new Error("fixture JSON is invalid");
  }

  scanValue() {
    this.skipWhitespace();
    const character = this.text[this.index];
    if (character === "{") return this.scanObject();
    if (character === "[") return this.scanArray();
    if (character === '"') return this.scanString();
    const token = this.text.slice(this.index).match(/^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/u)?.[0];
    if (!token) throw new Error("fixture JSON is invalid");
    this.index += token.length;
  }

  scanObject() {
    this.consume("{");
    this.skipWhitespace();
    const keys = new Set();
    if (this.text[this.index] === "}") {
      this.index += 1;
      return;
    }
    while (true) {
      this.skipWhitespace();
      const key = this.scanString();
      if (keys.has(key)) throw new Error("fixture JSON contains a duplicate object key");
      keys.add(key);
      this.skipWhitespace();
      this.consume(":");
      this.scanValue();
      this.skipWhitespace();
      if (this.text[this.index] === "}") {
        this.index += 1;
        return;
      }
      this.consume(",");
    }
  }

  scanArray() {
    this.consume("[");
    this.skipWhitespace();
    if (this.text[this.index] === "]") {
      this.index += 1;
      return;
    }
    while (true) {
      this.scanValue();
      this.skipWhitespace();
      if (this.text[this.index] === "]") {
        this.index += 1;
        return;
      }
      this.consume(",");
    }
  }
}

export function parseReviewQualityJson(text) {
  if (typeof text !== "string") throw new Error("fixture JSON must be text");
  new JsonDuplicateKeyScanner(text).scan();
  return JSON.parse(text);
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function containsSensitiveCredential(value) {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function normalizeSensitiveLabel(value) {
  return canonicalizeInspectionText(value).trim().toLowerCase()
    .replace(/(?:\[[^\]]*\])+$/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function isSensitiveQueryLabel(value) {
  const normalized = normalizeSensitiveLabel(value);
  return SENSITIVE_QUERY_LABELS.has(normalized) ||
    [...SENSITIVE_QUERY_LABELS].some((label) => normalized.startsWith(`${label}[`));
}

function stripMalformedPercentEscapes(value) {
  return value.replace(/%(?![0-9A-Fa-f]{2})[0-9A-Za-z]{0,2}/gu, "");
}

function canonicalizeInspectionText(value) {
  return value.normalize("NFKC").replace(/[\u2044\u2215\u29f8]/gu, "/");
}

function decodeLayers(value) {
  const variants = [];
  const seen = new Set();
  let current = value;
  const addVariant = (entry) => {
    if (!seen.has(entry)) {
      seen.add(entry);
      variants.push(entry);
    }
  };
  for (let depth = 0; depth < 6; depth += 1) {
    const normalized = canonicalizeInspectionText(current);
    addVariant(current);
    addVariant(normalized);
    // Preserve benign percent prose while inspecting what malformed escapes can
    // hide when removed (for example, `token%2G=x` -> `token=x`). A malformed
    // escape must never prevent credential/path inspection of the remaining
    // text, but its mere presence is not itself sensitive content.
    addVariant(stripMalformedPercentEscapes(normalized));
    let decoded;
    try {
      decoded = decodeURIComponent(normalized);
    } catch {
      return { variants, exhausted: /%[0-9A-Fa-f]{2}/u.test(normalized) };
    }
    if (decoded === normalized) return { variants, exhausted: false };
    current = decoded;
  }
  const normalized = canonicalizeInspectionText(current);
  addVariant(current);
  addVariant(normalized);
  addVariant(stripMalformedPercentEscapes(normalized));
  return { variants, exhausted: /%[0-9A-Fa-f]{2}/u.test(normalized) };
}

function containsUnsafeNestedUrl(value, depth) {
  if (value.match(URL_PATTERN) === null) return false;
  return depth >= 4 || containsUnsafeUrl(value, depth + 1);
}

function rawUrlPathname(value) {
  const authorityStart = value.indexOf("://") + 3;
  const pathStarts = [
    value.indexOf("/", authorityStart),
    value.indexOf("\\", authorityStart),
  ].filter((index) => index >= 0);
  if (pathStarts.length === 0) return "";
  const pathStart = Math.min(...pathStarts);
  const queryStart = value.indexOf("?", pathStart);
  const fragmentStart = value.indexOf("#", pathStart);
  const ends = [queryStart, fragmentStart].filter((index) => index >= 0);
  const pathEnd = ends.length > 0 ? Math.min(...ends) : value.length;
  return value.slice(pathStart, pathEnd);
}

function containsUnsafeUrlPathPayload(value, depth) {
  // A URL pathname normally owns one leading slash. Remove only that transport
  // slash before checking whether the payload itself starts with a host-local
  // path, private URI, or nested URL. This keeps `/evidence` valid while
  // rejecting encoded `//Users/...`, `C:\\...`, `file:...`, and nested userinfo.
  const payload = value.replace(/^[/\\]/u, "");
  return containsSensitiveCredential(value) ||
    /(?:^|[/\\])\.\.(?:[/\\]|$)/u.test(value) ||
    containsPrivatePath(payload) || containsUnsafeNestedUrl(payload, depth);
}

function containsUnsafeUrl(value, depth = 0) {
  let unsafe = false;
  for (const match of value.matchAll(URL_PATTERN)) {
    try {
      const rawUrl = match[0];
      const url = new URL(rawUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        unsafe = true;
        continue;
      }
      for (const [key, parameterValue] of url.searchParams) {
        const keyLayers = decodeLayers(key);
        const valueLayers = decodeLayers(parameterValue);
        if (keyLayers.exhausted || valueLayers.exhausted ||
          keyLayers.variants.some((entry) => isSensitiveQueryLabel(entry)) ||
          valueLayers.variants.some((entry) => {
            const withoutUrls = withoutValidatedUrls(entry);
            return containsSensitiveCredential(withoutUrls) || containsPrivatePath(withoutUrls) ||
              containsUnsafeNestedUrl(entry, depth);
          })) {
          unsafe = true;
          break;
        }
      }
      const rawPathLayers = decodeLayers(rawUrlPathname(rawUrl));
      const pathLayers = decodeLayers(url.pathname);
      const fragmentLayers = decodeLayers(url.hash.slice(1));
      if (rawPathLayers.exhausted || pathLayers.exhausted || fragmentLayers.exhausted ||
        rawPathLayers.variants.some((entry) => containsUnsafeUrlPathPayload(entry, depth)) ||
        pathLayers.variants.some((entry) => containsUnsafeUrlPathPayload(entry, depth)) ||
        fragmentLayers.variants.some((entry) => {
          const withoutUrls = withoutValidatedUrls(entry);
          return containsSensitiveCredential(withoutUrls) || containsPrivatePath(withoutUrls) ||
            containsUnsafeNestedUrl(entry, depth);
        })) unsafe = true;
    } catch {
      unsafe = true;
    }
  }
  return unsafe;
}

function withoutValidatedUrls(value) {
  return value.replace(URL_PATTERN, "https-url");
}

function containsPrivatePath(value) {
  return /\b(?:data|file):/iu.test(value) ||
    /(?:^|[^A-Za-z0-9_./\\-])(?:\/{1,2}|~[^\s/\\]*[/\\]|[A-Za-z]:[/\\]|\\{1,2})[^\s]+/u.test(value) ||
    /(?:^|[/\\])\.\.(?:[/\\]|$)/u.test(value);
}

function validateContentLightText(value, path, failures, { identifier = false } = {}) {
  if (!nonEmptyText(value)) {
    failures.push(`${path}: non-empty string required`);
    return false;
  }
  let valid = true;
  if (value.length > MAX_NARRATIVE_LENGTH) {
    failures.push(`${path}: content-light length limit exceeded`);
    valid = false;
  }
  if (UNSAFE_CONTENT_CONTROL_PATTERN.test(value)) {
    failures.push(`${path}: control or format characters are forbidden`);
    valid = false;
  }
  if (identifier && !SYNTHETIC_ID_PATTERN.test(value)) {
    failures.push(`${path}: bounded synthetic identifier required`);
    valid = false;
  }
  const decoded = decodeLayers(value);
  if (decoded.exhausted || decoded.variants.some((entry) => {
    const valueWithoutUrls = withoutValidatedUrls(entry);
    return UNSAFE_CONTENT_CONTROL_PATTERN.test(entry) || containsUnsafeUrl(entry) ||
      containsSensitiveCredential(valueWithoutUrls) || containsPrivatePath(valueWithoutUrls);
  })) {
    failures.push(`${path}: sensitive or private content is forbidden`);
    valid = false;
  }
  return valid;
}

export function isContentLightNarrative(value) {
  const failures = [];
  return validateContentLightText(value, "value", failures) && failures.length === 0;
}

function validateRelativePath(value, path, failures) {
  if (!validateContentLightText(value, path, failures)) return;
  if (value.length > MAX_PATH_LENGTH || value.includes(":") || value.includes("\\") || value.startsWith("/") || value.startsWith("~")) {
    failures.push(`${path}: bounded repository-relative path required`);
    return;
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    failures.push(`${path}: bounded repository-relative path required`);
  }
}

function findForbiddenFields(value, path = "fixture", failures = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => findForbiddenFields(entry, `${path}[${index}]`, failures));
    return failures;
  }
  if (!isObject(value)) return failures;
  for (const [key, child] of Object.entries(value)) {
    if (RAW_FIELD_PATTERN.test(key)) failures.push(`${path}: raw/private payload field is forbidden`);
    findForbiddenFields(child, path, failures);
  }
  return failures;
}

function rejectUnknownKeys(value, allowedKeys, path, failures) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) failures.push(`${path}: unknown field is forbidden`);
  }
}

function validateFinding(finding, path, failures) {
  if (!isObject(finding)) {
    failures.push(`${path}: finding must be an object`);
    return;
  }
  rejectUnknownKeys(finding, FINDING_KEYS, path, failures);
  for (const field of FINDING_TEXT_FIELDS) {
    if (field === "path") validateRelativePath(finding[field], `${path}.${field}`, failures);
    else validateContentLightText(finding[field], `${path}.${field}`, failures, { identifier: field === "id" });
  }
  if (!SEVERITIES.has(finding.severity)) failures.push(`${path}.severity: invalid severity`);
  if (!Number.isInteger(finding.line) || finding.line < 1) failures.push(`${path}.line: positive integer required`);
  if (!CONFIDENCE.has(finding.confidence)) failures.push(`${path}.confidence: invalid confidence`);
}

function validateCoverage(row, path, failures) {
  if (!isObject(row)) {
    failures.push(`${path}: coverage row must be an object`);
    return;
  }
  rejectUnknownKeys(row, COVERAGE_KEYS, path, failures);
  for (const field of COVERAGE_TEXT_FIELDS) {
    validateContentLightText(row[field], `${path}.${field}`, failures);
  }
  if (!COVERAGE_VERDICTS.has(row.verdict)) failures.push(`${path}.verdict: invalid coverage verdict`);
}

export function validateReviewQualityFixture(fixture) {
  const failures = [];
  if (!isObject(fixture)) return ["fixture root must be an object"];
  rejectUnknownKeys(fixture, ROOT_KEYS, "fixture", failures);
  if (fixture.version !== 1) failures.push("fixture version must be 1");
  validateContentLightText(fixture.description, "fixture.description", failures);
  if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) {
    failures.push("fixture cases must be a non-empty array");
    return failures;
  }
  if (canonicalCasesDigest(fixture.cases) !== CANONICAL_CASES_SHA256) {
    failures.push("fixture.cases: canonical case semantics do not match");
  }

  findForbiddenFields(fixture, "fixture", failures);
  const caseIds = new Set();

  fixture.cases.forEach((entry, caseIndex) => {
    const path = `cases[${caseIndex}]`;
    if (!isObject(entry)) {
      failures.push(`${path}: case must be an object`);
      return;
    }
    rejectUnknownKeys(entry, CASE_KEYS, path, failures);
    if (validateContentLightText(entry.id, `${path}.id`, failures, { identifier: true })) {
      if (caseIds.has(entry.id)) failures.push(`${path}.id: duplicate identifier`);
      else caseIds.add(entry.id);
    }
    if (!CASE_KINDS.has(entry.kind)) failures.push(`${path}.kind: invalid case kind`);
    if (!RISK_TIERS.has(entry.riskTier)) failures.push(`${path}.riskTier: invalid risk tier`);
    if (!SHA_PATTERN.test(entry.currentHead || "")) failures.push(`${path}.currentHead: 40-char lowercase hex SHA required`);
    if (!isObject(entry.expected) || !isObject(entry.observed)) {
      failures.push(`${path}: expected and observed objects are required`);
      return;
    }
    rejectUnknownKeys(entry.expected, EXPECTED_KEYS, `${path}.expected`, failures);
    rejectUnknownKeys(entry.observed, OBSERVED_KEYS, `${path}.observed`, failures);

    if (!INTAKE_DECISIONS.has(entry.expected.intakeDecision)) failures.push(`${path}.expected.intakeDecision: invalid decision`);
    if (!Array.isArray(entry.expected.allowedVerdicts) || entry.expected.allowedVerdicts.length === 0) {
      failures.push(`${path}.expected.allowedVerdicts: non-empty array required`);
    } else {
      entry.expected.allowedVerdicts.forEach((verdict) => {
        if (!VERDICTS.has(verdict)) failures.push(`${path}.expected.allowedVerdicts: invalid verdict`);
      });
    }
    if (!Array.isArray(entry.expected.findings)) failures.push(`${path}.expected.findings: array required`);
    const expectedIds = new Set();
    array(entry.expected.findings).forEach((finding, index) => {
      const findingPath = `${path}.expected.findings[${index}]`;
      if (!isObject(finding) || !nonEmptyText(finding.id) || !SEVERITIES.has(finding.severity)) {
        failures.push(`${findingPath}: id and valid severity required`);
        return;
      }
      rejectUnknownKeys(finding, EXPECTED_FINDING_KEYS, findingPath, failures);
      validateContentLightText(finding.id, `${findingPath}.id`, failures, { identifier: true });
      if (expectedIds.has(finding.id)) failures.push(`${findingPath}.id: duplicate identifier`);
      expectedIds.add(finding.id);
    });

    if (entry.kind === "seeded-defect" && expectedIds.size === 0) failures.push(`${path}: seeded-defect requires expected findings`);
    if (entry.kind !== "seeded-defect" && expectedIds.size > 0) failures.push(`${path}: only seeded-defect cases may declare expected findings`);

    const caseContract = REQUIRED_CASE_CONTRACTS.get(entry.id);
    if (caseContract) {
      if (entry.kind !== caseContract.kind) failures.push(`${path}.kind: immutable corpus kind changed`);
      if (entry.riskTier !== caseContract.riskTier) failures.push(`${path}.riskTier: immutable corpus risk tier changed`);
      if (entry.expected.intakeDecision !== caseContract.intake) failures.push(`${path}.expected.intakeDecision: immutable corpus intake changed`);
      if (JSON.stringify(entry.expected.allowedVerdicts) !== JSON.stringify(caseContract.verdicts)) {
        failures.push(`${path}.expected.allowedVerdicts: immutable corpus verdicts changed`);
      }
      if (JSON.stringify(entry.expected.findings) !== JSON.stringify(caseContract.findings)) {
        failures.push(`${path}.expected.findings: immutable seeded identity or severity changed`);
      }
    }

    if (!SHA_PATTERN.test(entry.observed.reviewedHead || "")) failures.push(`${path}.observed.reviewedHead: 40-char lowercase hex SHA required`);
    if (!INTAKE_DECISIONS.has(entry.observed.intakeDecision)) failures.push(`${path}.observed.intakeDecision: invalid decision`);
    if (!VERDICTS.has(entry.observed.verdict)) failures.push(`${path}.observed.verdict: invalid verdict`);
    if (["high", "critical"].includes(entry.riskTier) && entry.observed.intakeDecision === "ready-for-review" && !nonEmptyText(entry.observed.humanOwner)) {
      failures.push(`${path}.observed.humanOwner: ready High/Critical review requires an accountable human owner`);
    }
    if (entry.observed.humanOwner !== undefined && !nonEmptyText(entry.observed.humanOwner)) {
      failures.push(`${path}.observed.humanOwner: must be a non-empty string when present`);
    }
    if (entry.observed.humanOwner !== undefined) {
      validateContentLightText(entry.observed.humanOwner, `${path}.observed.humanOwner`, failures, { identifier: true });
    }
    if (entry.observed.intakeDecision !== "ready-for-review" && !nonEmptyText(entry.observed.blockerReason)) {
      failures.push(`${path}.observed.blockerReason: non-ready intake requires a blocker reason`);
    }
    if (entry.observed.intakeDecision === "ready-for-review" && entry.observed.blockerReason !== undefined) {
      failures.push(`${path}.observed.blockerReason: ready intake must not carry a blocker reason`);
    }
    if (entry.observed.blockerReason !== undefined) {
      validateContentLightText(entry.observed.blockerReason, `${path}.observed.blockerReason`, failures);
    }
    if (!Array.isArray(entry.observed.coverage)) failures.push(`${path}.observed.coverage: array required`);
    else {
      const coverageCriteria = new Set();
      for (let index = 0; index < entry.observed.coverage.length; index += 1) {
        const rowPath = `${path}.observed.coverage[${index}]`;
        if (!(index in entry.observed.coverage)) {
          failures.push(`${rowPath}: sparse entries are forbidden`);
          continue;
        }
        const row = entry.observed.coverage[index];
        validateCoverage(row, rowPath, failures);
        if (isObject(row) && nonEmptyText(row.criterion)) {
          const criterionIdentity = row.criterion.normalize("NFKC").trim().toLowerCase();
          if (coverageCriteria.has(criterionIdentity)) failures.push(`${rowPath}.criterion: duplicate criterion`);
          coverageCriteria.add(criterionIdentity);
        }
      }
    }
    if (!Array.isArray(entry.observed.findings)) failures.push(`${path}.observed.findings: array required`);
    else {
      const findingIds = new Set();
      for (let index = 0; index < entry.observed.findings.length; index += 1) {
        const findingPath = `${path}.observed.findings[${index}]`;
        if (!(index in entry.observed.findings)) {
          failures.push(`${findingPath}: sparse entries are forbidden`);
          continue;
        }
        const finding = entry.observed.findings[index];
        validateFinding(finding, findingPath, failures);
        if (isObject(finding) && nonEmptyText(finding.id)) {
          if (findingIds.has(finding.id)) failures.push(`${findingPath}.id: duplicate identifier`);
          findingIds.add(finding.id);
        }
      }
      if (entry.observed.intakeDecision !== "ready-for-review" && entry.observed.findings.length > 0) {
        failures.push(`${path}.observed.findings: non-ready intake must not manufacture findings`);
      }
    }
  });

  const missingCaseIds = [...REQUIRED_CASE_IDS].filter((id) => !caseIds.has(id));
  const unexpectedCaseIds = [...caseIds].filter((id) => !REQUIRED_CASE_IDS.has(id));
  if (missingCaseIds.length > 0) failures.push(`fixture topology missing cases: ${missingCaseIds.join(", ")}`);
  if (unexpectedCaseIds.length > 0) failures.push("fixture topology has unexpected cases");

  return failures;
}

export function evaluateReviewQuality(fixture) {
  const failures = validateReviewQualityFixture(fixture);
  const cases = array(fixture?.cases);
  let seededDefects = 0;
  let cleanControls = 0;
  let admissionBlockers = 0;
  let criticalHighExpected = 0;
  let criticalHighDetected = 0;
  let totalFindings = 0;
  let actionableFindings = 0;
  let cleanControlsWithAnyFinding = 0;
  let cleanControlsWithBlockingFinding = 0;

  cases.forEach((entry, caseIndex) => {
    if (!isObject(entry) || !isObject(entry.expected) || !isObject(entry.observed)) return;
    const label = `cases[${caseIndex}]`;
    const observedFindingEntries = array(entry.observed.findings);
    const observedFindings = observedFindingEntries.filter(isObject);
    totalFindings += observedFindingEntries.length;
    actionableFindings += observedFindingEntries.filter((finding) => {
      if (!isObject(finding)) return false;
      return FINDING_TEXT_FIELDS.every((field) => nonEmptyText(finding[field])) &&
        SEVERITIES.has(finding.severity) && Number.isInteger(finding.line) && finding.line > 0 &&
        CONFIDENCE.has(finding.confidence);
    }).length;

    if (entry.kind === "seeded-defect") seededDefects += 1;
    if (entry.kind === "clean-control") {
      cleanControls += 1;
      if (observedFindingEntries.length > 0) {
        cleanControlsWithAnyFinding += 1;
        failures.push(`${label}: clean control has unexpected finding`);
      }
      if (observedFindingEntries.some((finding) => BLOCKING_SEVERITIES.has(finding?.severity))) {
        cleanControlsWithBlockingFinding += 1;
        failures.push(`${label}: clean control has unexpected Critical/High finding`);
      }
    }
    if (entry.kind === "admission-blocker") admissionBlockers += 1;

    if (entry.observed.reviewedHead !== entry.currentHead) failures.push(`${label}: reviewed head is stale`);
    if (entry.observed.intakeDecision !== entry.expected.intakeDecision) {
      failures.push(`${label}: intake decision does not match the immutable expectation`);
    }
    if (!array(entry.expected.allowedVerdicts).includes(entry.observed.verdict)) {
      failures.push(`${label}: observed verdict is not allowed`);
    }
    if (entry.observed.intakeDecision !== "ready-for-review" && entry.observed.verdict !== "blocked") {
      failures.push(`${label}: non-ready intake must use blocked verdict`);
    }
    if (entry.observed.intakeDecision === "ready-for-review" && array(entry.observed.coverage).length === 0) {
      failures.push(`${label}: ready review requires semantic coverage`);
    }
    if (entry.observed.verdict === "approve" && array(entry.observed.coverage).some((row) => row?.verdict === "gap")) {
      failures.push(`${label}: approve is forbidden with semantic coverage gaps`);
    }

    const observedById = new Map(observedFindings.map((finding) => [finding?.id, finding]));
    for (const expected of array(entry.expected.findings)) {
      if (BLOCKING_SEVERITIES.has(expected?.severity)) criticalHighExpected += 1;
      const observed = observedById.get(expected?.id);
      if (!observed) {
        failures.push(`${label}: missed seeded finding`);
        continue;
      }
      if (BLOCKING_SEVERITIES.has(expected?.severity)) criticalHighDetected += 1;
      if (observed.severity !== expected.severity) {
        failures.push(`${label}: seeded finding severity does not match the immutable expectation`);
      }
    }
  });

  const metrics = {
    totalCases: cases.length,
    seededDefects,
    cleanControls,
    admissionBlockers,
    criticalHighRecall: criticalHighExpected === 0 ? 1 : criticalHighDetected / criticalHighExpected,
    cleanControlFalsePositiveRate: cleanControls === 0 ? 0 : cleanControlsWithAnyFinding / cleanControls,
    cleanControlBlockingFalsePositiveRate: cleanControls === 0 ? 0 : cleanControlsWithBlockingFinding / cleanControls,
    actionableFindingRate: totalFindings === 0 ? 1 : actionableFindings / totalFindings,
  };

  if (metrics.criticalHighRecall !== 1) failures.push(`critical/high recall must be 1, got ${metrics.criticalHighRecall}`);
  if (metrics.cleanControlFalsePositiveRate !== 0) failures.push("clean-control false-positive rate must be 0");
  if (metrics.cleanControlBlockingFalsePositiveRate !== 0) failures.push("clean-control blocking false-positive rate must be 0");
  if (metrics.actionableFindingRate !== 1) failures.push(`actionable finding rate must be 1, got ${metrics.actionableFindingRate}`);

  return { pass: failures.length === 0, failures: [...new Set(failures)], metrics };
}
