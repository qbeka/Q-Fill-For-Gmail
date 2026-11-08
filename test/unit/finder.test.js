import { test } from 'node:test';
import assert from 'node:assert/strict';

import { findNewestCode, sleep } from '../../extension/core/finder.js';

const b64url = text => Buffer.from(text).toString('base64url');

function message(id, receivedAt, subject, text) {
  return {
    id,
    internalDate: String(receivedAt),
    payload: {
      mimeType: 'text/plain',
      headers: [{ name: 'Subject', value: subject }, { name: 'From', value: 'Acme <a@acme.test>' }],
      body: { data: b64url(text) }
    }
  };
}

/** A fake Gmail whose inbox can change between checks. */
function fakeGmail(start, inbox) {
  let clock = start;
  const calls = { list: 0, get: 0, drop: 0 };
  const deps = {
    getToken: async () => 'token',
    listIds: async (_token, { afterMs }) => {
      calls.list++;
      return inbox().filter(m => Number(m.internalDate) >= afterMs).map(m => m.id);
    },
    getMessage: async (_token, id) => {
      calls.get++;
      return inbox().find(m => m.id === id);
    },
    dropToken: async () => { calls.drop++; },
    now: () => clock,
    sleep: async ms => { clock += ms; }
  };
  return { deps, calls, advance: ms => { clock += ms; }, time: () => clock };
}

const options = { lookbackMs: 10 * 60_000, waitMs: 60_000, pollMs: 3_000, maxPerCheck: 8 };
const T = 1_762_500_000_000;

test('returns the newest message with a code, not the highest scoring one', async () => {
  const inbox = [
    message('old', T - 8 * 60_000, '111111 is your Acme code', 'Your verification code is 111111'),
    message('new', T - 60_000, 'Sign in', 'Use 222333 to sign in.'),
    message('news', T - 30_000, 'Weekly news', 'Nothing to see here.')
  ];
  const { deps } = fakeGmail(T, () => inbox);
  const hit = await findNewestCode(deps, options);
  assert.equal(hit.id, 'new');
  assert.equal(hit.code, '222333');
});

test('ignores messages older than the lookback window', async () => {
  const inbox = [message('stale', T - 11 * 60_000, 'Your code', 'Your code is 445566')];
  const { deps } = fakeGmail(T, () => inbox);
  const hit = await findNewestCode(deps, { ...options, waitMs: 0 });
  assert.equal(hit, null);
});

test('skips messages whose code was already used and waits for a new one', async () => {
  const inbox = [message('used', T - 60_000, 'Your code', 'Your code is 123123')];
  const gmail = fakeGmail(T, () => inbox);
  const phases = [];

  const pending = findNewestCode(gmail.deps, {
    ...options,
    skipIds: new Set(['used']),
    onProgress: p => {
      phases.push(p.phase);
      // A new email arrives during the second check.
      if (phases.length === 2) inbox.push(message('fresh', gmail.time(), 'Your code', 'Your code is 789789'));
    }
  });
  const hit = await pending;
  assert.equal(hit.id, 'fresh');
  assert.deepEqual(phases.slice(0, 2), ['checking', 'waiting']);
});

test('gives up after the wait time and fetches each message only once', async () => {
  const inbox = [message('n', T - 60_000, 'Newsletter', 'No codes here')];
  const gmail = fakeGmail(T, () => inbox);
  const hit = await findNewestCode(gmail.deps, options);
  assert.equal(hit, null);
  assert.equal(gmail.calls.get, 1);
  assert.ok(gmail.calls.list >= 20 && gmail.calls.list <= 21, `listed ${gmail.calls.list} times`);
});

test('drops the token and retries once when Gmail answers 401', async () => {
  const inbox = [message('m', T - 1000, 'Your code', 'Your code is 550055')];
  const gmail = fakeGmail(T, () => inbox);
  let failures = 1;
  const listIds = gmail.deps.listIds;
  gmail.deps.listIds = async (...args) => {
    if (failures-- > 0) throw Object.assign(new Error('Unauthorized'), { status: 401 });
    return listIds(...args);
  };
  const hit = await findNewestCode(gmail.deps, options);
  assert.equal(hit.code, '550055');
  assert.equal(gmail.calls.drop, 1);
});

test('a second 401 in a row is reported', async () => {
  const gmail = fakeGmail(T, () => []);
  gmail.deps.listIds = async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); };
  await assert.rejects(findNewestCode(gmail.deps, options), /Unauthorized/);
  assert.equal(gmail.calls.drop, 1);
});

test('a message that fails to load is skipped, not fatal', async () => {
  const inbox = [
    message('broken', T - 2000, 'x', 'x'),
    message('ok', T - 3000, 'Your code', 'Your code is 909090')
  ];
  const gmail = fakeGmail(T, () => inbox);
  const getMessage = gmail.deps.getMessage;
  gmail.deps.getMessage = async (token, id) => {
    if (id === 'broken') throw Object.assign(new Error('boom'), { status: 500 });
    return getMessage(token, id);
  };
  const hit = await findNewestCode(gmail.deps, options);
  assert.equal(hit.id, 'ok');
});

test('stops when cancelled', async () => {
  const controller = new AbortController();
  const gmail = fakeGmail(T, () => []);
  gmail.deps.sleep = sleep;
  const pending = findNewestCode(gmail.deps, { ...options, pollMs: 50, signal: controller.signal });
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('a dropped connection while listing keeps the wait going', async () => {
  const inbox = [message('m', T - 1000, 'Your code', 'Your code is 616161')];
  const gmail = fakeGmail(T, () => inbox);
  let failures = 2;
  const listIds = gmail.deps.listIds;
  gmail.deps.listIds = async (...args) => {
    if (failures-- > 0) throw Object.assign(new Error('offline'), { status: 0 });
    return listIds(...args);
  };
  const hit = await findNewestCode(gmail.deps, options);
  assert.equal(hit.code, '616161');
});

test('when the newest message fails to load, it is retried instead of filling an older code', async () => {
  const inbox = [
    message('older', T - 5 * 60_000, 'Your code', 'Your code is 100100'),
    message('newer', T - 10_000, 'Your code', 'Your code is 200200')
  ];
  const gmail = fakeGmail(T, () => inbox);
  let failures = 1;
  const getMessage = gmail.deps.getMessage;
  gmail.deps.getMessage = async (token, id) => {
    if (id === 'newer' && failures-- > 0) throw Object.assign(new Error('busy'), { status: 503 });
    return getMessage(token, id);
  };
  const hit = await findNewestCode(gmail.deps, options);
  assert.equal(hit.id, 'newer');
  assert.equal(hit.code, '200200');
});

test('if Gmail stays unreachable, the last error is reported when time runs out', async () => {
  const gmail = fakeGmail(T, () => []);
  gmail.deps.listIds = async () => { throw Object.assign(new Error('offline'), { status: 0 }); };
  await assert.rejects(findNewestCode(gmail.deps, options), /offline/);
});

test('a permanent error such as a disabled API stops at once', async () => {
  const gmail = fakeGmail(T, () => []);
  gmail.deps.listIds = async () => {
    gmail.calls.list++;
    throw Object.assign(new Error('Gmail API has not been used'), { status: 403 });
  };
  await assert.rejects(findNewestCode(gmail.deps, options), /not been used/);
  assert.equal(gmail.calls.list, 1);
});
