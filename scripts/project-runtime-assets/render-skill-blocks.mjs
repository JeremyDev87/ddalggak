import { escapeRegExp } from "../lib/escape-regexp.mjs";

const allowedArtifactByCommand = {
  start: "worker agents may edit only files named in their brief",
  review: "author agents may apply accepted Critical/High review fixes only",
  "ulw-loop": "scoped source edits only; no GitHub writes",
  "ulw-plan": "plan output only",
  "ulw-research": "research output only",
  "gjc-plan": "coordinator plan delegation evidence only",
  "gjc-execute": "scoped source edits only after explicit approval and coordinator mutation enablement; no GitHub writes",
  "gjc-team": "scoped team work only after explicit approval and coordinator mutation enablement; no GitHub writes",
  prompt: "brief artifacts after explicit confirmation",
  tune: "goal-alignment brief artifacts only",
  forge: "acceptance-criteria artifacts only",
  spark: "runtime-goal sentence artifacts only",
  plan: "response output only unless the user separately asks to write a plan document",
  issue: "GitHub issues only",
  status: "response output only",
  check: "local review notes only; no repository edits",
  ship: "commit, push, and draft PR for existing changes only",
  clean: "local branch and worktree cleanup only after merge verification",
  retro: "retrospective notes and memory update request artifacts only",
  getwiki: "delegate to dedicated `/getwiki` read-only retrieval",
  setwiki: "delegate to dedicated `/setwiki` approval-gated write workflow",
};

function markerStart(id, relativePath = "") {
  const marker = `<!-- ddalggak:generated:start ${id} -->`;
  return relativePath.endsWith(".mjs") ? `// ${marker}` : marker;
}

function markerEnd(id, relativePath = "") {
  const marker = `<!-- ddalggak:generated:end ${id} -->`;
  return relativePath.endsWith(".mjs") ? `// ${marker}` : marker;
}

function generatedBlock(id, body, relativePath) {
  return `${markerStart(id, relativePath)}\n${body.trimEnd()}\n${markerEnd(id, relativePath)}`;
}

export function replaceGeneratedBlock(text, id, body, relativePath) {
  const start = markerStart(id, relativePath);
  const end = markerEnd(id, relativePath);
  const pattern = new RegExp(`${escapeRegExp(start)}\\n[\\s\\S]*?\\n${escapeRegExp(end)}`, "g");
  const matches = text.match(pattern) || [];
  if (matches.length !== 1) {
    throw new Error(`${relativePath}: expected exactly one generated block for ${id}, found ${matches.length}`);
  }
  return text.replace(pattern, generatedBlock(id, body, relativePath));
}

function mdList(items, prefix) {
  if (!items?.length) return "-";
  return items.map((item) => `\`${prefix}${item}\``).join(", ");
}

function purpose(doc) {
  return String(doc.purpose || "").replace(/\.$/, "");
}

function renderCodexCodePermissionTable(commands) {
  const lines = [
    "| Subcommand | May modify source files | Allowed artifacts |",
    "| --- | --- | --- |",
  ];
  for (const doc of commands) {
    lines.push(
      `| \`${doc.command}\` | ${doc.source_edit_allowed ? "yes" : "no"} | ${allowedArtifactByCommand[doc.command] || "response output only"} |`,
    );
  }
  return lines.join("\n");
}

function renderClaudeCodePermissionTable(commands) {
  const lines = [
    "| 서브커맨드 | 소스 코드 수정 | 작성 가능한 산출물 |",
    "|---|---|---|",
  ];
  for (const doc of commands) {
    const allowed = doc.source_edit_allowed ? "✅" : "❌";
    const artifact = allowedArtifactByCommand[doc.command] || "상태 보고";
    lines.push(`| \`${doc.command}\` | ${allowed} | ${artifact} |`);
  }
  return lines.join("\n");
}

function renderCodexSubcommandTable(commands) {
  const lines = [
    "## Subcommand Contract Table",
    "",
    "| Subcommand | Mode | Show-doc heading | Purpose | Side effects | Stop condition | Required assets |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const doc of commands) {
    const refs = mdList(doc.required_references || [], "references/");
    const templates = mdList(doc.required_templates || [], "templates/");
    lines.push(`| \`${doc.command}\` | ${doc.mode || "read-only"} | ${doc.show_doc_heading} | ${purpose(doc)} | ${doc.write_side_effects || "response output only"} | ${doc.stop_condition || "Stop after reporting current state."} | refs: ${refs}; templates: ${templates} |`);
  }
  return lines.join("\n");
}

function renderClaudeSubcommandTable(commands) {
  const lines = [
    "| subcommand | mode | show-doc heading | 목적 | side effects | stop condition | 상세 reference rule |",
    "|---|---|---|---|---|---|---|",
  ];
  for (const doc of commands) {
    const refs = mdList(doc.required_references || [], "references/");
    const templates = mdList(doc.required_templates || [], "templates/");
    lines.push(`| \`${doc.command}\` | ${doc.mode || "read-only"} | ${doc.show_doc_heading} | ${purpose(doc)} | ${doc.write_side_effects || "response output only"} | ${doc.stop_condition || "Stop after reporting current state."} | refs: ${refs}; templates: ${templates} |`);
  }
  return lines.join("\n");
}

