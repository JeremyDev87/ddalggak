import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { pathExists } from "../local-payload.mjs";

const DEFAULT_SESSION_STALE_HOURS = 24;
const SESSION_STATE_RELATIVE_PATH = join(".ddalggak", "session-state.json");

function resolveWorkspaceRoot() {
  return resolve(
    process.env.DDALGGAK_WORKSPACE_ROOT &&
      process.env.DDALGGAK_WORKSPACE_ROOT.length > 0
      ? process.env.DDALGGAK_WORKSPACE_ROOT
      : process.cwd(),
  );
}

function typeOfValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function matchesType(value, expected) {
  const actual = typeOfValue(value);
  if (expected === "number") return actual === "number" || actual === "integer";
  return actual === expected;
}

// Minimal zero-dependency JSON Schema subset validator. Supports exactly the
// keywords core/state/session-state.schema.json uses: local $ref, type, const,
// enum, required, properties, items, and format "date-time". Unknown keywords
// are ignored, matching JSON Schema annotation semantics.
function resolveLocalRef(rootSchema, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return null;
  return ref
    .slice(2)
    .split("/")
    .reduce((node, segment) => {
      if (!node || typeOfValue(node) !== "object") return undefined;
      const key = segment.replace(/~1/g, "/").replace(/~0/g, "~");
      return node[key];
    }, rootSchema);
}

