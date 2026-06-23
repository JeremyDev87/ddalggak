#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import { classifyNpmLookupError, classifyNpmPublishError } from "./lib/release.mjs";

const CLASSIFIERS = {
  lookup: classifyNpmLookupError,
  publish: classifyNpmPublishError,
};

function usage() {
  return "Usage: node scripts/classify-npm-error.mjs --mode lookup|publish <stderr-file>";
}

function parseArgs(argv) {
  let mode = null;
  let errorPath = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--mode") {
      mode = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (errorPath) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
    errorPath = arg;
  }

  if (!mode || !CLASSIFIERS[mode]) {
    throw new Error("--mode must be one of: lookup, publish");
  }
  if (!errorPath) {
    throw new Error("Missing stderr file path");
  }
  return { mode, errorPath };
}

export function classifyNpmErrorCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  console.log(CLASSIFIERS[args.mode](readFileSync(args.errorPath, "utf8")));
  return 0;
}

export function runClassifyNpmErrorCli(argv = process.argv.slice(2)) {
  try {
    return classifyNpmErrorCli(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runClassifyNpmErrorCli();
}
