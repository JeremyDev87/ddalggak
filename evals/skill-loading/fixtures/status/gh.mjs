#!/usr/bin/env node
// Exact read allowlist: no gh executable, network client, or write-through fallback.
import { readFileSync } from "node:fs";
const state = JSON.parse(readFileSync(new URL("state.json", import.meta.url)));
const args = process.argv.slice(2);
const commands = new Map([
  [JSON.stringify(["pr", "list", "--json", "number,state,headRefName"]), [state.pr]],
  [JSON.stringify(["pr", "view", "17", "--json", "number,state,headRefName,headRefOid,statusCheckRollup,reviewDecision,mergeStateStatus"]), state.pr],
  [JSON.stringify(["pr", "checks", "17", "--json", "name,state"]), [{ name: "unit", state: "PENDING" }]],
  [JSON.stringify(["issue", "view", "17", "--json", "body,comments"]), { body: "Verify quantity failure handling", comments: state.blockers }],
]);
const result = commands.get(JSON.stringify(args));
if (result === undefined) {
  console.error(JSON.stringify({ boundary: "fixture-gh", denied: true, externalRequests: 0 }));
  process.exitCode = 77;
} else {
  console.log(JSON.stringify(result));
}
