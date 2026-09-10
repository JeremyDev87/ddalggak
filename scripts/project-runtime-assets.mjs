#!/usr/bin/env node
import { createProjectRuntimeContext, fatal } from "./project-runtime-assets/load-contracts.mjs";
import { packageManifestProjection } from "./project-runtime-assets/render-package-manifest.mjs";
import { assertCommandDocOwnership, commandDocProjections } from "./project-runtime-assets/render-command-docs.mjs";
import { replaceGeneratedBlock, skillBlockProjections } from "./project-runtime-assets/render-skill-blocks.mjs";
import {
  runTokenBudgetAdmissionChecks,
  runTokenBudgetReport,
} from "./project-runtime-assets/token-budget-report.mjs";

const usage = `Usage: node scripts/project-runtime-assets.mjs [--check|--write] [--report [--json] [--admission]]

Options:
  --check      Check generated runtime assets for drift (default unless --write is set).
  --write      Update generated runtime asset blocks and command documents.
  --report     Print token budget report instead of checking generated blocks.
  --json       With --report, print the same accounting rows as JSON only.
  --admission  With --report, fail if token budget admission findings exist.
  --help       Show this help message.`;

function parseArgs(argv) {
  const options = {
    writeMode: false,
    reportMode: false,
    jsonMode: false,
    admissionMode: false,
    checkRequested: false,
  };

  for (const arg of argv) {
    if (arg === "--help") {
      console.log(usage);
      process.exit(0);
    } else if (arg === "--write") {
      options.writeMode = true;
    } else if (arg === "--report") {
      options.reportMode = true;
    } else if (arg === "--json") {
      options.jsonMode = true;
    } else if (arg === "--admission") {
      options.admissionMode = true;
    } else if (arg === "--check") {
      options.checkRequested = true;
    } else {
      console.error(`[project-runtime-assets] unknown option: ${arg}`);
      console.error(usage);
      process.exit(1);
    }
  }

  if (options.writeMode && options.checkRequested) {
    console.error("[project-runtime-assets] --write and --check cannot be used together");
    console.error(usage);
    process.exit(1);
  }

  if (options.jsonMode && !options.reportMode) {
    console.error("[project-runtime-assets] --json requires --report");
    process.exit(1);
  }

  return {
    writeMode: options.writeMode,
    reportMode: options.reportMode,
    jsonMode: options.jsonMode,
    admissionMode: options.admissionMode,
    checkMode: options.checkRequested || !options.writeMode,
  };
}

function runtimeProjections(context) {
  const { commands } = context;
  return [
    ...skillBlockProjections(commands),
    packageManifestProjection(commands),
    ...commandDocProjections(context),
  ];
}

function checkOrWriteGeneratedBlocks(context, { writeMode, checkMode }) {
  const { readText, writeText } = context;
  const drift = [];
  try {
    for (const projection of runtimeProjections(context)) {
      const wholeFile = projection.content !== undefined;
      const current = readText(projection.path, { optional: wholeFile });
      let next = projection.content;
      if (wholeFile) {
        assertCommandDocOwnership(current, projection);
      } else {
        next = current;
        for (const [id, body] of projection.blocks) {
          next = replaceGeneratedBlock(next, id, body, projection.path);
        }
      }
      if (next !== current) drift.push({ path: projection.path, content: next });
    }
  } catch (error) {
    fatal(error.message);
  }

  if (drift.length > 0 && checkMode) {
    console.error("[project-runtime-assets] generated asset drift detected:");
    for (const file of drift) console.error(`- ${file.path}`);
    console.error("Run: node scripts/project-runtime-assets.mjs --write");
    process.exit(1);
  }

  if (writeMode) {
    // Validate every output before writing, so a collision cannot leave a partial projection.
    for (const file of drift) writeText(file.path, file.content);
    console.log(`[project-runtime-assets] updated ${drift.length} file(s)`);
  } else {
    console.log("[project-runtime-assets] generated assets are up to date");
  }
}

const options = parseArgs(process.argv.slice(2));
const context = createProjectRuntimeContext(process.cwd());

if (options.reportMode) {
  let report;
  let extraFailures;
  try {
    report = runTokenBudgetReport(context, { json: options.jsonMode });
    extraFailures = runTokenBudgetAdmissionChecks(context);
  } catch (error) {
    fatal(error.message);
  }
  const { overBudget, missingBudget } = report;
  if (options.jsonMode) {
    console.log(JSON.stringify({ ...report, extraFailures }, null, 2));
  } else {
    for (const failure of extraFailures) console.log(`[token-budget] warning: ${failure}`);
  }
  if (options.admissionMode) {
    if (overBudget + missingBudget + extraFailures.length > 0) {
      console.error(
        `[token-budget] admission gate: fail (over-budget ${overBudget}, missing-budget ${missingBudget}, coverage/cap/ceiling ${extraFailures.length}); adjust assets, budgets, ceilings, or exemptions in core/token-budgets.yaml`,
      );
      process.exit(1);
    }
    if (!options.jsonMode) console.log("[token-budget] admission gate: pass");
  }
  process.exit(0);
}

checkOrWriteGeneratedBlocks(context, options);
