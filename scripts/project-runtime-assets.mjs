#!/usr/bin/env node
import { createProjectRuntimeContext, fatal } from "./project-runtime-assets/load-contracts.mjs";
import { packageManifestProjection } from "./project-runtime-assets/render-package-manifest.mjs";
import { replaceGeneratedBlock, skillBlockProjections } from "./project-runtime-assets/render-skill-blocks.mjs";
import {
  runTokenBudgetAdmissionChecks,
  runTokenBudgetReport,
} from "./project-runtime-assets/token-budget-report.mjs";

const usage = `Usage: node scripts/project-runtime-assets.mjs [--check|--write] [--report [--admission]]

Options:
  --check      Check generated runtime assets for drift (default unless --write is set).
  --write      Update generated runtime asset blocks.
  --report     Print token budget report instead of checking generated blocks.
  --admission  With --report, fail if token budget admission findings exist.
  --help       Show this help message.`;

function parseArgs(argv) {
  const options = {
    writeMode: false,
    reportMode: false,
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

  return {
    writeMode: options.writeMode,
    reportMode: options.reportMode,
    admissionMode: options.admissionMode,
    checkMode: options.checkRequested || !options.writeMode,
  };
}

function runtimeProjections(commands) {
  return [
    ...skillBlockProjections(commands),
    packageManifestProjection(commands),
  ];
}

function checkOrWriteGeneratedBlocks({ commands, readText, writeText }, { writeMode, checkMode }) {
  const drift = [];
  for (const projection of runtimeProjections(commands)) {
    const current = readText(projection.path);
    let next = current;
    for (const [id, body] of projection.blocks) {
      try {
        next = replaceGeneratedBlock(next, id, body, projection.path);
      } catch (error) {
        fatal(error.message);
      }
    }
    if (next !== current) {
      drift.push(projection.path);
      if (writeMode) writeText(projection.path, next);
    }
  }

  if (drift.length > 0 && checkMode) {
    console.error("[project-runtime-assets] generated block drift detected:");
    for (const file of drift) console.error(`- ${file}`);
    console.error("Run: node scripts/project-runtime-assets.mjs --write");
    process.exit(1);
  }

  if (writeMode) {
    console.log(`[project-runtime-assets] updated ${drift.length} file(s)`);
  } else {
    console.log("[project-runtime-assets] generated blocks are up to date");
  }
}

const options = parseArgs(process.argv.slice(2));
const context = createProjectRuntimeContext(process.cwd());

if (options.reportMode) {
  const { overBudget, missingBudget } = runTokenBudgetReport(context);
  let extraFailures;
  try {
    extraFailures = runTokenBudgetAdmissionChecks(context);
  } catch (error) {
    fatal(error.message);
  }
  for (const failure of extraFailures) {
    console.log(`[token-budget] warning: ${failure}`);
  }
  if (options.admissionMode) {
    if (overBudget + missingBudget + extraFailures.length > 0) {
      console.error(
        `[token-budget] admission gate: fail (over-budget ${overBudget}, missing-budget ${missingBudget}, coverage/cap/ceiling ${extraFailures.length}); adjust assets, budgets, ceilings, or exemptions in core/token-budgets.yaml`,
      );
      process.exit(1);
    }
    console.log("[token-budget] admission gate: pass");
  }
  process.exit(0);
}

checkOrWriteGeneratedBlocks(context, options);
