// Subcommand execution, permission-profile, heading, and required-command contracts.

import { loadCommandContracts } from "../../../bin/lib/command-contracts.mjs";

const commandContracts = loadCommandContracts(process.cwd());

export const modePermissionProfiles = {
  "source-edit": { sourceEditAllowed: true, githubWriteAllowed: false },
  "review-fix": { sourceEditAllowed: true, githubWriteAllowed: true },
  "read-only": { sourceEditAllowed: false, githubWriteAllowed: false },
  "plan-only": { sourceEditAllowed: false, githubWriteAllowed: false },
  "github-write": { sourceEditAllowed: false, githubWriteAllowed: true },
  "local-destructive": { sourceEditAllowed: false, githubWriteAllowed: false },
  "repo-external-write": { sourceEditAllowed: false, githubWriteAllowed: false },
  "approval-gated-write": { sourceEditAllowed: false, githubWriteAllowed: false },
};

function executionContractFromCommand(doc) {
  return {
    mode: doc.mode,
    sourceEditAllowed: doc.source_edit_allowed,
    githubWriteAllowed: doc.github_write_allowed,
    requiredReferences: doc.required_references || [],
    stopCondition: doc.stop_condition,
    completionSignal: doc.output_contract?.completion_signal,
  };
}

export const subcommandExecutionContracts = Object.fromEntries(
  commandContracts.map((doc) => [doc.command, executionContractFromCommand(doc)]),
);

export const requiredSubcommands = commandContracts.map((doc) => doc.command);

export const requiredClaudeHeadings = Object.fromEntries(
  commandContracts.map((doc) => [doc.command, doc.show_doc_heading]),
);
