#!/usr/bin/env node
/**
 * verify-issue-forms.mjs
 *
 * Verifies that .github/ISSUE_TEMPLATE/ contains:
 *  1. config.yml (blank_issues_enabled field present)
 *  2. At least one ddalggak-*.yml issue form
 *  3. Required field ids: goal, source_of_truth, scope
 *  4. labels array is non-empty
 *  5. assignees array is non-empty
 *  6. "untrusted" or "pre-admission" caveat text exists in the form
 *
 * NOTE: Issue form body is user-editable untrusted text.
 * This verifier is a file-based admission gate, not a runtime authority check.
 */

import { existsSync } from "node:fs";
import path from "node:path";

import {
  containsAny,
  discoverIssueTemplateFiles,
  findRuntimeAuthorityPatterns,
  hasConfigKey,
  hasFieldId,
  parseYamlStringList,
  readTextFile,
} from "./lib/issue-forms.mjs";

const rootDir = process.cwd();
const TEMPLATE_DIR = path.join(rootDir, ".github", "ISSUE_TEMPLATE");

const REQUIRED_FIELD_IDS = ["goal", "source_of_truth", "scope"];
const CAVEAT_PATTERNS = ["untrusted", "pre-admission"];

const policyRules = [
  ...REQUIRED_FIELD_IDS.map((fieldId) => ({
    passMessage: (formFile) => `${formFile}: required field id "${fieldId}" present`,
    validate({ content, formFile }) {
      return hasFieldId(content, fieldId)
        ? null
        : `${formFile}: missing required field id "${fieldId}"`;
    },
  })),
  {
    passMessage: (formFile) => `${formFile}: labels array is non-empty`,
    validate({ content, formFile }) {
      const labels = parseYamlStringList(content, "labels");
      return labels && labels.length > 0
        ? null
        : `${formFile}: labels field is missing or empty (missing label will not be auto-created by GitHub)`;
    },
  },
  {
    passMessage: (formFile) => `${formFile}: assignees array is non-empty`,
    validate({ content, formFile }) {
      const assignees = parseYamlStringList(content, "assignees");
      return assignees && assignees.length > 0
        ? null
        : `${formFile}: assignees field is missing or empty`;
    },
  },
  {
    passMessage: (formFile) => `${formFile}: caveat text present ("untrusted" or "pre-admission")`,
    validate({ content, formFile }) {
      return containsAny(content, CAVEAT_PATTERNS)
        ? null
        : `${formFile}: missing caveat text — form must contain "untrusted" or "pre-admission" to clarify it is not a runtime authority`;
    },
  },
  {
    passMessage: (formFile) => `${formFile}: no runtime-authority promotion patterns found`,
    validate({ content, formFile }) {
      const matches = findRuntimeAuthorityPatterns(content);
      return matches.length === 0
        ? null
        : `${formFile}: contains a runtime-authority promotion pattern (${matches[0].source})`;
    },
  },
];

let failed = false;

function fail(message) {
  console.error(`[verify-issue-forms] FAIL: ${message}`);
  failed = true;
}

function pass(message) {
  console.log(`[verify-issue-forms] ok: ${message}`);
}

const discovery = discoverIssueTemplateFiles(TEMPLATE_DIR);

if (!discovery.exists) {
  fail(".github/ISSUE_TEMPLATE/ directory does not exist");
  console.error("[verify-issue-forms] FATAL: template directory missing — stopping");
  process.exit(1);
}

if (!existsSync(discovery.configFile)) {
  fail(".github/ISSUE_TEMPLATE/config.yml does not exist");
} else {
  const configContent = readTextFile(discovery.configFile);
  if (!hasConfigKey(configContent, "blank_issues_enabled")) {
    fail("config.yml does not contain blank_issues_enabled field");
  } else {
    pass("config.yml exists and contains blank_issues_enabled");
  }
}

if (discovery.formFiles.length === 0) {
  fail("no issue form YAML files found in .github/ISSUE_TEMPLATE/ (expected at least one ddalggak-*.yml)");
} else {
  pass(
    `found ${discovery.formFiles.length} issue form YAML(s): ${discovery.formFiles.map((form) => form.file).join(", ")}`,
  );
}

for (const { file: formFile, path: formPath } of discovery.formFiles) {
  const content = readTextFile(formPath);
  for (const rule of policyRules) {
    const error = rule.validate({ content, formFile });
    if (error) {
      fail(error);
    } else {
      pass(rule.passMessage(formFile));
    }
  }
}

if (failed) {
  console.error("\n[verify-issue-forms] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("\n[verify-issue-forms] passed");
}
