import { escapeRegExp } from "../lib/escape-regexp.mjs";
import { commandContractReference } from "../../core/conditional-assets.mjs";
import { installationInventory } from "./render-package-manifest.mjs";

export const allowedArtifactByCommand = {
  start: "worker agents may edit only files named in their brief",
  review: "author agents may apply accepted Critical/High review fixes only",
  "ulw-loop": "scoped edits; no GitHub",
  "ulw-plan": "plan output only",
  "ulw-research": "research output only",
  "gjc-plan": "coordinator evidence",
  "gjc-execute": "approved edits; no GitHub",
  "gjc-team": "approved team work; no GitHub",
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

export function skillBlockProjections(commands) {
  const index = [
    "| Command | Contract |",
    "| --- | --- |",
    ...commands.map((doc) => `| \`${doc.command}\` | \`references/${commandContractReference(doc.command)}\` |`),
  ].join("\n");
  return Object.entries({ claude: "ddalggak", codex: ".codex/skills/ddalggak" }).map(([root, prefix]) => ({
    path: `${prefix}/SKILL.md`,
    blocks: [
      ["command-index", index],
      ["installation-inventory", installationInventory(commands, { root }).map((file) => `- \`${file}\``).join("\n")],
    ],
  }));
}
