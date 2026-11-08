/**
 * Q-Fill service worker.
 *
 * Runs a find when you press Fill in the popup or use the keyboard shortcut,
 * and keeps the popup up to date over a long-lived port.
 */

import {
  CLIENT_ID_PATTERN,
  LOOKBACK_CHOICES,
  MAX_MESSAGES_PER_CHECK,
  PHASE,
  POLL_INTERVAL_MS,
  PORT_NAME,
  REQUEST,
  STATE,
  WAIT_FOR_EMAIL_MS
} from '../shared/constants.js';
import { t } from '../shared/i18n.js';
import { senderName } from '../core/mime.js';
import { findNewestCode } from '../core/finder.js';
import { AuthError, dropToken, getAccessToken, redirectUri, signIn, signOut } from './auth.js';
import { GmailError, getEmailAddress, getMessage, listRecentMessageIds } from './gmail.js';
import { fillCodeInTab, showToast } from './fill.js';
import {
  clearSession,
  getLastResult,
  getSettings,
  getUsedMessageIds,
  markMessageUsed,
  saveSettings,
  setLastResult
} from './settings.js';

/** @type {Set<chrome.runtime.Port>} */
const ports = new Set();

/** The run in progress, if any. */
let job = null;

/** True while the Google sign-in window is open. */
let connecting = false;

/** The last sign-in error, shown in the popup until the next attempt. */
let authError = '';

// ---------------------------------------------------------------------------
// State sent to the popup

async function snapshot() {
  const [settings, last, commands] = await Promise.all([
    getSettings(),
    getLastResult(),
    chrome.commands.getAll().catch(() => [])
  ]);
  return {
    type: STATE,
    extensionId: chrome.runtime.id,
    redirectUri: redirectUri(),
    clientId: settings.clientId,
    email: settings.email,
    lookbackMinutes: settings.lookbackMinutes,
    shortcut: commands.find(c => c.name === 'fill-code')?.shortcut || '',
    connecting,
    authError,
    job: job ? { phase: job.phase, deadline: job.deadline, tabId: job.tabId } : null,
    last
  };
}

async function broadcast() {
  if (!ports.size) return;
  const state = await snapshot();
  for (const port of ports) {
    try {
      port.postMessage(state);
    } catch {
      ports.delete(port);
    }
  }
}

// ---------------------------------------------------------------------------
// Errors in plain language

/** @param {unknown} error */
function describe(error) {
  if (error instanceof AuthError) {
    const key = {
      no_client_id: 'errorNoClientId',
      cancelled: 'errorSignInCancelled',
      access_denied: 'errorAccessDenied',
      scope_denied: 'errorScopeDenied',
      interaction_required: 'errorSignInAgain'
    }[error.code];
    return key ? t(key) : t('errorSignInFailed', error.message);
  }
  if (error instanceof GmailError) {
    if (error.status === 0) return t('errorOffline');
    if (error.status === 401) return t('errorSignInAgain');
    if (error.status === 403) return t('errorGmailForbidden');
    if (error.status === 429) return t('errorRateLimited');
    return t('errorGmail', error.message);
  }
  return t('errorUnexpected', String(error?.message || error));
}

// ---------------------------------------------------------------------------
// Find and fill

/**
 * @param {number} tabId
 * @param {'popup'|'shortcut'} source
 */
