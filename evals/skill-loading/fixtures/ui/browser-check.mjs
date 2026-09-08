import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export async function checkUi(browser, htmlPath, { evidenceDir, widths = [375, 768, 1280] } = {}) {
  const app = await startUiServer(htmlPath, true);
  const context = await browser.newContext();
  const receipts = [];
  const faults = [];
  const externalRequests = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin !== app.url) { externalRequests.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  try {
    for (const width of widths) {
      const page = await context.newPage();
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => faults.push(error.message));
      await page.setViewportSize({ width, height: 720 });
      await page.goto(app.url, { waitUntil: 'load' });
      const input = page.getByLabel('Name', { exact: true });
      const button = page.getByRole('button', { name: 'Submit', exact: true });
      assert.equal(await input.count(), 1, 'label must target the input');
      assert.equal(await input.getAttribute('required') !== null, true, 'required input');
      assert([null, 'polite'].includes(await page.locator('[role=status]').getAttribute('aria-live')), 'status must retain its implicit or explicit polite live region');
      const capture = async state => {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'horizontal overflow');
        const file = evidenceDir ? path.join(evidenceDir, `task-5-ui-${width}-${state}.png`) : null;
        if (file) {
          await page.screenshot({ path: file });
          const png = readFileSync(file);
          assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
          assert.equal(png.readUInt32BE(16), width);
          assert.equal(png.readUInt32BE(20), 720);
        }
        receipts.push({ width, state, screenshot: file, focus: await page.evaluate(() => document.activeElement.id), status: await page.locator('[role=status]').getAttribute('data-state') });
      };
      await capture('idle');
      await page.keyboard.press('Tab');
      assert.equal(await input.evaluate(element => element === document.activeElement), true, 'keyboard reaches name');
      await page.keyboard.press('Tab');
      assert.equal(await button.evaluate(element => element === document.activeElement), true, 'keyboard reaches submit');
      await page.keyboard.press('Enter');
      assert.equal(await input.evaluate(element => element.validity.valueMissing && element === document.activeElement), true, 'native invalid focus');
      await capture('invalid');
      await page.keyboard.press('Escape'); // Dismiss native validation UI before the next state capture.
      for (const [state, code, name] of [['success', 200, 'Ada'], ['error', 503, 'Grace'], ['retry-success', 200, 'Lin']]) {
        await input.fill(name);
        const submitted = once(app.server, 'submission', { signal: AbortSignal.timeout(5000) });
        await armState(page, 'loading');
        await input.press('Enter');
        const [submission] = await submitted;
        await page.evaluate(() => window.stateSignal);
        assert.deepEqual(submission.input, { name });
        assert.equal(await button.isDisabled(), true, 'submit disabled while pending');
        await capture(`loading-${state}`);
        await armState(page, code === 200 ? 'success' : 'error');
        submission.complete(code);
        await page.evaluate(() => window.stateSignal);
        assert.equal(await button.isEnabled(), true, 'submit enabled after completion');
        assert.equal(await input.evaluate(element => element === document.activeElement), true, 'focus restored');
        assert((await page.getByRole('status').textContent()).trim().length > 0, 'visible feedback');
        await capture(state);
      }
      await page.close();
    }
    assert.deepEqual(faults, [], 'browser runtime errors');
    assert.deepEqual(externalRequests, [], 'browser external network attempts');
  } finally {
    await context.close();
    await app.close();
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
  let receipt;
  try { receipt = await checkUi(browser, args.includes('--html') ? value('--html') : new URL('solution/index.html', import.meta.url), { evidenceDir }); }
  finally {
    await browser.close();
    writeFileSync(path.join(evidenceDir, 'task-5-ui-cleanup.json'), JSON.stringify({ browserClosed: !browser.isConnected(), serverClosed: receipt?.serverClosed ?? 'checkUi finally awaited close', timestamp: new Date().toISOString() }, null, 2));
  }
  writeFileSync(path.join(evidenceDir, 'task-5-ui-actions.json'), JSON.stringify(receipt, null, 2));
  console.log('[task-5-ui] passed');
}
