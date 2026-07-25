import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { failClosed } from "./fail-closed.mjs";
import { computeDevelopmentPacketHash, requireControlPlaneSafetyContract } from "./packet.mjs";

const EVIDENCE_SCHEMA = "ddalggak.development_run_evidence.v2";
const EVENT_FIELDS = new Set([
  "eventId",
  "eventHash",
  "sequence",
  "recordedAt",
  "type",
  "invocationId",
  "attemptId",
  "budgetCost",
  "outcomeCertainty",
  "failureClass",
  "evidenceRefs",
  "reason",
  "approved",
  "exitCode",
  "verificationPassed",
  "sideEffectClass",
]);
const EVENT_TYPES = new Set([
  "run_started",
  "dispatch_prepared",
  "approval_blocked",
  "budget_reserved",
  "side_effect_intent_recorded",
  "execution_observed",
  "verification_recorded",
  "run_stopped",
]);
const OUTCOME_CERTAINTY = new Set(["not_applicable", "pending", "certain", "ambiguous"]);
const FORBIDDEN_CONTENT_KEYS = new Set([
  "rawprompt",
  "rawtranscript",
  "secret",
  "secrets",
  "token",
  "tokens",
  "credential",
  "credentials",
  "githubmutationpayload",
  "toolpayload",
  "payload",
  "privatelog",
  "privatesession",
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function evidencePathFor(packet) {
  if (!packet?.evidenceDir) {
    throw failClosed("packet evidenceDir is required before evidence write");
  }
  return path.join(packet.evidenceDir, `${packet.runId}.json`);
}

function assertContentLight(value, location = "evidence") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (FORBIDDEN_CONTENT_KEYS.has(normalized)) {
      throw failClosed("content-light evidence rejects sensitive or raw payload fields", {
        location: `${location}.${key}`,
      });
    }
    assertContentLight(child, `${location}.${key}`);
  }
}

function normalizeEvent(rawEvent, expectedSequence) {
  if (!rawEvent || typeof rawEvent !== "object" || Array.isArray(rawEvent)) {
    throw failClosed("development evidence event must be an object");
  }
  for (const key of Object.keys(rawEvent)) {
    if (!EVENT_FIELDS.has(key)) {
      throw failClosed("unsupported event field violates content-light contract", { key });
    }
  }
  assertContentLight(rawEvent, "event");
  if (!rawEvent.eventId || typeof rawEvent.eventId !== "string" || rawEvent.eventId.length > 256) {
    throw failClosed("development evidence eventId is required and bounded");
  }
  if (!EVENT_TYPES.has(rawEvent.type)) {
    throw failClosed("unsupported development evidence event type", { type: rawEvent.type });
  }
  if (!rawEvent.recordedAt || Number.isNaN(Date.parse(rawEvent.recordedAt))) {
    throw failClosed("development evidence recordedAt must be an ISO timestamp");
  }
  const sequence = rawEvent.sequence ?? expectedSequence;
  if (!Number.isInteger(sequence) || sequence !== expectedSequence) {
    throw failClosed("development evidence event sequence must be contiguous", {
      expectedSequence,
      actualSequence: sequence,
    });
  }
  const budgetCost = rawEvent.budgetCost ?? 0;
  if (!Number.isInteger(budgetCost) || budgetCost < 0 || budgetCost > 1) {
    throw failClosed("development evidence budgetCost must be zero or one", { budgetCost });
  }
  if (rawEvent.type === "budget_reserved" ? budgetCost !== 1 : budgetCost !== 0) {
    throw failClosed("only budget_reserved may consume the attempt budget", {
      type: rawEvent.type,
      budgetCost,
    });
  }
  const outcomeCertainty = rawEvent.outcomeCertainty || "not_applicable";
  if (!OUTCOME_CERTAINTY.has(outcomeCertainty)) {
    throw failClosed("unsupported outcome certainty", { outcomeCertainty });
  }
  const evidenceRefs = rawEvent.evidenceRefs || [];
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length > 16 || evidenceRefs.some((ref) => typeof ref !== "string" || ref.length > 512)) {
    throw failClosed("development evidence refs must be a bounded string array");
  }
  if (rawEvent.reason != null && (typeof rawEvent.reason !== "string" || rawEvent.reason.length > 256)) {
    throw failClosed("development evidence reason must be a bounded string");
  }
  const event = {
    ...rawEvent,
    sequence,
    budgetCost,
    outcomeCertainty,
    failureClass: rawEvent.failureClass ?? null,
    evidenceRefs,
  };
  delete event.eventHash;
  const eventHash = sha256(event);
  if (rawEvent.eventHash && rawEvent.eventHash !== eventHash) {
    throw failClosed("development evidence event hash mismatch", { eventId: rawEvent.eventId });
  }
  return { ...event, eventHash };
}

