/**
 * Loads the real extension into Chromium with Playwright.
 *
 * Only two things are faked, both inside the service worker: the Gmail API
 * (fetch answers from an in-memory inbox) and the Google access token. The
 * service worker, the find loop, script injection and the in-page autofill
 * all run for real.
 *
 * Automated browsers cannot click the toolbar icon, which is what grants
 * activeTab. The test copy of the extension is given access to
 * http://localhost/* instead. Pages on 127.0.0.1 stay off limits, which
 * stands in for a cross-origin frame the extension may not touch.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

/** Serves the repository root over http on a free port. */
export async function startServer() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    try {
      const body = await readFile(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] || 'text/html' });
      res.end(body);
    } catch {
      res.writeHead(404).end('Not found');
    }
  });
  await new Promise(resolve => server.listen(0, '0.0.0.0', resolve));
  return { port: server.address().port, close: () => new Promise(resolve => server.close(resolve)) };
}

/** Copies the extension and grants it localhost access for testing. */
async function testCopy() {
  const dir = await mkdtemp(join(tmpdir(), 'qfill-e2e-'));
  await cp(join(ROOT, 'extension'), dir, { recursive: true });
  const manifestPath = join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.host_permissions.push('http://localhost/*');
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return dir;
}

/** @param {import('playwright').BrowserContextOptions} [options] */
export async function launch(options = {}) {
  const extensionDir = await testCopy();
  const userDataDir = await mkdtemp(join(tmpdir(), 'qfill-profile-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: process.env.HEADED ? false : true,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
    ...options
  });

  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker');
  const extensionId = new URL(worker.url()).host;

  // Close the setup tab the extension opens on first install.
  for (const page of context.pages()) {
    if (page.url().startsWith('chrome-extension://')) await page.close();
  }

  return {
    context,
    worker,
    extensionId,
    async close() {
      await context.close();
      await rm(extensionDir, { recursive: true, force: true });
      await rm(userDataDir, { recursive: true, force: true });
    }
  };
}

/**
 * Replaces Gmail and Google auth inside the service worker with fakes.
 * @param {import('playwright').Worker} worker
 */
export async function installFakeGmail(worker) {
  await worker.evaluate(async () => {
    const b64url = text => btoa(String.fromCharCode(...new TextEncoder().encode(text)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    globalThis.__inbox = [];
    globalThis.__gmailCalls = [];
    globalThis.__addEmail = (subject, text, ageMs = 0) => {
      const id = `m${globalThis.__inbox.length + 1}`;
      globalThis.__inbox.push({
        id,
        internalDate: String(Date.now() - ageMs),
        payload: {
          mimeType: 'text/plain',
          headers: [{ name: 'Subject', value: subject }, { name: 'From', value: 'Acme Security <no-reply@acme.test>' }],
          body: { data: b64url(text) }
        }
      });
      return id;
    };

    const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url);
      if (url.host === 'oauth2.googleapis.com') return new Response('', { status: 200 });
      if (url.host !== 'gmail.googleapis.com') return realFetch(input, init);
      globalThis.__gmailCalls.push(url.pathname + url.search);
      if (url.pathname.endsWith('/profile')) return json({ emailAddress: 'sam@example.com' });
      const one = url.pathname.match(/\/messages\/([^/]+)$/);
      if (one) return json(globalThis.__inbox.find(m => m.id === one[1]));
      const after = Number((url.searchParams.get('q') || '').match(/after:(\d+)/)?.[1] || 0) * 1000;
      const messages = globalThis.__inbox
        .filter(m => Number(m.internalDate) >= after)
        .sort((a, b) => Number(b.internalDate) - Number(a.internalDate))
        .map(({ id }) => ({ id, threadId: id }));
      return json({ messages, resultSizeEstimate: messages.length });
    };

    await chrome.storage.local.set({ clientId: '123456789012-abcdefghijklmnop.apps.googleusercontent.com', email: 'sam@example.com' });
    await chrome.storage.session.set({ accessToken: { token: 'fake-token', expiresAt: Date.now() + 3_600_000 } });
  });
}

/** @param {import('playwright').Worker} worker */
export function addEmail(worker, subject, text, ageMs = 0) {
  return worker.evaluate(([s, t, a]) => globalThis.__addEmail(s, t, a), [subject, text, ageMs]);
}

/**
 * Starts a find for a tab, the same way the popup does, and resolves with the
 * stored result once the run ends.
 * @param {{ context: import('playwright').BrowserContext, extensionId: string, worker: import('playwright').Worker }} env
 * @param {import('playwright').Page} page
 */
export async function runFind(env, page, { timeout = 20_000 } = {}) {
  const url = page.url();
  const tabId = await env.worker.evaluate(async target => {
    const tabs = await chrome.tabs.query({});
    return tabs.find(tab => tab.url === target)?.id;
  }, url);
  if (tabId === undefined) throw new Error(`No tab for ${url}`);

  await env.worker.evaluate(() => chrome.storage.session.remove('lastResult'));
  const driver = await env.context.newPage();
  await driver.goto(`chrome-extension://${env.extensionId}/popup/popup.html`);
  await driver.evaluate(id => {
    globalThis.__port = chrome.runtime.connect({ name: 'qfill-popup' });
    globalThis.__port.postMessage({ type: 'find', tabId: id });
  }, tabId);
  await page.bringToFront();

  const deadline = Date.now() + timeout;
  for (;;) {
    const last = await env.worker.evaluate(async () => (await chrome.storage.session.get('lastResult')).lastResult ?? null);
    if (last) {
      await driver.close();
      return last;
    }
    if (Date.now() > deadline) {
      await driver.close();
      throw new Error('Find did not finish in time');
    }
    await new Promise(resolve => setTimeout(resolve, 150));
  }
}
