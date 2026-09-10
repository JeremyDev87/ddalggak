import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item;
});

// Only counts, public paths and hashes leave this observer, never provider prose or headers.
export function createCapture({ sentinels = {}, root, allowedReadPaths } = {}) {
  const requests = [], reads = [], events = [], errors = [];
  const pending = new Map();
  const allowed = allowedReadPaths && new Set(allowedReadPaths.map(file => path.resolve(root, file)));
  const event = type => events.push({ sequence: events.length + 1, type });
  function summarize(payload) {
    const text = JSON.stringify(payload);
    const summary = { sha256: sha256(canonical(payload)), bytes: Buffer.byteLength(text),
      sentinels: Object.fromEntries(Object.entries(sentinels).map(([id, token]) => [id, text.split(token).length - 1])) };
    let messages, results, format;
    if (Array.isArray(payload.messages)) {
      format = 'messages';
      messages = payload.messages;
      results = messages.flatMap(message => message.role === 'tool' ? [{ id: message.tool_call_id, content: message.content }] :
        Array.isArray(message.content) ? message.content.filter(part => part.type === 'tool_result').map(part => ({ id: part.tool_use_id, content: part.content })) : []);
    } else if (Array.isArray(payload.input) || typeof payload.input === 'string') {
      format = 'responses';
      const input = typeof payload.input === 'string' ? [{ role: 'user', content: payload.input }] : payload.input;
      messages = input.filter(item => typeof item.role === 'string');
      results = input.filter(item => item.type === 'function_call_output').map(item => ({ id: item.call_id, content: item.output }));
      summary.inputItemCount = input.length;
    } else return { ...summary, format: 'unavailable', summaryUnavailable: 'unsupported provider payload layout',
      messageCount: null, roles: null, toolResultCount: null, toolResults: null };
    return { ...summary, format, messageCount: messages.length, roles: messages.map(message => message.role),
      toolResultCount: results.length, toolResults: results.map(result => {
        const content = typeof result.content === 'string' ? result.content : (result.content ?? []).filter(part => part.type === 'text' || part.type === 'input_text' || part.type === 'output_text').map(part => part.text).join('\n');
        return { toolCallId: result.id, sha256: sha256(content), bytes: Buffer.byteLength(content) };
      }) };
  }
  return {
    requests, reads, events, errors,
    extension(pi) {
      pi.on('before_provider_request', ({ payload }) => {
        event('before_provider_request');
        requests.push({ sequence: requests.length + 1, observedAt: 'hook', ...summarize(payload) });
      });
      pi.on('tool_call', input => {
        if (!allowed) return;
        const file = input.input?.path;
        if (input.toolName !== 'read' || typeof file !== 'string' || !allowed.has(path.resolve(root, file))) {
          errors.push('tool outside fixture read boundary');
          return { block: true, reason: 'fixture read boundary' };
        }
      });
      pi.on('tool_execution_start', input => {
        if (input.toolName !== 'read') return;
        event('read_start');
        const relative = root ? path.relative(root, path.resolve(root, input.args.path)) : null;
        pending.set(input.toolCallId, { sequence: reads.length + pending.size + 1,
          requestSequence: requests.length, toolCallId: input.toolCallId,
          path: relative !== null && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative) ? relative : '<outside-sandbox-or-unavailable>',
          offset: input.args.offset ?? null, limit: input.args.limit ?? null });
      });
      pi.on('tool_execution_end', input => {
        const read = pending.get(input.toolCallId);
        if (!read) return;
        const text = (input.result.content ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
        reads.push({ ...read, bytes: Buffer.byteLength(text), sha256: sha256(text), isError: input.isError });
        pending.delete(input.toolCallId);
        event('read_end');
      });
      for (const type of ['agent_end', 'agent_settled', 'session_compact', 'session_start', 'session_shutdown']) {
        pi.on(type, () => event(type));
      }
    },
    observeWire(payload, rawBytes) {
      const request = requests.find(entry => !entry.wire);
      assert(request, 'wire request without before_provider_request observer');
      const summary = summarize(payload);
      request.wire = { sha256: summary.sha256, bytes: rawBytes, equal: summary.sha256 === request.sha256 };
      request.observedAt = 'hook-and-wire';
      if (!request.wire.equal) errors.push('hook/wire mismatch');
      assert(request.wire.equal, 'hook/wire mismatch: mutation after final observer');
      return request;
    },
    assertComplete({ wire = true } = {}) {
      assert.deepEqual(errors, [], 'capture errors');
      assert.equal(pending.size, 0, 'unfinished tool executions');
      assert(requests.length > 0, 'unsupported or unobserved provider request hook');
      if (wire) assert(requests.every(request => request.wire?.equal), 'missing wire receipt');
    },
  };
}
