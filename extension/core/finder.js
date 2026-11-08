/**
 * The search loop: look through recent mail, newest first, for a message with
 * a verification code. If there is none yet, keep checking until one arrives
 * or time runs out.
 *
 * Gmail access and the clock are passed in, so the loop runs in Node tests
 * with fakes and in the service worker with the real API.
 */

import { extractCode } from './extract.js';
import { parseMessage } from './mime.js';

/**
 * @typedef {object} Hit
 * @property {string} id - Gmail message ID.
 * @property {string} code
 * @property {number} score
 * @property {string} reason
 * @property {number} receivedAt
 * @property {string} from
 * @property {string} subject
 */

/**
 * @typedef {object} FinderDeps
 * @property {() => Promise<string>} getToken
 * @property {(token: string, options: { afterMs: number, max: number, signal?: AbortSignal }) => Promise<string[]>} listIds
 * @property {(token: string, id: string, signal?: AbortSignal) => Promise<object>} getMessage
 * @property {() => Promise<void>} [dropToken] - Called when Gmail rejects the token.
 * @property {() => number} [now]
 * @property {(ms: number, signal?: AbortSignal) => Promise<void>} [sleep]
 */

/**
 * @param {number} ms
 * @param {AbortSignal} [signal]
 */
export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const timer = setTimeout(done, ms);
    function done() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function abortError() {
  return new DOMException('The search was cancelled', 'AbortError');
}

/**
 * @param {FinderDeps} deps
 * @param {object} options
 * @param {number} options.lookbackMs - Only messages received this recently count.
 * @param {number} options.waitMs - How long to keep checking for a new message.
 * @param {number} options.pollMs - Time between checks.
 * @param {number} options.maxPerCheck - Messages to list per check.
 * @param {Set<string>} [options.skipIds] - Messages whose code was already used.
 * @param {AbortSignal} [options.signal]
 * @param {(progress: { phase: 'checking'|'waiting', deadline: number }) => void} [options.onProgress]
 * @returns {Promise<Hit|null>} The newest message with a code, or null when time ran out.
 */
export async function findNewestCode(deps, options) {
  const now = deps.now ?? Date.now;
  const wait = deps.sleep ?? sleep;
  const { lookbackMs, waitMs, pollMs, maxPerCheck, skipIds = new Set(), signal, onProgress } = options;

  const startedAt = now();
  const since = startedAt - lookbackMs;
  const deadline = startedAt + waitMs;
  /** @type {Map<string, Hit|null>} */
  const seen = new Map();
  let retriedAuth = false;
  let first = true;

  for (;;) {
    if (signal?.aborted) throw abortError();
    onProgress?.({ phase: first ? 'checking' : 'waiting', deadline });
    first = false;

    try {
      const token = await deps.getToken();
      // Gmail's after: filter works in whole seconds, so ask for a minute more
      // and apply the exact cutoff using each message's received time.
      const ids = await deps.listIds(token, { afterMs: since - 60_000, max: maxPerCheck, signal });
      const fresh = ids.filter(id => !seen.has(id));

      const parsed = await Promise.all(fresh.map(async id => {
        try {
          return parseMessage(await deps.getMessage(token, id, signal));
        } catch (error) {
          if (error?.name === 'AbortError' || error?.status === 401) throw error;
          return null;
        }
      }));

      fresh.forEach((id, i) => {
        const message = parsed[i];
        if (!message || message.receivedAt < since) {
          seen.set(id, null);
          return;
        }
        const match = extractCode(message);
        seen.set(id, match ? {
          id,
          code: match.code,
          score: match.score,
          reason: match.reason,
          receivedAt: message.receivedAt,
          from: message.from,
          subject: message.subject
        } : null);
      });
      retriedAuth = false;
    } catch (error) {
      if (error?.status === 401 && !retriedAuth && deps.dropToken) {
        retriedAuth = true;
        await deps.dropToken();
        continue;
      }
      throw error;
    }

    const newest = [...seen.values()]
      .filter(hit => hit && !skipIds.has(hit.id))
      .sort((a, b) => b.receivedAt - a.receivedAt)[0];
    if (newest) return newest;

    if (now() + pollMs > deadline) return null;
    await wait(pollMs, signal);
  }
}
