import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { once, EventEmitter } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runReservedSession } from './eval-skill-loading.mjs';
import { readArtifact, sourceTree, digest } from './skill-loading/run-config.mjs';
import { guardOfflineNetwork } from './skill-loading/offline-provider.mjs';
import { createCapture } from './skill-loading/capture-extension.mjs';
import { loadInstalledRuntime, createIsolatedAuthStorage, createCapturedSession } from './skill-loading/runtime-adapter.mjs';

const script = fileURLToPath(import.meta.url), root = fileURLToPath(new URL('../', import.meta.url));
const { values } = parseArgs({ options: { 'runtime-dist': { type: 'string' }, 'plugin-path': { type: 'string' },
  scenario: { type: 'string', default: 'all' }, mode: { type: 'string' }, output: { type: 'string' }, 'child-home': { type: 'string' } } });
const secret = 'A9_PRIVATE_DIAGNOSTIC_SENTINEL', partial = 'A9_PARTIAL_PUBLIC_OUTPUT';

async function receiveRequest(request, capture) {
  request.setEncoding('utf8');
  let bytes = '';
  for await (const chunk of request) { bytes += chunk; assert(Buffer.byteLength(bytes) < 8 * 1024 * 1024); }
  const payload = JSON.parse(bytes);
  capture.observeWire(payload, Buffer.byteLength(bytes));
  return payload;
}

