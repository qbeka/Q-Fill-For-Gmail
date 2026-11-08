/**
 * Takes the README screenshots from the real extension, using the same
 * harness as the end-to-end tests (fake inbox, real everything else).
 *
 * Run with: npm run screenshots
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { addEmail, installFakeGmail, launch, ROOT, runFind, startServer } from '../test/e2e/harness.js';

const OUT = join(ROOT, 'docs/images');
await mkdir(OUT, { recursive: true });

const server = await startServer();
const env = await launch({ deviceScaleFactor: 2 });
await installFakeGmail(env.worker);
const base = `http://localhost:${server.port}/playground`;

async function popupShot(name, { scheme = 'light', prepare } = {}) {
  const page = await env.context.newPage();
  await page.emulateMedia({ colorScheme: scheme });
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`chrome-extension://${env.extensionId}/popup/popup.html`);
  await page.waitForTimeout(300);
  if (prepare) await prepare(page);
  await page.evaluate(() => document.fonts.ready);
  const height = await page.evaluate(() => document.querySelector('.shell').getBoundingClientRect().height);
  await page.setViewportSize({ width: 360, height: Math.ceil(height) });
  await page.screenshot({ path: join(OUT, `${name}.png`), scale: 'device' });
  console.log(`docs/images/${name}.png`);
  await page.close();
}

// A filled code on the split-box page, with the toast showing.
await addEmail(env.worker, '204816 is your Acme code', 'Use 204816 to sign in to Acme.', 50_000);
const form = await env.context.newPage();
await form.setViewportSize({ width: 720, height: 520 });
await form.goto(`${base}/boxes.html`);
await runFind(env, form);
await form.waitForTimeout(250);
await form.screenshot({ path: join(OUT, 'fill.png') });
console.log('docs/images/fill.png');
await form.close();

await popupShot('popup-filled');
await popupShot('popup-filled-dark', { scheme: 'dark' });

// Waiting for an email that has not arrived yet.
const waitingPage = await env.context.newPage();
await waitingPage.goto(`${base}/single.html`);
const tabId = await env.worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url)?.id, waitingPage.url());
await popupShot('popup-waiting', {
  prepare: async page => {
    await page.evaluate(id => {
      const port = chrome.runtime.connect({ name: 'qfill-popup' });
      port.postMessage({ type: 'find', tabId: id });
    }, tabId);
    await page.locator('#progress').waitFor();
    await page.waitForFunction(() => document.getElementById('progressTitle').textContent.includes('Waiting'), null, { timeout: 10_000 });
  }
});
await env.worker.evaluate(() => {
  const port = chrome.runtime.connect({ name: 'qfill-popup' });
  port.postMessage({ type: 'cancel' });
});
await waitingPage.close();

await popupShot('popup-settings', { prepare: page => page.click('#openSettings') });

await env.worker.evaluate(() => chrome.storage.local.set({ clientId: '', email: '' }));
await popupShot('popup-setup');

await env.close();
await server.close();
