import { commandContractReference, conditionalAssets } from "../../core/conditional-assets.mjs";
import { extractMarkdownSection } from "../lib/markdown-links.mjs";
import { allowedArtifactByCommand } from "./render-skill-blocks.mjs";

function commandFragments(text, commands, source, locale) {
  const keys = [...text.matchAll(/^# (.*)$/gm)].map((match) => match[1]);
  const expected = new Set(commands.map((doc) => doc.command));
  if (keys.length !== 21 || new Set(keys).size !== 21 || keys.some((key) => !expected.has(key))) {
    throw new Error(`${source}: expected exactly 21 unique command keys matching core/commands`);
  }
  return new Map(commands.map((doc) => {
    // Exclude the source file's final LF, just as extraction excludes the next H1's separator.
    const section = extractMarkdownSection(text.replace(/\n$/, ""), doc.command, { level: 1 });
    const body = section.slice(section.indexOf("\n") + 1).trimStart();
    if (!/^## \S[^\n]*\n/.test(body) || (body.match(/^## /gm) || []).length !== 1
      || (locale === "claude" && !extractMarkdownSection(body, doc.show_doc_heading))) {
      throw new Error(`${source}: missing or invalid locale H2 for ${doc.command}`);
    }
    if (body.includes("<!-- ddalggak:generated:")) {
      throw new Error(`${source}: unexpected generated marker in ${doc.command}`);
    }
    return [doc.command, body];
  }));
}

export function commandDocMetadata(doc) {
  if (!Object.hasOwn(allowedArtifactByCommand, doc.command)) {
    throw new Error(`missing allowed_artifact for ${doc.command}`);
  }
  return {
    ...doc,
    conditional_references: doc.conditional_references || [],
    conditional_templates: doc.conditional_templates || [],
    allowed_artifact: allowedArtifactByCommand[doc.command],
  };
}

function readingGuidance(doc) {
  const lines = [
    "This command document and its required assets are the minimum required context, not a reading allowlist.",
    "Read required assets before acting. Read conditional assets when their activation has supporting evidence; multiple activations for one asset are OR, and the asset need only be read once.",
    "Record activation and skip reasons. If a condition is unknown, investigate or stop the affected action; do not silently treat unknown as false.",
    "Additional reading or re-reading is allowed when new evidence warrants it; record why. Load a later phase's command contract before entering that phase, without inheriting another command's permissions.",
    "The public-body activation covers public-ready summaries/findings, including previews and zero-finding summaries; it does not grant publication permission.",
    "Paths below and in the locale notes are relative to the installed skill root.",
    "",
  ];
  for (const kind of ["references", "templates"]) {
    lines.push(`Required ${kind}:`);
    lines.push(...(doc[`required_${kind}`].length
      ? doc[`required_${kind}`].map((asset) => `- \`${kind}/${asset}\``) : ["- None."]));
    lines.push(`Conditional ${kind} (activation -> asset):`);
    const entries = conditionalAssets(doc, `conditional_${kind}`);
    lines.push(...(entries.length
      ? entries.map(({ activation, asset }) => `- \`${activation}\` -> \`${kind}/${asset}\``) : ["- None."]));
    lines.push("");
  }
  return lines.join("\n");
}

export function commandDocProjections({ commands, readText }) {
  if (commands.length !== 21 || new Set(commands.map((doc) => doc.command)).size !== 21) {
    throw new Error("command documents require exactly 21 unique command contracts");
  }
  return Object.entries({ claude: "ddalggak", codex: ".codex/skills/ddalggak" }).flatMap(([locale, root]) => {
    const source = `core/command-docs/${locale}.md`;
    const fragments = commandFragments(readText(source), commands, source, locale);
    return commands.map((doc) => {
      const marker = `<!-- ddalggak:generated:file command-doc:${doc.command} -->`;
      return {
        path: `${root}/references/${commandContractReference(doc.command)}`,
        marker,
        content: [
          marker,
          `# Command: ${doc.command}`,
          "",
          `Use when: ${doc.purpose}`,
          `Required by: \`${doc.command}\` command.`,
          `Side effects: ${doc.write_side_effects}`,
          `Do not use when: Outside this command's scope or permissions. ${doc.stop_condition}`,
          "",
          readingGuidance(doc),
          "```json",
          JSON.stringify(commandDocMetadata(doc), null, 2),
          "```",
          "",
          fragments.get(doc.command),
        ].join("\n"),
      };
    });
  });
}

export function assertCommandDocOwnership(text, { path, marker }) {
  if (text === null) return;
  if ((text.match(/<!-- ddalggak:generated:/g) || []).length !== 1) {
    throw new Error(`${path}: output collision or duplicate generated marker; expected one whole-file marker`);
  }
  if (!text.startsWith(`${marker}\n`)) {
    throw new Error(`${path}: output collision; not owned by this command projection`);
  }
}
