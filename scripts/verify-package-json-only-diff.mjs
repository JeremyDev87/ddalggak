import { spawnSync } from "node:child_process";

const usage = "Usage: node ./scripts/verify-package-json-only-diff.mjs --label before|after";
const failureHeadings = {
  before: "Unexpected changed files before verification:",
  after: "Unexpected changed files after package verification:",
};
const label = parseLabel(process.argv.slice(2));
const changedFiles = gitDiffNameOnly();
const requiredFiles = ["package.json"];
const allowedFiles = new Set(requiredFiles);

const missingFiles = requiredFiles.filter((requiredFile) => !changedFiles.includes(requiredFile));
const unexpectedFiles = changedFiles.filter((changedFile) => !allowedFiles.has(changedFile));

if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
  console.log(failureHeadings[label]);
  printList("Changed files:", changedFiles);
  printList("Missing required files:", missingFiles);
  printList("Unexpected files:", unexpectedFiles);
  process.exit(1);
}

function parseLabel(args) {
  if (args.length !== 2 || args[0] !== "--label" || !["before", "after"].includes(args[1])) {
    console.error(usage);
    process.exit(2);
  }
  return args[1];
}

function gitDiffNameOnly() {
  const result = spawnSync("git", ["diff", "--name-only"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function printList(title, items) {
  console.log(title);
  for (const item of items) {
    console.log(item);
  }
}
