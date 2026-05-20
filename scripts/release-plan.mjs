#!/usr/bin/env node

import { resolveReleasePlan } from "./lib/release.mjs";

const tag = process.argv[2];

if (!tag) {
  console.error("Usage: node scripts/release-plan.mjs <tag>");
  process.exit(1);
}

try {
  const plan = resolveReleasePlan(tag);
  for (const [key, value] of Object.entries(plan)) {
    console.log(`${key}=${value}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
