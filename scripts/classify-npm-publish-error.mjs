#!/usr/bin/env node

import { runClassifyNpmErrorCli } from "./classify-npm-error.mjs";

process.exitCode = runClassifyNpmErrorCli(["--mode", "publish", ...process.argv.slice(2)]);