export function collectSchemaViolations(
  schema,
  value,
  path,
  violations,
  rootSchema = schema,
  refStack = [],
) {
  if (schema && Object.hasOwn(schema, "$ref")) {
    const ref = schema.$ref;
    if (refStack.includes(ref)) {
      violations.push(`${path}: circular schema $ref ${ref}`);
      return;
    }
    const resolvedSchema = resolveLocalRef(rootSchema, ref);
    if (!resolvedSchema) {
      violations.push(`${path}: unsupported or unresolved schema $ref ${ref}`);
      return;
    }
    collectSchemaViolations(resolvedSchema, value, path, violations, rootSchema, [
      ...refStack,
      ref,
    ]);
    return;
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) {
    violations.push(
      `${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`,
    );
    return;
  }
  if (Object.hasOwn(schema, "enum") && !schema.enum.includes(value)) {
    violations.push(
      `${path}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`,
    );
    return;
  }
  if (Object.hasOwn(schema, "type")) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.some((expected) => matchesType(value, expected))) {
      violations.push(
        `${path}: expected type ${allowed.join("|")}, got ${typeOfValue(value)}`,
      );
      return;
    }
  }
  if (
    schema.format === "date-time" &&
    typeof value === "string" &&
    Number.isNaN(Date.parse(value))
  ) {
    violations.push(
      `${path}: expected ISO-8601 date-time, got ${JSON.stringify(value)}`,
    );
    return;
  }
  if (typeOfValue(value) === "object") {
    for (const requiredKey of schema.required || []) {
      if (!Object.hasOwn(value, requiredKey)) {
        violations.push(`${path}: missing required field "${requiredKey}"`);
      }
    }
    for (const [key, childSchema] of Object.entries(schema.properties || {})) {
      if (Object.hasOwn(value, key)) {
        collectSchemaViolations(
          childSchema,
          value[key],
          `${path}.${key}`,
          violations,
          rootSchema,
          refStack,
        );
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    for (let index = 0; index < value.length; index += 1) {
      collectSchemaViolations(
        schema.items,
        value[index],
        `${path}[${index}]`,
        violations,
        rootSchema,
        refStack,
      );
    }
  }
}

export function collectPhaseLedgerViolations(state) {
  const ledger = state?.phase_ledger;
  if (!ledger) return [];

  const violations = [];
  const phases = ledger.phases || [];
  const ids = new Set();
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (ids.has(phase.id)) {
      violations.push(`$.phase_ledger.phases[${index}].id: duplicate phase id ${JSON.stringify(phase.id)}`);
    }
    ids.add(phase.id);
    if (phase.next_phase_id !== null && !phases.some((candidate) => candidate.id === phase.next_phase_id)) {
      violations.push(`$.phase_ledger.phases[${index}].next_phase_id: unknown phase ${JSON.stringify(phase.next_phase_id)}`);
    }
    if ((phase.status === "completed" || phase.status === "skipped") && phase.evidence.length === 0) {
      violations.push(`$.phase_ledger.phases[${index}].evidence: ${phase.status} phase requires evidence`);
    }
  }

  if (ledger.mode === "multi" && phases.length < 2) {
    violations.push("$.phase_ledger.phases: multi mode requires at least two phases");
  }
  const active = phases.filter((phase) => phase.status === "in_progress" || phase.status === "blocked");
  const terminalPhases = phases.filter((phase) => phase.next_phase_id === null);
  if (phases.length > 0 && terminalPhases.length !== 1) {
    violations.push(`$.phase_ledger.phases: expected exactly one graph terminal (next_phase_id null), got ${terminalPhases.length}`);
  }
  const terminal =
    phases.length > 0 &&
    phases.every((phase) => phase.status === "completed" || phase.status === "skipped") &&
    ledger.next_phase_id === null;

  if (terminal) {
    const terminalPhase = terminalPhases.length === 1 ? terminalPhases[0] : null;
    if (!terminalPhase) return violations;
    if (ledger.current_phase_id !== terminalPhase.id) {
      violations.push(
        `$.phase_ledger.current_phase_id: terminal projection ${JSON.stringify(ledger.current_phase_id)} does not match final phase ${JSON.stringify(terminalPhase.id)}`,
      );
    }
    if (state.phase !== terminalPhase.id) {
      violations.push(
        `$.phase: terminal projection ${JSON.stringify(state.phase)} does not match final phase ${JSON.stringify(terminalPhase.id)}`,
      );
    }
  } else if (active.length !== 1) {
    violations.push(`$.phase_ledger.phases: expected exactly one in_progress/blocked phase or a terminal ledger, got ${active.length}`);
  } else {
    const activePhase = active[0];
    if (ledger.current_phase_id !== activePhase.id) {
      violations.push(
        `$.phase_ledger.current_phase_id: projection ${JSON.stringify(ledger.current_phase_id)} does not match canonical active phase ${JSON.stringify(activePhase.id)}`,
      );
    }
    if (state.phase !== activePhase.id) {
      violations.push(
        `$.phase: projection ${JSON.stringify(state.phase)} does not match phase_ledger active phase ${JSON.stringify(activePhase.id)}`,
      );
    }
    if (ledger.next_phase_id !== activePhase.next_phase_id) {
      violations.push(
        `$.phase_ledger.next_phase_id: projection ${JSON.stringify(ledger.next_phase_id)} does not match active phase ${JSON.stringify(activePhase.next_phase_id)}`,
      );
    }
  }
  if (ledger.next_phase_id !== null) {
    const next = phases.find((phase) => phase.id === ledger.next_phase_id);
    if (!next) {
      violations.push(`$.phase_ledger.next_phase_id: unknown phase ${JSON.stringify(ledger.next_phase_id)}`);
    } else if (next.status !== "planned") {
      violations.push(
        `$.phase_ledger.next_phase_id: next phase ${JSON.stringify(next.id)} must be planned, got ${JSON.stringify(next.status)}`,
      );
    }
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(ledger.plan_hash)) {
    violations.push(
      "$.phase_ledger.plan_hash: expected sha256:<64 lowercase hex> for the referenced LF-normalized plan artifact",
    );
  }
  return violations;
}

export async function collectPlanArtifactViolations(state, workspaceRoot) {
  const ledger = state?.phase_ledger;
  if (!ledger) return { violations: [], artifact: null };

  const planPaths = [
    ...new Set(
      (state.lanes || [])
        .map((lane) => lane?.artifacts?.plan)
        .filter((planPath) => typeof planPath === "string" && planPath.length > 0),
    ),
  ];
  if (planPaths.length !== 1) {
    return {
      violations: [
        `$.lanes[].artifacts.plan: phase ledger requires exactly one plan artifact path, got ${planPaths.length}`,
      ],
      artifact: null,
    };
  }

  const planPath = planPaths[0];
  const absolutePath = resolve(workspaceRoot, planPath);
  let raw;
  try {
    raw = await readFile(absolutePath);
  } catch {
    return {
      violations: [`$.lanes[].artifacts.plan: plan artifact not found at ${planPath}`],
      artifact: { path: planPath, expectedHash: ledger.plan_hash },
    };
  }
  const normalized = raw.toString("utf8").replace(/\\r\\n?/g, "\\n");
  const actualHash = createHash("sha256")
    .update(Buffer.from(normalized, "utf8"))
    .digest("hex");
  const actual = `sha256:${actualHash}`;
  if (actual !== ledger.plan_hash) {
    return {
      violations: [
        `$.phase_ledger.plan_hash: expected ${ledger.plan_hash}, actual ${actual} for ${planPath}`,
      ],
      artifact: { path: planPath, expectedHash: ledger.plan_hash, actualHash: actual },
    };
  }
  return {
    violations: [],
    artifact: { path: planPath, expectedHash: ledger.plan_hash, actualHash: actual },
  };
}

