const REQUIRED_STRING_FIELDS = Object.freeze([
  "command",
  "show_doc_heading",
  "purpose",
  "mode",
  "write_side_effects",
  "stop_condition",
]);

const REQUIRED_BOOLEAN_FIELDS = Object.freeze([
  "source_edit_allowed",
  "github_write_allowed",
]);

const REQUIRED_LIST_FIELDS = Object.freeze([
  "required_references",
  "required_templates",
]);

// Unknown top-level keys are intentionally allowed so command contracts can add
// forward-compatible metadata without forcing every consumer to change in lock
// step. Known keys remain fail-closed and type-checked here.
export const COMMAND_CONTRACT_UNKNOWN_KEY_POLICY =
  "unknown top-level keys are allowed; required known keys and nested output_contract fields are validated fail-closed";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function validateStringList(doc, field, failures) {
  if (!Array.isArray(doc[field])) {
    failures.push(`${field} must be a list`);
    return;
  }

  const invalidIndex = doc[field].findIndex((entry) => !nonEmptyString(entry));
  if (invalidIndex !== -1) {
    failures.push(`${field} must contain only non-empty strings`);
  }
}

export function validateCommandContract(doc, label) {
  const failures = [];

  if (!isPlainObject(doc)) {
    return [`${label}: command contract must parse to an object`];
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    if (!nonEmptyString(doc[field])) {
      failures.push(`${field} must be a non-empty string`);
    }
  }

  for (const field of REQUIRED_BOOLEAN_FIELDS) {
    if (typeof doc[field] !== "boolean") {
      failures.push(`${field} must be a boolean`);
    }
  }

  for (const field of REQUIRED_LIST_FIELDS) {
    validateStringList(doc, field, failures);
  }

  if (!isPlainObject(doc.output_contract)) {
    failures.push("output_contract must be a mapping");
  } else {
    if (!nonEmptyString(doc.output_contract.completion_signal)) {
      failures.push("output_contract.completion_signal must be a non-empty string");
    }
    if (typeof doc.output_contract.evidence_required !== "boolean") {
      failures.push("output_contract.evidence_required must be a boolean");
    }
  }

  return failures.map((failure) => `${label}: ${failure}`);
}

export function assertValidCommandContract(doc, label, { onError } = {}) {
  const failures = validateCommandContract(doc, label);
  if (onError) {
    for (const failure of failures) onError(failure);
    return failures.length === 0;
  }
  if (failures.length > 0) {
    throw new Error(failures.join("\n"));
  }
  return true;
}
