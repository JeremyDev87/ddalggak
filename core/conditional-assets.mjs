const ACTIVATION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASSET_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

export function parseConditionalAssetSpec(spec, label = "conditional asset") {
  if (typeof spec !== "string") throw new Error(`${label} must be a string`);
  const separator = spec.indexOf("=");
  if (separator <= 0 || separator !== spec.lastIndexOf("=")) {
    throw new Error(`${label} must use activation=asset.md`);
  }
  const activation = spec.slice(0, separator);
  const asset = spec.slice(separator + 1);
  if (!ACTIVATION_PATTERN.test(activation)) {
    throw new Error(`${label} activation must be a lowercase kebab-case token`);
  }
  if (!ASSET_PATTERN.test(asset) || asset.includes("..") || asset.includes("/")) {
    throw new Error(`${label} asset must be a traversal-free Markdown basename`);
  }
  return { activation, asset };
}

export function conditionalAssets(doc, field) {
  return (doc[field] || []).map((spec, index) =>
    parseConditionalAssetSpec(spec, `${doc.command || "command"}.${field}[${index}]`),
  );
}

export function commandReferenceNames(doc) {
  return [
    ...(doc.required_references || []),
    ...conditionalAssets(doc, "conditional_references").map((entry) => entry.asset),
  ];
}

export function commandTemplateNames(doc) {
  return [
    ...(doc.required_templates || []),
    ...conditionalAssets(doc, "conditional_templates").map((entry) => entry.asset),
  ];
}
