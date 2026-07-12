#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { maybeAutoUpdate } from "./lib/auto-update.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

async function main() {
  const update = await maybeAutoUpdate({
    argv: process.argv.slice(2),
    packageRoot: rootDir,
    env: process.env,
  });
  if (update.handled) return update.code;

  const { runCli } = await import("./lib/cli-main.mjs");
  return runCli(update.args);
}

main()
  .then((code) => {
    process.exit(typeof code === "number" ? code : 0);
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
