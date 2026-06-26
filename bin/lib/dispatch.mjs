// ddalggak dispatch — 화이트리스트 서브커맨드를 받아
// "/ddalggak <subcmd> [args]" 슬래시 문자열을 빌드하고 claude CLI를 spawn.
// zero-dep, ESM only.

import { spawn } from "node:child_process";
import { buildSlashString } from "./dispatch/slash.mjs";
import { extractDocSection } from "./dispatch/show-doc.mjs";
import { parseArgs, runRuntimeDispatch } from "./dispatch/runtime-dispatch-args.mjs";
import { resolveExecutable } from "./process/resolve-executable.mjs";

// subcmd → SKILL.md H2 헤더 매핑 (--show-doc 용)
// <!-- ddalggak:generated:start show-doc-heading-map -->
const DOC_SECTION = {
  start: "Start Workflow",
  review: "Cross-Review Loop",
  status: "Status",
  plan: "Issue-Ready Plan",
  issue: "Plan to Issues",
  clean: "Merge Cleanup",
  ship: "Ship",
  retro: "Retrospective",
  prompt: "Prompt Optimizer",
  tune: "Tune Goal Brief",
  forge: "Forge Acceptance Criteria",
  spark: "Spark Runtime Goal",
  check: "Local Diff Check",
  getwiki: "GetWiki Bridge",
  setwiki: "SetWiki Bridge",
};
// <!-- ddalggak:generated:end show-doc-heading-map -->

async function findClaude() {
  return resolveExecutable("claude");
}

export async function run(subcmd, args) {
  const { printMode, showDocMode, runtimeDispatchMode, rest } = parseArgs(args || []);

  // 1) --show-doc 우선 처리
  if (showDocMode) {
    return extractDocSection(subcmd, DOC_SECTION);
  }

  if (runtimeDispatchMode) {
    return runRuntimeDispatch(subcmd, rest);
  }

  // 2) 슬래시 문자열 빌드
  const slash = buildSlashString(subcmd, rest);

  // 3) --print 모드
  if (printMode) {
    process.stdout.write(slash + "\n");
    return 0;
  }

  // 4) claude 검출 + 비대화형 폴백
  const claudePath = await findClaude();
  const interactive = process.stdout.isTTY;

  if (!claudePath || !interactive) {
    process.stderr.write(
      "claude CLI not found in PATH. Run this in Claude Code instead:\n"
    );
    process.stdout.write(slash + "\n");
    return 0;
  }

  // 5) claude 정상 spawn (stdio inherit으로 SIGINT 자동 전파)
  return await new Promise((resolve) => {
    const child = spawn(claudePath, [slash], { stdio: "inherit" });
    child.on("close", (code) => resolve(typeof code === "number" ? code : 0));
    child.on("error", (err) => {
      process.stderr.write(`failed to spawn claude: ${err.message}\n`);
      resolve(1);
    });
  });
}
