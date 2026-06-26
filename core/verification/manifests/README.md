# ddalggak verification manifests

This directory owns domain-specific contract data consumed by the ddalggak verification scripts.

- `disclosure-assets.mjs`: progressive-disclosure assets, template fields, payload roots, and admission-header fields.
- `subcommands.mjs`: subcommand execution contracts, mode permission profiles, required subcommands, and headings.
- `hot-path.mjs`: always-loaded SKILL.md hot-path anchors and banned terms.
- `gate-contracts.mjs`: quality-lens router/gate family contracts and gate-stage/activation checks.
- `reference-anchors.mjs`: reference-document, regression-library, wiki/readme anchor contracts.
- `package-files.mjs`: generated required package-file list.

`../skill-contract-manifest.mjs` remains a compatibility adapter and should stay path-light; add new domain data here instead of growing the adapter.
