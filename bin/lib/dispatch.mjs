// ddalggak dispatch — 화이트리스트 서브커맨드를 받아
// "/ddalggak <subcmd> [args]" 슬래시 문자열을 빌드하고 claude CLI를 spawn.
// zero-dep, ESM only.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  prepareDdalggakDispatchFromLiveGithubIssue,
  runDdalggakDispatchWithApproval,
} from "../../core/development-control-plane.mjs";
import { fileURLToPath } from "node:url";
import { resolveExecutable } from "./process/resolve-executable.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Slash command arguments are printed as one command string for Claude Code.
// Use JSON string literal escaping when quoting is needed so backslashes and
// control characters cannot make the emitted command ambiguous.
const QUOTE_PATTERN = /[\s"'\\$`]/;

function quoteIfNeeded(s) {
  if (!QUOTE_PATTERN.test(s)) {
    return s;
  }
  return JSON.stringify(s);
}

function buildSlashString(subcmd, parts) {
  const slashCommand =
    subcmd === "getwiki" || subcmd === "setwiki"
      ? `/${subcmd}`
      : `/ddalggak ${subcmd}`;
  if (parts.length === 0) {
    return slashCommand;
  }
  return `${slashCommand} ` + parts.map(quoteIfNeeded).join(" ");
}

async function findClaude() {
  return resolveExecutable("claude");
}

// SKILL.md에서 첫 매칭 H2 섹션부터 다음 H2 직전까지 추출.
function extractDocSection(subcmd) {
  const header = DOC_SECTION[subcmd];
  if (!header) {
    process.stderr.write(`no doc section for: ${subcmd}\n`);
    return 1;
  }

  const skillPath = path.join(__dirname, "..", "..", "ddalggak", "SKILL.md");
  let body;
  try {
    body = readFileSync(skillPath, "utf8");
  } catch {
    process.stderr.write(`SKILL.md not found at ${skillPath}\n`);
    return 1;
  }

  const lines = body.split("\n");
  const targetLower = header.toLowerCase();

  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      const title = line.slice(3).trim().toLowerCase();
      if (title === targetLower) {
        startIdx = i;
        break;
      }
    }
  }

  if (startIdx === -1) {
    process.stderr.write(`no doc section for: ${subcmd}\n`);
    return 1;
  }

  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    if (lines[j].startsWith("## ")) {
      endIdx = j;
      break;
    }
  }

  const section = lines.slice(startIdx, endIdx).join("\n");
  process.stdout.write(section.endsWith("\n") ? section : section + "\n");
  return 0;
}

// 자체 플래그 분리: --print, --show-doc, --runtime-dispatch, --
function parseArgs(args) {
  let printMode = false;
  let showDocMode = false;
  let runtimeDispatchMode = false;
  const rest = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a === "--") {
      // 이후 모든 인자는 raw passthrough (자체 플래그 파싱 중단)
      for (let j = i + 1; j < args.length; j++) {
        rest.push(args[j]);
      }
      break;
    }
    if (a === "--print") {
      printMode = true;
    } else if (a === "--show-doc") {
      showDocMode = true;
    } else if (a === "--runtime-dispatch") {
      runtimeDispatchMode = true;
    } else {
      rest.push(a);
    }
    i++;
  }
  return { printMode, showDocMode, runtimeDispatchMode, rest };
}

function parseRuntimeDispatchArgs(subcmd, rest) {
  const options = {
    subcommand: subcmd,
    plannedFiles: [],
    validationCommands: [],
    approvalSource: "direct",
    approval: { approved: false },
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    const next = () => {
      i += 1;
      if (i >= rest.length) {
        throw new Error(`${arg} requires a value`);
      }
      return rest[i];
    };
    if (arg === "--issue") options.issueRef = next();
    else if (arg === "--repo") options.repo = next();
    else if (arg === "--repo-root") options.repoRoot = next();
    else if (arg === "--planned-file") options.plannedFiles.push(next());
    else if (arg === "--validation-command") options.validationCommands.push(next());
    else if (arg === "--run-id") options.runId = next();
    else if (arg === "--evidence-dir") options.evidenceDir = next();
    else if (arg === "--approval-source") options.approvalSource = next();
    else if (arg === "--approved-by") options.approval.approvedBy = next();
    else if (arg === "--reason") options.approval.reason = next();
    else if (arg === "--workcell-approval-file") options.workcellApprovalFile = next();
    else if (arg === "--execute-approved") options.executeApproved = true;
    else throw new Error(`unknown --runtime-dispatch option: ${arg}`);
  }
  if (!options.issueRef) throw new Error("--runtime-dispatch requires --issue");
  if (!options.repoRoot) throw new Error("--runtime-dispatch requires --repo-root");
  if (!options.runId) throw new Error("--runtime-dispatch requires --run-id");
  if (options.plannedFiles.length === 0) throw new Error("--runtime-dispatch requires at least one --planned-file");
  if (options.validationCommands.length === 0) throw new Error("--runtime-dispatch requires at least one --validation-command");
  options.repoRoot = path.resolve(options.repoRoot);
  if (!options.evidenceDir) {
    options.evidenceDir = path.join(options.repoRoot, ".ddalggak", "development-runs", options.runId);
  }
  if (options.executeApproved) {
    options.approval.approved = true;
  }
  return options;
}

function writeJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function runRuntimeDispatch(subcmd, rest) {
  if (subcmd !== "start" && subcmd !== "review") {
    process.stderr.write("--runtime-dispatch is supported only for start and review\n");
    return 2;
  }
  let options;
  try {
    options = parseRuntimeDispatchArgs(subcmd, rest);
    const result = options.executeApproved
      ? runDdalggakDispatchWithApproval(options)
      : prepareDdalggakDispatchFromLiveGithubIssue(options);
    writeJson({
      status: result.evidence.status,
      evidencePath: result.evidencePath,
      workerExecuted: result.evidence.workerExecuted,
      nextAction: result.evidence.nextAction,
      issueUrl: result.packet.issue.url,
      runId: result.packet.runId,
    });
    return 0;
  } catch (error) {
    process.stderr.write(`ddalggak runtime dispatch blocked: ${error.message}\n`);
    if (error.details) {
      process.stderr.write(JSON.stringify(error.details, null, 2) + "\n");
    }
    return 1;
  }
}

export async function run(subcmd, args) {
  const { printMode, showDocMode, runtimeDispatchMode, rest } = parseArgs(args || []);

  // 1) --show-doc 우선 처리
  if (showDocMode) {
    return extractDocSection(subcmd);
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