export async function validateSessionStateData({ state, schemaPath, workspaceRoot }) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const violations = [];
  collectSchemaViolations(schema, state, "$", violations);
  violations.push(...collectPhaseLedgerViolations(state));
  const planCheck = await collectPlanArtifactViolations(state, workspaceRoot);
  violations.push(...planCheck.violations);
  return { violations, planArtifact: planCheck.artifact, schema };
}

// Judges the workspace session state file independently from the installed
// skill state so the parity contract stays deterministic regardless of what
// .ddalggak/ holds in the current workspace.
export async function collectSessionStateEvidence({ schemaPath }) {
  const sessionStatePath = join(resolveWorkspaceRoot(), SESSION_STATE_RELATIVE_PATH);
  const evidence = {
    path: sessionStatePath,
    schemaPath,
    status: "absent",
    updatedAt: null,
    ageHours: null,
    staleAfterHours: DEFAULT_SESSION_STALE_HOURS,
    violations: [],
    phaseLedger: { status: "absent", currentPhaseId: null, nextPhaseId: null },
    planArtifact: null,
    action: "No session state file found; nothing to validate.",
  };
  if (!(await pathExists(sessionStatePath))) return evidence;

  let state;
  try {
    state = JSON.parse(await readFile(sessionStatePath, "utf8"));
  } catch (error) {
    evidence.status = "malformed";
    evidence.violations = [
      `$: ${error && error.message ? error.message : String(error)}`,
    ];
    evidence.action =
      "Rewrite .ddalggak/session-state.json as valid JSON before trusting resume state.";
    return evidence;
  }

  let validation;
  try {
    validation = await validateSessionStateData({
      state,
      schemaPath,
      workspaceRoot: resolveWorkspaceRoot(),
    });
  } catch (error) {
    evidence.status = "schema-unavailable";
    evidence.violations = [
      `schema: ${error && error.message ? error.message : String(error)}`,
    ];
    evidence.action =
      "Reinstall the ddalggak package; core/state/session-state.schema.json is missing or unreadable.";
    return evidence;
  }
  const staleAfterHours = validation.schema["x-ddalggak"]?.staleAfterHours;
  if (typeof staleAfterHours === "number" && staleAfterHours > 0) {
    evidence.staleAfterHours = staleAfterHours;
  }

  const violations = validation.violations;
  if (violations.length > 0) {
    evidence.status = "invalid";
    evidence.violations = violations;
    evidence.action =
      "Fix the schema violations before trusting resume state; see core/state/session-state.schema.json.";
    return evidence;
  }

  if (state.phase_ledger) {
    evidence.phaseLedger = {
      status: "valid",
      mode: state.phase_ledger.mode,
      planId: state.phase_ledger.plan_id,
      planHash: state.phase_ledger.plan_hash,
      currentPhaseId: state.phase_ledger.current_phase_id,
      nextPhaseId: state.phase_ledger.next_phase_id,
    };
  }
  evidence.planArtifact = validation.planArtifact;
  evidence.updatedAt = state.updated_at;
  const ageMs = Date.now() - Date.parse(state.updated_at);
  evidence.ageHours = Math.round((ageMs / 36e5) * 100) / 100;
  if (ageMs > evidence.staleAfterHours * 36e5) {
    evidence.status = "stale";
    evidence.action = `Session state is older than ${evidence.staleAfterHours}h; rebuild it from live git/GitHub state before resuming.`;
    return evidence;
  }
  evidence.status = "valid";
  evidence.action =
    "Session state matches the schema and is fresh enough to trust for resume.";
  return evidence;
}
