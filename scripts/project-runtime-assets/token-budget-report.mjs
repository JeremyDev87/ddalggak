import { readdirSync } from "node:fs";
import path from "node:path";

import {
  parseReferenceBudgetExemptions,
  parseSubcommandTokenBudgets,
  parseSubcommandTokenCeilings,
} from "../lib/token-budget-yaml.mjs";

const tokenBudgetRoots = [
  { key: "claude", base: "ddalggak" },
  { key: "codex", base: ".codex/skills/ddalggak" },
];

// `bytes / 4` systematically undercounts multibyte content: a Hangul syllable
// is 3 UTF-8 bytes (~0.75 tokens under that rule) while real tokenizers spend
// ~1.5-2 tokens per syllable. Count ASCII at 4 chars per token and every
// non-ASCII code point (string iteration yields code points, so a 4-byte
// emoji counts once) at 1.5 tokens — a zero-dependency heuristic, not a
// tokenizer (#266).
function fileTokenEstimate(relativePath, { readText }) {
  let asciiChars = 0;
  let multibyteChars = 0;
  for (const char of readText(relativePath)) {
    if (char.codePointAt(0) <= 0x7f) asciiChars += 1;
    else multibyteChars += 1;
  }
  return asciiChars / 4 + multibyteChars * 1.5;
}

function readTokenBudgetsText(context) {
  return context.readText("core/token-budgets.yaml");
}

function readSubcommandTokenBudgets(context) {
  return parseSubcommandTokenBudgets(readTokenBudgetsText(context));
}

function readSubcommandTokenCeilings(context) {
  return parseSubcommandTokenCeilings(readTokenBudgetsText(context));
}

function readReferenceBudgetExemptions(context) {
  return parseReferenceBudgetExemptions(readTokenBudgetsText(context));
}

export function runTokenBudgetReport(context) {
  const { commands, fileSize } = context;
  const budgetsByRoot = readSubcommandTokenBudgets(context);
  const warnings = [];
  const allRows = [];
  for (const { key, base } of tokenBudgetRoots) {
    const budgets = budgetsByRoot.get(key) ?? new Map();
    const skillBytes = fileSize(`${base}/SKILL.md`);
    const skillTokens = fileTokenEstimate(`${base}/SKILL.md`, context);
    const rows = [];
    for (const doc of commands) {
      const referenceBytes = (doc.required_references || []).reduce(
        (sum, ref) => sum + fileSize(`${base}/references/${ref}`),
        0,
      );
      const referenceTokens = (doc.required_references || []).reduce(
        (sum, ref) => sum + fileTokenEstimate(`${base}/references/${ref}`, context),
        0,
      );
      const templateBytes = (doc.required_templates || []).reduce(
        (sum, template) => sum + fileSize(`${base}/templates/${template}`),
        0,
      );
      const templateTokens = (doc.required_templates || []).reduce(
        (sum, template) => sum + fileTokenEstimate(`${base}/templates/${template}`, context),
        0,
      );
      const totalBytes = skillBytes + referenceBytes + templateBytes;
      const estTokens = Math.ceil(skillTokens + referenceTokens + templateTokens);
      const budget = budgets.get(doc.command);
      let status = "ok";
      if (budget === undefined) {
        status = "no-budget";
        warnings.push(`${key}/${doc.command}: no budget declared in core/token-budgets.yaml subcommand_token_budgets.${key}`);
      } else if (estTokens > budget) {
        status = "OVER";
        warnings.push(`${key}/${doc.command}: ~${estTokens} tokens exceeds budget ${budget}`);
      }
      rows.push({ root: key, command: doc.command, skillBytes, referenceBytes, templateBytes, totalBytes, estTokens, budget, status });
    }

    console.log(`[token-budget] per-subcommand effective load (root: ${base}/, est tokens = ceil(ascii_chars / 4 + multibyte_chars x 1.5))`);
    console.log("| subcommand | skill_md_bytes | reference_bytes | template_bytes | total_bytes | est_tokens | budget_tokens | status |");
    console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
    for (const row of rows) {
      console.log(
        `| ${row.command} | ${row.skillBytes} | ${row.referenceBytes} | ${row.templateBytes} | ${row.totalBytes} | ${row.estTokens} | ${row.budget ?? "-"} | ${row.status} |`,
      );
    }
    allRows.push(...rows);
  }
  for (const warning of warnings) {
    console.log(`[token-budget] warning: ${warning}`);
  }
  const overBudget = allRows.filter((row) => row.status === "OVER").length;
  const missingBudget = allRows.filter((row) => row.status === "no-budget").length;
  const maxRow = allRows.reduce((max, row) => (row.estTokens > max.estTokens ? row : max), allRows[0]);
  console.log(
    `[token-budget] summary: ${commands.length} subcommands x ${tokenBudgetRoots.length} roots, over-budget ${overBudget}, missing-budget ${missingBudget}, max ${maxRow.root}/${maxRow.command} ~${maxRow.estTokens} tokens`,
  );
  return { overBudget, missingBudget };
}