// Canonical grouping for the generated Required Reference Map (#379).
// The group is semantic, not filename-derived:
// - gates: preflight/admission/review/checklist gates that can block readiness or approval.
// - wiki: wiki/getwiki/setwiki authority and retrieval/write-boundary references.
// - workflow: procedural command workflows, shipping/status/cleanup/reporting steps, or support loops.
// Keep each reference in exactly one group so generated tables cannot classify the
// same reference differently across runtime surfaces.
const referenceGroupByName = new Map([
  ["agent-runtime-contract.md", "workflow"],
  ["ci-failure-triage-loop.md", "workflow"],
  ["core-invariants.md", "gates"],
  ["cross-review-loop.md", "workflow"],
  ["deep-interview-readiness-gate.md", "gates"],
  ["evidence-contract.md", "gates"],
  ["forge-goal.md", "workflow"],
  ["gajae-code.md", "workflow"],
  ["human-review-feedback-loop.md", "workflow"],
  ["issue-ready-plan.md", "workflow"],
  ["local-diff-check.md", "workflow"],
  ["merge-cleanup.md", "workflow"],
  ["plan-to-issues.md", "workflow"],
  ["pr-check-evidence-bundle.md", "workflow"],
  ["prompt-optimizer.md", "workflow"],
  ["prompt-skill-optimization-staging.md", "workflow"],
  ["quality-lens-router.md", "gates"],
  ["ralplan-critic-consensus.md", "gates"],
  ["regression-library.md", "gates"],
  ["retrospective-workflow.md", "workflow"],
  ["retrospective.md", "workflow"],
  ["security-posture-gate.md", "gates"],
  ["ship.md", "workflow"],
  ["simplicity-deletability-gate.md", "gates"],
  ["spark-goal.md", "workflow"],
  ["start-workflow.md", "workflow"],
  ["status.md", "workflow"],
  ["tune-goal.md", "workflow"],
  ["ulw-loop.md", "workflow"],
  ["ulw-plan.md", "workflow"],
  ["ulw-research.md", "workflow"],
  ["wiki-bridge.md", "wiki"],
  ["wiki-context-preflight.md", "wiki"],
  ["wiki-growth-triage.md", "workflow"],
  ["2026-06-04-brain-v0-wiki-authority-in-ddalggak.md", "wiki"],
]);

const referenceGroups = new Set(["workflow", "gates", "wiki"]);

function referenceGroupOf(ref) {
  const group = referenceGroupByName.get(ref);
  if (!group) {
    throw new Error(
      `unclassified required reference: ${ref}; add it to referenceGroupByName in scripts/project-runtime-assets/render-skill-blocks.mjs`,
    );
  }
  if (!referenceGroups.has(group)) {
    throw new Error(`invalid reference group for ${ref}: ${group}`);
  }
  return group;
}

function splitReferencesByGroup(refs) {
  const groups = { workflow: [], gates: [], wiki: [] };
  for (const ref of refs || []) {
    groups[referenceGroupOf(ref)].push(ref);
  }
  return groups;
}

function renderRequiredReferenceMap(commands) {
  const lines = [
    "| Subcommand | Workflow reference | Gate references | Wiki/meta references | Required templates |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const doc of commands) {
    const refs = splitReferencesByGroup(doc.required_references || []);
    lines.push(
      `| \`${doc.command}\` | ${mdList(refs.workflow, "references/")} | ${mdList(refs.gates, "references/")} | ${mdList(refs.wiki, "references/")} | ${mdList(doc.required_templates || [], "templates/")} |`,
    );
  }
  return lines.join("\n");
}

function completionSignalOf(doc) {
  const signal = doc.output_contract?.completion_signal;
  if (!signal) {
    throw new Error(`command contract missing output_contract.completion_signal: ${doc.command}`);
  }
  return signal;
}

function renderClaudeCompletionSignalTable(commands) {
  const lines = ["| 서브커맨드 | 완료 신호 |", "|---|---|"];
  for (const doc of commands) {
    lines.push(`| \`${doc.command}\` | \`${completionSignalOf(doc)}\` |`);
  }
  return lines.join("\n");
}

function renderCodexCompletionSignalTable(commands) {
  const lines = ["| Subcommand | Completion signal |", "| --- | --- |"];
  for (const doc of commands) {
    lines.push(`| \`${doc.command}\` | \`${completionSignalOf(doc)}\` |`);
  }
  return lines.join("\n");
}

export function skillBlockProjections(commands) {
  return [
    {
      path: "ddalggak/SKILL.md",
      blocks: [
        ["code-permission-table", renderClaudeCodePermissionTable(commands)],
        ["subcommand-table", renderClaudeSubcommandTable(commands)],
        ["required-reference-map", renderRequiredReferenceMap(commands)],
        ["completion-signal-table", renderClaudeCompletionSignalTable(commands)],
      ],
    },
    {
      path: ".codex/skills/ddalggak/SKILL.md",
      blocks: [
        ["code-permission-table", renderCodexCodePermissionTable(commands)],
        ["subcommand-table", renderCodexSubcommandTable(commands)],
        ["required-reference-map", renderRequiredReferenceMap(commands)],
        ["completion-signal-table", renderCodexCompletionSignalTable(commands)],
      ],
    },
  ];
}
