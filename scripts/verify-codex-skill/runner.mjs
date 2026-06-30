import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { runCliReadmeDriftChecks } from "./cli-readme-drift.mjs";
import { runFrontmatterChecks } from "./frontmatter.mjs";
import { runHotPathBudgetChecks } from "./hot-path-budget.mjs";
import { runReferenceAdmissionChecks } from "./reference-admission.mjs";
import { runSemanticAnchorChecks } from "./semantic-anchors.mjs";
import { sideEffectBoundarySkillSemanticAnchorGuards } from "../../core/verification/side-effect-boundary-policy.mjs";
import {
  requiredDisclosureAssetsBySubcommand,
  requiredIssueTemplateFields,
  requiredEpicTemplateFields,
  skillPayloadRoots,
  requiredPackageFiles,
  requiredReferenceAdmissionHeaderFields,
  modePermissionProfiles,
  subcommandExecutionContracts,
  forbiddenHotPathTemplateSentinels,
  requiredSubcommands,
  requiredClaudeHeadings,
  bannedTerms,
  requiredSkillHotPathAnchors,
  requiredClaudeSkillHotPathAnchors,
  routerGateFamilies,
  requiredRouterGateFamilies,
  requiredRouterReferenceAnchors,
  requiredGateVerdictVocabularyReferenceAnchors,
  requiredEvidenceReferenceAnchors,
  requiredSimplicityReferenceAnchors,
  requiredFrontendDesignReferenceAnchors,
  requiredVercelAgentSkillsReferenceAnchors,
  gateStageHeadingReferenceContracts,
  gateActivationKeywordContracts,
  requiredRegressionLibraryReferenceAnchors,
  requiredRegressionLibraryClasses,
  requiredRegressionLibraryFields,
  requiredAgentRuntimeContractAnchors,
  requiredCoreInvariantReferenceAnchors,
  requiredPromptSafetyReferenceAnchors,
  requiredWikiBridgeReferenceAnchors,
  requiredReadmeQualityAnchors,
} from "../../core/verification/skill-contract-manifest.mjs";
import { escapeRegExp } from "../lib/escape-regexp.mjs";
import { parseSimpleYaml } from "../lib/parse-simple-yaml.mjs";