function assertProjection(projection) {
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) {
    throw failClosed("development evidence projection must be an object");
  }
  assertContentLight(projection, "projection");
  for (const flag of ["rawPromptStored", "rawTranscriptStored", "githubMutationPayloadStored"]) {
    if (projection[flag] !== false) {
      throw failClosed("content-light evidence flags must remain false", { flag, value: projection[flag] });
    }
  }
}

export function reduceDevelopmentEvidence(document) {
  const events = Array.isArray(document?.events) ? document.events : [];
  const budgetLimit = document?.attemptBudget ?? 1;
  const attemptsConsumed = events.reduce((total, event) => total + (event.type === "budget_reserved" ? event.budgetCost : 0), 0);
  const latestIntent = [...events].reverse().find((event) => event.type === "side_effect_intent_recorded");
  const latestObservation = [...events].reverse().find((event) => event.type === "execution_observed");
  const matchingObservation = latestIntent
    ? events.find((event) => event.type === "execution_observed" && event.invocationId === latestIntent.invocationId)
    : latestObservation || null;
  const latestVerification = [...events].reverse().find((event) => event.type === "verification_recorded");
  const latestStop = [...events].reverse().find((event) => event.type === "run_stopped");
  const approvalBlocked = [...events].reverse().find((event) => event.type === "approval_blocked");

  let decision = "pending_approval";
  let status = "dispatch_prepared";
  let nextAction = "pending approval";
  let outcomeCertainty = "not_applicable";

  if (latestIntent && !matchingObservation) {
    decision = "reconciliation_required";
    status = "blocked";
    nextAction = "reconciliation required";
    outcomeCertainty = "ambiguous";
  } else if (latestVerification) {
    const fulfilled = matchingObservation?.exitCode === 0 && latestVerification.verificationPassed === true;
    decision = fulfilled ? "terminal_success" : "terminal_failure";
    status = fulfilled ? "fulfilled" : "blocked";
    nextAction = fulfilled ? "verification passed" : "inspect worker or verification result";
    outcomeCertainty = "certain";
  } else if (matchingObservation && matchingObservation.exitCode !== 0) {
    decision = "terminal_failure";
    status = "blocked";
    nextAction = "inspect worker or verification result";
    outcomeCertainty = "certain";
  } else if (latestStop?.failureClass) {
    decision = latestStop.failureClass === "approval_required" ? "approval_required" : "terminal_failure";
    status = "blocked";
    nextAction = latestStop.reason || "inspect stopped run";
    outcomeCertainty = latestStop.outcomeCertainty || "certain";
  } else if (approvalBlocked) {
    decision = "approval_required";
    status = "blocked";
    nextAction = "pending approval";
  } else if (attemptsConsumed >= budgetLimit) {
    decision = "budget_exhausted";
    status = "blocked";
    nextAction = "attempt budget exhausted";
  }

  return {
    decision,
    status,
    nextAction,
    outcomeCertainty,
    attemptsConsumed,
    budgetRemaining: Math.max(0, budgetLimit - attemptsConsumed),
    autoExecute: false,
  };
}

