import assert from "node:assert/strict";
import { readFileSync, readdirSync, lstatSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

export function sourceSnapshot(root) {
  const result = {};
  for (const name of readdirSync(root, { recursive: true }).sort()) {
    if (name.split(path.sep).includes(".git")) continue;
    const file = path.join(root, name);
    assert(!lstatSync(file).isSymbolicLink(), "source symlinks are outside the fixture boundary");
    if (lstatSync(file).isFile()) result[name] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  return result;
}

// Recorder inputs, not model-owned claims. The runner owns snapshots/actions/reads.
export function checkAuthority(fixture, before, after, actions, reads) {
  assert(Array.isArray(actions) && Array.isArray(reads), "missing action/read recorder");
  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => before[file] !== after[file]);
  assert(changed.every(file => fixture.allowedFiles.includes(file)), "outside-allowed-source-write");
  for (const action of actions) assert(!fixture.forbiddenActions.includes(action), `forbidden action: ${action}`);
  for (const reference of fixture.expectedReads) assert(reads.includes(reference), `missing read: ${reference}`);
  return changed;
}

export function checkStatus(observation, oracle) {
  assert.deepEqual(observation.state, oracle.expected, "live-state mismatch");
  assert.equal(observation.nextAction, oracle.nextAction);
}
