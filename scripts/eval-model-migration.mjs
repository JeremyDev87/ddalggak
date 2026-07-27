#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

import { formatReport, scoreComparison } from "./eval-model-migration/scorer.mjs";

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`cannot read JSON ${filePath}: ${error.message}`);
  }
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  await import("./test-eval-model-migration.mjs");
} else if (args.length !== 2) {
  console.error("usage: node scripts/eval-model-migration.mjs <cases.json> <content-light-results.json>");
  process.exitCode = 2;
} else {
  const [manifestArg, resultsArg] = args.map((entry) => path.resolve(entry));
  try {
    const report = scoreComparison(readJson(manifestArg), readJson(resultsArg));
    console.log(formatReport(report));
    if (!report.pass) process.exitCode = 1;
  } catch (error) {
    console.error(`[eval:model-migration] ${error.message}`);
    process.exitCode = 1;
  }
}
