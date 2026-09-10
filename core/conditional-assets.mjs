const ACTIVATION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

export function commandContractReference(command) {
  if (typeof command !== "string" || command.trim() !== command || !ACTIVATION_PATTERN.test(command)) {
    throw new TypeError("command must be a lowercase kebab-case token");
  }
  return `command-${command}.md`;
}

function assertAssetName(asset, label) {
  if (typeof asset !== "string" || asset.trim() !== asset || !ASSET_PATTERN.test(asset) || asset.includes("..")) {
    throw new TypeError(`${label} must be a traversal-free Markdown basename`);
  }
}

function requiredAssets(doc, field) {
  const entries = doc[field] === undefined ? [] : doc[field];
  if (!Array.isArray(entries)) throw new TypeError(`${field} must be a list`);
  const seen = new Set();
  for (const [index, asset] of entries.entries()) {
    assertAssetName(asset, `${field}[${index}]`);
    if (seen.has(asset)) throw new TypeError(`${field} must not contain duplicate assets: ${asset}`);
    seen.add(asset);
  }
  return entries;
}

export function parseConditionalAssetSpec(spec, label = "conditional asset") {
  if (typeof spec !== "string") throw new TypeError(`${label} must be a string`);
  const separator = spec.indexOf("=");
  if (separator <= 0 || separator !== spec.lastIndexOf("=")) {
    throw new TypeError(`${label} must use activation=asset.md`);
  }
  const activation = spec.slice(0, separator);
  const asset = spec.slice(separator + 1);
  if (activation.trim() !== activation || !ACTIVATION_PATTERN.test(activation)) {
    throw new TypeError(`${label} activation must be a lowercase kebab-case token`);
  }
  assertAssetName(asset, `${label} asset`);
  return { activation, asset };
}

export function conditionalAssets(doc, field) {
  const baseField = field.replace("conditional_", "required_");
  const required = new Set(requiredAssets(doc, baseField));
  const specs = doc[field] === undefined ? [] : doc[field];
  if (!Array.isArray(specs)) throw new TypeError(`${field} must be a list`);
  const seen = new Set();
  return Array.from(specs, (spec, index) => {
    const parsed = parseConditionalAssetSpec(spec, `${doc.command || "command"}.${field}[${index}]`);
    if (seen.has(spec)) throw new TypeError(`${field} must not contain duplicate specs: ${spec}`);
    seen.add(spec);
    if (required.has(parsed.asset)) {
      throw new TypeError(`${field} asset ${parsed.asset} must not also be listed in ${baseField}`);
    }
    return parsed;
  });
}

export function commandReferenceNames(doc) {
  return [...new Set([
    ...(doc.required_references || []),
    ...conditionalAssets(doc, "conditional_references").map((entry) => entry.asset),
  ])];
}

export function commandTemplateNames(doc) {
  return [...new Set([
    ...(doc.required_templates || []),
    ...conditionalAssets(doc, "conditional_templates").map((entry) => entry.asset),
  ])];
}

export function selectCommandAssets(doc, activeActivations) {
  const conditional = {
    references: conditionalAssets(doc, "conditional_references"),
    templates: conditionalAssets(doc, "conditional_templates"),
  };
  const known = new Set(Object.values(conditional).flat().map((entry) => entry.activation));
  if (!Array.isArray(activeActivations)) throw new TypeError("activeActivations must be a list");
  for (const activation of activeActivations) {
    if (!known.has(activation)) throw new TypeError(`unknown activation: ${String(activation)}`);
  }
  const active = new Set(activeActivations);
  const selected = {};
  for (const kind of ["references", "templates"]) {
    selected[kind] = [...new Set([
      ...(doc[`required_${kind}`] || []),
      ...conditional[kind].filter((entry) => active.has(entry.activation)).map((entry) => entry.asset),
    ])];
  }
  return selected;
}