// Coverage + per-reference cap invariant (#283): every ddalggak/references/*.md
// file must be EITHER measured (named in some command's required_references, so
// it counts against that subcommand's budget) OR exempt (registered in
// reference_budget_exemptions with a positive max_tokens cap). Neither leaves a
// reference unbudgeted; both is a redundant exemption. Exempted references are
// still bounded by their cap on each root where the file exists, so a
// conditional gate reachable only via the always-loaded quality-lens-router
// cannot grow without bound.
function runReferenceCoverageChecks(context) {
  const { commands, fileExists, fileSize, rootDir } = context;
  const failures = [];
  const measured = new Set();
  for (const doc of commands) {
    for (const ref of doc.required_references || []) measured.add(ref);
  }

  const exemptions = readReferenceBudgetExemptions(context);
  const exemptByRef = new Map();
  for (const exemption of exemptions) {
    if (exemptByRef.has(exemption.reference)) {
      failures.push(`reference_budget_exemptions has a duplicate entry for '${exemption.reference}'`);
    }
    exemptByRef.set(exemption.reference, exemption);
  }

  const referenceDir = path.join(rootDir, "ddalggak", "references");
  let referenceFiles;
  try {
    referenceFiles = readdirSync(referenceDir).filter((name) => name.endsWith(".md"));
  } catch (error) {
    throw new Error(`cannot list ddalggak/references: ${error.message}`);
  }
  const referenceSet = new Set(referenceFiles);

  for (const file of referenceFiles) {
    const isMeasured = measured.has(file);
    const isExempt = exemptByRef.has(file);
    if (!isMeasured && !isExempt) {
      failures.push(
        `reference ${file} is neither measured (in any command required_references) nor exempt (reference_budget_exemptions); add it to a required_references list or register an exemption with a max_tokens cap`,
      );
    } else if (isMeasured && isExempt) {
      failures.push(
        `reference ${file} is both measured and listed in reference_budget_exemptions; remove the redundant exemption`,
      );
    }
  }

  for (const exemption of exemptions) {
    if (!referenceSet.has(exemption.reference)) {
      failures.push(
        `reference_budget_exemptions lists '${exemption.reference}' but ddalggak/references/${exemption.reference} does not exist; remove the stale exemption`,
      );
      continue;
    }
    if (!Number.isInteger(exemption.maxTokens) || exemption.maxTokens <= 0) {
      failures.push(
        `reference_budget_exemptions entry '${exemption.reference}' is missing a positive integer max_tokens cap`,
      );
      continue;
    }
    for (const { key, base } of tokenBudgetRoots) {
      const relativePath = `${base}/references/${exemption.reference}`;
      if (!fileExists(relativePath)) continue; // root-specific reference absent on this root
      const estTokens = Math.ceil(fileTokenEstimate(relativePath, context));
      if (estTokens > exemption.maxTokens) {
        failures.push(
          `${key}: reference ${exemption.reference} ~${estTokens} tokens exceeds its exemption cap ${exemption.maxTokens}; reduce the reference or raise max_tokens in core/token-budgets.yaml reference_budget_exemptions`,
        );
      }
    }
  }

  return failures;
}

// Absolute-ceiling invariant (#283): every declared budget must be <= its
// declared ceiling. A budget-only PR passes check-budget-isolation, so without
// this a budget could be ratcheted up indefinitely across PRs; the ceiling is a
// frozen constant that caps how high the working budget may go.
function runCeilingChecks(context) {
  const { commands } = context;
  const failures = [];
  const budgetsByRoot = readSubcommandTokenBudgets(context);
  const ceilingsByRoot = readSubcommandTokenCeilings(context);
  for (const { key } of tokenBudgetRoots) {
    const budgets = budgetsByRoot.get(key) ?? new Map();
    const ceilings = ceilingsByRoot.get(key) ?? new Map();
    for (const doc of commands) {
      const budget = budgets.get(doc.command);
      if (budget === undefined) continue; // missing-budget already reported by runTokenBudgetReport
      const ceiling = ceilings.get(doc.command);
      if (ceiling === undefined) {
        failures.push(`${key}/${doc.command}: no ceiling declared in core/token-budgets.yaml subcommand_token_ceilings.${key}`);
        continue;
      }
      if (budget > ceiling) {
        failures.push(
          `${key}/${doc.command}: budget ${budget} exceeds ceiling ${ceiling}; a budget must not be ratcheted past its absolute ceiling (subcommand_token_ceilings)`,
        );
      }
    }
  }
  return failures;
}

export function runTokenBudgetAdmissionChecks(context) {
  return [...runReferenceCoverageChecks(context), ...runCeilingChecks(context)];
}
