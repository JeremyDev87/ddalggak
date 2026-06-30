import { spawnSync } from "node:child_process";

export const domain = "cli-readme-drift";
export const checks = ["README quality anchors", "CLI help/show-doc drift", "legacy forbidden terms", "projection verifier"];

export function runCliReadmeDriftChecks({
  rootDir,
  packagePath,
  readmePath,
  cliPath,
  skillPath,
  skillDir,
  claudeSkillPath,
  requiredReadmeQualityAnchors,
  requiredSubcommands,
  requiredClaudeHeadings,
  extractCliHelpSubcommands,
  arraysEqual,
  extractClaudeSection,
  extractMarkdownSection,
  assertRenderedSubcommandContracts,
  assertForbiddenTermsAbsent,
  readText,
  statSync,
  listFiles,
  bannedTerms,
  countOccurrences,
  fail,
}) {
  const readmeText = readText(readmePath);
  const missingReadmeQualityAnchors = requiredReadmeQualityAnchors.filter(
    (anchor) => !readmeText.includes(anchor),
  );
  if (missingReadmeQualityAnchors.length > 0) {
    fail(
      `README Quality Defaults anchors missing:\n${missingReadmeQualityAnchors
        .map((anchor) => `  - ${anchor}`)
        .join("\n")}`,
    );
  }

  const packageJson = JSON.parse(readText(packagePath));
  const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : [];
  if (!packageFiles.includes(".codex/")) {
    fail('package.json files must include ".codex/".');
  }

  const helpResult = spawnSync(process.execPath, [cliPath, "--help"], {
    cwd: rootDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (helpResult.status !== 0) {
    fail(`bin/ddalggak.js --help must run successfully. stderr:\n${helpResult.stderr}`);
  }
  const cliSubcommands = extractCliHelpSubcommands(helpResult.stdout);
  if (!arraysEqual(cliSubcommands, requiredSubcommands)) {
    fail(
      `CLI help subcommands drifted. Expected ${requiredSubcommands.join(", ")}; got ${cliSubcommands.join(", ")}`,
    );
  }

  for (const subcommand of requiredSubcommands) {
    const showDocResult = spawnSync(process.execPath, [cliPath, subcommand, "--show-doc"], {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (showDocResult.status !== 0) {
      fail(
        `ddalggak ${subcommand} --show-doc failed:\nstdout:\n${showDocResult.stdout}\nstderr:\n${showDocResult.stderr}`,
      );
      continue;
    }
    const expectedHeading = requiredClaudeHeadings[subcommand];
    if (!showDocResult.stdout.includes(`## ${expectedHeading}`)) {
      fail(`ddalggak ${subcommand} --show-doc must resolve core/commands heading "${expectedHeading}".`);
    }
  }

  const claudeSkillText = statSync(claudeSkillPath, { throwIfNoEntry: false })?.isFile()
    ? readText(claudeSkillPath)
    : "";
  for (const [subcommand, heading] of Object.entries(requiredClaudeHeadings)) {
    if (!claudeSkillText.includes(`## ${heading}`)) {
      fail(`ddalggak/SKILL.md must include ## ${heading} for '${subcommand}'.`);
    }
  }

  const compactShowDocContracts = {
    plan: [
      "Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.",
      "references/wiki-bridge.md",
      "Execution contract index:",
      "Quality Lens Router Output",
      "Evidence Contract",
      "Simplicity / Deletability Gate",
      "Frontend/Vercel/Regression details only when applicable",
      "one PR per issue by default",
      "conflict fallback only with proof",
      "Parallelization Decision",
      "Must not touch",
      "evidence",
      "commit message",
    ],
    start: [
      "Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.",
      "Execution contract index:",
      "Quality Lens Router",
      "Evidence Contract",
      "Simplicity / Deletability",
      "Core Invariants",
      "frontend/vercel/regression only when applicable",
      "allowed, forbidden, inspect-only, Must not touch",
      "one issue PR by default",
      "hard-conflict fallback only with reason",
      "commit/push/PR/evidence/blocking gaps",
    ],
    review: [
      "Full procedure: `references/cross-review-loop.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; reusable prompt: `templates/review-brief.md`.",
      "Execution contract index:",
      "live PR state",
      "diff/files/checks",
      "linked issue",
      "current head SHA",
      "wiki-context preflight",
      "Quality Lens Router",
      "Evidence Contract",
      "Simplicity / Deletability",
      "Core Invariants",
      "conditional frontend/vercel/regression gates",
      "top-level comment with SHA",
      "validation",
      "conclusion",
    ],
  };
  for (const [subcommand, anchors] of Object.entries(compactShowDocContracts)) {
    const heading = requiredClaudeHeadings[subcommand];
    const section = extractClaudeSection(claudeSkillText, heading);
    for (const anchor of anchors) {
      if (!section.includes(anchor)) {
        fail(`ddalggak ${subcommand} --show-doc compact contract missing anchor: ${anchor}`);
      }
    }
    for (const forbiddenHeading of [
      "### Quality Lens Router Output",
      "### Evidence Contract",
      "### Frontend Design Brief",
      "### Vercel Agent Skills Gate",
    ]) {
      if (section.includes(forbiddenHeading)) {
        fail(`ddalggak ${subcommand} --show-doc must keep ${forbiddenHeading} detail in references/templates, not inline.`);
      }
    }
  }

  const codexSkillText = statSync(skillPath, { throwIfNoEntry: false })?.isFile()
    ? readText(skillPath)
    : "";
  assertRenderedSubcommandContracts({
    label: ".codex/skills/ddalggak/SKILL.md",
    text: codexSkillText,
  });
  assertRenderedSubcommandContracts({
    label: "ddalggak/SKILL.md",
    text: claudeSkillText,
  });
  const codexCompactSubcommandContracts = {
    plan: [
      "Full procedure: `references/issue-ready-plan.md`; wiki preflight: `references/wiki-context-preflight.md`; wiki bridge: `references/wiki-bridge.md`; Brain v0 authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`.",
      "references/wiki-bridge.md",
      "Execution contract index:",
      "Quality Lens Router Output",
      "Evidence Contract",
      "Simplicity / Deletability Gate",
      "one issue PR by default",
      "conflict fallback only with proof",
      "Parallelization Decision",
      "Must not touch",
    ],
    start: [
      "Full procedure: `references/start-workflow.md`; reusable prompt: `templates/worker-brief.md`.",
      "Execution contract index:",
      "Quality Lens Router Output",
      "Evidence Contract",
      "Simplicity / Deletability Gate",
      "allowed/forbidden/inspect-only/Must not touch",
      "one issue PR by default",
      "hard-conflict fallback only with reason",
      "validation/PR evidence",
    ],
    review: [
      "Full procedure: `references/cross-review-loop.md`; wiki authority: `references/2026-06-04-brain-v0-wiki-authority-in-ddalggak.md`; reusable prompt: `templates/review-brief.md`.",
      "Execution contract index:",
      "live PR/diff/files/checks/issue/head SHA",
      "Wiki Context Preflight",
      "Quality Lens Router Output",
      "Evidence Contract",
      "Simplicity / Deletability Gate",
      "conditional frontend/Vercel/regression gates",
      "top-level conclusion comment",
    ],
  };
  const codexCompactHeadings = {
    plan: "`plan` - Issue-Ready Plan",
    start: "`start` - Issue-Based Implementation",
    review: "`review` - Cross-Review Loop",
  };
  for (const [subcommand, anchors] of Object.entries(codexCompactSubcommandContracts)) {
    const section = extractMarkdownSection(codexSkillText, codexCompactHeadings[subcommand]);
    for (const anchor of anchors) {
      if (!section.includes(anchor)) {
        fail(`.codex/skills/ddalggak/SKILL.md ${subcommand} compact contract missing anchor: ${anchor}`);
      }
    }
  }

  const issueSection = extractClaudeSection(claudeSkillText, requiredClaudeHeadings.issue);
  for (const issueCommitLaneAnchor of ["Owned files", "Must not touch", "Parallelization note", "Commit lane suggestion", "Validation/evidence", "Dependencies / blocked by"]) {
    if (!issueSection.includes(issueCommitLaneAnchor)) {
      fail(`ddalggak issue --show-doc section must preserve commit-lane issue fields (${issueCommitLaneAnchor}).`);
    }
  }

  assertForbiddenTermsAbsent({
    label: "ddalggak start --show-doc section",
    text: extractClaudeSection(claudeSkillText, requiredClaudeHeadings.start),
    terms: [
      "PUSHED:",
      "PR URL 출력",
      "git add → commit → push → gh pr create",
      "commit/push/draft PR까지 완료",
      "PR 링크 요약",
      "PR이 열렸으면",
      "push/PR만 빠진 경우",
      "gh pr create --draft --base",
      "Wave",
      "wave",
      "복수 PR merge",
    ],
  });

  assertForbiddenTermsAbsent({
    label: "ddalggak plan --show-doc section",
    text: extractClaudeSection(claudeSkillText, requiredClaudeHeadings.plan),
    terms: ["Wave", "wave", "복수 PR merge", "별도 wave", "같은 wave"],
  });

  assertForbiddenTermsAbsent({
    label: "ddalggak issue --show-doc section",
    text: issueSection,
    terms: [
      "Wave",
      "wave",
      "Wave 1",
      "Wave 2",
      "Wave 단위",
      "모든 sub-issue merge",
      "/multi-issue-executor",
      "복수 PR merge",
      "| # | 제목 | 파일 | Wave | Blockers | 상태 |",
    ],
  });

  assertForbiddenTermsAbsent({
    label: "Codex skill",
    text: readText(skillPath),
    terms: [
      "PRs in the same wave",
      "tests, commit, push, draft PR",
      "worker repeatedly idles after commit without push or PR",
      '"phase": "wave-1"',
      '"pr_url"',
      "`pr_opened`",
      "`pr_review_approved`",
      "merge-order context",
      "one PR per lane unless",
      "do not create stacked PRs, branch matrices, or lane-specific PRs",
      "Lane-specific/per-issue PRs are required",
      "without creating lane PRs",
    ],
  });

  assertForbiddenTermsAbsent({
    label: "ddalggak Claude skill unconditional lane-specific PR prohibition",
    text: claudeSkillText,
    terms: [
      "Worker는 lane-specific PR을 만들지 않는다.",
      "content=\"BRIEF.md(.worktrees/<branch>/BRIEF.md)를 읽고 지시된 대로 구현해. 완료 후 한 줄: LANE_READY: Phase Y W<번호> <patch-or-commit> <validation>\"",
      "모든 워커가 `LANE_READY:` 출력 나오면 lane 초안 수집 완료",
    ],
  });

  if (statSync(skillDir, { throwIfNoEntry: false })?.isDirectory()) {
    const bannedHits = [];
    for (const filePath of listFiles(skillDir)) {
      const text = readText(filePath);
      for (const term of bannedTerms) {
        const count = countOccurrences(text, term);
        if (count > 0) {
          bannedHits.push({
            file: filePath.replace(`${rootDir}/`, ""),
            term,
            count,
          });
        }
      }
    }

    if (bannedHits.length > 0) {
      const details = bannedHits
        .map((hit) => `${hit.file}: ${hit.term} x${hit.count}`)
        .join("\n");
      fail(`banned Claude primitive leftovers must be zero:\n${details}`);
    }
  }

  const projectionVerifier = spawnSync(process.execPath, ["scripts/verify-projections.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
  });
  if (projectionVerifier.status !== 0) {
    fail(
      `projection-aware verifier failed with exit ${projectionVerifier.status}:\n${projectionVerifier.stdout || ""}${projectionVerifier.stderr || ""}`,
    );
  } else if (projectionVerifier.stdout) {
    process.stdout.write(projectionVerifier.stdout);
  }
}
