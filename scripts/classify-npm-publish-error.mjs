#!/usr/bin/env node

import { readFileSync } from "node:fs";

import { classifyNpmPublishError } from "./lib/release.mjs";

const errorPath = process.argv[2];

if (!errorPath) {
  console.error("Usage: node scripts/classify-npm-publish-error.mjs <stderr-file>");
  process.exit(1);
}

try {
  console.log(classifyNpmPublishError(readFileSync(errorPath, "utf8")));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
