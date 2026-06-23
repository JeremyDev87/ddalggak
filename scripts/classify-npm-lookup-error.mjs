#!/usr/bin/env node

import { runClassifyNpmErrorCli } from "./classify-npm-error.mjs";

process.exitCode = runClassifyNpmErrorCli(["--mode", "lookup", ...process.argv.slice(2)]);
