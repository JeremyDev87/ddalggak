import { readFile } from "node:fs/promises";
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

function collectSchemaViolations(
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

  let schema;
  try {
    schema = JSON.parse(await readFile(schemaPath, "utf8"));
  } catch (error) {
    evidence.status = "schema-unavailable";
    evidence.violations = [
      `schema: ${error && error.message ? error.message : String(error)}`,
    ];
    evidence.action =
      "Reinstall the ddalggak package; core/state/session-state.schema.json is missing or unreadable.";
    return evidence;
  }
  const staleAfterHours = schema["x-ddalggak"]?.staleAfterHours;
  if (typeof staleAfterHours === "number" && staleAfterHours > 0) {
    evidence.staleAfterHours = staleAfterHours;
  }

  const violations = [];
  collectSchemaViolations(schema, state, "$", violations);
  if (violations.length > 0) {
    evidence.status = "invalid";
    evidence.violations = violations;
    evidence.action =
      "Fix the schema violations before trusting resume state; see core/state/session-state.schema.json.";
    return evidence;
  }

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