async function run(home) {
  const startup = guardOfflineNetwork('http://127.0.0.1:0/v1');
  let runtime, authStorage;
  try {
    runtime = await loadInstalledRuntime({ runtimeDist: values['runtime-dist'], pluginPath: values['plugin-path'] });
    authStorage = await createIsolatedAuthStorage({ runtime, cwd: home, agentDir: path.join(home, 'auth'),
      credentials: { 'skill-loading-offline': { type: 'api_key', key: 'offline-dummy-not-a-credential' } } });
    assert.deepEqual(startup.attempts, []);
  } finally { startup.restore(); }
  const source = path.join(home, 'source'); mkdirSync(source);
  cpSync(path.join(root, 'ddalggak'), path.join(source, 'ddalggak'), { recursive: true });
  const tree = sourceTree(source), config = { runId: 'a9-offline', candidateSource: source, reasoning: 'off' };
  const results = [], evidence = [];
  const state = JSON.parse(readFileSync(path.join(root, 'evals/skill-loading/fixtures/status/state.json')));
  const sourceText = readFileSync(path.join(root, 'evals/skill-loading/fixtures/backend/app.mjs'), 'utf8') + '\n// A9_PARTIAL_SOURCE\n';
  async function scenario(name) {
    const output = path.join(home, name); mkdirSync(output);
    let handle, capture, workspace, mutation, cursor = 0;
    const signals = new EventEmitter();
    const calls = [
      ['read', { path: 'ddalggak/references/wiki-context-preflight.md', reason: 'Required context' }],
      ['read', { path: 'state.json', reason: 'Observed state' }], ['verify', {}],
      ['submit', { observation: { state: { branch: 'feature/quantity-total', clean: true, openPrs: [state.pr.number],
        pendingChecks: state.pr.statusCheckRollup.filter(check => check.status === 'IN_PROGRESS').map(check => check.name), blockers: state.blockers.filter(blocker => !blocker.resolved).map(blocker => blocker.id), ready: false }, nextAction: 'resolve-blocker-and-await-ci' } }],
      ['read', { path: 'README.md', reason: 'Final context' }],
    ];
    if (name === 'late-source') {
      calls[1][1].path = 'app.mjs';
      calls[2] = ['gh', { args: ['pr', 'list', '--json', 'number,state,headRefName'] }];
      calls[3][1].observation = { implementationComplete: false, published: false, remainingGates: ['implementation', 'verification', 'human-publication'] };
      calls[4][1].path = 'app.mjs';
    }
    // Actual SDK transport, event delivery, fixture tools and recorder; no model inference.
    const server = createServer(async (request, response) => {
      try {
        assert.equal(request.url, '/v1/chat/completions');
        await receiveRequest(request, capture);
        const index = cursor++;
        if (name === 'late-source' && index === 2) {
          // Scripted fixture mutation after the real initial read, never an autonomous model write.
          mutation = { requestSequence: index + 1, beforeSha256: capture.reads.find(read => read.path === 'app.mjs').sha256,
            afterSha256: digest(sourceText) };
          assert.notEqual(mutation.beforeSha256, mutation.afterSha256);
          writeFileSync(path.join(workspace, 'app.mjs'), sourceText);
        }
        if (index === calls.length && name === 'cancel') { signals.emit('held'); return; }
        if (index === calls.length && name.startsWith('late')) {
          if (name === 'late-source') {
            assert.equal(capture.reads.at(-1).sha256, mutation.afterSha256, 'changed source must be observed before the injected failure');
            assert.equal(digest(readFileSync(path.join(workspace, 'app.mjs'))), mutation.afterSha256);
            mutation.failureRequestSequence = index + 1;
          }
          response.writeHead(400, { 'content-type': 'application/json', 'x-private': secret });
          response.end(JSON.stringify({ error: { message: `invalid request ${secret}`, type: secret, request: { private: secret } } }));
          return;
        }
        assert(index <= calls.length, 'unexpected retry/title/fallback request');
        response.writeHead(200, { 'content-type': 'text/event-stream' });
        const send = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: `a9-${index}`,
          object: 'chat.completion.chunk', created: 0, model: 'offline-scripted', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
        const call = calls[index];
        send({ role: 'assistant', content: index === calls.length - 1 ? partial : '', ...(call ? {
          tool_calls: [{ index: 0, id: `action-${index}`, type: 'function', function: { name: call[0], arguments: JSON.stringify(call[1]) } }],
        } : { content: 'A9_DONE' }) });
        send({}, call ? 'tool_calls' : 'stop'); response.end('data: [DONE]\n\n');
      } catch (error) { response.destroy(error); console.error('offline contract failure:', error.code ?? error.name); }
    });
    const listening = once(server, 'listening', { signal: AbortSignal.timeout(10000) }); server.listen(0, '127.0.0.1'); await listening;
    const baseUrl = `http://127.0.0.1:${server.address().port}/v1`, network = guardOfflineNetwork(baseUrl);
    const model = { id: 'offline-scripted', name: 'Offline scripted (not a model)', provider: 'skill-loading-offline',
      api: 'openai-completions', baseUrl, reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 4096,
      compat: { supportsStore: false, supportsDeveloperRole: false, supportsUsageInStreaming: false, maxTokensField: 'max_tokens' } };
    config.modelId = `${model.provider}/${model.id}`;
    const slot = { fixtureId: name === 'late-source' ? 'backend' : 'status', variant: 'candidate', ordinal: results.length + 1 }, identity = { ...slot, sourceTree: tree };
    let result;
    try {
      result = await runReservedSession({ config, slot, identity, attempted: { ...slot, attempted: true, attempt: 1 },
        output, runtime, model, authStorage, async createSession(options) {
          capture = options.capture; workspace = options.cwd;
          handle = await createCapturedSession(options);
          const prompt = handle.prompt.bind(handle);
          handle.prompt = async (...args) => {
            const held = name === 'cancel' ? once(signals, 'held', { signal: AbortSignal.timeout(30000) }) : null;
            const turn = prompt(args[0], { timeoutMs: 30000 }).then(value => ({ value }), error => ({ error }));
            if (held) { await held; await handle.session.abort(); }
            const { value, error } = await turn;
            if (error) throw error;
            if (name === 'post-prompt') capture.errors.push(secret);
            if (name === 'verification-failure') writeFileSync(path.join(output, `${slot.ordinal}-${slot.fixtureId}-${slot.variant}`, 'oracle-execution.json'), '{}', { flag: 'wx' });
            return value;
          };
          if (name.includes('close')) {
            const close = handle.close.bind(handle);
            handle.close = async () => {
              const abort = handle.session.abort.bind(handle.session);
              handle.session.abort = async () => { await abort(); throw new Error(secret); };
              try { return await close(); } finally { handle.session.abort = abort; }
            };
          }
          return handle;
        } });
      assert.equal(cursor, calls.length + 1, 'each scripted provider request occurs once');
      assert.equal(handle.receipt.reads.length, 3, 'late failure follows actual SDK reads');
      assert(handle.session.messages.some(message => message.role === 'assistant' && message.content.some(part => part.type === 'text' && part.text === partial)));
      assert.equal(existsSync(workspace), false, 'workspace must already be removed');
      assert(result.receipt, 'reserved session discarded available recorder evidence');
      const receipt = readArtifact(output, result.receipt), observed = readArtifact(output, result.output);
      assert.equal(receipt.actions.filter(action => action.status === 'success').length, calls.length);
      if (name === 'late-source') {
        assert.equal(receipt.before['app.mjs'], mutation.beforeSha256);
        assert.equal(receipt.after['app.mjs'], mutation.afterSha256);
        assert(mutation.requestSequence < mutation.failureRequestSequence);
        assert.notEqual(receipt.before['app.mjs'], receipt.after['app.mjs']);
        assert.equal(result.files.length, 1);
        assert.equal(readArtifact(output, result.files[0], false).toString(), sourceText);
        assert.equal(result.files[0].sha256, receipt.after['app.mjs']);
        assert.equal(observed.implementationComplete, false);
        assert(readArtifact(output, result.verification).checks.every(check => check.status === 'fail'), 'unexecuted verification cannot pass');
      } else {
        assert.deepEqual(receipt.before, receipt.after, 'source snapshot must survive workspace removal');
        assert(receipt.after['state.json']);
        assert(observed.state, 'submitted partial output must survive a late failure');
        if (name !== 'verification-failure') assert(readArtifact(output, result.verification).checks.every(check => check.status === 'pass'));
      }
      assert.equal(receipt.cleanup.sandboxRemoved, true);
      assert.equal(receipt.cleanup.disposed, true);
      for (const read of receipt.capture.reads) assert(receipt.capture.requests.some(request => request.sequence > read.requestSequence &&
        request.toolResults.some(item => item.toolCallId === read.toolCallId && item.sha256 === read.sha256 && item.bytes === read.bytes)));
      const refs = new Set(), artifacts = {};
      const closure = value => {
        if (!value || typeof value !== 'object') return;
        if (typeof value.path === 'string' && value.sha256 && Object.keys(value).length === 2) {
          if (refs.has(value.path)) return; refs.add(value.path);
          const bytes = readArtifact(output, value, false);
          artifacts[value.path] = { sha256: value.sha256, text: bytes.toString() };
          if (value.path.endsWith('.json')) closure(JSON.parse(bytes));
        } else Object.values(value).forEach(closure);
      };
      closure(result);
      for (const file of readdirSync(output, { recursive: true, withFileTypes: true }).filter(file => file.isFile()))
        assert(!readFileSync(path.join(file.parentPath, file.name), 'utf8').includes(secret), 'private error/header/body leaked');
      assert.equal(result.status, name === 'success' ? 'complete' : 'unresolved');
      if (name !== 'success') {
        assert(result.failure?.stage && result.failure?.category, 'structured failure required');
        assert(readArtifact(output, result.finalText, false).toString().includes(partial), 'partial assistant text must survive');
      }
      if (name.startsWith('late')) assert.equal(result.failure.stage, 'prompt');
      if (name.includes('close')) assert(receipt.cleanup.failures.length > 0);
      assert.deepEqual(network.attempts, []);
      results.push(result);
      evidence.push({ scenario: name, result, artifacts, workspace, port: new URL(baseUrl).port, requests: cursor, mutation });
      console.log(JSON.stringify({ scenario: name, status: result.status, requests: cursor, reads: receipt.capture.reads.length,
        actions: receipt.actions.length, closureRefs: refs.size, cleanup: receipt.cleanup, failure: result.failure ?? null, mutation }));
    } finally {
      try { if (handle && !handle.receipt.cleanup?.disposed) await handle.close(); }
      finally {
        const closed = once(server, 'close', { signal: AbortSignal.timeout(10000) }); server.close(); server.closeAllConnections(); await closed;
        network.restore();
        console.log(JSON.stringify({ teardown: name, serverClosed: !server.listening, workspace: workspace ?? null, workspaceRemoved: !workspace || !existsSync(workspace) }));
      }
    }
  }
  for (const name of values.scenario === 'all' ? ['success', 'late-failure', 'post-prompt', 'verification-failure', 'close', 'late-close', 'cancel', 'late-source'] : [values.scenario]) await scenario(name);
  assert.equal(new Set(results.map(entry => entry.sessionId)).size, results.length, 'duplicate SDK session');
  if (values.output) writeFileSync(values.output, JSON.stringify({ runtime: runtime.identity, evidence }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ verified: true, scenarios: results.length, modelCalls: 0, runtime: runtime.identity }));
}

