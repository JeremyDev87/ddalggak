// Slash command string helpers for ddalggak dispatch.
// zero-dep, ESM only.

// Slash command arguments are printed as one command string for Claude Code.
// Use JSON string literal escaping when quoting is needed so backslashes and
// control characters cannot make the emitted command ambiguous.
export const QUOTE_PATTERN = /[\s"'\\$`]/;

export function quoteIfNeeded(value) {
  if (!QUOTE_PATTERN.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}

export function buildSlashString(subcmd, parts) {
  const slashCommand =
    subcmd === "getwiki" || subcmd === "setwiki"
      ? `/${subcmd}`
      : `/ddalggak ${subcmd}`;
  if (parts.length === 0) {
    return slashCommand;
  }
  return `${slashCommand} ` + parts.map(quoteIfNeeded).join(" ");
}
