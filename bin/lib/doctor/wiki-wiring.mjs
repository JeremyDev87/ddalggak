// ddalggak doctor — wiki-wiring check.
// Every command contract must list references/wiki-context-preflight.md in
// required_references so the mandatory wiki preflight is wired for ALL
// subcommands, not just plan/start/review. Without this a new command can
// silently ship without the wiki-context step and the invariant rots.

const WIKI_PREFLIGHT_REF = "wiki-context-preflight.md";

export function checkWikiWiring(layout) {
  const findings = [];
  for (const command of layout.commands) {
    if (command.malformed) continue;
    if (!command.requiredReferences.includes(WIKI_PREFLIGHT_REF)) {
      findings.push(
        `core/commands/${command.file} required_references is missing ${WIKI_PREFLIGHT_REF} (mandatory wiki preflight for all subcommands)`,
      );
    }
  }
  return { findings };
}
