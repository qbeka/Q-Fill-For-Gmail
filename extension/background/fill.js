/**
 * Puts a code into the page through content/autofill.js.
 *
 * Q-Fill has no access to any site until you click its icon or press its
 * shortcut. That gesture grants temporary access to the current tab
 * (activeTab), which is all this needs.
 */

const SCRIPT = 'content/autofill.js';

/**
 * @typedef {object} FillResult
 * @property {boolean} ok
 * @property {'blocked'|'no-field'|'rejected'|'bad-code'|'gone'} [reason]
 */

/**
 * Injects the autofill script into every frame Q-Fill may access, asks each
 * frame how good its best field is, and fills only the best one.
 * @param {number} tabId
 * @param {string} code
 * @returns {Promise<FillResult>}
 */
export async function fillCodeInTab(tabId, code) {
  try {
    await inject({ tabId, allFrames: true });
  } catch (error) {
    if (/No tab with id/i.test(String(error?.message))) return { ok: false, reason: 'gone' };
    return { ok: false, reason: 'blocked' };
  }

  let probes = [];
  try {
    probes = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: length => globalThis.__qfill?.probe(length) ?? null,
      args: [code.length]
    });
  } catch {
    return { ok: false, reason: 'blocked' };
  }

  const best = probes
    .filter(p => p?.result)
    .sort((a, b) => b.result.score - a.result.score || (a.frameId === 0 ? -1 : 1))[0];
  if (!best) return { ok: false, reason: 'no-field' };

  const [run] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [best.frameId] },
    func: value => globalThis.__qfill.fill(value),
    args: [code]
  });
  return run?.result ?? { ok: false, reason: 'rejected' };
}

/**
 * Shows a short message at the bottom of the page. Fails quietly on pages the
 * extension cannot touch, such as the browser's own settings pages.
 * @param {number} tabId
 * @param {string} text
 * @param {'success'|'error'|'info'} tone
 * @param {number} [durationMs]
 */
export async function showToast(tabId, text, tone, durationMs) {
  try {
    await inject({ tabId, frameIds: [0] });
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: (message, kind, ms) => globalThis.__qfill?.toast(message, kind, ms),
      args: [text, tone, durationMs ?? 3200]
    });
  } catch {
    // Nothing to show on a page we cannot reach.
  }
}

/** @param {chrome.scripting.InjectionTarget} target */
function inject(target) {
  return chrome.scripting.executeScript({ target, files: [SCRIPT] });
}
