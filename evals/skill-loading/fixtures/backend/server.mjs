import { createServer } from "node:http";
import { once } from "node:events";

export async function startServer(quantities) {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/quantities") {
      response.writeHead(404).end();
      return;
    }
    let input;
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      input = JSON.parse(raw);
    } catch {
      response.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ error: "invalid-quantities" }));
      return;
    }
    const result = quantities(input);
    response.writeHead(result.status, { "content-type": "application/json" }).end(JSON.stringify(result.body));
  });
  const ready = once(server, "listening", { signal: AbortSignal.timeout(5000) });
  server.listen(0, "127.0.0.1");
  await ready;
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

export async function closeServer(server) {
  const closed = once(server, "close", { signal: AbortSignal.timeout(5000) });
  server.close();
  server.closeAllConnections();
  await closed;
}
