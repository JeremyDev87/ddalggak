// ddalggak dispatch — 화이트리스트 서브커맨드를 받아
// "/ddalggak <subcmd> [args]" 슬래시 문자열을 빌드하고 claude CLI를 spawn.
// zero-dep, ESM only.

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// subcmd → SKILL.md H2 헤더 매핑 (--show-doc 용)
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
  check: "Local Diff Check",
};

// 큰따옴표 escape가 필요한 문자
const QUOTE_TRIGGERS = [" ", '"', "'", "\\", "$", "`"];

function quoteIfNeeded(s) {
  for (const ch of QUOTE_TRIGGERS) {
    if (s.includes(ch)) {
      return '"' + s.replace(/"/g, '\\"') + '"';
    }
  }
  return s;
}

function buildSlashString(subcmd, parts) {
  if (parts.length === 0) {
    return `/ddalggak ${subcmd}`;
  }
  return `/ddalggak ${subcmd} ` + parts.map(quoteIfNeeded).join(" ");
}

// claude CLI를 PATH에서 검색 (which 인라인).
async function findClaude() {
  const PATH = process.env.PATH || "";
  const sep = process.platform === "win32" ? ";" : ":";
  const candidates =
    process.platform === "win32"
      ? ["claude.exe", "claude.cmd", "claude"]
      : ["claude"];
  for (const dir of PATH.split(sep)) {
    if (!dir) continue;
    for (const name of candidates) {
      const full = path.join(dir, name);
      try {
        await access(full, constants.X_OK);
        return full;
      } catch {
        /* not executable / not found */
      }
    }
  }
  return null;
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

// 자체 플래그 분리: --print, --show-doc, --
function parseArgs(args) {
  let printMode = false;
  let showDocMode = false;
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
    } else {
      rest.push(a);
    }
    i++;
  }
  return { printMode, showDocMode, rest };
}

export async function run(subcmd, args) {
  const { printMode, showDocMode, rest } = parseArgs(args || []);

  // 1) --show-doc 우선 처리
  if (showDocMode) {
    return extractDocSection(subcmd);
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
