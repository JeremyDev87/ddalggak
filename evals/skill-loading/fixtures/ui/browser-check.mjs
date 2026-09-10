import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { startUiServer } from "./server.mjs";

// Subscribe synchronously inside the browser before the action. No polling/sleeps.
async function armState(page, state) {
  await page.evaluate(state => {
    const status = document.querySelector('[role=status]');
    window.stateSignal = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error(`state timeout: ${state}`)); }, 5000);
      const observer = new MutationObserver(() => {
        if (status.dataset.state === state) { clearTimeout(timer); observer.disconnect(); resolve(); }
      });
      observer.observe(status, { attributes: true, childList: true });
    });
    // The observer stays armed between protocol calls without unhandled rejection.
    window.stateSignal.catch(() => {});
  }, state);
}

// The caller owns the browser and immutable source binding. This checker does not snapshot htmlPath.
export async function checkUi(browser, htmlPath, { evidenceDir, widths = [375, 768, 1280] } = {}) {
  const receipts = [];
  const faults = [];
  const externalRequests = [];
  let app, context, page, failure, trustedFailure, primaryFailure, submissionWait;
  let operation = 'start-server', viewport = null, state = null, expectedState = null, submissionObserved = false, pendingCapture = null;
  const cleanup = { context: { acquired: false, closed: null }, server: { acquired: false, closed: null }, failures: [] };
  let observed = { availability: 'unavailable' };
  const at = name => { operation = name; };
  const summary = (category = 'execution', code = 'runtime-error') => ({ stage: 'ui-check', operation, viewport, state, expectedState, category, code });
  const safeStatus = value => ['idle', 'loading', 'success', 'error'].includes(value) ? value : 'other';
  // Browser operations are evaluated before this wrapper; only these trusted assertions get the tag.
  const behavior = (check, ...args) => {
    try { check(...args); }
    catch (error) {
      if (error instanceof assert.AssertionError) trustedFailure = error;
      throw error;
    }
  };
  try {
    app = await startUiServer(htmlPath, true);
    cleanup.server = { acquired: true, closed: false };
    at('create-context');
    context = await browser.newContext();
    cleanup.context = { acquired: true, closed: false };
    context.once('close', () => { cleanup.context.closed = true; });
    at('route-context');
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== app.url) { externalRequests.push(true); return route.abort(); }
      return route.continue();
    });
    for (const width of widths) {
      viewport = { width, height: 720 }; state = 'idle'; expectedState = null;
      at('create-page');
      page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.on('pageerror', () => faults.push(true));
      at('set-viewport');
      await page.setViewportSize({ width, height: 720 });
      at('navigate');
      await page.goto(app.url, { waitUntil: 'load' });
      const input = page.getByLabel('Name', { exact: true });
      const button = page.getByRole('button', { name: 'Submit', exact: true });
      at('label-count');
      behavior(assert.equal, await input.count(), 1, 'label must target the input');
      at('required-attribute');
      behavior(assert.equal, await input.getAttribute('required') !== null, true, 'required input');
      at('status-live-region');
      behavior(assert, [null, 'polite'].includes(await page.locator('[role=status]').getAttribute('aria-live')), 'status must retain its implicit or explicit polite live region');
      const capture = async captureState => {
        state = captureState;
        at('overflow');
        behavior(assert.equal, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow');
        const file = evidenceDir ? path.join(evidenceDir, `task-5-ui-${width}-${state}.png`) : null;
        pendingCapture = { width, state, screenshot: null, validity: 'unavailable' };
        if (file) {
          at('capture-screenshot');
          const existed = existsSync(file);
          let captured = false;
          try { await page.screenshot({ path: file }); captured = true; }
          finally { if ((captured || !existed) && existsSync(file)) pendingCapture.screenshot = file; }
          at('read-png');
          const png = readFileSync(file);
          pendingCapture.validity = 'invalid';
          at('validate-png-signature');
          assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
          at('validate-png-width');
          assert.equal(png.readUInt32BE(16), width);
          at('validate-png-height');
          assert.equal(png.readUInt32BE(20), 720);
          pendingCapture.validity = 'valid';
        }
        at('capture-focus');
        const focus = await page.evaluate(() => document.activeElement.id);
        at('capture-status');
        const status = await page.locator('[role=status]').getAttribute('data-state');
        receipts.push({ width, state, screenshot: file, focus, status });
        pendingCapture = null;
      };
      await capture('idle');
      at('tab-name');
      await page.keyboard.press('Tab');
      at('keyboard-name-focus');
      behavior(assert.equal, await input.evaluate(element => element === document.activeElement), true, 'keyboard reaches name');
      at('tab-submit');
      await page.keyboard.press('Tab');
      at('keyboard-submit-focus');
      behavior(assert.equal, await button.evaluate(element => element === document.activeElement), true, 'keyboard reaches submit');
      state = 'invalid'; at('submit-invalid');
      await page.keyboard.press('Enter');
      at('native-invalid-focus');
      behavior(assert.equal, await input.evaluate(element => element.validity.valueMissing && element === document.activeElement), true, 'native invalid focus');
      await capture('invalid');
      at('dismiss-validation');
      await page.keyboard.press('Escape'); // Dismiss native validation UI before the next state capture.
      for (const [resultState, code, name] of [['success', 200, 'Ada'], ['error', 503, 'Grace'], ['retry-success', 200, 'Lin']]) {
        state = `loading-${resultState}`; expectedState = 'loading'; submissionObserved = false;
        at('fill-name');
        await input.fill(name);
        submissionWait = new AbortController();
        const submitted = once(app.server, 'submission', { signal: AbortSignal.any([submissionWait.signal, AbortSignal.timeout(5000)]) });
        // An earlier arm/press failure still cancels this listener in finally; await below owns its error.
        submitted.then(() => { submissionObserved = true; }, () => {});
        at('arm-loading');
        await armState(page, 'loading');
        at('submit-name');
        await input.press('Enter');
        at('await-submission');
        const [submission] = await submitted;
        at('await-loading');
        await page.evaluate(() => window.stateSignal);
        at('submission-input');
        behavior(assert.deepEqual, submission.input, { name });
        at('pending-disabled');
        behavior(assert.equal, await button.isDisabled(), true, 'submit disabled while pending');
        await capture(`loading-${resultState}`);
        state = resultState; expectedState = code === 200 ? 'success' : 'error';
        at('arm-completion');
        await armState(page, code === 200 ? 'success' : 'error');
        at('release-response');
        submission.complete(code);
        at('await-completion');
        await page.evaluate(() => window.stateSignal);
        at('completion-enabled');
        behavior(assert.equal, await button.isEnabled(), true, 'submit enabled after completion');
        at('restored-focus');
        behavior(assert.equal, await input.evaluate(element => element === document.activeElement), true, 'focus restored');
        at('visible-feedback');
        behavior(assert, (await page.getByRole('status').textContent()).trim().length > 0, 'visible feedback');
        await capture(resultState);
      }
      at('close-page');
      await page.close();
    }
    at('assert-runtime-faults');
    assert.deepEqual(faults, [], 'browser runtime errors');
    at('assert-external-requests');
    assert.deepEqual(externalRequests, [], 'browser external network attempts');
  } catch (error) {
    failure = error;
    primaryFailure = error === trustedFailure ? summary('verification', 'ui-behavior-mismatch') : summary();
    if (page && !page.isClosed()) {
      let timer;
      try {
        const sample = await Promise.race([
          page.evaluate(() => {
            const input = document.querySelector('input'), button = document.querySelector('button');
            return { status: document.querySelector('[role=status]')?.dataset.state,
              focus: document.activeElement === input ? 'name' : document.activeElement === button ? 'submit' : document.activeElement === document.body ? 'body' : 'other',
              buttonDisabled: button?.disabled, validity: !input ? 'unavailable' : input.validity.valueMissing ? 'value-missing' : input.validity.valid ? 'valid' : 'invalid' };
          }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('failure sample unavailable')), 5000); }),
        ]);
        observed = { availability: 'available', status: safeStatus(sample?.status),
          focus: ['name', 'submit', 'body', 'other'].includes(sample?.focus) ? sample.focus : 'other',
          buttonDisabled: typeof sample?.buttonDisabled === 'boolean' ? sample.buttonDisabled : 'unavailable',
          validity: ['value-missing', 'valid', 'invalid'].includes(sample?.validity) ? sample.validity : 'unavailable' };
      } catch { observed = { availability: 'unavailable', failure: { operation: 'sample-failure-state', code: 'runtime-error' } }; }
      finally { clearTimeout(timer); }
    }
  } finally {
    submissionWait?.abort();
    // Independent attempts: a rejected context close must not skip the owned HTTP server.
    for (const [name, resource] of [['context', context], ['server', app]]) {
      if (!resource) continue;
      try { await resource.close(); }
      catch (error) {
        const detail = { operation: `close-${name}`, category: 'execution', code: 'cleanup-error' };
        cleanup.failures.push(detail);
        if (!primaryFailure) { failure = error; primaryFailure = { ...summary(), ...detail }; }
      }
      if (name === 'server') cleanup.server.closed = !app.server.listening;
    }
  }
  if (primaryFailure) {
    // Guest exception properties never authenticate a category. Keep the original error where writable.
    if (!(failure instanceof Error) || !Object.isExtensible(failure) ||
        ['fixtureFailure', 'uiFailure'].some(key => Object.getOwnPropertyDescriptor(failure, key)?.configurable === false)) {
      failure = new Error('UI check failed', { cause: failure });
    }
    const effective = faults.length || externalRequests.length || cleanup.failures.length ? { category: 'execution', code: 'runtime-error' } : primaryFailure;
    Object.defineProperty(failure, 'fixtureFailure', { configurable: true, writable: true, enumerable: true,
      value: effective.category === 'verification' ? { category: 'verification', code: 'ui-behavior-mismatch' } : undefined });
    Object.defineProperty(failure, 'uiFailure', { configurable: true, writable: true, enumerable: true, value: {
      failure: { ...primaryFailure, category: effective.category, code: effective.code }, primaryFailure,
      receipts: receipts.map(({ width, state, screenshot, focus, status }) => ({ width, state, screenshot, focus: focus === 'name' ? 'name' : 'other', status: safeStatus(status) })),
      pendingCapture, observed: { ...observed, submissionObserved }, faults: { pageErrors: faults.length, externalRequests: externalRequests.length }, cleanup: structuredClone(cleanup) } });
    throw failure;
  }
  return { receipts, serverClosed: !app.server.listening, contextClosed: true, faults, externalRequests };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const value = name => args[args.indexOf(name) + 1];
  assert(args.includes('--browser-module') && args.includes('--evidence'), 'supply existing browser module and evidence directory');
  const { chromium } = await import(pathToFileURL(path.resolve(value('--browser-module'))));
  const evidenceDir = path.resolve(value('--evidence'));
  mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let receipt, failure, browserFailure;
  try { receipt = await checkUi(browser, args.includes('--html') ? value('--html') : new URL('solution/index.html', import.meta.url), { evidenceDir }); }
  catch (error) { failure = error; receipt = error.uiFailure; }
  finally {
    try { await browser.close(); }
    catch (error) {
      browserFailure = error;
      if (failure) {
        failure.fixtureFailure = undefined;
        receipt.failure = { ...receipt.failure, category: 'execution', code: 'cleanup-error' };
      }
    }
    writeFileSync(path.join(evidenceDir, 'task-5-ui-cleanup.json'), JSON.stringify({ browserClosed: !browser.isConnected(),
      serverClosed: receipt?.cleanup?.server.closed ?? receipt?.serverClosed ?? null,
      contextClosed: receipt?.cleanup?.context.closed ?? receipt?.contextClosed ?? null,
      cleanup: receipt?.cleanup ?? null, browserFailure: browserFailure ? { operation: 'close-browser', category: 'execution', code: 'cleanup-error' } : null,
      timestamp: new Date().toISOString() }, null, 2));
  }
  writeFileSync(path.join(evidenceDir, 'task-5-ui-actions.json'), JSON.stringify(receipt ?? null, null, 2));
  if (failure || browserFailure) throw failure ?? browserFailure;
  console.log('[task-5-ui] passed');
}