async function portable() {
  const text = readFileSync(path.join(root, 'ddalggak/references/wiki-context-preflight.md'), 'utf8');
  const payload = { messages: [{ role: 'tool', tool_call_id: 'action-0', content: text }] };
  const original = Buffer.from(JSON.stringify(payload));
  const lead = original.findIndex(byte => byte >= 0xe0 && byte <= 0xef);
  assert(lead > 0 && (original[lead + 1] & 0xc0) === 0x80 && (original[lead + 2] & 0xc0) === 0x80);
  for (const mutated of [false, true]) for (const split of [null, lead + 1, lead + 2]) {
    const capture = createCapture(), hooks = new Map(), signals = new EventEmitter(), chunks = [];
    capture.extension({ on: (type, handler) => hooks.set(type, handler) });
    hooks.get('before_provider_request')({ payload });
    const sent = structuredClone(payload);
    if (mutated) sent.messages[0].content += 'A17_POST_HOOK_MUTATION';
    const raw = Buffer.from(JSON.stringify(sent));
    if (!mutated) assert.deepEqual(raw, original);
    let received, failure, client;
    const server = createServer(async (request, response) => {
      request.on('data', chunk => { chunks.push(Buffer.byteLength(chunk)); signals.emit('chunk'); });
      try { received = await receiveRequest(request, capture); }
      catch (error) { failure = error; }
      response.writeHead(failure ? 400 : 200); response.end();
    });
    try {
      const listening = once(server, 'listening', { signal: AbortSignal.timeout(5000) }); server.listen(0, '127.0.0.1'); await listening;
      const signal = AbortSignal.timeout(5000);
      client = httpRequest({ host: '127.0.0.1', port: server.address().port, path: '/v1/chat/completions', method: 'POST',
        headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' }, agent: false, signal });
      const response = once(client, 'response', { signal });
      // Subscribe before writing; the second HTTP chunk cannot arrive before the receiver sees the first.
      const first = split === null ? null : once(signals, 'chunk', { signal });
      const send = async () => {
        if (first) { client.write(raw.subarray(0, split)); await first; }
        client.end(first ? raw.subarray(split) : raw);
      };
      const [, [reply]] = await Promise.all([send(), response]);
      for await (const chunk of reply) { assert.equal(chunk.length, 0); }
      const summary = capture.requests[0];
      console.log(JSON.stringify({ receiver: 'UTF-8 HTTP chunks', mutated, split, rawBytes: raw.length, chunks,
        hook: summary.sha256, wire: summary.wire, failure: failure?.message ?? null }));
      if (mutated) {
        assert.equal(failure?.code, 'ERR_ASSERTION');
        assert.equal(reply.statusCode, 400);
        assert.deepEqual(capture.errors, ['hook/wire mismatch']);
        assert.equal(summary.wire.equal, false);
        assert.notEqual(summary.wire.sha256, summary.sha256);
        assert.throws(() => capture.assertComplete(), /capture errors/);
      } else {
        assert.ifError(failure);
        assert.equal(reply.statusCode, 200);
        assert.deepEqual(received, payload);
        capture.assertComplete();
        assert.equal(summary.wire.sha256, summary.sha256);
        assert.deepEqual(summary.toolResults, [{ toolCallId: 'action-0', sha256: digest(text), bytes: Buffer.byteLength(text) }]);
      }
      assert.equal(summary.wire.bytes, raw.length);
      if (first) assert(chunks.length >= 2, 'split regression must exercise separate receiver chunks');
    } finally {
      client?.destroy();
      const closed = once(server, 'close', { signal: AbortSignal.timeout(5000) }); server.close(); server.closeAllConnections(); await closed;
      assert.equal(server.listening, false);
    }
  }
  const temp = mkdtempSync(path.join(os.tmpdir(), 'ddalggak-a9-portable-'));
  try {
    for (const [index, name] of ['create-session', 'prepare-sandbox'].entries()) {
      const output = path.join(temp, name); mkdirSync(output);
      const slot = { fixtureId: 'status', variant: 'candidate', ordinal: index + 1 };
      let creations = 0;
      const result = await runReservedSession({ slot, attempted: { ...slot, attempted: true, attempt: 1 }, identity: {}, output,
        config: { runId: 'a9-portable', candidateSource: name === 'create-session' ? root : path.join(temp, 'missing') },
        async createSession() { creations++; throw new Error(secret); } });
      const receipt = readArtifact(output, result.receipt);
      assert.equal(result.status, 'unresolved');
      assert.equal(result.failure.stage, name);
      assert.equal(creations, name === 'create-session' ? 1 : 0, 'no retry or duplicate session');
      assert.equal(receipt.capture.requests.length, 0);
      assert(receipt.after['state.json'], 'available partial workspace snapshot discarded');
      assert.equal(receipt.cleanup.sandboxRemoved, true);
      assert.equal(receipt.cleanup.disposed, false, 'session was never created');
      assert(readArtifact(output, result.output).unavailable);
      assert(!JSON.stringify({ result, receipt }).includes(secret));
    }
    console.log('PASS portable reserved exits: setup/create failure snapshots, output unavailability, sanitized diagnostics and cleanup');
  } finally { rmSync(temp, { recursive: true, force: true }); assert(!existsSync(temp)); }
}

const mode = values.mode ?? (values['runtime-dist'] || values['plugin-path'] ? 'offline' : 'portable');
assert(['offline', 'portable'].includes(mode), 'no live mode');
if (mode === 'portable') await portable();
else if (values['child-home']) await run(values['child-home']);
else {
  assert(values['runtime-dist'] && values['plugin-path'], 'explicit --runtime-dist and --plugin-path required');
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'ddalggak-a9-')));
  let child, code;
  try {
    mkdirSync(path.join(home, '.omo')); mkdirSync(path.join(home, 'agent'));
    writeFileSync(path.join(home, '.omo/omo.json'), JSON.stringify({ memory: { enabled: false }, telemetry: { enabled: false } }));
    child = spawn('/usr/bin/sandbox-exec', ['-p', `(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(deny file-write*)(allow file-write* (subpath ${JSON.stringify(home)}) ${values.output ? `(literal ${JSON.stringify(path.resolve(values.output))})` : ''} (literal "/dev/null"))`,
      process.execPath, script, ...process.argv.slice(2), '--child-home', home], { cwd: home, stdio: ['ignore', 'pipe', 'pipe'], env: {
        HOME: home, TMPDIR: home, PATH: process.env.PATH, LANG: 'en_US.UTF-8', DO_NOT_TRACK: '1',
        OMO_CODING_AGENT_DIR: path.join(home, 'agent'), SENPI_CODING_AGENT_DIR: path.join(home, 'agent'), PI_CODING_AGENT_DIR: path.join(home, 'agent'),
      } });
    child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
    try { [code] = await once(child, 'close', { signal: AbortSignal.timeout(180000) }); }
    catch (error) { const stopped = once(child, 'close', { signal: AbortSignal.timeout(10000) }); child.kill('SIGKILL'); await stopped; throw error; }
    process.exitCode = code ?? 1;
  } finally {
    rmSync(home, { recursive: true, force: true });
    console.log(JSON.stringify({ childPid: child?.pid, exitCode: code, home, homeRemoved: !existsSync(home) }));
  }
}
