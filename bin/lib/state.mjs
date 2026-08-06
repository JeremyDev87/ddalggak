import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateSessionStateData } from "./status/session-state.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_SCHEMA_PATH = join(ROOT, "core", "state", "session-state.schema.json");
const STATE_RELATIVE_PATH = join(".ddalggak", "session-state.json");
const TERMINAL_STATUSES = new Set(["completed", "skipped"]);
const MALFORMED_LOCK_STALE_MS = 30_000;
const SECRET_KEY = /(api.?key|access.?token|refresh.?token|authorization|credential|password|secret)/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|bearer\s+[A-Za-z0-9._-]{12,})/i;

function workspaceRoot(value) {
  return resolve(value || process.env.DDALGGAK_WORKSPACE_ROOT || process.cwd());
}

function statePath(root) {
  return join(root, STATE_RELATIVE_PATH);
}

function transitionRequestHash({ phaseId, status, evidence = [], blocker = "" }) {
  return createHash("sha256")
    .update(JSON.stringify({ phaseId, status, evidence: [...evidence], blocker }))
    .digest("hex");
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== "ESRCH";
  }
}

async function reclaimStaleLock(lockPath) {
  let stale = false;
  try {
    const [raw, lockStat] = await Promise.all([readFile(lockPath, "utf8"), stat(lockPath)]);
    try {
      const owner = JSON.parse(raw);
      stale = Number.isInteger(owner?.pid) && owner.pid > 0
        ? !processIsAlive(owner.pid)
        : Date.now() - lockStat.mtimeMs > MALFORMED_LOCK_STALE_MS;
    } catch {
      stale = Date.now() - lockStat.mtimeMs > MALFORMED_LOCK_STALE_MS;
    }
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  if (!stale) return false;
  const recoveryPath = `${lockPath}.stale.${process.pid}.${randomUUID()}`;
  try {
    await rename(lockPath, recoveryPath);
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
  await rm(recoveryPath, { force: true });
  return true;
}

async function withLock(targetPath, operation) {
  await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
  const lockPath = `${targetPath}.lock`;
  const lockId = randomUUID();
  let lock;
  while (!lock) {
    let candidate;
    try {
      candidate = await open(lockPath, "wx", 0o600);
      await candidate.writeFile(`${JSON.stringify({ id: lockId, pid: process.pid, created_at: new Date().toISOString() })}\n`, "utf8");
      await candidate.sync();
      lock = candidate;
    } catch (error) {
      if (candidate) {
        await candidate.close();
        await rm(lockPath, { force: true });
      }
      if (error?.code !== "EEXIST") throw error;
      if (await reclaimStaleLock(lockPath)) continue;
      throw new Error(`state lock already exists: ${lockPath}`);
    }
  }
  try {
    return await operation();
  } finally {
    await lock.close();
    try {
      const owner = JSON.parse(await readFile(lockPath, "utf8"));
      if (owner?.id === lockId) await rm(lockPath, { force: true });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

async function atomicWriteJson(targetPath, value) {
  const temporaryPath = `${targetPath}.tmp`;
  let handle;
  try {
    handle = await open(temporaryPath, "w", 0o600);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporaryPath, targetPath);
  } finally {
    if (handle) await handle.close();
    await rm(temporaryPath, { force: true });
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function assertNoSensitiveState(value, path = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveState(entry, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) throw new Error(`${path}.${key}: secret-bearing field is forbidden; store [REDACTED] instead`);
      assertNoSensitiveState(entry, `${path}.${key}`);
    }
    return;
  }
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value)) throw new Error(`${path}: token-like secret value is forbidden; store [REDACTED] instead`);
    if (/^(?:\/Users\/|~\/)/.test(value)) throw new Error(`${path}: user-home absolute path is forbidden`);
  }
}

async function validateCandidate(state, root, schemaPath) {
  assertNoSensitiveState(state);
  const validation = await validateSessionStateData({ state, schemaPath, workspaceRoot: root });
  if (validation.violations.length > 0) {
    throw new Error(`session state validation failed:\n- ${validation.violations.join("\n- ")}`);
  }
}

export async function initState({ workspaceRoot: rootInput, draftPath, expectedPlanHash, schemaPath = DEFAULT_SCHEMA_PATH }) {
  if (!draftPath) throw new Error("state init requires --from <draft.json>");
  if (!/^sha256:[0-9a-f]{64}$/.test(expectedPlanHash || "")) {
    throw new Error("state init requires --expected-plan-hash sha256:<64 lowercase hex>");
  }
  const root = workspaceRoot(rootInput);
  const targetPath = statePath(root);
  return withLock(targetPath, async () => {
    try {
      await readFile(targetPath);
      throw new Error(`session state already exists: ${targetPath}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const state = await readJson(resolve(draftPath));
    if (state?.phase_ledger?.plan_hash !== expectedPlanHash) {
      throw new Error(`plan hash mismatch: expected ${expectedPlanHash}, draft has ${state?.phase_ledger?.plan_hash || "<missing>"}`);
    }
    if (!state.phase_ledger || !Array.isArray(state.phase_ledger.phases)) {
      throw new Error("state init requires phase_ledger.phases[]");
    }
    state.revision = 0;
    state.last_transition = null;
    state.updated_at = new Date().toISOString();
    for (const phase of state.phase_ledger.phases) {
      phase.attempt_count = Number.isInteger(phase.attempt_count)
        ? phase.attempt_count
        : phase.status === "in_progress" || phase.status === "blocked" ? 1 : 0;
    }
    await validateCandidate(state, root, schemaPath);
    await atomicWriteJson(targetPath, state);
    return { changed: true, state, path: targetPath };
  });
}

export async function transitionState({ workspaceRoot: rootInput, expectedRevision, transitionId, phaseId, status, evidence = [], blocker = "", schemaPath = DEFAULT_SCHEMA_PATH }) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new Error("state transition requires a non-negative --expected-revision");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(transitionId || "")) throw new Error("state transition requires a normalized --transition-id");
  if (!phaseId) throw new Error("state transition requires --phase");
  if (!new Set(["completed", "skipped", "blocked", "in_progress"]).has(status)) throw new Error("unsupported transition status");
  if (!Array.isArray(evidence) || !evidence.every((entry) => typeof entry === "string" && entry.length > 0)) throw new Error("--evidence values must be non-empty strings");
  const root = workspaceRoot(rootInput);
  const targetPath = statePath(root);
  const requestHash = transitionRequestHash({ phaseId, status, evidence, blocker });
  return withLock(targetPath, async () => {
    const state = await readJson(targetPath);
    if (state.last_transition?.id === transitionId) {
      if (state.last_transition.request_hash !== requestHash) throw new Error(`transition id payload mismatch: ${transitionId}`);
      return { changed: false, state, path: targetPath };
    }
    if (state.revision !== expectedRevision) throw new Error(`revision mismatch: expected ${expectedRevision}, actual ${state.revision}`);
    const ledger = state.phase_ledger;
    const phases = ledger?.phases || [];
    const terminal = phases.length > 0 && phases.every((phase) => TERMINAL_STATUSES.has(phase.status)) && ledger.next_phase_id === null;
    if (terminal) throw new Error("terminal ledger is immutable");
    const current = phases.find((phase) => phase.id === ledger.current_phase_id);
    if (!current || current.id !== phaseId) throw new Error(`transition must target current phase ${ledger?.current_phase_id || "<missing>"}`);
    const legal = current.status === "blocked"
      ? status === "in_progress"
      : current.status === "in_progress" && new Set(["completed", "skipped", "blocked"]).has(status);
    if (!legal) throw new Error(`illegal phase transition ${current.status} -> ${status}`);
    if (status === "blocked" && blocker.length === 0) throw new Error("blocked transition requires --blocker");
    if ((status === "completed" || status === "skipped") && evidence.length === 0) {
      throw new Error(`${status} phase requires evidence`);
    }

    current.status = status;
    if (evidence.length > 0) current.evidence = [...new Set([...(current.evidence || []), ...evidence])];
    if (status === "blocked") current.blocker = blocker;
    else delete current.blocker;

    if (status === "in_progress") {
      current.attempt_count = (Number.isInteger(current.attempt_count) ? current.attempt_count : 1) + 1;
    } else if (status === "completed" || status === "skipped") {
      const next = current.next_phase_id === null ? null : phases.find((phase) => phase.id === current.next_phase_id);
      if (current.next_phase_id !== null && !next) throw new Error(`next phase not found: ${current.next_phase_id}`);
      if (next) {
        next.status = "in_progress";
        next.attempt_count = Math.max(1, Number.isInteger(next.attempt_count) ? next.attempt_count : 0);
        ledger.current_phase_id = next.id;
        ledger.next_phase_id = next.next_phase_id;
        state.phase = next.id;
      } else {
        ledger.current_phase_id = current.id;
        ledger.next_phase_id = null;
        state.phase = current.id;
      }
    }

    state.revision += 1;
    state.last_transition = { id: transitionId, request_hash: requestHash };
    state.updated_at = new Date().toISOString();
    await validateCandidate(state, root, schemaPath);
    await atomicWriteJson(targetPath, state);
    return { changed: true, state, path: targetPath };
  });
}

function parseOptions(args) {
  const options = { evidence: [] };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (!["--from", "--expected-plan-hash", "--expected-revision", "--transition-id", "--phase", "--status", "--evidence", "--blocker"].includes(flag)) {
      throw new Error(`unknown state option: ${flag}`);
    }
    const value = args[index + 1];
    if (value === undefined) throw new Error(`missing value for ${flag}`);
    index += 1;
    if (flag === "--evidence") options.evidence.push(value);
    else if (flag === "--from") options.draftPath = value;
    else if (flag === "--expected-plan-hash") options.expectedPlanHash = value;
    else if (flag === "--expected-revision") options.expectedRevision = Number(value);
    else if (flag === "--transition-id") options.transitionId = value;
    else if (flag === "--phase") options.phaseId = value;
    else if (flag === "--status") options.status = value;
    else if (flag === "--blocker") options.blocker = value;
  }
  return options;
}

export async function run(args = []) {
  try {
    const [command, ...rest] = args;
    if (command === "init") {
      const result = await initState(parseOptions(rest));
      process.stdout.write(`STATE_INIT revision=${result.state.revision} path=${result.path}\n`);
      return 0;
    }
    if (command === "transition") {
      const result = await transitionState(parseOptions(rest));
      process.stdout.write(`STATE_TRANSITION ${result.changed ? "applied" : "idempotent"} revision=${result.state.revision} phase=${result.state.phase}\n`);
      return 0;
    }
    throw new Error("usage: ddalggak state init|transition [options]");
  } catch (error) {
    process.stderr.write(`ddalggak state: ${error?.message || String(error)}\n`);
    return 1;
  }
}
