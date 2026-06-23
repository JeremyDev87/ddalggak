import { appendFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

function usage() {
  return `Usage: node scripts/release-pack-smoke.mjs [--github-output <path>] [--sha256]\n\nPacks the current package, verifies the tarball exists, installs it in a temporary project,\nand exercises the ddalggak CLI smoke commands used by release workflows.`;
}

function parseArgs(argv) {
  const options = { githubOutput: "", sha256: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--sha256") {
      options.sha256 = true;
      continue;
    }
    if (arg === "--github-output") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--github-output requires a path");
      }
      options.githubOutput = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function packPackage() {
  const packJson = execFileSync("npm", ["pack", "--json"], { encoding: "utf8" });
  const parsed = JSON.parse(packJson);
  const filename = parsed?.[0]?.filename;
  if (!filename) {
    throw new Error("npm pack --json did not return a tarball filename");
  }
  const tarballPath = resolve(filename);
  if (!existsSync(tarballPath)) {
    throw new Error(`Packed tarball was not created: ${tarballPath}`);
  }
  return { tarball: filename, tarballPath };
}

function smokeInstall(tarballPath) {
  const smokeDir = mkdtempSync(join(tmpdir(), "ddalggak-release-smoke-"));
  try {
    run("npm", ["init", "-y"], { cwd: smokeDir });
    run("npm", ["install", tarballPath], { cwd: smokeDir });
    for (const args of [
      ["ddalggak", "--help"],
      ["ddalggak", "plan", "--show-doc"],
      ["ddalggak", "setup", "--dry-run"],
      ["ddalggak", "status", "--local", "--json"],
    ]) {
      run("npx", args, { cwd: smokeDir });
    }
  } finally {
    rmSync(smokeDir, { recursive: true, force: true });
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function appendOutputs(path, outputs) {
  if (!path) return;
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  appendFileSync(path, `${lines.join("\n")}\n`);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const { tarball, tarballPath } = packPackage();
  smokeInstall(tarballPath);

  const outputs = { tarball, tarball_path: tarballPath };
  if (options.sha256) {
    outputs.tarball_sha256 = sha256(tarballPath);
  }
  appendOutputs(options.githubOutput, outputs);
  console.log(`Packed and smoke-installed ${tarball}`);
}

main();