export function runVerifyCodexSkill() {
  const rootDir = process.cwd();
  const skillDir = path.join(rootDir, ".codex", "skills", "ddalggak");
  const skillPath = path.join(skillDir, "SKILL.md");
  const claudeSkillPath = path.join(rootDir, "ddalggak", "SKILL.md");
  const routerReferencePaths = [
    path.join(skillDir, "references", "quality-lens-router.md"),
    path.join(rootDir, "ddalggak", "references", "quality-lens-router.md"),
  ];
  const gateVerdictVocabularyReferencePaths = [
    path.join(skillDir, "references", "gate-verdict-vocabulary.md"),
    path.join(rootDir, "ddalggak", "references", "gate-verdict-vocabulary.md"),
  ];
  const evidenceReferencePaths = [
    path.join(skillDir, "references", "evidence-contract.md"),
    path.join(rootDir, "ddalggak", "references", "evidence-contract.md"),
  ];
  const simplicityReferencePaths = [
    path.join(skillDir, "references", "simplicity-deletability-gate.md"),
    path.join(rootDir, "ddalggak", "references", "simplicity-deletability-gate.md"),
  ];
  const frontendDesignReferencePaths = [
    path.join(skillDir, "references", "frontend-design-gate.md"),
    path.join(rootDir, "ddalggak", "references", "frontend-design-gate.md"),
  ];
  const vercelAgentSkillsReferencePaths = [
    path.join(skillDir, "references", "vercel-agent-skills-gates.md"),
    path.join(rootDir, "ddalggak", "references", "vercel-agent-skills-gates.md"),
  ];
  const regressionLibraryReferencePaths = [
    path.join(skillDir, "references", "regression-library.md"),
    path.join(rootDir, "ddalggak", "references", "regression-library.md"),
  ];
  const agentRuntimeContractReferencePaths = [
    path.join(skillDir, "references", "agent-runtime-contract.md"),
    path.join(rootDir, "ddalggak", "references", "agent-runtime-contract.md"),
  ];
  const coreInvariantReferencePaths = [
    path.join(skillDir, "references", "core-invariants.md"),
    path.join(rootDir, "ddalggak", "references", "core-invariants.md"),
  ];
  const promptOptimizerReferencePaths = [
    path.join(skillDir, "references", "prompt-optimizer.md"),
    path.join(rootDir, "ddalggak", "references", "prompt-optimizer.md"),
  ];
  const wikiBridgeReferencePaths = [
    path.join(skillDir, "references", "wiki-bridge.md"),
    path.join(rootDir, "ddalggak", "references", "wiki-bridge.md"),
  ];
  const referenceAnchorContracts = [
    {
      verificationMode: "all-copies",
      contractLabel: "Quality Lens Router",
      referencePaths: routerReferencePaths,
      anchors: requiredRouterReferenceAnchors,
      missingAnchorsLabel: ({ label }) => `Quality Lens Router acceptance anchors missing from ${label}`,
      extraValidate: assertRouterReferenceContract,
    },
    {
      verificationMode: "all-copies",
      contractLabel: "Gate Verdict Vocabulary Index",
      referencePaths: gateVerdictVocabularyReferencePaths,
      anchors: requiredGateVerdictVocabularyReferenceAnchors,
      missingAnchorsLabel: ({ label }) => `Gate Verdict Vocabulary Index anchors missing from ${label}`,
    },
    {
      verificationMode: "all-copies",
      contractLabel: "Evidence Contract",
      referencePaths: evidenceReferencePaths,
      anchors: requiredEvidenceReferenceAnchors,
      missingAnchorsLabel: ({ label }) => `Evidence Contract anchors missing from ${label}`,
    },
    {
      verificationMode: "source-root",
      contractLabel: "Simplicity / Deletability Gate",
      referencePaths: simplicityReferencePaths,
      anchors: requiredSimplicityReferenceAnchors,
      missingAnchorsLabel: () => "Simplicity / Deletability Gate anchors missing",
    },
    {
      verificationMode: "source-root",
      contractLabel: "Frontend Design Gate",
      referencePaths: frontendDesignReferencePaths,
      anchors: requiredFrontendDesignReferenceAnchors,
      missingAnchorsLabel: () => "Frontend Design Gate anchors missing",
    },
    {
      verificationMode: "source-root",
      contractLabel: "Vercel Agent Skills Gate",
      referencePaths: vercelAgentSkillsReferencePaths,
      anchors: requiredVercelAgentSkillsReferenceAnchors,
      missingAnchorsLabel: () => "Vercel Agent Skills Gate anchors missing",
    },
    {
      verificationMode: "source-root",
      contractLabel: "Continuous Regression Library",
      referencePaths: regressionLibraryReferencePaths,
      anchors: requiredRegressionLibraryReferenceAnchors,
      missingAnchorsLabel: () => "Continuous Regression Library anchors missing",
      extraValidate: assertRegressionLibraryClassFields,
    },
    {
      verificationMode: "source-root",
      contractLabel: "Agent Runtime Contract",
      referencePaths: agentRuntimeContractReferencePaths,
      anchors: requiredAgentRuntimeContractAnchors,
      missingAnchorsLabel: () => "Agent Runtime Contract anchors missing",
    },
    {
      verificationMode: "source-root",
      contractLabel: "Core Invariants",
      referencePaths: coreInvariantReferencePaths,
      anchors: requiredCoreInvariantReferenceAnchors,
      missingAnchorsLabel: () => "Core Invariants anchors missing",
    },
    {
      verificationMode: "all-copies",
      contractLabel: "Prompt Safety / Brief Compiler",
      referencePaths: promptOptimizerReferencePaths,
      anchors: requiredPromptSafetyReferenceAnchors,
      missingAnchorsLabel: ({ label }) => `Prompt Safety / Brief Compiler anchors missing from ${label}`,
    },
    {
      verificationMode: "source-root",
      contractLabel: "Wiki Bridge",
      referencePaths: wikiBridgeReferencePaths,
      anchors: requiredWikiBridgeReferenceAnchors,
      missingAnchorsLabel: () => "Wiki Bridge anchors missing",
    },
  ];
  const packagePath = path.join(rootDir, "package.json");
  const readmePath = path.join(rootDir, "README.md");
  const cliPath = path.join(rootDir, "bin", "ddalggak.js");
  const skillBudgets = [
    {
      label: ".codex/skills/ddalggak/SKILL.md",
      filePath: skillPath,
      maxLines: 450,
      maxChars: 35_000,
      principleHeadings: ["Global Guardrails"],
      maxPrincipleBullets: 25,
      maxInlineSubcommandAnchors: 23,
    },
    {
      label: "ddalggak/SKILL.md",
      filePath: claudeSkillPath,
      maxLines: 700,
      maxChars: 45_000,
      principleHeadings: ["핵심 원칙", "myWiki-derived 운영 Guardrails"],
      maxPrincipleBullets: 30,
      maxInlineSubcommandAnchors: 60,
    },
  ];
  const skillBudgetMetrics = [];

  const failures = [];

  const semanticAnchorGuards = sideEffectBoundarySkillSemanticAnchorGuards;

  function fail(message) {
    failures.push(message);
  }

  function readText(filePath) {
    return readFileSync(filePath, "utf8");
  }

  function listFiles(dir) {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listFiles(entryPath);
      }
      if (entry.isFile()) {
        return [entryPath];
      }
      return [];
    });
  }

  function getFrontmatter(text) {
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    return match ? match[1] : null;
  }

  function getFrontmatterValue(frontmatter, key) {
    const pattern = new RegExp(`^${escapeRegExp(key)}:\\s*(.+?)\\s*$`, "m");
    const match = frontmatter.match(pattern);
    if (!match) {
      return null;
    }
    return match[1].replace(/^["']|["']$/g, "");
  }

  function extractCliHelpSubcommands(text) {
    const commands = [];
    let inSubcommands = false;
    for (const line of text.split("\n")) {
      if (line.trim() === "Subcommands:") {
        inSubcommands = true;
        continue;
      }
      if (inSubcommands && line.trim() === "") {
        break;
      }
      if (!inSubcommands) {
        continue;
      }
      const match = line.match(/^  ([a-z][a-z-]*)(?:\s|$)/);
      if (line.includes("--local")) {
        continue;
      }
      if (match && !["setup", "doctor", "profile"].includes(match[1])) {
        commands.push(match[1]);
      }
    }
    return commands;
  }

  function arraysEqual(a, b) {
    return a.length === b.length && a.every((item, index) => item === b[index]);
  }

  function countOccurrences(text, term) {
    if (term.length === 0) {
      return 0;
    }

    let count = 0;
    let index = text.indexOf(term);
    while (index !== -1) {
      count += 1;
      index = text.indexOf(term, index + term.length);
    }
    return count;
  }

  function countLinesAndChars(text) {
    const normalized = text.replace(/\r\n/g, "\n");
    return {
      lines: normalized.length === 0 ? 0 : normalized.replace(/\n$/, "").split("\n").length,
      chars: text.length,
    };
  }

  function sectionByHeading(text, heading) {
    const lines = text.split("\n");
    const target = `## ${heading}`;
    const startIdx = lines.findIndex((line) => line.trim() === target);
    if (startIdx === -1) {
      return "";
    }

    let endIdx = lines.length;
    for (let index = startIdx + 1; index < lines.length; index += 1) {
      if (lines[index].startsWith("## ")) {
        endIdx = index;
        break;
      }
    }
    return lines.slice(startIdx, endIdx).join("\n");
  }

  function countPrincipleBullets(text, headings) {
    return headings
      .map((heading) => sectionByHeading(text, heading))
      .join("\n")
      .split("\n")
      .filter((line) => /^\s*-\s+/.test(line)).length;
  }

  function subcommandSections(text) {
    const lines = text.split("\n");
    const sections = [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line.startsWith("## ")) {
        continue;
      }
      const matchingSubcommand = requiredSubcommands.find((subcommand) => {
        const claudeHeading = requiredClaudeHeadings[subcommand];
        return line.trim() === `## ${claudeHeading}` || line.startsWith(`## \`${subcommand}\``);
      });
      if (!matchingSubcommand) {
        continue;
      }

      let endIdx = lines.length;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (lines[cursor].startsWith("## ")) {
          endIdx = cursor;
          break;
        }
      }
      sections.push(lines.slice(index, endIdx).join("\n"));
    }
    return sections;
  }

  function countInlineSubcommandAnchors(text) {
    return subcommandSections(text)
      .join("\n")
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed && !trimmed.startsWith("## ");
      }).length;
  }

  function assertSkillBudget({
    label,
    filePath,
    maxLines,
    maxChars,
    principleHeadings = [],
    maxPrincipleBullets,
    maxInlineSubcommandAnchors,
  }) {
    if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      fail(`${label} must exist before budget verification.`);
      return;
    }

    const text = readText(filePath);
    const { lines, chars } = countLinesAndChars(text);
    const principleBullets = countPrincipleBullets(text, principleHeadings);
    const inlineSubcommandAnchors = countInlineSubcommandAnchors(text);
    skillBudgetMetrics.push({
      label,
      lines,
      maxLines,
      chars,
      maxChars,
      principleBullets,
      maxPrincipleBullets,
      inlineSubcommandAnchors,
      maxInlineSubcommandAnchors,
    });
    if (lines > maxLines || chars > maxChars) {
      fail(
        `${label} exceeds progressive-disclosure budget: ${lines}/${maxLines} lines, ${chars}/${maxChars} chars. Move low-frequency detail to references/ or templates/.`,
      );
    }
    if (maxPrincipleBullets !== undefined && principleBullets > maxPrincipleBullets) {
      fail(
        `${label} has too many hot-path principle bullets: ${principleBullets}/${maxPrincipleBullets}. Keep only non-negotiable invariants here and move explanatory guardrails to references/.`,
      );
    }
    if (maxInlineSubcommandAnchors !== undefined && inlineSubcommandAnchors > maxInlineSubcommandAnchors) {
      fail(
        `${label} has too many inline subcommand detail anchors: ${inlineSubcommandAnchors}/${maxInlineSubcommandAnchors}. Keep show-doc sections as execution-contract indexes and move low-frequency procedure to references/.`,
      );
    }
  }

  function requiredDisclosureAssetPaths() {
    const assets = new Set();
    const mappedSubcommands = Object.keys(requiredDisclosureAssetsBySubcommand);
    for (const subcommand of requiredSubcommands) {
      if (!mappedSubcommands.includes(subcommand)) {
        fail(`requiredDisclosureAssetsBySubcommand is missing required subcommand '${subcommand}'.`);
      }
    }
    for (const [subcommand, groups] of Object.entries(requiredDisclosureAssetsBySubcommand)) {
      if (!requiredSubcommands.includes(subcommand)) {
        fail(`requiredDisclosureAssetsBySubcommand contains unknown subcommand '${subcommand}'.`);
      }
      if (Object.hasOwn(groups, "references")) {
        fail(
          `requiredDisclosureAssetsBySubcommand.${subcommand}.references must not be manually curated; derive reference assets from subcommandExecutionContracts.${subcommand}.requiredReferences.`,
        );
      }
      if (!Array.isArray(groups.templates)) {
        fail(`requiredDisclosureAssetsBySubcommand.${subcommand}.templates must be an array.`);
      }
      const contractReferences = subcommandExecutionContracts[subcommand]?.requiredReferences || [];
      for (const reference of contractReferences) {
        for (const root of skillPayloadRoots) {
          assets.add(`${root}/references/${reference}`);
        }
      }
      for (const template of groups.templates || []) {
        for (const root of skillPayloadRoots) {
          assets.add(`${root}/templates/${template}`);
        }
      }
    }
    return [...assets].sort();
  }

  function assertRequiredDisclosureAssetsExist() {
    for (const assetPath of requiredDisclosureAssetPaths()) {
      const absolutePath = path.join(rootDir, assetPath);
      if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
        fail(`required progressive-disclosure asset missing: ${assetPath}`);
      }
    }
  }

  // Header enforcement targets are derived from the live reference payloads so any new
  // reference or gate document must declare its admission contract before it can land
  // (fail-closed coverage; #264, #372).
  function commandContractDocsBySubcommand() {
    const commandDir = path.join(rootDir, "core", "commands");
    const docs = new Map();
    for (const name of readdirSync(commandDir).filter((entry) => entry.endsWith(".yaml")).sort()) {
      const doc = parseSimpleYaml(readText(path.join(commandDir, name)), `core/commands/${name}`, {
        onError: fail,
      });
      if (typeof doc.command !== "string" || doc.command.trim().length === 0) {
        fail(`core/commands/${name} must define a non-empty command field.`);
        continue;
      }
      if (docs.has(doc.command)) {
        fail(`duplicate core command contract for '${doc.command}'.`);
        continue;
      }
      docs.set(doc.command, doc);
    }
    return docs;
  }

  function referenceAdmissionHeaderTargets() {
    const targets = [];
    for (const root of skillPayloadRoots) {
      const referencesDir = path.join(rootDir, root, "references");
      const referenceFiles = readdirSync(referencesDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
        .map((entry) => entry.name)
        .sort();
      if (referenceFiles.length === 0) {
        fail(`required reference admission header coverage could not be derived: ${root}/references contains no markdown files.`);
        continue;
      }
      for (const reference of referenceFiles) {
        const relativePath = `${root}/references/${reference}`;
        targets.push({ relativePath, absolutePath: path.join(rootDir, relativePath) });
      }
    }
    return targets;
  }

  function assertRequiredReferenceAdmissionHeaders() {
    for (const { relativePath, absolutePath } of referenceAdmissionHeaderTargets()) {
      if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
        fail(`required reference admission header file missing: ${relativePath}`);
        continue;
      }
      const text = readText(absolutePath);
      const firstBlock = text.split(/\n\n/)[0] || "";
      if (firstBlock.trimStart().startsWith("---")) {
        fail(`${relativePath} must use plaintext admission header fields, not frontmatter.`);
      }
      const missingFields = requiredReferenceAdmissionHeaderFields.filter((field) => !firstBlock.includes(field));
      if (missingFields.length > 0) {
        fail(`${relativePath} missing required reference admission header fields:\n${formatAnchorList(missingFields)}`);
      }
    }
  }

  function assertSubcommandExecutionContracts() {
    const contractKeys = Object.keys(subcommandExecutionContracts);
    if (!arraysEqual(contractKeys, requiredSubcommands)) {
      fail(
        `subcommandExecutionContracts keys drifted. Expected ${requiredSubcommands.join(", ")}; got ${contractKeys.join(", ")}`,
      );
    }

    const commandDocs = commandContractDocsBySubcommand();
    for (const subcommand of requiredSubcommands) {
      const contract = subcommandExecutionContracts[subcommand];
      const commandDoc = commandDocs.get(subcommand);
      if (!contract || typeof contract !== "object") {
        fail(`subcommandExecutionContracts.${subcommand} must be an object.`);
        continue;
      }
      if (!commandDoc) {
        fail(`core/commands/${subcommand}.yaml missing or lacks command: ${subcommand}.`);
        continue;
      }

      for (const field of ["mode", "stopCondition", "completionSignal"]) {
        if (typeof contract[field] !== "string" || contract[field].trim().length === 0) {
          fail(`subcommandExecutionContracts.${subcommand}.${field} must be a non-empty string.`);
        }
      }
      for (const field of ["sourceEditAllowed", "githubWriteAllowed"]) {
        if (typeof contract[field] !== "boolean") {
          fail(`subcommandExecutionContracts.${subcommand}.${field} must be a boolean.`);
        }
      }
      if (!Array.isArray(contract.requiredReferences) || contract.requiredReferences.length === 0) {
        fail(`subcommandExecutionContracts.${subcommand}.requiredReferences must be a non-empty array.`);
      } else {
        for (const reference of contract.requiredReferences) {
          if (typeof reference !== "string" || !reference.endsWith(".md")) {
            fail(`subcommandExecutionContracts.${subcommand}.requiredReferences contains invalid reference '${reference}'.`);
            continue;
          }
          const existsInPayload = skillPayloadRoots.some((root) =>
            statSync(path.join(rootDir, root, "references", reference), { throwIfNoEntry: false })?.isFile(),
          );
          if (!existsInPayload) {
            fail(`subcommandExecutionContracts.${subcommand} references missing payload file '${reference}'.`);
          }
        }
      }

      const profile = modePermissionProfiles[contract.mode];
      if (!profile) {
        fail(`subcommandExecutionContracts.${subcommand}.mode '${contract.mode}' has no modePermissionProfiles entry.`);
      } else {
        for (const field of ["sourceEditAllowed", "githubWriteAllowed"]) {
          if (contract[field] !== profile[field]) {
            fail(
              `subcommandExecutionContracts.${subcommand}.${field} must derive from modePermissionProfiles['${contract.mode}']=${profile[field]}.`,
            );
          }
        }
      }

      if (contract.mode !== commandDoc.mode) {
        fail(
          `subcommandExecutionContracts.${subcommand}.mode drifted from core/commands/${subcommand}.yaml mode='${commandDoc.mode}'.`,
        );
      }
      if (contract.sourceEditAllowed !== commandDoc.source_edit_allowed) {
        fail(
          `subcommandExecutionContracts.${subcommand}.sourceEditAllowed drifted from core/commands/${subcommand}.yaml source_edit_allowed=${commandDoc.source_edit_allowed}.`,
        );
      }
      if (contract.githubWriteAllowed !== commandDoc.github_write_allowed) {
        fail(
          `subcommandExecutionContracts.${subcommand}.githubWriteAllowed drifted from core/commands/${subcommand}.yaml github_write_allowed=${commandDoc.github_write_allowed}.`,
        );
      }
      if (contract.stopCondition !== commandDoc.stop_condition) {
        fail(
          `subcommandExecutionContracts.${subcommand}.stopCondition drifted from core/commands/${subcommand}.yaml stop_condition.`,
        );
      }
      if (contract.completionSignal !== commandDoc.output_contract?.completion_signal) {
        fail(
          `subcommandExecutionContracts.${subcommand}.completionSignal drifted from core/commands/${subcommand}.yaml output_contract.completion_signal.`,
        );
      }
    }
  }

  function assertRenderedSubcommandContracts({ label, text }) {
    const permissionRows = parseCodePermissionRows(extractGeneratedBlock(text, "code-permission-table"));
    const contractRows = parseSubcommandContractRows(extractGeneratedBlock(text, "subcommand-table"));
    const allowedSourceEditors = new Set(["start", "review"]);
    const sourceEditAuthorityPatterns = [
      /\bmay edit source\b/i,
      /\bmay modify source\b/i,
      /\bsource edits are allowed\b/i,
      /Repo source edits/i,
      /accepted .* fixes may edit source/i,
    ];

    for (const subcommand of requiredSubcommands) {
      const manifestContract = subcommandExecutionContracts[subcommand];
      const permission = permissionRows.get(subcommand);
      const renderedContract = contractRows.get(subcommand);
      if (!permission) {
        fail(`${label} code permission table missing '${subcommand}'.`);
        continue;
      }
      if (!renderedContract) {
        fail(`${label} subcommand contract table missing '${subcommand}'.`);
        continue;
      }

      if (permission.mayModify !== manifestContract.sourceEditAllowed) {
        fail(
          `${label} code permission table for '${subcommand}' drifted from manifest sourceEditAllowed=${manifestContract.sourceEditAllowed}.`,
        );
      }
      if (!renderedContract.mode || renderedContract.mode !== manifestContract.mode) {
        fail(
          `${label} subcommand table mode for '${subcommand}' drifted. Expected '${manifestContract.mode}', got '${renderedContract.mode}'.`,
        );
      }
      if (!renderedContract.stopCondition) {
        fail(`${label} subcommand table stop condition for '${subcommand}' must be non-empty.`);
      } else if (renderedContract.stopCondition !== manifestContract.stopCondition) {
        fail(
          `${label} subcommand table stop condition for '${subcommand}' drifted. Expected '${manifestContract.stopCondition}', got '${renderedContract.stopCondition}'.`,
        );
      }
      for (const reference of manifestContract.requiredReferences) {
        if (!renderedContract.requiredReferences.includes(reference)) {
          fail(`${label} subcommand table for '${subcommand}' missing required reference '${reference}'.`);
        }
      }
      // Reverse direction: the rendered (yaml-derived) set must not exceed the
      // manifest either. Without this, a reference present in core/commands/*.yaml
      // but absent from the manifest is unguarded — it can be deleted from the
      // yaml and verify stays green (e.g. review's security-posture-gate.md).
      // Both loops together enforce yaml ↔ manifest set equality (#279).
      for (const reference of renderedContract.requiredReferences) {
        if (!manifestContract.requiredReferences.includes(reference)) {
          fail(
            `${label} subcommand table for '${subcommand}' lists required reference '${reference}' absent from skill-contract-manifest subcommandExecutionContracts.${subcommand}.requiredReferences; required_references must match the manifest exactly.`,
          );
        }
      }

      const renderedAuthorityText = `${permission.allowedArtifacts}\n${renderedContract.sideEffects}`;
      const grantsSourceAuthority = sourceEditAuthorityPatterns.some((pattern) => pattern.test(renderedAuthorityText));
      if (!allowedSourceEditors.has(subcommand) && grantsSourceAuthority) {
        fail(
          `${label} non-source-edit subcommand '${subcommand}' contains unnegated source-edit authority wording.`,
        );
      }
    }
  }

  function assertForbiddenHotPathTemplateSentinels({ label, text }) {
    for (const sentinel of forbiddenHotPathTemplateSentinels) {
      if (sentinel.pattern.test(text)) {
        fail(`${label} must not inline ${sentinel.description}; keep detail in references/ or templates/.`);
      }
    }
  }

  function assertTemplateRequiredFields({ label, relativePath, fields }) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
      fail(`${label} template missing: ${relativePath}`);
      return;
    }

    const text = readText(absolutePath);
    const missingFields = fields.filter((field) => !text.includes(field));
    if (missingFields.length > 0) {
      fail(
        `${label} template required fields missing from ${relativePath}:
  ${formatAnchorList(missingFields)}`,
      );
    }

    if (/\u[0-9a-fA-F]{4}/.test(text)) {
      fail(`${label} template must keep raw UTF-8 guidance; literal Unicode escape found in ${relativePath}.`);
    }
  }

  function parsePackJson(stdout) {
    try {
      return JSON.parse(stdout);
    } catch {
      const startIndex = stdout.indexOf("[");
      const endIndex = stdout.lastIndexOf("]");
      if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
        throw new Error("could not locate JSON array in npm pack stdout");
      }
      return JSON.parse(stdout.slice(startIndex, endIndex + 1));
    }
  }

  function assertPackageArtifactIncludes() {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(
      npmCommand,
      ["pack", "--dry-run", "--json", "--ignore-scripts"],
      {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          npm_config_cache: process.env.npm_config_cache || path.join(os.tmpdir(), "ddalggak-npm-cache"),
        },
      },
    );
    if (result.status !== 0) {
      fail(`npm pack --dry-run --json --ignore-scripts failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
      return;
    }

    let packEntries;
    try {
      packEntries = parsePackJson(result.stdout);
    } catch (error) {
      fail(`npm pack --dry-run --json output was not valid JSON: ${error.message}`);
      return;
    }
    if (!Array.isArray(packEntries) || !Array.isArray(packEntries[0]?.files)) {
      fail("npm pack --dry-run --json output did not include a files array.");
      return;
    }
    const packedFiles = new Set(packEntries[0].files.map((file) => file.path));
    const expectedFiles = [...new Set([...requiredPackageFiles, ...requiredDisclosureAssetPaths()])].sort();
    const missingFiles = expectedFiles.filter((filePath) => !packedFiles.has(filePath));
    if (missingFiles.length > 0) {
      fail(
        `npm pack artifact missing required files:\n${missingFiles
          .map((filePath) => `  - ${filePath}`)
          .join("\n")}`,
      );
    }
  }

  function assertForbiddenTermsAbsent({ label, text, terms }) {
    for (const term of terms) {
      if (text.includes(term)) {
        fail(`${label} must not contain stale multi-PR/wave wording (${term}).`);
      }
    }
  }

  function extractClaudeSection(text, heading) {
    return extractMarkdownSection(text, heading);
  }

  function extractMarkdownSection(text, heading) {
    const lines = text.split("\n");
    const target = `## ${heading}`;
    const startIdx = lines.findIndex((line) => line.trim() === target);
    if (startIdx === -1) {
      return "";
    }

    let endIdx = lines.length;
    for (let index = startIdx + 1; index < lines.length; index += 1) {
      if (lines[index].startsWith("## ")) {
        endIdx = index;
        break;
      }
    }

    return lines.slice(startIdx, endIdx).join("\n");
  }

  function extractGeneratedBlock(text, name) {
    const escapedName = escapeRegExp(name);
    const pattern = new RegExp(
      `<!-- ddalggak:generated:start ${escapedName} -->\\n([\\s\\S]*?)\\n<!-- ddalggak:generated:end ${escapedName} -->`,
    );
    const match = text.match(pattern);
    return match ? match[1] : "";
  }

  function parseMarkdownTableRows(block) {
    return block
      .split("\n")
      .filter((line) => line.trim().startsWith("|"))
      .slice(2)
      .map((line) => line.trim());
  }

  function splitMarkdownTableCells(line) {
    return line.split("|").slice(1, -1).map((cell) => cell.trim());
  }

  function parseRouterGateFamilyRows(routerText) {
    const rows = new Map();
    const gateFamiliesSection = extractMarkdownSection(routerText, "Gate Families");
    for (const line of parseMarkdownTableRows(gateFamiliesSection)) {
      const cells = splitMarkdownTableCells(line);
      const family = cells[0]?.match(/`([^`]+)`/)?.[1];
      if (!family) continue;
      rows.set(family, {
        family,
        activateWhen: cells[1] || "",
        skipWhen: cells[2] || "",
      });
    }
    return rows;
  }

  function parseRouterRequiredReferenceRows(routerText) {
    const rows = new Map();
    const referenceSection = extractMarkdownSection(routerText, "Required Reference Mapping");
    for (const line of parseMarkdownTableRows(referenceSection)) {
      const cells = splitMarkdownTableCells(line);
      const family = cells[0]?.match(/`([^`]+)`/)?.[1];
      const reference = cells[1]?.match(/`([^`]+)`/)?.[1];
      if (!family || !reference) continue;
      rows.set(family, { family, reference });
    }
    return rows;
  }

  function assertRouterGateFamilyManifestContract({ label, routerText, rootReferenceDir }) {
    const gateRows = parseRouterGateFamilyRows(routerText);
    const referenceRows = parseRouterRequiredReferenceRows(routerText);
    const expectedNames = new Set(routerGateFamilies.map((family) => family.name));

    if (gateRows.size !== routerGateFamilies.length) {
      fail(
        `${label} Gate Families row count must match routerGateFamilies (${routerGateFamilies.length}); found ${gateRows.size}.`,
      );
    }
    if (referenceRows.size !== routerGateFamilies.length) {
      fail(
        `${label} Required Reference Mapping row count must match routerGateFamilies (${routerGateFamilies.length}); found ${referenceRows.size}.`,
      );
    }

    for (const foundName of [...gateRows.keys(), ...referenceRows.keys()]) {
      if (!expectedNames.has(foundName)) {
        fail(`${label} contains unknown Quality Lens Router gate family row: ${foundName}.`);
      }
    }

    for (const family of routerGateFamilies) {
      const gateRow = gateRows.get(family.name);
      if (!gateRow) {
        fail(`${label} Gate Families table missing manifest family: ${family.name}.`);
      } else {
        if (gateRow.activateWhen !== family.activateWhen) {
          fail(`${label} Activate when cell drift for ${family.name}.`);
        }
        if (gateRow.skipWhen !== family.skipWhen) {
          fail(`${label} Skip when cell drift for ${family.name}.`);
        }
      }

      const referenceRow = referenceRows.get(family.name);
      if (!referenceRow) {
        fail(`${label} Required Reference Mapping table missing manifest family: ${family.name}.`);
      } else if (referenceRow.reference !== family.reference) {
        fail(
          `${label} Required Reference Mapping drift for ${family.name}: expected ${family.reference}, found ${referenceRow.reference}.`,
        );
      }

      const relativeReference = family.reference.replace(/^references\//, "");
      const referencePath = path.join(rootReferenceDir, relativeReference);
      if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
        fail(`${label} mapped reference for ${family.name} does not exist: ${family.reference}.`);
      }
    }
  }

  function extractRouterActivateCell(routerText, gateFamily) {
    const gateRows = parseRouterGateFamilyRows(routerText);
    return gateRows.get(gateFamily)?.activateWhen || "";
  }

  function assertGateActivationKeywordContract({ gateFamily, contract, routerText, gateReferenceText }) {
    const routerActivateCell = extractRouterActivateCell(routerText, gateFamily);
    if (!routerActivateCell) {
      fail(`Quality Lens Router must keep an Activate when row for ${gateFamily}.`);
      return;
    }

    const activationSection = extractMarkdownSection(gateReferenceText, "Activation");
    if (!activationSection) {
      fail(`${contract.referenceFile} must keep a ## Activation section for ${gateFamily}.`);
      return;
    }

    const missingFromRouter = contract.keywords.filter((keyword) => !routerActivateCell.includes(keyword));
    const missingFromGate = contract.keywords.filter((keyword) => !activationSection.includes(keyword));

    if (missingFromRouter.length > 0) {
      fail(
        `Quality Lens Router Activate when cell for ${gateFamily} is missing gate activation contract keyword(s):\n${formatAnchorList(missingFromRouter)}`,
      );
    }
    if (missingFromGate.length > 0) {
      fail(
        `${contract.referenceFile} ## Activation for ${gateFamily} is missing router activation contract keyword(s):\n${formatAnchorList(missingFromGate)}`,
      );
    }
  }

  function parseCodePermissionRows(block) {
    const rows = new Map();
    for (const line of parseMarkdownTableRows(block)) {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      const subcommand = cells[0]?.match(/`([^`]+)`/)?.[1];
      if (!subcommand) continue;
      const mayModify = /^(✅|yes)$/.test(cells[1]);
      rows.set(subcommand, { mayModify, allowedArtifacts: cells[2] || "" });
    }
    return rows;
  }

  function parseSubcommandContractRows(block) {
    const rows = new Map();
    for (const line of parseMarkdownTableRows(block)) {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      const subcommand = cells[0]?.match(/`([^`]+)`/)?.[1];
      if (!subcommand) continue;
      const requiredReferences = [...(cells[6] || "").matchAll(/`references\/([^`]+\.md)`/g)].map(
        (match) => match[1],
      );
      rows.set(subcommand, {
        mode: cells[1] || "",
        sideEffects: cells[4] || "",
        stopCondition: cells[5] || "",
        requiredReferences,
      });
    }
    return rows;
  }

  function missingAnchors(text, anchors) {
    return anchors.filter((anchor) => !text.includes(anchor));
  }

  function linesContaining(text, anchor) {
    return text
      .split("\n")
      .map((line, index) => ({ line, lineNumber: index + 1 }))
      .filter(({ line }) => line.includes(anchor));
  }

  function assertSemanticAnchorGuards({ label, text, anchors }) {
    const anchorSet = new Set(anchors);
    for (const guard of semanticAnchorGuards) {
      if (!anchorSet.has(guard.anchor)) {
        continue;
      }
      for (const { line, lineNumber } of linesContaining(text, guard.anchor)) {
        if (guard.invalidLinePattern.test(line)) {
          fail(
            `${label} semantic inversion near required anchor '${guard.anchor}' on line ${lineNumber}: ${guard.description}. Anchor presence alone is not enough when the same line negates or reverses the invariant.`,
          );
        }
      }
    }
  }

  function formatAnchorList(anchors) {
    return anchors.map((anchor) => `  - ${anchor}`).join("\n");
  }

  function verifySkillFile(filePath, { label, hotPathAnchors }) {
    if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      fail(`${label} must exist.`);
      return;
    }

    const skillText = readText(filePath);
    const frontmatter = getFrontmatter(skillText);
    if (!frontmatter) {
      fail(`${label} must start with YAML frontmatter.`);
    } else if (getFrontmatterValue(frontmatter, "name") !== "ddalggak") {
      fail(`${label} frontmatter must include name: ddalggak.`);
    }

    const missingHotPathAnchors = missingAnchors(skillText, hotPathAnchors);
    if (missingHotPathAnchors.length > 0) {
      fail(
        `hot-path anchors missing from ${label}:\n${formatAnchorList(missingHotPathAnchors)}\n` +
          "These anchors must stay in SKILL.md because they are always-loaded router/core invariants. " +
          "Reference-only details should be preserved in references/* instead of re-expanded into SKILL.md.",
      );
    }
    assertSemanticAnchorGuards({ label, text: skillText, anchors: hotPathAnchors });
  }

  function assertReferenceAnchors({ label, text, anchors }) {
    const missingReferenceAnchors = missingAnchors(text, anchors);
    if (missingReferenceAnchors.length > 0) {
      fail(
        `${label} reference anchors missing; preserve these details in the appropriate references/* file instead of re-expanding SKILL.md:\n${formatAnchorList(missingReferenceAnchors)}`,
      );
    }
  }

  function assertStageHeadings({ label, text, stages }) {
    const sections = parseMarkdownSections(text);
    const missingStages = stages.filter(
      (stage) => !sections.some((section) => section.level === 2 && section.heading === stage),
    );
    if (missingStages.length > 0) {
      fail(
        `${label} must use canonical stage headings for gate applicability:\n${formatAnchorList(
          missingStages.map((stage) => `## ${stage}`),
        )}`,
      );
    }
  }

  function parseMarkdownSections(text) {
    const lines = text.split("\n");
    const headings = [];
    let inFence = false;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) {
        continue;
      }
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        headings.push({ level: headingMatch[1].length, heading: headingMatch[2].trim(), lineIdx: index });
      }
    }
    return headings.map((entry, order) => {
      let endIdx = lines.length;
      for (let cursor = order + 1; cursor < headings.length; cursor += 1) {
        if (headings[cursor].level <= entry.level) {
          endIdx = headings[cursor].lineIdx;
          break;
        }
      }
      return {
        level: entry.level,
        heading: entry.heading,
        body: lines.slice(entry.lineIdx + 1, endIdx).join("\n"),
      };
    });
  }

  function stripHtmlComments(text) {
    let result = "";
    let cursor = 0;
    while (cursor < text.length) {
      const commentStart = text.indexOf("<!--", cursor);
      if (commentStart === -1) {
        result += text.slice(cursor);
        break;
      }
      result += text.slice(cursor, commentStart);
      const commentEnd = text.indexOf("-->", commentStart + 4);
      if (commentEnd === -1) {
        break;
      }
      cursor = commentEnd + 3;
    }
    return result;
  }

  function nonWhitespaceLength(text) {
    let length = 0;
    for (const char of text) {
      if (!/\s/u.test(char)) {
        length += 1;
      }
    }
    return length;
  }

  function substantiveBodyLength(body) {
    return nonWhitespaceLength(stripHtmlComments(body));
  }

  const minSubstantiveSectionBodyChars = 40;
  // Known pre-existing index-style heading with an intentionally empty body (#214 audit finding).
  // The document itself is must-not-touch in #214; do not extend this list without an issue reference.
  const allowedEmptySectionBodies = new Set(["regression-library.md :: Existing failure classes"]);

  function assertSubstantiveSectionBodies({ label, fileName, text }) {
    for (const section of parseMarkdownSections(text)) {
      if (allowedEmptySectionBodies.has(`${fileName} :: ${section.heading}`)) {
        continue;
      }
      const bodyLength = substantiveBodyLength(section.body);
      if (bodyLength < minSubstantiveSectionBodyChars) {
        fail(
          `${label} section "${section.heading}" must keep a substantive body (>= ${minSubstantiveSectionBodyChars} non-whitespace chars excluding HTML comments); found ${bodyLength}. A heading without prose does not satisfy the prose gate.`,
        );
      }
    }
  }

  function assertSectionScopedAnchors({ label, parsedSections, heading, anchors }) {
    const matchingSections = parsedSections.filter((section) => section.heading === heading);
    if (matchingSections.length === 0) {
      fail(`${label} required section heading missing: "${heading}". Section-scoped anchors need their owning heading.`);
      return;
    }
    const missingScopedAnchors = anchors.filter(
      (anchor) => !matchingSections.some((section) => section.body.includes(anchor)),
    );
    if (missingScopedAnchors.length > 0) {
      fail(
        `${label} section "${heading}" missing required anchors; each must appear under this heading, not just anywhere in the file:\n${formatAnchorList(missingScopedAnchors)}`,
      );
    }
  }

  function assertRouterReferenceContract({ label, text, referencePath }) {
    assertRouterGateFamilyManifestContract({
      label,
      routerText: text,
      rootReferenceDir: path.dirname(referencePath),
    });
    const missingGateFamilies = requiredRouterGateFamilies.filter(
      (gateFamily) => !text.includes(`\`${gateFamily}\``),
    );
    if (missingGateFamilies.length > 0) {
      fail(
        `Quality Lens Router gate families missing from ${label}:\n${missingGateFamilies
          .map((gateFamily) => `  - ${gateFamily}`)
          .join("\n")}`,
      );
    }
  }

  function assertRegressionLibraryClassFields({ text }) {
    for (const className of requiredRegressionLibraryClasses) {
      const section = extractMarkdownSection(text, className);
      if (!section) {
        fail(`Continuous Regression Library class missing: ${className}`);
        continue;
      }
      const missingFields = requiredRegressionLibraryFields.filter(
        (field) => !section.includes(`- ${field}`),
      );
      if (missingFields.length > 0) {
        fail(
          `Continuous Regression Library class ${className} missing fields:\n${missingFields
            .map((field) => `  - ${field}`)
            .join("\n")}`,
        );
      }
    }
  }

  function verifyAllReferenceCopiesAnchors(contract) {
    for (const referencePath of contract.referencePaths) {
      const label = path.relative(rootDir, referencePath);
      if (!statSync(referencePath, { throwIfNoEntry: false })?.isFile()) {
        fail(`${label} must exist for ${contract.contractLabel} parity.`);
        continue;
      }

      const text = readText(referencePath);
      assertReferenceAnchors({
        label: contract.missingAnchorsLabel({ label }),
        text,
        anchors: contract.anchors,
      });
      contract.extraValidate?.({ label, text, referencePath });
    }
  }

  function verifySourceRootReferenceAnchors(contract) {
    const sourceRootReference = readSourceRootReference(contract.referencePaths, contract.contractLabel);
    if (!sourceRootReference) {
      return;
    }
    assertReferenceAnchors({
      label: contract.missingAnchorsLabel({ label: sourceRootReference.label }),
      text: sourceRootReference.text,
      anchors: contract.anchors,
    });
    contract.extraValidate?.(sourceRootReference);
  }

  function verifyReferenceAnchorContract(contract) {
    if (contract.verificationMode === "all-copies") {
      verifyAllReferenceCopiesAnchors(contract);
    } else if (contract.verificationMode === "source-root") {
      verifySourceRootReferenceAnchors(contract);
    } else {
      fail(`${contract.contractLabel} has unknown reference anchor verification mode: ${contract.verificationMode}`);
    }
  }

  runHotPathBudgetChecks({ skillBudgets, assertSkillBudget });
  runReferenceAdmissionChecks({
    skillPayloadRoots,
    requiredIssueTemplateFields,
    requiredEpicTemplateFields,
    assertRequiredDisclosureAssetsExist,
    assertRequiredReferenceAdmissionHeaders,
    assertSubcommandExecutionContracts,
    assertPackageArtifactIncludes,
    assertTemplateRequiredFields,
  });
  runFrontmatterChecks({
    skillPath,
    claudeSkillPath,
    requiredSkillHotPathAnchors,
    requiredClaudeSkillHotPathAnchors,
    verifySkillFile,
    assertForbiddenHotPathTemplateSentinels,
    readText,
  });

  // Must-match projection parity is intentionally not checked here. The single
  // source of authority for codex↔claude byte parity is core/projections.yaml's
  // parity_ledger, enforced by scripts/verify-projections.mjs. This verifier only
  // inspects the source-root reference payload for semantic/anchor contracts.
  function readSourceRootReference(referencePaths, contractLabel) {
    const sourceRootReferencePath = referencePaths[1];
    const label = path.relative(rootDir, sourceRootReferencePath);
    if (!statSync(sourceRootReferencePath, { throwIfNoEntry: false })?.isFile()) {
      fail(`${label} must exist for ${contractLabel} contract verification.`);
      return null;
    }
    return { label, text: readText(sourceRootReferencePath) };
  }

  runSemanticAnchorChecks({
    referenceAnchorContracts,
    verifyReferenceAnchorContract,
    gateStageHeadingReferenceContracts,
    skillDir,
    rootDir,
    path,
    statSync,
    fail,
    assertStageHeadings,
    readText,
    requiredDisclosureAssetPaths,
    assertSubstantiveSectionBodies,
    assertSectionScopedAnchors,
    parseMarkdownSections,
    routerReferencePaths,
    evidenceReferencePaths,
    frontendDesignReferencePaths,
    vercelAgentSkillsReferencePaths,
    gateActivationKeywordContracts,
    assertGateActivationKeywordContract,
    requiredRouterGateFamilies,
    routerGateFamilies,
  });

  runCliReadmeDriftChecks({
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
    requiredIssueTemplateFields,
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
  });

  if (failures.length > 0) {
    console.error("[verify:codex-skill] failed");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  for (const metric of skillBudgetMetrics) {
    console.log(
      `[verify:codex-skill] budget ${metric.label}: lines ${metric.lines}/${metric.maxLines}, chars ${metric.chars}/${metric.maxChars}, principle bullets ${metric.principleBullets}/${metric.maxPrincipleBullets}, inline subcommand anchors ${metric.inlineSubcommandAnchors}/${metric.maxInlineSubcommandAnchors}`,
    );
  }
  console.log("[verify:codex-skill] passed");
}
