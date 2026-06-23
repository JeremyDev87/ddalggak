export function parseRootKeyedIntBlock(text, blockName) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`${blockName}:`);
  const byRoot = new Map();
  if (start === -1) return byRoot;

  let currentRoot;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].replace(/\s+#.*$/, "");
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const rootEntry = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (rootEntry) {
      currentRoot = new Map();
      byRoot.set(rootEntry[1], currentRoot);
      continue;
    }
    const entry = line.match(/^ {4}([A-Za-z0-9_-]+):\s*(\d+)\s*$/);
    if (!entry || !currentRoot) break;
    currentRoot.set(entry[1], Number(entry[2]));
  }
  return byRoot;
}

export function parseSubcommandTokenBudgets(text) {
  return parseRootKeyedIntBlock(text, "subcommand_token_budgets");
}

export function parseSubcommandTokenCeilings(text) {
  return parseRootKeyedIntBlock(text, "subcommand_token_ceilings");
}

export function parseReferenceBudgetExemptions(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf("reference_budget_exemptions:");
  const exemptions = [];
  if (start === -1) return exemptions;

  let current = null;
  for (let index = start + 1; index < lines.length; index += 1) {
    const raw = lines[index];
    if (!raw.trim()) continue;
    if (/^\S/.test(raw)) break;
    const item = raw.match(/^ {2}- reference:\s*(.+?)\s*$/);
    if (item) {
      current = { reference: item[1], maxTokens: undefined, reason: "" };
      exemptions.push(current);
      continue;
    }
    if (!current) continue;
    const maxTokens = raw.match(/^ {4}max_tokens:\s*(\d+)\s*$/);
    if (maxTokens) {
      current.maxTokens = Number(maxTokens[1]);
      continue;
    }
    const reason = raw.match(/^ {4}reason:\s*(.+?)\s*$/);
    if (reason) current.reason = reason[1];
  }
  return exemptions;
}

export function mapToPlainObject(map) {
  return Object.fromEntries(
    [...map.entries()].map(([key, value]) => [
      key,
      value instanceof Map ? mapToPlainObject(value) : value,
    ]),
  );
}
