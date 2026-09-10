import assert from "node:assert/strict";
import { startServer, closeServer } from "./server.mjs";

export async function checkBackend(quantities, oracle) {
  const { server, url } = await startServer(quantities);
  const receipts = [];
  try {
    for (const entry of [...oracle.cases, oracle.malformed]) {
      const response = await fetch(`${url}/quantities`, {
        method: "POST", body: entry.raw ?? JSON.stringify(entry.input), signal: AbortSignal.timeout(5000),
      });
      const body = await response.json();
      assert.equal(response.status, entry.status, "HTTP status");
      assert.deepEqual(body, entry.body, "HTTP body");
      receipts.push({ input: entry.raw ?? entry.input, status: response.status, body });
    }
  } finally {
    await closeServer(server);
  }
  return { checks: receipts, serverClosed: !server.listening, entryPoint: "POST /quantities" };
}

export function checkCompletion(observation, receipt) {
  assert(receipt.serverClosed && receipt.checks.length > 0, "missing executed HTTP checks");
  assert.equal(observation.implementationComplete, true);
  assert.equal(observation.published, false);
  assert.deepEqual(observation.remainingGates, ["human-publication"]);
}
