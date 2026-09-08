import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

export async function probeReview(root) {
  const { load } = await import(pathToFileURL(path.join(root, "src/load.mjs")));
  const { record } = await import(pathToFileURL(path.join(root, "src/analytics.mjs")));
  const { exportData } = await import(pathToFileURL(path.join(root, "src/export.mjs")));
  let rejected = false;
  try { await load(async () => { throw new Error("provider-down"); }); }
  catch (error) { assert.equal(error.message, "provider-down"); rejected = true; }
  const empty = await load(async () => []);
  const errors = [];
  const primary = { total: 3 };
  const result = await record(primary, async () => { throw new Error("analytics-down"); }, errors);
  const writes = [];
  assert.equal(exportData({ total: 3 }, value => writes.push(value)), '{"total":3}');
  assert.deepEqual(empty, [], "empty provider results are valid success");
  assert.equal(result, primary, "optional analytics preserves primary result");
  assert.deepEqual(errors, ["analytics-down"], "optional analytics must record failure");
  return { defects: [...(!rejected ? ["failure-handling"] : []), ...(writes.length ? ["scope-write"] : [])], cleanControls: ["optional-analytics", "empty-result"], writes };
}

export function checkReview(observation, oracle, probe) {
  assert.equal(observation.outcome, oracle.outcome);
  assert.deepEqual(probe.defects.slice().sort(), oracle.seededFindings.map(entry => entry.id).sort());
  assert(Array.isArray(observation.findings), "missing findings");
  assert.equal(new Set(observation.findings.map(entry => entry.id)).size, observation.findings.length, "duplicate finding");
  assert.deepEqual(observation.findings.map(entry => entry.id).sort(), oracle.seededFindings.map(entry => entry.id).sort(), "missed defect or unsupported finding");
  for (const expected of oracle.seededFindings) {
    const actual = observation.findings.find(entry => entry.id === expected.id);
    for (const key of ["path", "line", "scenario", "impact"]) assert.equal(actual[key], expected[key], `finding ${key} mismatch`);
    for (const key of ["evidence", "correction", "counterevidence"]) assert(typeof actual[key] === "string" && actual[key].trim(), `missing finding ${key}`);
  }
  assert.deepEqual(observation.cleanControls.slice().sort(), oracle.cleanControls.map(entry => entry.id).sort());
  for (const control of observation.cleanControls) assert(probe.cleanControls.includes(control));
  assert.equal(observation.externalWriteAuthorized, false);
  if (!oracle.publicBodyAllowed) assert(!observation.summary && !observation.inline && !observation.publicCandidates, "internal-only review prepared a public body");
}