function deriveProjection(baseProjection, events, attemptBudget) {
  assertProjection(baseProjection);
  const reduction = reduceDevelopmentEvidence({ events, attemptBudget });
  const observed = [...events].reverse().find((event) => event.type === "execution_observed");
  const verified = [...events].reverse().find((event) => event.type === "verification_recorded");
  return {
    ...baseProjection,
    status: reduction.status,
    nextAction: reduction.nextAction,
    outcomeCertainty: reduction.outcomeCertainty,
    attemptsConsumed: reduction.attemptsConsumed,
    budgetRemaining: reduction.budgetRemaining,
    decision: reduction.decision,
    autoExecute: false,
    workerExecuted: Boolean(observed),
    ...(observed ? { exitCode: observed.exitCode } : {}),
    ...(verified ? { verificationPassed: verified.verificationPassed === true } : {}),
  };
}

function buildDocument(packet, events, baseProjection, revision) {
  const projection = deriveProjection(baseProjection, events, packet.attemptBudget);
  const document = {
    ...projection,
    schema: EVIDENCE_SCHEMA,
    schemaVersion: 2,
    runId: packet.runId,
    writerEpoch: packet.writerEpoch,
    writerProcessId: packet.writerProcessId,
    packetHash: packet.packetHash,
    revision,
    maxEvents: packet.maxEvents,
    attemptBudget: packet.attemptBudget,
    events,
    projection,
  };
  return { ...document, documentHash: sha256(document) };
}

