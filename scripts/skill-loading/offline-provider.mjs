import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once, EventEmitter } from 'node:events';
import net from 'node:net';

export async function startOfflineProvider({ capture, actions = [], api = 'openai-completions' }) {
  assert(['openai-completions', 'openai-responses'].includes(api), 'unsupported offline API');
  const signals = new EventEmitter();
  const errors = [];
  let cursor = 0, closed = false;
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, api === 'openai-responses' ? '/v1/responses' : '/v1/chat/completions');
      request.setEncoding('utf8');
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        assert(Buffer.byteLength(body) < 8 * 1024 * 1024, 'oversized offline request');
      }
      const payload = JSON.parse(body);
      const receipt = capture.observeWire(payload, Buffer.byteLength(body));
      signals.emit('request', receipt);
      const action = actions[cursor++];
      assert(action, 'unexpected provider call: retry/title/fallback or exhausted script');
      if (action.hold) {
        signals.emit('held');
        return;
      }
      const id = `offline-${cursor}`;
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      if (api === 'openai-responses') {
        const send = (type, data) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
        const item = action.read ? { type: 'function_call', id: `fc_${cursor}`, call_id: `read-${cursor}`, name: 'read', arguments: JSON.stringify(action.read), status: 'completed' } :
          { type: 'message', id: `msg_${cursor}`, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: action.text ?? 'OFFLINE_DONE', annotations: [] }] };
        send('response.created', { response: { id, status: 'in_progress', output: [] } });
        send('response.output_item.added', { output_index: 0, item });
        send('response.output_item.done', { output_index: 0, item });
        send('response.completed', { response: { id, status: 'completed', output: [item], usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 } } });
        response.end();
        return;
      }
      const send = (delta, finish_reason = null, usage) => response.write(`data: ${JSON.stringify({
        id, object: 'chat.completion.chunk', created: 0, model: 'offline-scripted',
        choices: [{ index: 0, delta, finish_reason }], ...(usage ? { usage } : {}),
      })}\n\n`);
      send({ role: 'assistant', ...(action.read ? { tool_calls: [{ index: 0, id: `read-${cursor}`, type: 'function',
        function: { name: 'read', arguments: JSON.stringify(action.read) } }] } : { content: action.text ?? 'OFFLINE_DONE' }) });
      send({}, action.read ? 'tool_calls' : 'stop', { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110 });
      response.end('data: [DONE]\n\n');
    } catch (error) {
      errors.push(error.message);
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { message: error.message, type: 'offline_contract_error' } }));
    }
  });
  const listening = once(server, 'listening', { signal: AbortSignal.timeout(10000) });
  server.listen(0, '127.0.0.1');
  await listening;
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  return { baseUrl, signals, errors, actions,
    model: { id: 'offline-scripted', name: 'Offline scripted (not a model)', provider: 'skill-loading-offline',
      api, baseUrl, reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 4096,
      compat: { supportsStore: false, supportsDeveloperRole: false, supportsUsageInStreaming: true, maxTokensField: 'max_tokens' } },
    get consumed() { return cursor; },
    async close() {
      if (!closed) {
        const done = once(server, 'close', { signal: AbortSignal.timeout(10000) });
        server.close();
        server.closeAllConnections();
        await done;
        closed = true;
      }
      return { serverClosed: !server.listening, consumed: cursor, planned: actions.length, errors };
    },
  };
}

// Child-process-local guard. The executable also uses an OS sandbox for write/network isolation.
export function guardOfflineNetwork(baseUrl) {
  const target = new URL(baseUrl);
  const originalFetch = globalThis.fetch, originalConnect = net.Socket.prototype.connect;
  const attempts = [];
  function deny() { attempts.push({ denied: true, reason: 'non-loopback-provider' }); throw new Error('offline network boundary'); }
  globalThis.fetch = function (input, options) {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.origin !== target.origin || ![`${target.pathname}/chat/completions`, `${target.pathname}/responses`].includes(url.pathname)) return deny();
    return originalFetch.call(this, input, options);
  };
  net.Socket.prototype.connect = function (...args) {
    const normalized = Array.isArray(args[0]) ? args[0] : args;
    const options = typeof normalized[0] === 'object' ? normalized[0] : { port: normalized[0], host: normalized[1] };
    if (options.path || options.host !== target.hostname || String(options.port) !== target.port) return deny();
    return originalConnect.apply(this, args);
  };
  return { attempts, restore() { globalThis.fetch = originalFetch; net.Socket.prototype.connect = originalConnect; } };
}
