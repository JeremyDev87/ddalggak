import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { closeServer } from "../backend/server.mjs";

export async function startUiServer(htmlPath, controlled = false) {
  const pending = new Set();
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(readFileSync(htmlPath));
      return;
    }
    if (request.method !== "POST" || request.url !== "/submit") { response.writeHead(404).end(); return; }
    let input;
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      input = JSON.parse(raw);
    } catch { response.writeHead(400).end(); return; }
    if (typeof input?.name !== "string" || !input.name.trim()) { response.writeHead(400).end(); return; }
    const submission = { input, complete(status = 200) {
      pending.delete(submission);
      response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ ok: status === 200 }));
    } };
    pending.add(submission);
    server.emit("submission", submission);
    if (!controlled) submission.complete(input.name === "fail" ? 503 : 200);
  });
  const ready = once(server, "listening", { signal: AbortSignal.timeout(5000) });
  server.listen(0, "127.0.0.1");
  await ready;
  return { server, url: `http://127.0.0.1:${server.address().port}`, async close() {
    for (const submission of pending) submission.complete(503);
    await closeServer(server);
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = await startUiServer(process.argv[2] ?? new URL("index.html", import.meta.url));
  console.log(JSON.stringify({ event: "ready", url: app.url }));
  process.once("SIGTERM", async () => { await app.close(); console.log(JSON.stringify({ event: "closed" })); });
}
