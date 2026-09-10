import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import net from 'node:net';
import { createCapture, sha256 } from './skill-loading/capture-extension.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(import.meta.url);
const { values } = parseArgs({ options: { 'runtime-dist': { type: 'string' }, 'plugin-path': { type: 'string' },
  mode: { type: 'string' }, output: { type: 'string' }, 'child-home': { type: 'string' } } });
assert(['portable', 'offline'].includes(values.mode), 'required: --mode portable or --mode offline');
let output;
const save = (file, value) => writeFile(path.join(output, file), `${JSON.stringify(value, null, 2)}\n`);

function protocolChecks() {
  function recorder() {
    const capture = createCapture({ sentinels: { bootstrap: 'SL_BOOTSTRAP_SENTINEL', result: 'SL_RESULT_SENTINEL', absent: 'SL_ABSENT_SENTINEL' } });
    const handlers = new Map();
    capture.extension({ on(type, handler) { handlers.set(type, handler); } });
    return { capture, emit: (type, event) => handlers.get(type)(event) };
  }
  const summaries = [];
  const text = 'SL_RESULT_SENTINEL\nread result: "quoted" \\ path\n\uD55C';
  const content = [{ type: 'text', text: 'SL_RESULT_SENTINEL\nread result: "quoted" \\ path' }, { type: 'text', text: '\uD55C' }];
  for (const format of ['messages', 'responses']) {
    for (const parts of [false, true]) {
      const { capture, emit } = recorder();
      const user = { role: 'user', content: 'SL_BOOTSTRAP_SENTINEL' };
      const initial = format === 'messages' ? { messages: [user] } : { input: [user] };
      emit('before_provider_request', { payload: initial });
      capture.observeWire(JSON.parse(JSON.stringify(initial)), Buffer.byteLength(JSON.stringify(initial)));
      emit('tool_execution_start', { toolName: 'read', toolCallId: 'read-1', args: { path: 'document.md', offset: 1, limit: 2 } });
      assert.throws(() => capture.assertComplete(), /unfinished tool executions/);
      emit('tool_execution_end', { toolName: 'read', toolCallId: 'read-1', result: { content }, isError: false });
      assert.equal(capture.reads[0].sha256, sha256(text));
      assert.equal(capture.reads[0].bytes, Buffer.byteLength(text));
      // Chat tool messages use text parts; Responses function outputs use input_text, not output_text.
      const payload = format === 'messages' ? { messages: [user,
        { role: 'assistant', tool_calls: [{ id: 'read-1', type: 'function', function: { name: 'read', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'read-1', content: parts ? content : text },
        { role: 'assistant', content: 'done' }] } : { input: [user,
        { type: 'function_call', call_id: 'read-1', name: 'read', arguments: '{}' },
        { type: 'function_call_output', call_id: 'read-1', output: parts ? [
          ...content.map(part => ({ type: 'input_text', text: part.text })),
          { type: 'input_image', detail: 'auto', image_url: 'data:image/png;base64,AA==' },
        ] : text },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done', annotations: [] }] }] };
      const serialized = JSON.stringify(payload);
      assert.equal(emit('before_provider_request', { payload }), undefined, 'observer must not replace the request');
      assert.equal(JSON.stringify(payload), serialized, 'observer must not mutate the request');
      const summary = capture.requests[1];
      assert.equal(summary.format, format);
      assert.equal(summary.messageCount, format === 'messages' ? 4 : 2);
      assert.deepEqual(summary.roles, format === 'messages' ? ['user', 'assistant', 'tool', 'assistant'] : ['user', 'assistant']);
      if (format === 'responses') assert.equal(summary.inputItemCount, 4);
      assert.equal(summary.toolResultCount, 1);
      assert.deepEqual(summary.toolResults, [{ toolCallId: 'read-1', sha256: sha256(text), bytes: Buffer.byteLength(text) }]);
      assert.deepEqual(summary.sentinels, { bootstrap: 1, result: 1, absent: 0 });
      assert.equal(summary.bytes, Buffer.byteLength(serialized));
      assert(capture.reads[0].requestSequence < summary.sequence);
      capture.assertComplete({ wire: false });
      assert.throws(() => capture.assertComplete(), /missing wire receipt/);
      // Key order/whitespace may differ on the wire; content may not.
      const wire = JSON.stringify(payload, (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse()) : value, 2);
      capture.observeWire(JSON.parse(wire), Buffer.byteLength(wire));
      capture.assertComplete();
      assert.equal(summary.wire.bytes, Buffer.byteLength(wire));
      assert.equal(summary.observedAt, 'hook-and-wire');
      summaries.push(summary);

      emit('before_provider_request', { payload });
      if (format === 'messages') payload.messages[2].content = 'changed after hook';
      else payload.input[2].output = 'changed after hook';
      const mutated = JSON.stringify(payload);
      assert.throws(() => capture.observeWire(JSON.parse(mutated), Buffer.byteLength(mutated)), /hook\/wire mismatch/);
      assert.deepEqual(capture.errors, ['hook/wire mismatch']);
      assert.equal(capture.requests[2].wire.equal, false);
      assert.throws(() => capture.assertComplete(), /capture errors/);
    }
  }
  const { capture, emit } = recorder();
  assert.throws(() => capture.observeWire({ input: 'unobserved' }, 0), /wire request without/);
  for (const payload of [{ input: 'SL_BOOTSTRAP_SENTINEL' }, { unsupported_input_layout: true }]) {
    emit('before_provider_request', { payload });
    capture.observeWire(JSON.parse(JSON.stringify(payload)), Buffer.byteLength(JSON.stringify(payload)));
  }
  assert.equal(capture.requests[0].format, 'responses');
  assert.equal(capture.requests[0].messageCount, 1);
  assert.equal(capture.requests[0].inputItemCount, 1);
  assert.deepEqual(capture.requests[0].roles, ['user']);
  assert.equal(capture.requests[0].toolResultCount, 0);
  assert.deepEqual(capture.requests[0].toolResults, []);
  assert.deepEqual(capture.requests[0].sentinels, { bootstrap: 1, result: 0, absent: 0 });
  const unsupported = capture.requests[1];
  assert.equal(unsupported.format, 'unavailable');
  for (const field of ['messageCount', 'roles', 'toolResultCount', 'toolResults']) assert.equal(unsupported[field], null);
  assert(unsupported.summaryUnavailable);
  capture.assertComplete();
  return [...summaries, ...capture.requests];
}

async function isolatedChild() {
  assert.equal(process.platform, 'darwin', 'unresolved: offline executable requires supported OS sandbox (darwin sandbox-exec)');
  const home = await realpath(await mkdtemp(path.join(os.tmpdir(), 'skill-loading-runtime-')));
  const agentDir = path.join(home, 'agent');
  await mkdir(agentDir);
  await mkdir(path.join(home, '.omo'));
  await writeFile(path.join(home, '.omo/omo.json'), JSON.stringify({ memory: { enabled: false }, telemetry: { enabled: false } }));
  const args = ['-p', `(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(deny file-write*)(allow file-write* (subpath ${JSON.stringify(home)}) (subpath ${JSON.stringify(output)}) (literal "/dev/null"))`,
    process.execPath, script, ...process.argv.slice(2), '--child-home', home];
  let child, exitCode;
  try {
    child = spawn('/usr/bin/sandbox-exec', args, { cwd: home, stdio: ['ignore', 'pipe', 'pipe'], env: {
      HOME: home, TMPDIR: home, PATH: process.env.PATH, LANG: 'en_US.UTF-8', DO_NOT_TRACK: '1',
      OMO_CODING_AGENT_DIR: agentDir, SENPI_CODING_AGENT_DIR: agentDir, PI_CODING_AGENT_DIR: agentDir,
    } });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 240000);
    try { [exitCode] = await once(child, 'close', { signal: controller.signal }); }
    catch (error) {
      const stopped = once(child, 'close'); child.kill('SIGKILL'); await stopped; throw error;
    } finally { clearTimeout(timer); }
    await writeFile(path.join(output, 'execution.log'), stdout + stderr);
    process.stdout.write(stdout); process.stderr.write(stderr);
  } finally {
    await rm(home, { recursive: true, force: true });
    await save('process-cleanup.json', { childExited: child?.exitCode !== null, exitCode,
      tempRemoved: !existsSync(home), sandbox: 'write-only-temp-and-evidence; network-loopback-only', credentialsInherited: false });
  }
  process.exitCode = exitCode ?? 1;
}

async function run() {
  const home = values['child-home'];
  assert.equal(process.env.HOME, home);
  await save('protocol-summaries.json', protocolChecks());
  const { startOfflineProvider, guardOfflineNetwork } = await import('./skill-loading/offline-provider.mjs');
  const { loadInstalledRuntime, createIsolatedAuthStorage, createCapturedSession } = await import('./skill-loading/runtime-adapter.mjs');
  const startupNetwork = guardOfflineNetwork('http://127.0.0.1:0/v1');
  const { registerHooks } = await import('node:module');
  assert.equal(typeof registerHooks, 'function', 'unresolved: Node module hooks required for public-import proof');
  const installedDist = await realpath(values['runtime-dist']);
  const installedPackage = JSON.parse(await readFile(path.join(installedDist, '../package.json'), 'utf8'));
  const publicEntry = pathToFileURL(path.resolve(installedDist, '..', installedPackage.exports['.'].import)).href;
  const sdkImports = [];
  const importBoundary = registerHooks({ resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    if (context.parentURL === new URL('./skill-loading/runtime-adapter.mjs', import.meta.url).href && result.url.startsWith(pathToFileURL(`${installedDist}/`).href)) {
      assert.equal(result.url, publicEntry, 'adapter imported a non-public installed SDK module');
      sdkImports.push(result.url);
    }
    return result;
  } });
  let runtime;
  try {
    runtime = await loadInstalledRuntime({ runtimeDist: values['runtime-dist'], pluginPath: values['plugin-path'] });
    assert.deepEqual(startupNetwork.attempts, []);
    assert.deepEqual(sdkImports, [publicEntry]);
    assert.equal(runtime.AuthStorage, undefined, 'private constructor must not be exposed');
    await save('public-sdk-boundary.json', { publicEntry, adapterSdkImports: sdkImports, authFactory: 'createAgentSessionServices', privateModuleFallback: false });
  } finally { importBoundary.deregister(); startupNetwork.restore(); }
  const results = [], rejections = [];
  const fixtureRoot = path.join(root, 'evals/skill-loading');
  const manifestBytes = await readFile(path.join(fixtureRoot, 'fixtures.json'));
  const manifest = JSON.parse(manifestBytes);
  async function scenario(id, { fixtureId = 'status', command = 'status', extra = [], missing = false,
    unknown = false, duplicate = false, reread = false, resume = false, cancel = false, phase = false, custom = false,
    mismatch = false, networkControl = false, hookOnly = false, api = 'openai-completions' } = {}) {
    const cwd = path.join(home, id), agentDir = path.join(home, 'agent');
    await mkdir(cwd);
    const skill = path.join(cwd, 'ddalggak');
    await cp(path.join(root, 'ddalggak'), skill, { recursive: true });
    const fixture = manifest.fixtures.find(entry => entry.id === fixtureId);
    const fixtureSource = path.join(fixtureRoot, 'fixtures', fixtureId);
    // Explicit model-visible copies; never copy oracle, solution, validator or expected-output trees.
    const visible = fixtureId === 'status' ? ['state.json'] : fixtureId === 'backend' ? ['app.mjs'] :
      fixtureId === 'ui' ? ['index.html', 'DESIGN.md'] : ['context.md', 'after/src'];
    for (const file of visible) await cp(path.join(fixtureSource, file), path.join(cwd, file), { recursive: true });
    const sandboxFiles = (await readdir(cwd, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
      .map(entry => path.relative(cwd, path.join(entry.parentPath, entry.name)));
    assert(sandboxFiles.every(file => !/(?:^|\/)(?:oracle[^/]*|solution)(?:\/|$)/.test(file)), 'oracle/solution leaked to sandbox');
    const sourceFiles = sandboxFiles.filter(file => !file.startsWith('ddalggak/'));
    const sentinels = { bootstrap: 'SL_BOOTSTRAP_SENTINEL', observer: 'SL_OBSERVER_SENTINEL', extra: 'SL_EXTRA_SENTINEL', extraReason: 'SL_EXTRA_REASON_NEW_EVIDENCE' };
    const body = await readFile(path.join(skill, 'SKILL.md'), 'utf8');
    await writeFile(path.join(skill, 'SKILL.md'), `${body}\n${sentinels.bootstrap}\n`);
    const doc = name => `ddalggak/references/${name}`;
    const contract = async name => JSON.parse((await readFile(path.join(skill, 'references', `command-${name}.md`), 'utf8')).match(/```json\n([\s\S]*?)\n```/)[1]);
    const metadata = await contract(command);
    const selected = doc(`command-${command}.md`);
    const files = [selected, ...metadata.required_references.map(doc), ...metadata.required_templates.map(file => `ddalggak/templates/${file}`), ...fixture.expectedReads.map(doc), ...extra.map(doc)];
    const phaseContract = phase ? await contract('review') : null;
    const phaseFiles = phase ? [doc('command-review.md'), ...phaseContract.required_references.map(doc)] : [];
    const earlyFiles = new Set(files);
    files.push(...phaseFiles);
    const unique = [...new Set(files)];
    const actions = [], phaseActions = [];
    for (const [index, file] of unique.entries()) {
      const token = `SL_DOCUMENT_${index}_SENTINEL`;
      sentinels[file] = token;
      const content = await readFile(path.join(cwd, file), 'utf8');
      await writeFile(path.join(cwd, file), `${content}\n${token}\n`);
      const lineCount = content.split('\n').length + 2;
      for (let offset = 1; offset <= lineCount; offset += 150) (earlyFiles.has(file) ? actions : phaseActions).push({ read: { path: file, offset, limit: 150 } });
    }
    for (const file of sourceFiles) actions.push({ read: { path: file, offset: 1, limit: 150 } });
    if (phase) actions.push({ text: 'OFFLINE_PHASE_START_COMPLETE' }, ...phaseActions);
    await writeFile(path.join(cwd, 'new-evidence.md'), `${sentinels.extra}\nSynthetic newly observed evidence warrants investigation.\n`);
    if (missing) { await rm(path.join(cwd, selected)); actions.splice(1); }
    if (unknown) actions.length = 0;
    if (reread) actions.push({ read: { path: selected, offset: 1, limit: 150 } });
    if (!missing && !unknown) actions.push({ text: `Context Manifest: ${sentinels.extraReason}; new evidence justifies the extra read.` }, { read: { path: 'new-evidence.md', offset: 1, limit: 2 } });
    actions.push(cancel ? { hold: true } : { text: unknown ? 'NEEDS_CLARIFICATION' : missing ? 'MISSING_SELECTED_CONTRACT' : 'OFFLINE_DONE' });
    const capture = createCapture({ sentinels, root: cwd, allowedReadPaths: [...unique, ...sourceFiles, 'new-evidence.md'] });
    const provider = await startOfflineProvider({ capture, actions, api });
    const network = guardOfflineNetwork(provider.baseUrl);
    let handle, providerCleanup, customReadCalls = 0;
    const lifecycles = [];
    const options = { runtime, cwd, agentDir, model: provider.model, capture, skillPaths: [skill],
      settings: { compaction: { keepRecentTokens: 100, reserveTokens: 1000 } },
      extensionFactories: [{ name: 'synthetic-upstream-observer', factory(pi) {
        pi.on('before_provider_request', event => ({ ...event.payload, user: sentinels.observer }));
      } }] };
    if (custom) {
      const native = runtime.sdk.createReadToolDefinition(cwd);
      options.customTools = [{ ...native, async execute(...args) { customReadCalls++; return native.execute(...args); } }];
    }
    try {
      options.authStorage = await createIsolatedAuthStorage({ runtime, cwd, agentDir: path.join(home, 'auth'),
        credentials: { [provider.model.provider]: { type: 'api_key', key: 'offline-dummy-not-a-credential' } } });
      assert.equal(options.authStorage.getStoragePath(), path.join(home, 'auth/auth.json'));
      handle = await createCapturedSession(options);
      lifecycles.push(handle.receipt);
      const prompt = `/skill:ddalggak ${duplicate ? '/skill:ddalggak ' : ''}${unknown ? 'sttaus' : command}\n${await readFile(path.join(fixtureRoot, fixture.prompt), 'utf8')}`;
      if (mismatch) {
        // Deliberately violate the adapter's ordering through the loaded runtime extension list.
        const extensions = handle.loader.getExtensions().extensions;
        extensions.unshift(...extensions.splice(extensions.findIndex(extension => extension.path === '<inline:skill-loading-capture>'), 1));
        await assert.rejects(handle.prompt(prompt), /runtime turn failed/);
        assert.deepEqual(capture.errors, ['hook/wire mismatch']);
        assert.equal(capture.requests.length, 1);
        assert.equal(capture.requests[0].wire.equal, false);
        assert.equal(capture.requests[0].sentinels.observer, 0);
        assert.equal(provider.consumed, 0, 'mismatched request must not receive a scripted successful response');
        rejections.push({ id, verified: true, request: capture.requests[0] });
        return;
      }
      if (cancel) {
        provider.actions.splice(0, provider.actions.length, { hold: true });
        const held = once(provider.signals, 'held', { signal: AbortSignal.timeout(30000) });
        const turn = handle.prompt(prompt).then(() => ({ unexpectedlyCompleted: true }), error => ({ rejected: error.message }));
        await held; await handle.session.abort();
        assert((await turn).rejected, 'cancel must not complete');
      } else {
        await handle.prompt(prompt);
        if (phase) {
          assert.equal(capture.requests.at(-1).sentinels[doc('command-review.md')], 0, 'later phase was preloaded');
          await handle.prompt('Transition to internal review; read its contract and applicable assets before reviewing.');
          assert(capture.requests.at(-1).sentinels[doc('command-review.md')] > 0, 'later phase contract missing');
        }
        // A scripted assistant completes the first phase before user-authorized extra investigation.
        if (!missing && !unknown) await handle.prompt('Investigate the new evidence recorded in the Context Manifest.');
      }
      capture.assertComplete();
      assert(capture.requests.every(request => request.format === (api === 'openai-responses' ? 'responses' : 'messages') && request.messageCount > 0));
      assert.deepEqual(handle.receipt.diagnostics, duplicate ? [{ code: 'duplicate-skill-invocation', event: 'skill_expansion' }] : []);
      assert.equal(capture.requests[0].sentinels.bootstrap, 1, 'one skill expansion on initial wire request');
      assert.equal(capture.requests[0].sentinels[selected], 0, 'selected body must not be preloaded');
      assert(capture.requests.every(request => request.sentinels.observer === 1), 'last observer must see upstream mutation');
      if (unknown) assert.equal(capture.reads.length, 0, 'unknown route cannot read a fallback contract');
      else if (missing) assert(capture.reads.some(read => read.path === selected && read.isError), 'actual missing-file error required');
      else if (!cancel) {
        for (const file of unique) {
          const loaded = capture.requests.find(request => request.sentinels[file] > 0);
          assert(loaded, `mandatory document never reached wire: ${file}`);
          assert(capture.reads.some(read => read.path === file && read.requestSequence < loaded.sequence && !read.isError));
        }
        assert(capture.requests.at(-1).sentinels.extra > 0, 'extra read result missing from next request');
        const extraRead = capture.reads.find(read => read.path === 'new-evidence.md');
        assert(capture.requests[extraRead.requestSequence - 1].sentinels.extraReason > 0, 'extra read must follow its recorded reason');
        assert(capture.requests.at(-1).toolResultCount >= unique.length, 'tool results must accumulate');
      }
      for (const read of capture.reads) {
        assert(capture.requests.some(request => request.sequence > read.requestSequence && request.toolResults.some(result =>
          result.toolCallId === (api === 'openai-responses' ? read.toolCallId.split('|')[0] : read.toolCallId) && result.sha256 === read.sha256 && result.bytes === read.bytes)), 'real tool result must reach subsequent provider body unchanged');
      }
      if (reread) assert(capture.reads.filter(read => read.path === selected && read.offset === 1).length === 2, 'forced reread must actually execute');
      if (custom) assert.equal(customReadCalls, capture.reads.length, 'caller-supplied native SDK tool definition was not used');
      if (resume) {
        provider.actions.push({ text: 'Synthetic compaction summary: selected context must be refreshed.' });
        let off, timer;
        const compacted = new Promise((resolve, reject) => {
          off = handle.session.subscribe(event => { if (event.type === 'compaction_end') resolve(event); });
          timer = setTimeout(() => reject(new Error('compaction_end timeout')), 30000);
        });
        try { await Promise.all([compacted, handle.session.compact('Keep only the synthetic phase and the need to re-read selected context.')]); }
        finally { clearTimeout(timer); off(); }
        assert(capture.events.some(event => event.type === 'session_compact'), 'actual compact event required');
        const manager = handle.session.sessionManager;
        await handle.close();
        handle = await createCapturedSession({ ...options, sessionManager: manager });
        lifecycles.push(handle.receipt);
        provider.actions.push({ read: { path: selected, offset: 1, limit: 150 } }, { text: 'OFFLINE_RESUMED' });
        await handle.prompt('Resume; refresh the selected command before proceeding.');
        capture.assertComplete();
        assert.equal(capture.reads.at(-1).path, selected);
        assert(capture.requests.at(-1).toolResults.some(result => result.sha256 === capture.reads.at(-1).sha256), 'resumed read did not reach wire');
      }
      assert.equal(provider.consumed, provider.actions.length, 'all scripted requests consumed exactly once');
      assert.deepEqual(provider.errors, []);
      assert.deepEqual(network.attempts, [], 'unexpected external network attempt');
      if (networkControl) {
        await assert.rejects(async () => fetch('https://example.invalid/forbidden'), /offline network boundary/);
        const socket = new net.Socket();
        try { assert.throws(() => socket.connect({ host: '203.0.113.1', port: 443 }), /offline network boundary/); }
        finally { socket.destroy(); }
        assert.equal(network.attempts.length, 2);
        rejections.push({ id: 'external-network', verified: true, externalRequestsSent: 0, attempts: network.attempts });
      }
      if (hookOnly) {
        const hookCapture = createCapture();
        // A second observer on the same actual session demonstrates honest hook-only receipts.
        const handler = handle.loader.getExtensions().extensions.at(-1).handlers.get('before_provider_request')[0];
        let hook;
        hookCapture.extension({ on(type, callback) { if (type === 'before_provider_request') hook = callback; } });
        handle.loader.getExtensions().extensions.at(-1).handlers.set('before_provider_request', [async event => { await handler(event); await hook(event); }]);
        provider.actions.push({ text: 'OFFLINE_HOOK_ONLY_PROTOCOL_CHECK' });
        await handle.prompt('Observe this offline request through both recorders.');
        hookCapture.assertComplete({ wire: false });
        assert.equal(hookCapture.requests.length, 1);
        assert.equal(hookCapture.requests[0].observedAt, 'hook');
        assert.equal(hookCapture.requests[0].wire, undefined);
        assert.throws(() => hookCapture.assertComplete(), /missing wire receipt/);
        capture.assertComplete();
        rejections.push({ id: 'hook-only-not-wire-proof', verified: true, request: hookCapture.requests[0], liveCalls: 0 });
      }
      const lastExtension = handle.receipt.extensions.at(-1);
      assert.equal(lastExtension.path, '<inline:skill-loading-capture>', 'recorder must be last extension');
      results.push(Object.assign(handle.receipt, { id, fixtureId, command, layer: 'scripted installed runtime, not autonomous model quality',
        phase: phase ? 'start-to-review' : null, visibleFixtureFiles: sourceFiles, customReadCalls }));
    } finally {
      try { if (handle) await handle.close(); }
      finally {
        providerCleanup = await provider.close(); network.restore();
        await rm(cwd, { recursive: true, force: true });
        await save(`${id}-cleanup.json`, { sessions: lifecycles.map(receipt => ({ settled: receipt.settled, ...receipt.cleanup })), ...providerCleanup, tempRemoved: !existsSync(cwd) });
        await save('requests.json', { runtime: runtime.identity, fixtureManifestSha256: sha256(manifestBytes), results,
          currentAttempt: { id, extensions: handle?.receipt.extensions, requests: capture.requests, reads: capture.reads, events: capture.events, errors: capture.errors } });
      }
    }
    console.log(`PASS ${id}: ${capture.requests.length} requests, ${capture.reads.length} actual reads`);
  }
  async function sourceDiscovery(fixtureId, api) {
    const { prepareSandbox, createFixtureTools } = await import('./eval-skill-loading.mjs');
    const { sourceSnapshot } = await import('../evals/skill-loading/fixtures/status/oracle.mjs');
    const id = `discovery-${fixtureId}-${api}`, parent = path.join(home, id); await mkdir(parent);
    const sandbox = prepareSandbox({ candidateSource: root }, { fixtureId, variant: 'candidate' }, parent);
    const capture = createCapture({ root: sandbox.workspace });
    const state = createFixtureTools({ slot: { fixtureId }, sandbox, directory: parent, capture });
    const prompt = await readFile(path.join(fixtureRoot, 'fixtures', fixtureId, 'prompt.md'), 'utf8');
    const directories = prompt.match(/\b(before)\/(after)\b/).slice(1);
    const reason = 'Discover and read the public review inputs';
    const provider = await startOfflineProvider({ capture, api, actions: [
      ...['context.md', ...directories].map(path => ({ read: { path, reason } })), { text: 'OFFLINE_DISCOVERY_DONE' },
    ] });
    const network = guardOfflineNetwork(provider.baseUrl), listings = [], sources = [];
    let handle;
    try {
      const agentDir = path.join(home, 'agent');
      const authStorage = await createIsolatedAuthStorage({ runtime, cwd: sandbox.workspace, agentDir: path.join(parent, 'auth'),
        credentials: { [provider.model.provider]: { type: 'api_key', key: 'offline-dummy-not-a-credential' } } });
      handle = await createCapturedSession({ runtime, cwd: sandbox.workspace, agentDir, model: provider.model, authStorage, capture,
        tools: state.tools.map(tool => tool.name), customTools: state.tools,
        extensionFactories: [{ name: 'scripted-public-discovery', factory(pi) {
          pi.on('tool_execution_end', event => {
            assert.equal(event.isError, false, 'public read failed through installed SDK');
            if (event.result.details?.type === 'directory') {
              const listing = JSON.parse(event.result.content[0].text);
              assert.deepEqual(listing.paths, [...new Set(listing.paths)].sort());
              listings.push(listing);
              // Filenames enter the script only after the actual advertised tool returns them.
              provider.actions.splice(provider.actions.length - 1, 0, ...listing.paths.map(path => ({ read: { path, reason } })));
              sources.push(...listing.paths);
            }
          });
        } }],
      });
      await handle.prompt(prompt); capture.assertComplete();
      assert.equal(listings.length, directories.length);
      assert.deepEqual(sources.slice().sort(), Object.keys(sandbox.before).filter(file => /^(before|after)\//.test(file)).sort());
      assert.equal(capture.reads.length, 1 + directories.length + sources.length);
      for (const read of capture.reads) {
        assert(!read.isError);
        if (sources.includes(read.path)) assert.equal(read.sha256, sandbox.before[read.path], 'source bytes changed at SDK boundary');
        assert(capture.requests.some(request => request.sequence > read.requestSequence && request.toolResults.some(result =>
          result.toolCallId === (api === 'openai-responses' ? read.toolCallId.split('|')[0] : read.toolCallId) &&
          result.sha256 === read.sha256 && result.bytes === read.bytes)), 'directory/file result missing from actual subsequent wire body');
      }
      assert(state.actions.every(action => action.kind === 'read' && action.status === 'success'));
      assert.deepEqual(sourceSnapshot(sandbox.workspace), sandbox.before);
      assert.deepEqual(network.attempts, []); assert.deepEqual(provider.errors, []);
      assert.equal(provider.consumed, provider.actions.length);
      assert(!JSON.stringify(listings).match(/oracle|solution|evidence/));
      await save(`${id}.json`, { layer: 'installed public SDK and loopback wire, not autonomous model quality', modelCalls: 0,
        listings, sources, actions: state.actions, contextManifest: state.contextManifest, requests: capture.requests, reads: capture.reads, sourceUnchanged: true });
      results.push({ id, fixtureId, layer: 'scripted installed runtime, not autonomous model quality' });
      console.log(`PASS ${id}: ${listings.length} directories, ${sources.length} exact source reads delivered to wire`);
    } finally {
      try { if (handle) await handle.close(); }
      finally {
        const closed = await provider.close(); network.restore(); await rm(parent, { recursive: true, force: true });
        await save(`${id}-cleanup.json`, { ...closed, session: handle?.receipt.cleanup, tempRemoved: !existsSync(parent) });
      }
    }
  }
  for (const fixtureId of ['internal-review', 'public-body-review'])
    for (const api of ['openai-completions', 'openai-responses']) await sourceDiscovery(fixtureId, api);
  for (const fixture of manifest.fixtures) await scenario(fixture.id, { fixtureId: fixture.id, command: fixture.id === 'status' ? 'status' : ['backend', 'ui'].includes(fixture.id) ? 'start' : 'review',
    extra: fixture.id === 'ui' ? ['frontend-design-gate.md'] : [] });
  await scenario('phase-transition', { fixtureId: 'backend', command: 'start', phase: true });
  await scenario('custom-native-tool', { custom: true });
  await scenario('responses-native-loop', { api: 'openai-responses' });
  await scenario('hook-wire-mismatch', { mismatch: true });
  await scenario('network-boundary', { networkControl: true });
  await scenario('hook-only-protocol', { hookOnly: true });
  const unsupported = path.join(home, 'unsupported-dist');
  await mkdir(unsupported);
  await writeFile(path.join(unsupported, 'index.js'), 'export {};\n');
  try {
    await assert.rejects(loadInstalledRuntime({ runtimeDist: unsupported, pluginPath: values['plugin-path'] }), /unresolved: installed SDK lacks/);
    rejections.push({ id: 'unsupported-sdk', verified: true });
  } finally { await rm(unsupported, { recursive: true, force: true }); }
  for (const [id, options] of Object.entries({ 'missing-selected': { missing: true }, 'unknown-command': { unknown: true },
    'duplicate-invocation': { duplicate: true }, 'forced-reread': { reread: true }, 'compact-resume': { resume: true }, 'cancel': { cancel: true } })) {
    await scenario(id, options); rejections.push({ id, verified: true });
  }
  await save('rejections.json', rejections);
  await save('done.json', { task: 11, status: 'verified', modelCalls: 0, layer: 'scripted-runtime-offline', runtime: runtime.identity,
    fixtureManifestSha256: sha256(manifestBytes), scenarios: results.map(result => result.id), timestamp: new Date().toISOString() });
}

try {
  if (values.mode === 'portable') {
    assert.deepEqual(Object.keys(values), ['mode'], 'portable mode takes only --mode portable');
    const summaries = protocolChecks();
    console.log(`PASS portable capture protocol: ${summaries.length} layouts; read summaries, sentinels, hook/wire equality and rejection`);
  } else {
    assert(values['runtime-dist'] && values['plugin-path'] && values.output, 'required: --runtime-dist --plugin-path --mode offline --output');
    assert(Number(process.versions.node.split('.')[0]) >= 24, 'unresolved: offline integration requires Node 24 or newer');
    output = path.resolve(values.output);
    await mkdir(output, { recursive: true });
    if (values['child-home']) await run(); else await isolatedChild();
  }
}
catch (error) { console.error(error); process.exitCode = 1; }
