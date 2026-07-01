#!/usr/bin/env node
/**
 * check-budget-isolation.mjs
 *
 * PR diff isolation gate for subcommand token budgets (#267).
 *
 * Policy: classify PRs that change `subcommand_token_budgets` together with
 * measured skill content (ddalggak/**, .codex/**, core/commands/**), but do not
 * block them here. The hard bound belongs to the token-budget admission and
 * ceiling gates, which verify the resulting package surface directly.
 *
 * Allowed: budget-only PRs, content-only PRs, new-command PRs that add the
 * command's initial budgets, calibration PRs, and intentional budget/content
 * PRs that still pass the admission and ceiling gates.
 *
 * Usage: node scripts/check-budget-isolation.mjs --base <ref> --head <ref>
 *
 * The comparison uses the merge-base of the two refs, so commits that
 * landed on the base branch after the PR branched off do not affect the
 * PR. Budget change detection parses the budget block on both sides and
 * compares values, so edits to other core/token-budgets.yaml blocks
 * (reference exemptions, ceilings, etc.) or comment-only edits never count as budget
 * classification.
 */

import { spawnSync } from "node:child_process";
import { parseSubcommandTokenBudgets } from "./lib/token-budget-yaml.mjs";

const TOKEN_BUDGETS_PATH = "core/token-budgets.yaml";
const MEASURED_ASSET_PREFIXES = ["ddalggak/", ".codex/", "core/commands/"];

function usage() {
  console.error(
    "[budget-isolation] usage: node scripts/check-budget-isolation.mjs --base <ref> --head <ref>",
  );
  process.exit(2);
}

function parseArgs(argv) {
  const options = { base: null, head: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base" && argv[index + 1]) options.base = argv[(index += 1)];
    else if (arg === "--head" && argv[index + 1]) options.head = argv[(index += 1)];
    else usage();
  }
  if (!options.base || !options.head) usage();
  return options;
}

function git(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.error) {
    console.error(`[budget-isolation] failed to run git: ${result.error.message}`);
    process.exit(2);
  }
  if (result.status !== 0 && !allowFailure) {
    console.error(
      `[budget-isolation] git ${args.join(" ")} failed (exit ${result.status}):\n${result.stderr.trim()}`,
    );
    process.exit(2);
  }
  return result;
}

function showFileAt(ref, filePath) {
  // Missing file at this ref (added/removed by the PR) reads as empty.
  const result = git(["show", `${ref}:${filePath}`], { allowFailure: true });
  return result.status === 0 ? result.stdout : "";
}

// Root key names are excluded from the comparison: a rename that carries the
// same budget values to a different root name (e.g. claude_legacy -> claude) is
// unrelated to the ratchet and must not count as a budget change. Each root's
// command->value map is normalized and the maps are sorted, so adding,
// removing, or modifying a value within a root is still detected. A wholesale
// swap of two roots' complete maps is intentionally treated as a no-op: it is
// zero-sum, and the binding ratchet is the frozen subcommand_token_ceilings
// admission gate, not this per-PR isolation check.
function canonicalBudgets(text) {
  const budgetsByRoot = parseSubcommandTokenBudgets(text);
  const perRoot = [...budgetsByRoot.keys()].map((root) => {
    const commands = {};
    for (const command of [...budgetsByRoot.get(root).keys()].sort()) {
      commands[command] = budgetsByRoot.get(root).get(command);
    }
    return JSON.stringify(commands);
  });
  perRoot.sort();
  return JSON.stringify(perRoot);
}

function budgetCommandValues(text) {
  const budgetsByRoot = parseSubcommandTokenBudgets(text);
  const byCommand = new Map();
  for (const budgets of budgetsByRoot.values()) {
    for (const [command, value] of budgets.entries()) {
      if (!byCommand.has(command)) byCommand.set(command, []);
      byCommand.get(command).push(value);
    }
  }
  const canonical = new Map();
  for (const [command, values] of byCommand.entries()) {
    canonical.set(command, JSON.stringify(values.sort((left, right) => left - right)));
  }
  return canonical;
}

function changedBudgetCommands(baseText, headText) {
  const before = budgetCommandValues(baseText);
  const after = budgetCommandValues(headText);
  const commands = new Set([...before.keys(), ...after.keys()]);
  return [...commands].filter((command) => before.get(command) !== after.get(command)).sort();
}

function isNewCommand(command, mergeBase, head) {
  const commandPath = `core/commands/${command}.yaml`;
  return showFileAt(mergeBase, commandPath) === "" && showFileAt(head, commandPath) !== "";
}

const { base, head } = parseArgs(process.argv.slice(2));

const mergeBase = git(["merge-base", base, head]).stdout.trim();
if (!mergeBase) {
  console.error(`[budget-isolation] no merge base between ${base} and ${head}`);
  process.exit(2);
}

const baseTokenBudgetsText = showFileAt(mergeBase, TOKEN_BUDGETS_PATH);
const headTokenBudgetsText = showFileAt(head, TOKEN_BUDGETS_PATH);
const budgetsChanged = canonicalBudgets(baseTokenBudgetsText) !== canonicalBudgets(headTokenBudgetsText);
const disallowedBudgetCommands = changedBudgetCommands(baseTokenBudgetsText, headTokenBudgetsText).filter(
  (command) => !isNewCommand(command, mergeBase, head),
);

// --no-renames: a rename out of a measured path must list the measured
// source path as deleted, not collapse into a destination-only rename entry.
const changedFiles = git(["diff", "--name-only", "--no-renames", mergeBase, head])
  .stdout.split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
const measuredChanges = changedFiles.filter((file) =>
  MEASURED_ASSET_PREFIXES.some((prefix) => file.startsWith(prefix)),
);

const classification = budgetsChanged
  ? measuredChanges.length > 0
    ? disallowedBudgetCommands.length > 0
      ? "budget/content calibration with measured content"
      : "new-command initial budget with measured content"
    : "budget-change without measured content"
  : measuredChanges.length > 0
    ? "measured content without budget change"
    : "neither budgets nor measured content changed";
if (budgetsChanged && measuredChanges.length > 0 && disallowedBudgetCommands.length > 0) {
  console.log(
    `[budget-isolation] note: existing budget command(s) changed with measured content: ${disallowedBudgetCommands.join(", ")}`,
  );
}
console.log(
  `[budget-isolation] pass: ${classification} (merge-base ${mergeBase.slice(0, 12)}, ${changedFiles.length} changed file(s))`,
);
