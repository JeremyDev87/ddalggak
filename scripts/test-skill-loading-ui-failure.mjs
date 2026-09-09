import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Server } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkUi } from '../evals/skill-loading/fixtures/ui/browser-check.mjs';
import { closeServer } from '../evals/skill-loading/fixtures/backend/server.mjs';
import { artifact, controls, digest, readArtifact, requiredReads, sourceTree, toolNames } from './skill-loading/run-config.mjs';
import { checkToolActions } from './skill-loading/quality-report.mjs';

const args = process.argv.slice(2), option = name => args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const mode = option('--mode') ?? 'portable', red = args.includes('--red');
assert(['portable', 'browser'].includes(mode));
const output = option('--evidence') && path.resolve(option('--evidence'));
const save = (name, value) => output && writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
if (!args.includes('--child')) {
  if (output) mkdirSync(output, { recursive: true });
  const home = realpathSync(mkdtempSync(path.join(tmpdir(), 'a21-checker-')));
  let code;
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args, '--child'], {
      env: { PATH: process.env.PATH, HOME: home, TMPDIR: home, MAC_CHROMIUM_TMPDIR: home, LANG: 'en_US.UTF-8', DO_NOT_TRACK: '1' }, stdio: 'inherit', detached: true,
    });
    try { [code] = await once(child, 'close', { signal: AbortSignal.timeout(180000) }); }
    catch (error) {
      const closed = once(child, 'close', { signal: AbortSignal.timeout(10000) });
      process.kill(-child.pid, 'SIGKILL'); await closed; throw error;
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
    save('process-cleanup.json', { exitCode: code, homeRemoved: !existsSync(home) });
  }
  process.exitCode = code ?? 1;
} else {
  const source = readFileSync(new URL('../evals/skill-loading/fixtures/ui/solution/index.html', import.meta.url), 'utf8');
  const sentinel = 'A21_PRIVATE_SENTINEL';
  const originalListen = Server.prototype.listen;
  let own, browser;
  const failures = [], results = [];
  Server.prototype.listen = function (...params) {
    own.server = this;
    this.on('submission', () => own.submissions++);
    return originalListen.apply(this, params);
  };
  try {
    if (mode === 'browser') {
      assert(option('--browser-module'), 'browser mode requires an existing module');
      const { chromium } = await import(pathToFileURL(path.resolve(option('--browser-module'))));
      browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-component-update'] });
    }
    const scenarios = args.includes('--integration-only') || args.includes('--final-json-only') ? [] : mode === 'portable' ? ['context-create-failure'] : [
      'missing-loading-state', 'missing-submission', 'context-create-failure', 'route-failure', 'context-close-failure',
      ...red ? [] : ['required', 'runtime', 'network', 'png', 'screenshot-failure', 'capture-focus-failure', 'forged', 'inherited-forgery', 'private-state', 'sample-failure', 'sample-timeout', 'close-after-success', 'success'],
    ];
    for (const scenario of scenarios) {
      const directory = path.join(output ?? process.env.HOME, scenario); mkdirSync(directory);
      let html = source;
      if (scenario === 'missing-loading-state') html = source.replace("show('loading', 'Submitting...');", "show('idle', 'Submitting...');");
      if (scenario === 'missing-submission') html = source.replace("show('loading', 'Submitting...');", "show('loading', 'Submitting...'); return;");
      if (['context-close-failure', 'required', 'runtime', 'network', 'sample-failure', 'sample-timeout'].includes(scenario)) html = source.replace(' required autocomplete', ' autocomplete');
      if (scenario === 'runtime') html += `<script>throw Error('503 ${sentinel}')</script>`;
      if (scenario === 'network') html += `<img src="https://${sentinel}.invalid/private" alt="">`;
      if (scenario === 'private-state') html = source.replace('data-state="idle"', `data-state="${sentinel}"`).replace('<body>', `<body id="${sentinel}">`);
      const sourceRef = artifact(directory, 'source-index.html', html);
      own = { submissions: 0, contextClosed: false };
      const injected = Object.assign(Error(sentinel), { fixtureFailure: { category: 'verification', code: 'ui-behavior-mismatch' }, uiFailure: { forged: sentinel } });
      if (scenario === 'inherited-forgery') {
        delete injected.fixtureFailure; delete injected.uiFailure;
        Object.setPrototypeOf(injected, Object.assign(Object.create(Error.prototype), { fixtureFailure: { category: 'verification', code: 'ui-behavior-mismatch' }, uiFailure: { forged: sentinel } }));
      }
      const surface = { async newContext() {
        if (scenario === 'context-create-failure') throw injected;
        const context = await browser.newContext(); own.context = context; own.close = context.close.bind(context);
        context.once('close', () => { own.contextClosed = true; });
        if (scenario === 'route-failure') context.route = async () => { throw injected; };
        if (['context-close-failure', 'close-after-success'].includes(scenario)) context.close = async () => { throw injected; };
        const newPage = context.newPage.bind(context);
        context.newPage = async () => {
          const page = await newPage();
          const evaluate = page.evaluate.bind(page), screenshot = page.screenshot.bind(page);
          if (['forged', 'inherited-forgery'].includes(scenario)) page.goto = async () => { throw injected; };
          if (scenario === 'sample-failure') page.evaluate = (fn, arg) => fn.toString().includes('buttonDisabled') ? Promise.reject(injected) : evaluate(fn, arg);
          if (scenario === 'sample-timeout') page.evaluate = (fn, arg) => fn.toString().includes('buttonDisabled') ? new Promise(() => {}) : evaluate(fn, arg);
          if (scenario === 'capture-focus-failure') page.evaluate = (fn, arg) => fn.toString().includes('document.activeElement.id') ? Promise.reject(injected) : evaluate(fn, arg);
          if (scenario === 'private-state') page.keyboard.press = async () => { throw injected; };
          if (scenario === 'png') page.screenshot = async options => { await screenshot(options); const bytes = readFileSync(options.path); bytes[0] = 0; writeFileSync(options.path, bytes); };
          if (scenario === 'screenshot-failure') page.screenshot = async options => { await screenshot(options); throw injected; };
          return page;
        };
        return context;
      } };
      let error, receipt;
      try { receipt = await checkUi(surface, path.join(directory, sourceRef.path), { evidenceDir: directory, ...scenario === 'success' ? {} : { widths: [375] } }); }
      catch (caught) { error = caught; }
      const beforeRescue = { serverClosed: !own.server.listening, contextAcquired: !!own.context, contextClosed: own.contextClosed };
      const evidence = { scenario, source: sourceRef, beforeRescue, submissions: own.submissions, receipt: error?.uiFailure ?? receipt ?? null,
        pngs: readdirSync(directory).filter(name => name.endsWith('.png')).map(name => ({ path: name, sha256: digest(readFileSync(path.join(directory, name))) })) };
      try {
        if (scenario === 'success') {
          assert.ifError(error);
          assert.deepEqual(Object.keys(receipt).sort(), ['contextClosed', 'externalRequests', 'faults', 'receipts', 'serverClosed']);
          assert.deepEqual(receipt.receipts.map(({ width, state }) => [width, state]), [375, 768, 1280].flatMap(width => ['idle', 'invalid', 'loading-success', 'success', 'loading-error', 'error', 'loading-retry-success', 'retry-success'].map(state => [width, state])));
          assert.equal(receipt.receipts.length, 24);
        } else {
          assert(error, 'counterexample must fail');
          const partial = error.uiFailure;
          assert(partial && !partial.forged, 'missing checker-owned partial failure receipt');
          assert(!JSON.stringify(partial).includes(sentinel), 'private guest values escaped into receipt');
          assert.equal(partial.cleanup.server.closed, true);
          assert.equal(partial.cleanup.context.acquired, !!own.context);
          assert.equal(partial.cleanup.context.closed, own.context ? !['context-close-failure', 'close-after-success'].includes(scenario) : null);
          const operation = { 'missing-loading-state': 'await-loading', 'missing-submission': 'await-submission', 'context-create-failure': 'create-context', 'route-failure': 'route-context', 'context-close-failure': 'required-attribute', required: 'required-attribute', png: 'validate-png-signature', 'screenshot-failure': 'capture-screenshot', 'capture-focus-failure': 'capture-focus', forged: 'navigate', 'inherited-forgery': 'navigate', 'private-state': 'tab-name', 'close-after-success': 'close-context' }[scenario];
          if (operation) assert.equal(partial.failure.operation, operation);
          if (scenario.startsWith('missing-')) {
            assert.equal(partial.receipts.length, 2); assert.equal(evidence.pngs.length, 2);
            assert.deepEqual(partial.failure.viewport, { width: 375, height: 720 });
            assert.equal(partial.failure.state, 'loading-success'); assert.equal(partial.failure.expectedState, 'loading');
            assert.equal(partial.observed.status, scenario === 'missing-loading-state' ? 'idle' : 'loading');
            assert.equal(partial.observed.focus, 'name'); assert.equal(partial.observed.buttonDisabled, true);
            assert.equal(partial.observed.submissionObserved, scenario === 'missing-loading-state');
          }
          if (scenario === 'context-close-failure') {
            assert(error instanceof assert.AssertionError, 'cleanup replaced primary assertion');
            assert.equal(partial.primaryFailure.category, 'verification');
            assert.deepEqual(partial.cleanup.failures.map(item => item.operation), ['close-context']);
          }
          if (['context-create-failure', 'route-failure', 'forged', 'inherited-forgery', 'private-state', 'screenshot-failure', 'capture-focus-failure', 'close-after-success'].includes(scenario)) assert.equal(error, injected, 'primary object identity changed');
          if (scenario === 'png') { assert(partial.pendingCapture.screenshot); assert.equal(partial.pendingCapture.validity, 'invalid'); }
          if (['screenshot-failure', 'capture-focus-failure'].includes(scenario)) { assert(partial.pendingCapture.screenshot); assert.equal(partial.pendingCapture.validity, scenario === 'screenshot-failure' ? 'unavailable' : 'valid'); }
          if (['sample-failure', 'sample-timeout'].includes(scenario)) { assert.equal(partial.observed.availability, 'unavailable'); assert.equal(partial.observed.failure.operation, 'sample-failure-state'); }
          assert.equal(partial.faults.pageErrors, scenario === 'runtime' ? 1 : 0);
          assert.equal(partial.faults.externalRequests, scenario === 'network' ? 1 : 0);
          const actions = [{ id: 'failed', kind: 'verify', status: 'failure', failure: error.fixtureFailure ?? partial.failure }, { id: 'later', kind: 'verify', status: 'success' }];
          if (['required', 'sample-failure', 'sample-timeout'].includes(scenario)) { assert.equal(error.fixtureFailure.category, 'verification'); checkToolActions(actions); }
          else { assert.equal(error.fixtureFailure, undefined); assert.equal(partial.failure.category, 'execution'); assert.throws(() => checkToolActions(actions)); }
        }
        assert.equal(beforeRescue.serverClosed, true, 'checker leaked owned server');
        if (own.context && !['context-close-failure', 'close-after-success'].includes(scenario)) assert.equal(beforeRescue.contextClosed, true);
        if (browser) assert(browser.isConnected(), 'checker closed caller-owned browser');
        // QA binds immutable source + produced files; runner attachment is deliberately not implemented here.
        if (mode === 'browser') {
          const { copyResultArtifacts } = await import('./eval-skill-loading.mjs');
          const bound = structuredClone(evidence.receipt);
          for (const capture of [...bound.receipts, ...bound.pendingCapture?.screenshot ? [bound.pendingCapture] : []]) {
            if (capture.screenshot) capture.screenshot = { path: path.basename(capture.screenshot), sha256: digest(readFileSync(capture.screenshot)) };
          }
          const ref = artifact(directory, 'qa-bound-receipt.json', { source: sourceRef, receipt: bound });
          const copied = path.join(directory, 'closure'); copyResultArtifacts({ evidence: ref }, directory, copied);
          assert.equal(readArtifact(copied, sourceRef, false).toString(), html);
          for (const file of evidence.pngs) assert.equal(digest(readArtifact(copied, file, false)), file.sha256);
        }
      } catch (failure) { failures.push(`${scenario}: ${failure.message}`); }
      finally {
        // Rescue only this case's deliberately unclosable real handles, after evidence is frozen.
        if (own.context && !own.contextClosed) await own.close();
        if (own.server.listening) await closeServer(own.server);
        if (error?.uiFailure?.cleanup) assert.equal(error.uiFailure.cleanup.context.closed, beforeRescue.contextAcquired ? beforeRescue.contextClosed : null, 'later caller cleanup rewrote failed-call closure evidence');
        evidence.afterRescue = { serverClosed: !own.server.listening, contextClosed: own.context ? own.contextClosed : null };
        save(`${scenario}.json`, evidence); results.push(evidence);
        console.log(JSON.stringify({ scenario, beforeRescue, checkerReceipt: !!error?.uiFailure && !error.uiFailure.forged, pngs: evidence.pngs.length }));
      }
    }
    if (mode === 'browser' && !red && !args.includes('--integration-only') && !args.includes('--final-json-only')) {
      const directory = path.join(output ?? process.env.HOME, 'cli'); mkdirSync(directory);
      const child = spawn(process.execPath, [fileURLToPath(new URL('../evals/skill-loading/fixtures/ui/browser-check.mjs', import.meta.url)),
        '--browser-module', option('--browser-module'), '--evidence', directory, '--html', path.join(output ?? process.env.HOME, 'missing-loading-state/source-index.html')], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
      const [code] = await once(child, 'close', { signal: AbortSignal.timeout(30000) });
      assert.notEqual(code, 0); assert(stderr.length > 0, 'CLI did not rethrow');
      const receipt = JSON.parse(readFileSync(path.join(directory, 'task-5-ui-actions.json')));
      const cleanup = JSON.parse(readFileSync(path.join(directory, 'task-5-ui-cleanup.json')));
      assert.equal(receipt.failure.operation, 'await-loading'); assert.equal(receipt.receipts.length, 2);
      assert.equal(cleanup.browserClosed, true); assert.equal(cleanup.serverClosed, true); assert.equal(cleanup.contextClosed, true);
      save('cli.json', { exitCode: code, receipt, cleanup });
    }
    if (mode === 'browser' && (!red || args.includes('--integration-only')) && !args.includes('--final-json-only')) {
      const { confineBrowser, copyResultArtifacts, runReservedSession } = await import('./eval-skill-loading.mjs');
      const root = fileURLToPath(new URL('../', import.meta.url));
      // Scripted createSession seam, not an SDK session or model result. Real tools, HTTP, Chrome and persistence.
      for (const [index, scenario] of ['failed-session', 'required-recovery', 'fatal-history', 'persist-failure', 'png-persist-failure', 'success-png-persist-failure'].entries()) {
        const directory = path.join(output ?? process.env.HOME, `runner-${scenario}`); mkdirSync(directory);
        const slot = { ordinal: index + 1, fixtureId: 'ui', variant: 'candidate' };
        const broken = scenario === 'success-png-persist-failure' ? source.replace('data-state="idle"', `data-state="${sentinel}"`).replace('<body>', `<body id="${sentinel}">`) :
          ['failed-session', 'png-persist-failure'].includes(scenario) ? source.replace("show('loading', 'Submitting...');", "show('idle', 'Submitting...');") :
          scenario === 'fatal-history' ? source.replace("show('loading', 'Submitting...');", "show('loading', 'Submitting...'); return;") : source.replace(' required autocomplete', ' autocomplete');
        let workspace, primary, first = true, failedSubmit, completed;
        own = { submissions: 0, contextClosed: false };
        const secure = confineBrowser(browser);
        const surface = { async newContext() {
          // Change the caller's mutable source after snapshot but before HTTP acquisition consumes it.
          if (first && scenario === 'required-recovery') writeFileSync(path.join(workspace, 'index.html'), source);
          const blockPng = first && ['png-persist-failure', 'success-png-persist-failure'].includes(scenario);
          first = false;
          const context = await secure.newContext(); own.context = context; own.close = context.close.bind(context); own.contextClosed = false;
          if (blockPng) {
            const newPage = context.newPage.bind(context);
            context.newPage = async () => {
              const page = await newPage(), screenshot = page.screenshot.bind(page);
              page.screenshot = async options => { await screenshot(options); if (options.path.endsWith('-375-idle.png')) mkdirSync(path.join(path.dirname(options.path), '375-idle.png')); };
              return page;
            };
          }
          context.once('close', () => { own.contextClosed = true; }); return context;
        } };
        const result = await runReservedSession({ config: { runId: 'a21-scripted', candidateSource: root, modelId: 'scripted/no-provider', reasoning: 'none' },
          slot, attempted: { ...slot, attempted: true, attempt: 1 }, identity: { sourceTree: sourceTree(root) }, output: directory, browser: surface,
          model: { provider: 'scripted', id: 'no-provider' }, async createSession({ cwd, customTools, capture, model }) {
            workspace = cwd;
            const hooks = new Map(); capture.extension({ on: (name, callback) => hooks.set(name, callback) });
            const session = { sessionId: `scripted-${scenario}`, model, thinkingLevel: 'none', agent: { transport: controls.transport }, messages: [],
              getActiveToolNames: () => toolNames.slice(), settingsManager: { getTransport: () => controls.transport, getRetryEnabled: () => false,
                getRetrySettings: () => ({ maxRetries: 0 }), getRetryFallbackSettings: () => ({ modelFallback: false }),
                getProviderRetrySettings: () => ({ maxRetries: 0 }), getCompactionEnabled: () => false } };
            let sequence = 0;
            const execute = async (name, args) => {
              const id = `scripted-${++sequence}`;
              hooks.get('tool_execution_start')({ toolName: name, toolCallId: id, args });
              const result = await customTools.find(tool => tool.name === name).execute(id, args);
              hooks.get('tool_execution_end')({ toolCallId: id, result, isError: false }); return result;
            };
            return { session, receipt: { usage: { unavailable: 'scripted seam; no provider' } }, async close() { return { aborted: true, shutdown: true, disposed: true }; }, async prompt() {
              hooks.get('before_provider_request')({ payload: { messages: [{ role: 'user', content: 'scripted seam; no provider request sent' }] } });
              for (const file of requiredReads({ candidateSource: root }, slot)) await execute('read', { path: file, reason: 'scripted authority check' });
              await execute('write', { path: 'index.html', content: broken });
              if (scenario === 'persist-failure') mkdirSync(path.join(directory, `${slot.ordinal}-ui-candidate`, `verification-action-${sequence + 1}.json`));
              try { await execute('verify', {}); } catch (error) { primary = error; }
              assert(primary, 'first verification must use the broken attempt source');
              if (scenario === 'failed-session') {
                failedSubmit = JSON.parse((await execute('submit', { observation: {} })).content[0].text);
                throw primary;
              }
              await execute('write', { path: 'index.html', content: source });
              completed = JSON.parse((await execute('verify', {})).content[0].text);
              await execute('submit', { observation: { claims: [{ checkId: completed.submissionContract.allowedClaimIds[0], actionId: completed.actionId }] } });
            } };
          } });
        try {
          const record = readArtifact(directory, result.receipt), verification = readArtifact(directory, result.verification);
          const failed = record.actions.find(action => action.kind === 'verify' && action.status === 'failure');
          assert(failed.source && failed.evidence, 'runner discarded failed attempt source/evidence');
          const partial = failed.evidence.path ? readArtifact(directory, failed.evidence) : failed.evidence;
          assert.equal(readArtifact(directory, failed.source, false).toString(), broken);
          assert.deepEqual(partial.source, failed.source);
          assert.equal(partial.cleanup?.server.closed ?? partial.serverClosed, true); assert.equal(partial.cleanup?.context.closed ?? partial.contextClosed, true);
          assert(!JSON.stringify(partial).includes(sentinel), 'successful-capture DOM leaked through persistence failure');
          assert.equal(record.cleanup.sandboxRemoved, true); assert.equal(existsSync(workspace), false);
          if (scenario === 'failed-session') { assert.equal(result.status, 'unresolved'); assert.equal(failedSubmit.verificationActionId, null); assert.equal(partial.receipts.length, 2); }
          else {
            assert.equal(result.status, 'complete'); assert.equal(completed.observations.receipts.length, 24);
            const success = record.actions.find(action => action.kind === 'verify' && action.status === 'success');
            assert.equal(readArtifact(directory, success.source, false).toString(), source);
            assert.notEqual(failed.source.sha256, success.source.sha256);
            assert(verification.checks.every(check => check.actionId === success.id));
          }
          assert(verification.checks.every(check => check.status === (scenario === 'required-recovery' ? 'pass' : 'fail')));
          assert.equal(failed.failure.category, scenario === 'required-recovery' ? 'verification' : 'execution');
          if (scenario === 'persist-failure') {
            assert.equal(primary.cause.uiFailure.primaryFailure.operation, 'required-attribute');
            assert.equal(partial.unavailable.operation, 'persist-ui-failure');
            assert.equal(partial.primaryFailure.category, 'verification');
          }
          if (scenario === 'png-persist-failure') {
            assert.equal(primary.cause.uiFailure.primaryFailure.operation, 'await-loading');
            assert.equal(partial.persistenceFailures[0].operation, 'persist-screenshot');
            assert.equal(partial.receipts[0].screenshot, null); assert(partial.receipts[1].screenshot.sha256);
          }
          if (scenario === 'success-png-persist-failure') { assert.equal(partial.primaryFailure.operation, 'persist-screenshot'); assert.equal(partial.receipts.length, 24); }
          const copied = path.join(directory, 'copied'); copyResultArtifacts({ result }, directory, copied);
          const validate = value => {
            if (Array.isArray(value)) value.forEach(validate);
            else if (value && typeof value === 'object') {
              if (Object.keys(value).length === 2 && value.path && value.sha256) { const bytes = readArtifact(copied, value, false); if (value.path.endsWith('.json')) validate(JSON.parse(bytes)); }
              else Object.values(value).forEach(validate);
            }
          };
          validate(result);
          save(`runner-${scenario}.json`, { seam: 'scripted createSession; real browser/tools/runReservedSession/copyResultArtifacts; no SDK/model/provider', result, failed, partial,
            cleanup: { sandboxRemoved: !existsSync(workspace), contextClosed: own.contextClosed, serverClosed: !own.server.listening } });
        } catch (error) { failures.push(`runner-${scenario}: ${error.message}`); }
        console.log(JSON.stringify({ scenario: `runner-${scenario}`, status: result.status, primaryReceipt: !!primary?.cause?.uiFailure, sandboxRemoved: !existsSync(workspace) }));
      }
    }
    if (mode === 'browser' && (!red || args.includes('--final-json-only'))) {
      const { createFixtureTools, confineBrowser, copyResultArtifacts } = await import('./eval-skill-loading.mjs');
      for (const privateDom of [false, true]) {
        const name = `final-json-${privateDom ? 'private' : 'clean'}`, directory = path.join(output ?? process.env.HOME, name);
        const workspace = path.join(process.env.HOME, name); mkdirSync(workspace); mkdirSync(directory);
        const html = privateDom ? source.replace('data-state="idle"', `data-state="${sentinel}"`).replace('<body>', `<body id="${sentinel}">`) : source;
        writeFileSync(path.join(workspace, 'index.html'), html);
        mkdirSync(path.join(directory, 'verification-action-1.json')); // Only final JSON is blocked; all 24 PNG saves succeed.
        writeFileSync(path.join(directory, 'private.txt'), sentinel);
        own = { submissions: 0, contextClosed: false };
        const secure = confineBrowser(browser), surface = { async newContext() {
          const context = await secure.newContext(); own.context = context; own.close = context.close.bind(context);
          context.once('close', () => { own.contextClosed = true; }); return context;
        } };
        const state = createFixtureTools({ config: {}, slot: { fixtureId: 'ui' }, sandbox: { workspace }, directory, browser: surface, capture: { requests: [], reads: [] } });
        let error;
        try { await state.tools.find(tool => tool.name === 'verify').execute('verify-1', {}); } catch (caught) { error = caught; }
        const action = state.actions[0], pngs = readdirSync(path.join(directory, 'browser-1')).filter(file => file.endsWith('.png'));
        for (const file of pngs) {
          const bytes = readFileSync(path.join(directory, 'browser-1', file));
          assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
          assert.equal(bytes.readUInt32BE(16), Number(file.split('-')[0])); assert.equal(bytes.readUInt32BE(20), 720);
        }
        const submitted = JSON.parse((await state.tools.find(tool => tool.name === 'submit').execute('submit-2', { observation: {} })).content[0].text);
        rmSync(workspace, { recursive: true });
        const copied = path.join(directory, 'copied'); copyResultArtifacts({ actions: state.actions }, directory, copied);
        const copiedPngs = readdirSync(copied, { recursive: true }).filter(file => file.endsWith('.png'));
        const evidence = { action, producedValidPngs: pngs.length, copiedPngs: copiedPngs.length, submitted,
          workspaceRemoved: !existsSync(workspace), contextClosed: own.contextClosed, serverClosed: !own.server.listening, neighborCopied: existsSync(path.join(copied, 'private.txt')) };
        save(`${name}.json`, evidence); console.log(JSON.stringify({ scenario: name, ...evidence, action: undefined }));
        try {
          assert(error); assert.equal(pngs.length, 24); assert.equal(submitted.verificationActionId, null);
          assert.equal(action.status, 'failure'); assert.equal(action.failure.category, 'execution');
          assert.equal(copiedPngs.length, 24, 'final JSON failure discarded already-hashed PNG refs');
          assert.equal(action.evidence.unavailable.operation, 'persist-verification');
          assert.equal(action.evidence.failure.category, 'execution'); assert.equal(action.evidence.receipts.length, 24);
          assert.equal(action.evidence.contextClosed, true); assert.equal(action.evidence.serverClosed, true);
          assert(['EEXIST', 'EISDIR'].includes(error.cause?.code), 'original persistence error lost');
          assert(!JSON.stringify(action.evidence).includes(sentinel));
          assert.equal(readArtifact(copied, action.source, false).toString(), html);
          for (const capture of action.evidence.receipts) readArtifact(copied, capture.screenshot, false);
          assert.equal(evidence.neighborCopied, false); assert.equal(evidence.contextClosed, true); assert.equal(evidence.serverClosed, true);
          assert.throws(() => checkToolActions([...state.actions, { id: 'later', kind: 'verify', status: 'success' }]));
        } catch (failure) { failures.push(`${name}: ${failure.message}`); }
      }
    }
  } finally {
    Server.prototype.listen = originalListen;
    if (own?.context && !own.contextClosed) await own.close();
    if (own?.server?.listening) await closeServer(own.server);
    if (browser) await browser.close();
    save('browser-cleanup.json', { browserClosed: browser ? !browser.isConnected() : null, contextsRemaining: browser?.contexts().length ?? 0, cases: results.length, failures });
  }
  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`[test:skill-loading-ui-failure:${mode}] passed`);
}