async function startFind(tabId, source) {
  if (job) {
    if (job.tabId === tabId) return;
    job.controller.abort();
  }

  const settings = await getSettings();
  if (!settings.clientId || !settings.email) {
    if (source === 'shortcut') await showToast(tabId, t('toastConnectFirst'), 'info', 4000);
    return;
  }

  const controller = new AbortController();
  const current = { tabId, phase: PHASE.CHECKING, deadline: 0, controller, waitingToastShown: false };
  job = current;
  await chrome.action.setBadgeText({ text: '…' });
  await broadcast();

  let result;
  try {
    const hit = await findNewestCode(
      {
        getToken: () => getAccessToken({ interactive: true }),
        listIds: listRecentMessageIds,
        getMessage,
        dropToken
      },
      {
        lookbackMs: settings.lookbackMinutes * 60_000,
        waitMs: WAIT_FOR_EMAIL_MS,
        pollMs: POLL_INTERVAL_MS,
        maxPerCheck: MAX_MESSAGES_PER_CHECK,
        skipIds: await getUsedMessageIds(),
        signal: controller.signal,
        onProgress: progress => {
          current.phase = progress.phase;
          current.deadline = progress.deadline;
          if (progress.phase === PHASE.WAITING && !current.waitingToastShown) {
            current.waitingToastShown = true;
            showToast(tabId, t('toastWaiting'), 'info', 0);
          }
          broadcast();
        }
      }
    );

    if (!hit) {
      result = { status: 'none', lookbackMinutes: settings.lookbackMinutes };
      await showToast(tabId, t('toastNoCode'), 'error', 4500);
    } else {
      current.phase = PHASE.FILLING;
      await broadcast();
      const sender = senderName(hit.from);
      const fill = await fillCodeInTab(tabId, hit.code);
      if (fill.ok) await markMessageUsed(hit.id);
      result = {
        status: fill.ok ? 'filled' : 'found',
        reason: fill.reason || '',
        code: hit.code,
        from: sender,
        subject: hit.subject,
        receivedAt: hit.receivedAt
      };
      const toastKey = fill.ok ? 'toastFilled' : fill.reason === 'no-field' ? 'toastNoField' : 'toastRejected';
      await showToast(tabId, t(toastKey, [hit.code, sender || 'Gmail']), fill.ok ? 'success' : 'error', fill.ok ? 3200 : 6000);
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      result = job === current ? { status: 'cancelled' } : null;
      await showToast(tabId, '', 'info');
    } else {
      console.warn('[Q-Fill]', error);
      result = { status: 'error', message: describe(error) };
      await showToast(tabId, result.message, 'error', 6000);
      if (error instanceof AuthError && error.code === 'no_client_id') await saveSettings({ email: '' });
    }
  } finally {
    if (job === current) {
      job = null;
      await chrome.action.setBadgeText({ text: '' });
    }
  }

  if (result) await setLastResult({ ...result, at: Date.now() });
  await broadcast();
}

// ---------------------------------------------------------------------------
// Account

async function connect() {
  if (connecting) return;
  connecting = true;
  authError = '';
  await broadcast();
  try {
    const token = await signIn();
    const email = await getEmailAddress(token);
    await saveSettings({ email });
    await setLastResult(null);
    chrome.action.openPopup?.()?.catch(() => {});
  } catch (error) {
    authError = describe(error);
  } finally {
    connecting = false;
    await broadcast();
  }
}

async function disconnect() {
  job?.controller.abort();
  await signOut();
  await saveSettings({ email: '' });
  await clearSession();
  authError = '';
  await broadcast();
}

// ---------------------------------------------------------------------------
// Messages from the popup

/** @param {any} message */
async function handle(message) {
  switch (message?.type) {
    case REQUEST.SAVE_CLIENT_ID: {
      const clientId = String(message.clientId || '').trim();
      if (clientId && !CLIENT_ID_PATTERN.test(clientId)) return;
      const { clientId: previous } = await getSettings();
      if (clientId !== previous) {
        await signOut();
        await saveSettings({ clientId, email: '' });
        await clearSession();
      }
      authError = '';
      return broadcast();
    }
    case REQUEST.CONNECT:
      return connect();
    case REQUEST.DISCONNECT:
      return disconnect();
    case REQUEST.FIND:
      if (Number.isInteger(message.tabId)) return startFind(message.tabId, 'popup');
      return;
    case REQUEST.CANCEL:
      job?.controller.abort();
      return;
    case REQUEST.SET_LOOKBACK:
      if (LOOKBACK_CHOICES.includes(Number(message.minutes))) {
        await saveSettings({ lookbackMinutes: Number(message.minutes) });
        return broadcast();
      }
      return;
    case REQUEST.OPEN_SHORTCUTS:
      return chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    default:
      return;
  }
}

chrome.runtime.onConnect.addListener(port => {
  if (port.name !== PORT_NAME || port.sender?.id !== chrome.runtime.id) return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  port.onMessage.addListener(message => {
    handle(message).catch(error => console.warn('[Q-Fill]', error));
  });
  snapshot().then(state => port.postMessage(state)).catch(() => {});
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'fill-code' && tab?.id !== undefined) {
    startFind(tab.id, 'shortcut').catch(error => console.warn('[Q-Fill]', error));
  }
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.action.setBadgeBackgroundColor({ color: '#1d3a2a' });
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    const { clientId } = await getSettings();
    if (!clientId) chrome.tabs.create({ url: 'popup/popup.html?view=page' });
  }
});
