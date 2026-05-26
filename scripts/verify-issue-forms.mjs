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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

const TEMPLATE_DIR = path.join(rootDir, ".github", "ISSUE_TEMPLATE");
const CONFIG_FILE = path.join(TEMPLATE_DIR, "config.yml");

const REQUIRED_FIELD_IDS = ["goal", "source_of_truth", "scope"];
const CAVEAT_PATTERNS = ["untrusted", "pre-admission"];

let failed = false;

function fail(message) {
  console.error(`[verify-issue-forms] FAIL: ${message}`);
  failed = true;
}

function pass(message) {
  console.log(`[verify-issue-forms] ok: ${message}`);
}

// 1. ISSUE_TEMPLATE directory must exist
if (!existsSync(TEMPLATE_DIR)) {
  fail(".github/ISSUE_TEMPLATE/ directory does not exist");
  console.error("[verify-issue-forms] FATAL: template directory missing — stopping");
  process.exit(1);
}

// 2. config.yml must exist
if (!existsSync(CONFIG_FILE)) {
  fail(".github/ISSUE_TEMPLATE/config.yml does not exist");
} else {
  const configContent = readFileSync(CONFIG_FILE, "utf8");
  if (!configContent.includes("blank_issues_enabled")) {
    fail("config.yml does not contain blank_issues_enabled field");
  } else {
    pass("config.yml exists and contains blank_issues_enabled");
  }
}

// 3. At least one ddalggak-*.yml form must exist
const allYamls = existsSync(TEMPLATE_DIR)
  ? readdirSync(TEMPLATE_DIR).filter(
      (f) => f.endsWith(".yml") && f !== "config.yml",
    )
  : [];

if (allYamls.length === 0) {
  fail("no issue form YAML files found in .github/ISSUE_TEMPLATE/ (expected at least one ddalggak-*.yml)");
} else {
  pass(`found ${allYamls.length} issue form YAML(s): ${allYamls.join(", ")}`);
}

// 4–6: Validate each form YAML
for (const formFile of allYamls) {
  const formPath = path.join(TEMPLATE_DIR, formFile);
  const content = readFileSync(formPath, "utf8");

  // Check required field ids
  for (const fieldId of REQUIRED_FIELD_IDS) {
    // Match `id: fieldId` with surrounding whitespace/newline
    const pattern = new RegExp(`\\bid:\\s*${fieldId}\\b`);
    if (!pattern.test(content)) {
      fail(`${formFile}: missing required field id "${fieldId}"`);
    } else {
      pass(`${formFile}: required field id "${fieldId}" present`);
    }
  }

  // Check labels array is non-empty (must have at least one label entry after "labels:")
  // Accept both inline list and block list
  const labelsMatch = content.match(/^labels:\s*\[([^\]]*)\]/m) ||
    content.match(/^labels:\n((?:\s+-\s+.+\n?)+)/m);
  if (!labelsMatch) {
    fail(`${formFile}: labels field is missing or empty (missing label will not be auto-created by GitHub)`);
  } else {
    const labelsBlock = labelsMatch[1] || labelsMatch[0];
    const hasLabel = /\S/.test(labelsBlock.replace(/[\[\]]/g, ""));
    if (!hasLabel) {
      fail(`${formFile}: labels array is empty (at least one live repo label required)`);
    } else {
      pass(`${formFile}: labels array is non-empty`);
    }
  }

  // Check assignees array is non-empty
  const assigneesMatch = content.match(/^assignees:\s*\[([^\]]*)\]/m) ||
    content.match(/^assignees:\n((?:\s+-\s+.+\n?)+)/m);
  if (!assigneesMatch) {
    fail(`${formFile}: assignees field is missing or empty`);
  } else {
    const assigneesBlock = assigneesMatch[1] || assigneesMatch[0];
    const hasAssignee = /\S/.test(assigneesBlock.replace(/[\[\]]/g, ""));
    if (!hasAssignee) {
      fail(`${formFile}: assignees array is empty`);
    } else {
      pass(`${formFile}: assignees array is non-empty`);
    }
  }

  // Check caveat text: must contain "untrusted" or "pre-admission"
  const hasCaveat = CAVEAT_PATTERNS.some((pattern) => content.includes(pattern));
  if (!hasCaveat) {
    fail(
      `${formFile}: missing caveat text — form must contain "untrusted" or "pre-admission" to clarify it is not a runtime authority`,
    );
  } else {
    pass(`${formFile}: caveat text present ("untrusted" or "pre-admission")`);
  }

  // Guard: form body must NOT contain patterns that promote it to runtime authority
  const runtimeAuthorityPatterns = [
    /auto[\s-]?merge\s*=\s*true/i,
    /approved\s*=\s*true/i,
    /execute\s*=\s*true/i,
    /runtime[\s-]?authority\s*=\s*true/i,
  ];
  for (const runtimePattern of runtimeAuthorityPatterns) {
    if (runtimePattern.test(content)) {
      fail(`${formFile}: contains a runtime-authority promotion pattern (${runtimePattern.source})`);
    }
  }
  pass(`${formFile}: no runtime-authority promotion patterns found`);
}

// Summary
if (failed) {
  console.error("\n[verify-issue-forms] FAILED — see errors above");
  process.exit(1);
} else {
  console.log("\n[verify-issue-forms] passed");
}
