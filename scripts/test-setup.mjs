import {
  assert,
  assertExit,
  assertIncludes,
  assertShowDocIncludes,
  assertStdout,
  loadCommandContracts,
  makeTempHome,
  parseJsonStdout,
  readFileSync,
  readdirSync,
  rmSync,
  runCli,
  runStatusWithSessionState,
  skillDirFor,
  symlinkSync,
  validSessionState,
  writeDoctorFixture,
  writeExistingInstall,
  writeFileSync,
  existsSync,
  listNames,
  llmsIndex,
  os,
  path,
  pkg,
  readInstalledManifest,
  readme,
  rootDir,
  sha256File,
  DOCTOR_FIXTURE_ROOTS,
} from "./test-lib/cli-fixtures.mjs";
import { mkdirSync, mkdtempSync } from "node:fs";
import { installSkillPayload } from "../bin/lib/setup/install-transaction.mjs";

export const cases = [
{
    name: "setup --dry-run does not create files",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["setup", "--dry-run"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assert(
        readdirSync(claudeHome).length === 0,
        `expected dry-run home to stay empty, found ${readdirSync(claudeHome).join(", ")}`,
      );
    },
  },
{
    name: "profile hermes --dry-run proposes patch without writing CLAUDE.md",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["profile", "hermes", "--dry-run"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assertIncludes(
        result.stdout,
        "ddalggak profile hermes dry-run",
        "stdout",
      );
      assertIncludes(result.stdout, "Korean with 극존칭", "stdout");
      assertIncludes(
        result.stdout,
        "GitHub issue body, labels, and comments",
        "stdout",
      );
      assertIncludes(
        result.stdout,
        "issue → plan → start → ship → review",
        "stdout",
      );
      assertIncludes(result.stdout, "getwiki", "stdout");
      assertIncludes(result.stdout, "setwiki", "stdout");
      assertIncludes(result.stdout, "Never merge", "stdout");
      assert(
        !existsSync(path.join(claudeHome, "CLAUDE.md")),
        "expected profile dry-run not to create CLAUDE.md",
      );
      assert(
        !existsSync(path.join(claudeHome, "settings.json")),
        "expected profile dry-run not to create settings.json",
      );
    },
  },
{
    name: "profile hermes --print-claude-md-patch reads existing profile but does not modify it",
    run() {
      const claudeHome = makeTempHome();
      const claudeMd = path.join(claudeHome, "CLAUDE.md");
      const before = "# Existing Claude profile\n\nKeep this line.\n";
      writeFileSync(claudeMd, before, "utf8");

      const result = runCli(["profile", "hermes", "--print-claude-md-patch"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assert(
        result.stdout.startsWith(`--- ${claudeMd}\n+++ ${claudeMd}\n`),
        "expected unified diff for existing CLAUDE.md",
      );
      assertIncludes(
        result.stdout,
        "+- Before `plan` and before `review`, run or delegate `getwiki`",
        "stdout",
      );
      assertIncludes(
        result.stdout,
        "+- Treat `setwiki` as approval-gated",
        "stdout",
      );
      assert(
        readFileSync(claudeMd, "utf8") === before,
        "expected print patch not to modify existing CLAUDE.md",
      );
    },
  },
{
    name: "profile hermes rejects --apply",
    run() {
      const result = runCli(["profile", "hermes", "--apply"]);
      assertExit(result, 2);
      assertIncludes(
        result.stderr,
        "--apply is intentionally not supported",
        "stderr",
      );
    },
  },
{
    name: "setup rejects missing --target value",
    run() {
      const result = runCli(["setup", "--target"]);
      assertExit(result, 2);
      assertIncludes(
        result.stderr,
        "--target requires a path argument",
        "stderr",
      );
    },
  },
{
    name: "setup rejects filesystem root target",
    run() {
      const result = runCli(["setup", "--target", path.parse(rootDir).root]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "safety check failed", "stderr");
    },
  },
{
    name: "setup rejects system directory descendants",
    run() {
      const result = runCli(["setup", "--dry-run", "--target", "/etc/ddalggak-test"]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "resolves under system directory", "stderr");
    },
  },
{
    name: "setup rejects HOME as target",
    run() {
      const result = runCli(["setup", "--dry-run", "--target", os.homedir()]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "user home directory", "stderr");
    },
  },
{
    name: "setup rejects symlink target descendants that resolve to a system directory",
    run() {
      const tempRoot = makeTempHome();
      const linkPath = path.join(tempRoot, "bin-link");
      symlinkSync("/bin", linkPath, "dir");
      const result = runCli([
        "setup",
        "--dry-run",
        "--target",
        path.join(linkPath, "ddalggak-test"),
      ]);
      assertExit(result, 2);
      assertIncludes(result.stderr, "resolves under system directory", "stderr");
    },
  },
{
    name: "setup installs skill payload",
    run() {
      const claudeHome = makeTempHome();
      const result = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      const skillDir = path.join(claudeHome, "skills", "ddalggak");
      assertExit(result, 0);
      assert(
        existsSync(path.join(skillDir, "SKILL.md")),
        "expected setup to create skills/ddalggak/SKILL.md",
      );
      assert(
        !existsSync(path.join(claudeHome, "skills", ["omo", "ulw"].join("-"))),
        "expected setup not to create a standalone ULW skill",
      );
      assert(
        existsSync(path.join(skillDir, ".installed-version")),
        "expected setup to create skills/ddalggak/.installed-version",
      );
      assert(
        existsSync(path.join(skillDir, ".installed-manifest.json")),
        "expected setup to create skills/ddalggak/.installed-manifest.json",
      );
      const manifest = readInstalledManifest(claudeHome);
      assert(
        manifest.packageVersion === pkg.version,
        "expected manifest packageVersion to match package.json",
      );
      assert(
        typeof manifest.installedAt === "string" &&
          manifest.installedAt.length > 0,
        "expected manifest installedAt",
      );
      assert(
        manifest.sourceRoot === path.join(rootDir, "ddalggak"),
        `expected sourceRoot to record source payload root, got ${manifest.sourceRoot}`,
      );
      const skillEntry = manifest.files.find(
        (file) => file.path === "SKILL.md",
      );
      assert(skillEntry, "expected manifest to include SKILL.md");
      assert(
        skillEntry.sha256 === sha256File(path.join(skillDir, "SKILL.md")),
        "expected manifest SKILL.md sha256 to match installed file",
      );
    },
  },
{
    name: "setup re-run is idempotent",
    run() {
      const claudeHome = makeTempHome();
      const first = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(first, 0);

      const second = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(second, 0);
      assertIncludes(second.stdout, "Already up to date", "stdout");
    },
  },
{
    name: "setup backs up stale existing install by default",
    run() {
      const claudeHome = makeTempHome();
      writeExistingInstall(claudeHome);
      const result = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assertIncludes(result.stdout, "Backed up existing install", "stdout");
      assert(
        listNames(path.join(claudeHome, "skills")).some((name) =>
          name.startsWith("ddalggak.bak."),
        ),
        "expected stale install backup next to skills/ddalggak",
      );
      assert(
        readFileSync(
          path.join(skillDirFor(claudeHome), ".installed-version"),
          "utf8",
        ) === `${pkg.version}\n`,
        "expected fresh install version after backup",
      );
    },
  },
{
    name: "setup --no-backup replaces stale install without backup",
    run() {
      const claudeHome = makeTempHome();
      writeExistingInstall(claudeHome);
      const result = runCli(["setup", "--no-backup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(result, 0);
      assert(
        !listNames(path.join(claudeHome, "skills")).some((name) =>
          name.startsWith("ddalggak.bak."),
        ),
        "expected --no-backup not to create backup directories",
      );
      assert(
        !listNames(path.join(claudeHome, "skills")).some((name) =>
          name.startsWith(".ddalggak-install-") ||
          name.startsWith(".ddalggak-replace-"),
        ),
        "expected atomic staging directories to be cleaned up",
      );
      assert(
        readFileSync(
          path.join(skillDirFor(claudeHome), ".installed-version"),
          "utf8",
        ) === `${pkg.version}\n`,
        "expected fresh install version after --no-backup replace",
      );
    },
  },
{
    name: "setup backfills missing manifest on same-version installs",
    run() {
      const claudeHome = makeTempHome();
      const first = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(first, 0);
      rmSync(path.join(skillDirFor(claudeHome), ".installed-manifest.json"), {
        force: true,
      });

      const second = runCli(["setup"], {
        env: { CLAUDE_HOME: claudeHome },
      });
      assertExit(second, 0);
      assertIncludes(
        second.stdout,
        "Wrote missing installed manifest",
        "stdout",
      );
      assert(
        existsSync(
          path.join(skillDirFor(claudeHome), ".installed-manifest.json"),
        ),
        "expected setup to backfill missing .installed-manifest.json",
      );
    },
  },
{
    name: "install excludes .DS_Store junk from payload copy and manifest",
    async run() {
      const src = mkdtempSync(path.join(os.tmpdir(), "ddx-src-"));
      mkdirSync(path.join(src, "references"), { recursive: true });
      writeFileSync(path.join(src, "SKILL.md"), "# skill\n", "utf8");
      writeFileSync(path.join(src, "references", "r.md"), "ref\n", "utf8");
      writeFileSync(path.join(src, ".DS_Store"), "junk", "utf8");
      writeFileSync(path.join(src, "references", ".DS_Store"), "junk", "utf8");
      const claudeHome = makeTempHome();
      const dst = path.join(claudeHome, "skills", "ddalggak");
      try {
        await installSkillPayload({
          sourceRoot: src,
          dstDir: dst,
          version: "9.9.9",
          force: false,
          noBackup: false,
          out: () => {},
        });
        assert(existsSync(path.join(dst, "SKILL.md")), "expected SKILL.md copied");
        assert(
          !existsSync(path.join(dst, ".DS_Store")),
          "expected top-level .DS_Store excluded from install",
        );
        assert(
          !existsSync(path.join(dst, "references", ".DS_Store")),
          "expected nested .DS_Store excluded from install",
        );
        const manifest = JSON.parse(
          readFileSync(path.join(dst, ".installed-manifest.json"), "utf8"),
        );
        assert(
          manifest.files.every((f) => !f.path.split("/").includes(".DS_Store")),
          "expected no .DS_Store entry in installed manifest",
        );
      } finally {
        rmSync(src, { recursive: true, force: true });
      }
    },
  },
{
    name: "setup re-syncs same-version content drift without --force",
    run() {
      const claudeHome = makeTempHome();
      assertExit(runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } }), 0);
      const skillMd = path.join(skillDirFor(claudeHome), "SKILL.md");
      const original = readFileSync(skillMd, "utf8");
      // Same installed-version, drifted content — the case plain version-only skip missed.
      writeFileSync(skillMd, `${original}\n<!-- drift -->\n`, "utf8");

      const second = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(second, 0);
      assert(
        !second.stdout.includes("Already up to date"),
        "expected content drift to bypass the up-to-date skip",
      );
      assertIncludes(second.stdout, "re-syncing", "stdout");
      assert(
        readFileSync(skillMd, "utf8") === original,
        "expected drifted SKILL.md restored to source bytes after re-sync",
      );
    },
  },
{
    name: "setup re-syncs when installed payload has an extra file at same version",
    run() {
      const claudeHome = makeTempHome();
      assertExit(runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } }), 0);
      const extra = path.join(skillDirFor(claudeHome), "references", "obsolete.md");
      writeFileSync(extra, "stray\n", "utf8"); // extra installed file, version unchanged

      const second = runCli(["setup"], { env: { CLAUDE_HOME: claudeHome } });
      assertExit(second, 0);
      assert(
        !second.stdout.includes("Already up to date"),
        "expected an extra installed file to count as drift and bypass skip",
      );
      assertIncludes(second.stdout, "re-syncing", "stdout");
      assert(
        !existsSync(extra),
        "expected re-sync to drop the extra installed file not present in source",
      );
    },
  }
];
