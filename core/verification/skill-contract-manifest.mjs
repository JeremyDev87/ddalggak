// Compatibility adapter for verification contract manifests.
// Domain-specific contract data lives in ./manifests/ to reduce conflicts between unrelated verification policy edits.

export * from "./manifests/disclosure-assets.mjs";
export * from "./manifests/subcommands.mjs";
export * from "./manifests/package-files.mjs";
export * from "./manifests/hot-path.mjs";
export * from "./manifests/gate-contracts.mjs";
export * from "./manifests/reference-anchors.mjs";