function validateDocument(packet, document) {
  if (!document || document.schema !== EVIDENCE_SCHEMA || document.schemaVersion !== 2) {
    throw failClosed("development evidence document schema mismatch");
  }
  const computedPacketHash = computeDevelopmentPacketHash(packet);
  if (packet.packetHash !== computedPacketHash) {
    throw failClosed("development packet hash mismatch", {
      expectedPacketHash: computedPacketHash,
      actualPacketHash: packet.packetHash,
    });
  }
  const { documentHash, ...hashableDocument } = document;
  if (typeof documentHash !== "string" || documentHash !== sha256(hashableDocument)) {
    throw failClosed("development evidence document hash mismatch");
  }
  if (
    document.runId !== packet.runId
    || document.writerEpoch !== packet.writerEpoch
    || document.writerProcessId !== packet.writerProcessId
    || document.packetHash !== packet.packetHash
  ) {
    throw failClosed("development evidence owner or packet binding mismatch", {
      runId: document.runId,
      writerEpoch: document.writerEpoch,
      packetHash: document.packetHash,
    });
  }
  if (!Number.isInteger(document.revision) || document.revision < 0) {
    throw failClosed("development evidence revision must be a non-negative integer");
  }
  if (document.maxEvents !== packet.maxEvents || document.attemptBudget !== packet.attemptBudget) {
    throw failClosed("development evidence budget binding mismatch", {
      maxEvents: document.maxEvents,
      attemptBudget: document.attemptBudget,
    });
  }
  if (!Array.isArray(document.events) || document.events.length > packet.maxEvents) {
    throw failClosed("development evidence events exceed the packet bound");
  }
  const ids = new Set();
  document.events.forEach((event, sequence) => {
    const normalized = normalizeEvent(event, sequence);
    if (ids.has(normalized.eventId)) {
      throw failClosed("development evidence contains a duplicate event id", { eventId: normalized.eventId });
    }
    ids.add(normalized.eventId);
  });
  assertProjection(document.projection);
  const derived = deriveProjection(document.projection, document.events, packet.attemptBudget);
  for (const key of ["status", "nextAction", "outcomeCertainty", "attemptsConsumed", "budgetRemaining", "decision", "autoExecute", "workerExecuted"]) {
    if (document.projection[key] !== derived[key] || document[key] !== document.projection[key]) {
      throw failClosed("development evidence projection drift", { key });
    }
  }
  return document;
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeCompleteTemp(directory, fileName, document) {
  const tempPath = path.join(directory, `.${fileName}.tmp-${randomUUID()}`);
  const descriptor = openSync(tempPath, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  return tempPath;
}

function removeTemp(tempPath) {
  try {
    unlinkSync(tempPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function publishInitialDocument(packet, document, faultInjector) {
  mkdirSync(packet.evidenceDir, { recursive: true });
  const evidencePath = evidencePathFor(packet);
  const tempPath = writeCompleteTemp(packet.evidenceDir, path.basename(evidencePath), document);
  try {
    faultInjector?.("before-initial-publish");
    linkSync(tempPath, evidencePath);
    faultInjector?.("after-initial-publish");
    removeTemp(tempPath);
    fsyncDirectory(packet.evidenceDir);
  } catch (error) {
    removeTemp(tempPath);
    throw error;
  }
  return evidencePath;
}

function replaceDocument(packet, document, faultInjector) {
  const evidencePath = evidencePathFor(packet);
  const tempPath = writeCompleteTemp(packet.evidenceDir, path.basename(evidencePath), document);
  try {
    faultInjector?.("before-rename");
    renameSync(tempPath, evidencePath);
    faultInjector?.("after-rename");
    fsyncDirectory(packet.evidenceDir);
  } catch (error) {
    removeTemp(tempPath);
    throw error;
  }
  return evidencePath;
}

export function makeEvidence(packet, overrides = {}) {
  requireControlPlaneSafetyContract(packet);
  const evidence = {
    schema: "ddalggak.development_run_evidence.v1",
    runId: packet.runId,
    repo: packet.repo,
    repoRoot: packet.repoRoot,
    issueUrl: packet.issue.url,
    subcommand: packet.subcommand,
    evidencePolicy: "content-light",
    rawPromptStored: false,
    rawTranscriptStored: false,
    githubMutationPayloadStored: false,
    ...overrides,
  };
  assertProjection(evidence);
  return evidence;
}

export function readDevelopmentEvidence(packet) {
  const evidencePath = evidencePathFor(packet);
  let document;
  try {
    document = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch (error) {
    throw failClosed("development evidence document is missing or malformed", {
      evidencePath,
      cause: error?.code || error?.name || "unknown",
    });
  }
  return validateDocument(packet, document);
}

export function writeDevelopmentEvidence(packet, evidence, { faultInjector } = {}) {
  requireControlPlaneSafetyContract(packet);
  assertProjection(evidence);
  const evidencePath = evidencePathFor(packet);
  if (existsSync(evidencePath)) {
    const current = readDevelopmentEvidence(packet);
    const alreadyPersisted = Object.entries(evidence).every(
      ([key, value]) => canonicalJson(current.projection[key]) === canonicalJson(value),
    );
    if (alreadyPersisted) return evidencePath;

    const recordedAt = new Date().toISOString();
    const legacyInvocationId = `${packet.runId}:legacy-write:${current.revision + 1}`;
    const legacyEvents = [];
    if (evidence.workerExecuted === true || evidence.status === "fulfilled") {
      const exitCode = Number.isInteger(evidence.exitCode)
        ? evidence.exitCode
        : evidence.status === "fulfilled" ? 0 : 1;
      const verificationPassed = evidence.verificationPassed === true || evidence.status === "fulfilled";
      legacyEvents.push(
        {
          eventId: `${legacyInvocationId}:execution-observed`,
          recordedAt,
          type: "execution_observed",
          invocationId: legacyInvocationId,
          attemptId: `${legacyInvocationId}:attempt`,
          budgetCost: 0,
          outcomeCertainty: "certain",
          failureClass: exitCode === 0 ? null : "legacy_runner_failed",
          evidenceRefs: [],
          exitCode,
          reason: "legacy evidence writer imported an observed result",
        },
        {
          eventId: `${legacyInvocationId}:verification-recorded`,
          recordedAt,
          type: "verification_recorded",
          invocationId: legacyInvocationId,
          attemptId: `${legacyInvocationId}:attempt`,
          budgetCost: 0,
          outcomeCertainty: "certain",
          failureClass: verificationPassed ? null : "legacy_verification_failed",
          evidenceRefs: [],
          verificationPassed,
          reason: verificationPassed ? "verification passed" : "verification did not pass",
        },
      );
    } else if (evidence.status === "dispatch_prepared") {
      legacyEvents.push({
        eventId: `${legacyInvocationId}:dispatch-prepared`,
        recordedAt,
        type: "dispatch_prepared",
        invocationId: legacyInvocationId,
        budgetCost: 0,
        outcomeCertainty: "not_applicable",
        failureClass: null,
        evidenceRefs: [],
        reason: evidence.nextAction || "pending approval",
      });
    } else {
      legacyEvents.push({
        eventId: `${legacyInvocationId}:run-stopped`,
        recordedAt,
        type: "run_stopped",
        invocationId: legacyInvocationId,
        budgetCost: 0,
        outcomeCertainty: "certain",
        failureClass: "legacy_blocked",
        evidenceRefs: [],
        reason: evidence.nextAction || evidence.status || "legacy evidence blocked",
      });
    }
    return recordDevelopmentEvidenceEvents(packet, {
      events: legacyEvents,
      projection: evidence,
      expectedRevision: current.revision,
      faultInjector,
    }).evidencePath;
  }

  const recordedAt = new Date().toISOString();
  const initialEvents = [
    normalizeEvent({
      eventId: `${packet.runId}:run-started`,
      recordedAt,
      type: "run_started",
      budgetCost: 0,
      outcomeCertainty: "not_applicable",
      failureClass: null,
      evidenceRefs: [],
      reason: "development run initialized",
    }, 0),
    normalizeEvent({
      eventId: `${packet.runId}:dispatch-prepared`,
      recordedAt,
      type: "dispatch_prepared",
      invocationId: `${packet.runId}:${packet.subcommand}:runtime-dispatch`,
      budgetCost: 0,
      outcomeCertainty: "not_applicable",
      failureClass: null,
      evidenceRefs: [],
      reason: "pending approval",
    }, 1),
  ];
  const document = buildDocument(packet, initialEvents, evidence, 0);
  publishInitialDocument(packet, document, faultInjector);
  return evidencePath;
}

export function recordDevelopmentEvidenceEvents(packet, {
  events,
  projection,
  expectedRevision,
  faultInjector,
}) {
  requireControlPlaneSafetyContract(packet);
  if (!Array.isArray(events) || events.length === 0) {
    throw failClosed("at least one development evidence event is required");
  }
  const current = readDevelopmentEvidence(packet);
  if (current.revision !== expectedRevision) {
    throw failClosed("development evidence revision mismatch", {
      expectedRevision,
      actualRevision: current.revision,
    });
  }
  const existingById = new Map(current.events.map((event) => [event.eventId, event]));
  const nextEvents = [...current.events];
  for (const rawEvent of events) {
    const existing = existingById.get(rawEvent?.eventId);
    const candidate = existing ? { ...rawEvent, eventHash: undefined } : rawEvent;
    const normalized = normalizeEvent(candidate, existing ? existing.sequence : nextEvents.length);
    if (existing) {
      if (existing.eventHash !== normalized.eventHash) {
        throw failClosed("conflicting duplicate event id", { eventId: normalized.eventId });
      }
      continue;
    }
    if (nextEvents.length >= packet.maxEvents) {
      throw failClosed("development evidence event budget exhausted", { maxEvents: packet.maxEvents });
    }
    nextEvents.push(normalized);
    existingById.set(normalized.eventId, normalized);
  }
  if (nextEvents.length === current.events.length) {
    const projected = deriveProjection(projection, current.events, packet.attemptBudget);
    if (canonicalJson(projected) !== canonicalJson(current.projection)) {
      throw failClosed("idempotent event replay cannot change the projection");
    }
    return { document: current, evidencePath: evidencePathFor(packet) };
  }
  const document = buildDocument(packet, nextEvents, projection, current.revision + 1);
  replaceDocument(packet, document, faultInjector);
  return { document, evidencePath: evidencePathFor(packet) };
}
