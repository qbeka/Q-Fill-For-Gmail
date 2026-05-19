/**
 * Content script entry — wires messaging and focus tracking.
 * @module content/index
 */

import { MESSAGE_ACTIONS, CODE_VALIDATION } from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { fillCode } from './fill-engine.js';
import { calculateScore } from './scoring.js';
import { showToast } from './ui.js';

const { info } = createLogger(false);

if (!globalThis.__QFILL_INITIALIZED__) {
  globalThis.__QFILL_INITIALIZED__ = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === MESSAGE_ACTIONS.FILL_CODE && message.code) {
      const result = fillCode(message.code);
      info(`Fill: ${result.success ? 'ok' : 'fail'} — ${result.message}`);
      sendResponse(result);
      return true;
    }

    if (message.action === MESSAGE_ACTIONS.FILL_FAILED) {
      const label = message.message || chrome.i18n.getMessage('toastFillFailedPage');
      showToast(label, 'error');
      sendResponse({ success: true });
      return true;
    }

    sendResponse({ success: false, message: 'Unknown action' });
    return false;
  });

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!target?.matches?.('input, textarea, [contenteditable="true"]')) return;
    if (calculateScore(target, CODE_VALIDATION.MAX_LENGTH) >= 30) {
      globalThis.__QFILL_LAST_FOCUSED__ = target;
    }
  }, true);

  if (!globalThis.__QFILL_READY_SENT__) {
    globalThis.__QFILL_READY_SENT__ = true;
    try {
      chrome.runtime.sendMessage({
        action: MESSAGE_ACTIONS.CONTENT_SCRIPT_READY,
        url: window.location.href
      });
    } catch {
      /* extension context unavailable */
    }
  }

  info('Content script ready');
}
