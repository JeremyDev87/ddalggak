import path from "node:path";

export const WRITE_ESCALATION_REASONS = {
  "codeql.yml":
    "analyze job: security-events:write required to upload CodeQL SARIF results to code scanning",
  "release-drafter.yml":
    "contents:write and pull-requests:write required for release draft creation/update",
  "manual-release-bump.yml":
    "contents:write for branch push, issues:write and pull-requests:write for bump PR lifecycle",
  "release.yml":
    "publish_to_npm job: id-token:write required for OIDC-based trusted npm provenance publishing",
};

export function classifyWriteEscalation(workflowPerms, jobPermsMap, filePath) {
  const allPerms = { ...(workflowPerms || {}) };
  if (jobPermsMap) {
    for (const perms of Object.values(jobPermsMap)) {
      Object.assign(allPerms, perms);
    }
  }

  const writePerms = Object.entries(allPerms)
    .filter(([, v]) => v === "write")
    .map(([k]) => k);

  if (writePerms.length === 0) return null;

  const filename = path.basename(filePath);
  if (WRITE_ESCALATION_REASONS[filename]) return WRITE_ESCALATION_REASONS[filename];
  return `WARN: write permissions detected (${writePerms.join(", ")}) — explicit reason not documented in inventory`;
}

export function isReleaseConcurrencyLane(concurrency, events) {
  return events.includes("release") || Boolean(concurrency?.group?.includes("release"));
}

export function classifyDuplicateRunPolicy(concurrency, events) {
  if (!concurrency) return "no_concurrency_declared_parallel_allowed";

  const cancelInProgress = concurrency.cancel_in_progress;
  const isReleasePublishLane =
    events.includes("release") || Boolean(concurrency.group?.includes("release-publish"));

  if (cancelInProgress === true) {
    if (isReleasePublishLane) {
      return "WARN: cancel_in_progress=true on release lane — may cancel active evidence run";
    }
    return "cancel_stale_runs";
  }

  if (cancelInProgress === false) return "serialize_runs";

  return "unknown";
}

export function classifyQueueHangNextGate(concurrency, events, duplicateRunPolicy) {
  if (typeof duplicateRunPolicy === "string" && duplicateRunPolicy.startsWith("WARN:")) {
    return "human_approval";
  }
  if (!concurrency) return "rerun";
  if (concurrency.cancel_in_progress === true) return "cancel_stale_then_rerun";
  if (concurrency.cancel_in_progress === false) {
    if (isReleaseConcurrencyLane(concurrency, events)) return "serialize_wait_for_prior_run";
    return "wait_for_prior_run";
  }
  return "rerun";
}

export const NEXT_GATE_RULES = [
  {
    gate: "warn",
    matches: ({ writeEscalation }) =>
      typeof writeEscalation === "string" && writeEscalation.startsWith("WARN:"),
  },
  {
    gate: "warn",
    matches: ({ duplicateRunPolicy }) =>
      typeof duplicateRunPolicy === "string" && duplicateRunPolicy.startsWith("WARN:"),
  },
  {
    gate: "human-review",
    matches: ({ hasJobLevelIdToken }) => hasJobLevelIdToken,
  },
  {
    gate: "human-review",
    matches: ({ allPerms }) => allPerms?.["id-token"] === "write",
  },
];

export function classifyNextGate(writeEscalation, duplicateRunPolicy, allPerms, hasJobLevelIdToken) {
  const context = { writeEscalation, duplicateRunPolicy, allPerms, hasJobLevelIdToken };
  const rule = NEXT_GATE_RULES.find((candidate) => candidate.matches(context));
  return rule ? rule.gate : "allow";
}
