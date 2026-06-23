import { sanitizeText, sanitizeUrl } from "./secret-scrub.mjs";

export function normalizeState(check) {
  const rawValues = [
    check.bucket,
    check.conclusion,
    check.state,
    check.status,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());
  const raw = rawValues.join(" ");

  if (/\b(success|successful|pass|passed|completed_success)\b/.test(raw)) {
    return "success";
  }
  if (/\b(skip|skipped|neutral)\b/.test(raw)) {
    return "skipped";
  }
  if (/\b(fail|failed|failure|error|timed_out|cancelled|canceled)\b/.test(raw)) {
    return "failure";
  }
  if (/\b(pending|queued|in_progress|waiting|requested|expected|startup|action_required)\b/.test(raw)) {
    return "pending";
  }
  return "unknown";
}

export function matrixAxisFromName(name) {
  const text = String(name || "");
  const node = text.match(/\bNode\s*(\d+(?:\.\d+)*)\b/i);
  if (node) {
    return `Node ${node[1]}`;
  }
  const py = text.match(/\bPython\s*(\d+(?:\.\d+)*)\b/i);
  if (py) {
    return `Python ${py[1]}`;
  }
  return null;
}

export function classifyFailure(check, normalizedState) {
  if (normalizedState !== "failure") {
    return "not-failure";
  }
  const haystack = [check.name, check.workflow, check.description, check.event]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(auth|permission|forbidden|403|unauthori[sz]ed|resource not accessible|approval required|action_required)\b/.test(haystack)) {
    return "permission-auth-failure";
  }
  if (/\b(runner|billing|spending|quota|capacity|startup|no logs?|platform|infrastructure|infra)\b/.test(haystack)) {
    return "infra-failure";
  }
  if (/\b(test|spec|lint|typecheck|build|verify|package|compile)\b/.test(haystack)) {
    return "test-failure";
  }
  return "unknown-failure";
}

export function normalizeCheck(check, index) {
  const state = normalizeState(check);
  const name = sanitizeText(check.name || check.context || `check-${index + 1}`);
  const workflow = sanitizeText(check.workflow || check.workflowName || check.app?.name || null);
  const description = sanitizeText(check.description || check.summary || null);
  const detailsUrl = sanitizeUrl(
    check.link
      || check.detailsUrl
      || check.details_url
      || check.targetUrl
      || check.target_url
      || check.html_url
      || check.url
      || null,
  );
  return {
    name,
    workflow,
    state,
    failureType: classifyFailure({ ...check, name, workflow, description }, state),
    detailsUrl,
    startedAt: sanitizeText(check.startedAt || check.started_at || null),
    completedAt: sanitizeText(check.completedAt || check.completed_at || null),
    matrixAxis: matrixAxisFromName(name),
  };
}

export function normalizeChecks(input) {
  const checks = Array.isArray(input)
    ? input
    : Array.isArray(input?.checks)
      ? input.checks
      : Array.isArray(input?.check_runs)
        ? input.check_runs
        : Array.isArray(input?.statusCheckRollup)
          ? input.statusCheckRollup
          : Array.isArray(input?.nodes)
            ? input.nodes
            : [];

  return checks.map((check, index) => normalizeCheck(check, index));
}
