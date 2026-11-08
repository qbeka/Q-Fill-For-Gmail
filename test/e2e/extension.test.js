import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

import { addEmail, installFakeGmail, launch, runFind, startServer } from './harness.js';

let env;
let server;
let base;

before(async () => {
  server = await startServer();
  base = `http://localhost:${server.port}/playground`;
  env = await launch();
  await installFakeGmail(env.worker);
});

after(async () => {
  await env?.close();
  await server?.close();
});

async function open(path) {
  const page = await env.context.newPage();
  await page.goto(`${base}/${path}`);
  return page;
}

test('the service worker starts and the manifest asks for no site access', async () => {
  const manifest = await env.worker.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'identity', 'scripting', 'storage']);
  assert.equal(manifest.content_scripts, undefined);
});

test('fills a single one-time-code field', async () => {
  await addEmail(env.worker, 'Your verification code', 'Your verification code is 482913.', 30_000);
  const page = await open('single.html');
  const result = await runFind(env, page);
  assert.equal(result.status, 'filled');
  assert.equal(result.code, '482913');
  assert.equal(await page.inputValue('#otp'), '482913');
  assert.equal(await page.textContent('#received'), 'Received: 482913');
  await page.close();
});

test('never fills the same email twice and waits for a new one', async () => {
  await addEmail(env.worker, 'Your login code', 'Login code: 864200');
  const page = await open('single.html');
  const first = await runFind(env, page);
  assert.equal(first.code, '864200');

  await page.fill('#otp', '');
  setTimeout(() => {
    addEmail(env.worker, 'Sign in', 'Use 135790 to sign in.').catch(() => {});
  }, 4000);
  const started = Date.now();
  const second = await runFind(env, page, { timeout: 30_000 });
  assert.equal(second.status, 'filled');
  assert.equal(second.code, '135790');
  assert.ok(Date.now() - started >= 3500, 'should have waited for the new email');
  assert.equal(await page.inputValue('#otp'), '135790');
  await page.close();
});

test('fills six separate boxes', async () => {
  await addEmail(env.worker, '204816 is your Acme code', 'Use 204816 to sign in.');
  const page = await open('boxes.html');
  const result = await runFind(env, page);
  assert.equal(result.status, 'filled');
  const values = await page.$$eval('#boxes input', inputs => inputs.map(i => i.value).join(''));
  assert.equal(values, '204816');
  await page.close();
});

test('fills a transparent input laid over six boxes', async () => {
  await addEmail(env.worker, 'Two-step verification', 'Your code: 771204');
  const page = await open('hidden-input.html');
  const result = await runFind(env, page);
  assert.equal(result.status, 'filled');
  assert.equal(await page.inputValue('#otp input'), '771204');
  await page.close();
});

test('fills a framework-controlled input so the framework sees the value', async () => {
  await addEmail(env.worker, 'Security code', 'Your security code is 660021');
  const page = await open('react.html');
  const result = await runFind(env, page);
  assert.equal(result.status, 'filled');
  await page.waitForTimeout(400);
  assert.equal(await page.textContent('#received'), 'State: 660021');
  assert.equal(await page.inputValue('#code'), '660021');
  await page.close();
});

test('on a login form, fills only the code field', async () => {
  await addEmail(env.worker, 'Your login code', 'Login code: 909182');
  const page = await open('login.html');
  const result = await runFind(env, page);
  assert.equal(result.status, 'filled');
  assert.equal(await page.inputValue('#mfa'), '909182');
  assert.equal(await page.inputValue('#email'), 'sam@example.com');
  assert.equal(await page.inputValue('#password'), 'hunter22');
  assert.equal(await page.inputValue('#promo'), '');
  await page.close();
});

test('fills a field inside a shadow root', async () => {
  await addEmail(env.worker, 'Verify your device', 'Your device code is 314159');
  const page = await open('shadow.html');
  const result = await runFind(env, page);
  assert.equal(result.status, 'filled');
  const value = await page.evaluate(() => document.querySelector('code-field').shadowRoot.querySelector('input').value);
  assert.equal(value, '314159');
  await page.close();
});

test('fills a field inside a same-origin iframe and leaves the search box alone', async () => {
  await addEmail(env.worker, 'Payment check', 'Your one-time code is 552901');
  const page = await open('iframe.html');
  await page.frameLocator('#frame').locator('#code').waitFor();
  const result = await runFind(env, page);
  assert.equal(result.status, 'filled');
  assert.equal(await page.frameLocator('#frame').locator('#code').inputValue(), '552901');
  assert.equal(await page.inputValue('#search'), '');
  await page.close();
});

test('skips a cross-origin frame it may not access, without failing', async () => {
  await addEmail(env.worker, 'Payment check', 'Your one-time code is 118822');
  const page = await open('iframe.html?cross=1');
  await page.frameLocator('#frame').locator('#code').waitFor();
  const result = await runFind(env, page);
  assert.equal(result.status, 'found');
  assert.equal(result.reason, 'no-field');
  assert.equal(result.code, '118822');
  assert.equal(await page.inputValue('#search'), '');
  await page.close();
});

test('on a page with no code field, finds the code but changes nothing', async () => {
  await addEmail(env.worker, 'Your verification code', 'Your verification code is 700111');
  const page = await open('no-field.html');
  const result = await runFind(env, page);
  assert.equal(result.status, 'found');
  assert.equal(result.reason, 'no-field');
  assert.equal(await page.inputValue('#name'), '');
  assert.equal(await page.inputValue('#email'), '');
  const toast = await page.evaluate(() => Boolean(document.getElementById('qfill-toast-host')));
  assert.ok(toast, 'a toast explains what happened');
  await page.close();
});

test('the popup shows the result with the code', async () => {
  await addEmail(env.worker, 'Your verification code', 'Your verification code is 246810');
  const page = await open('single.html');
  await runFind(env, page);
  const popup = await env.context.newPage();
  await popup.goto(`chrome-extension://${env.extensionId}/popup/popup.html`);
  await popup.locator('#resultCode').waitFor();
  assert.equal(await popup.textContent('#resultCode'), '246810');
  assert.equal(await popup.isVisible('#viewMain'), true);
  assert.equal(await popup.textContent('#account'), 'sam@example.com');
  await popup.close();
  await page.close();
});

test('the popup asks for a client ID when none is set', async () => {
  await env.worker.evaluate(() => chrome.storage.local.set({ clientId: '' }));
  const popup = await env.context.newPage();
  await popup.goto(`chrome-extension://${env.extensionId}/popup/popup.html`);
  await popup.locator('#viewSetup').waitFor();
  const redirect = await popup.textContent('#setupRedirect');
  assert.equal(redirect, `https://${env.extensionId}.chromiumapp.org/`);
  await popup.fill('#clientIdInput', 'not a client id');
  await popup.click('#clientForm button');
  assert.equal(await popup.isVisible('#clientIdError'), true);
  await popup.fill('#clientIdInput', '123456789012-abcdefghijklmnop.apps.googleusercontent.com');
  await popup.click('#clientForm button');
  await popup.locator('#viewConnect').waitFor();
  await popup.close();
});
