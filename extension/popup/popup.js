/**
 * The toolbar popup. It holds no logic of its own: it shows the state the
 * service worker sends and forwards button presses back to it.
 */

import { CLIENT_ID_PATTERN, LOOKBACK_CHOICES, PHASE, PORT_NAME, REQUEST, STATE } from '../shared/constants.js';
import { t } from '../shared/i18n.js';

const $ = id => document.getElementById(id);

const views = {
  setup: $('viewSetup'),
  connect: $('viewConnect'),
  main: $('viewMain'),
  settings: $('viewSettings')
};

let state = null;
let showSettings = false;
let editingClient = false;
let countdownTimer = 0;

if (new URLSearchParams(location.search).get('view') === 'page') document.body.classList.add('page');

// ---------------------------------------------------------------------------
// Static text

for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
$('version').textContent = t('versionLabel', chrome.runtime.getManifest().version);

const lookbackSelect = $('lookbackSelect');
for (const minutes of LOOKBACK_CHOICES) {
  lookbackSelect.add(new Option(t('settingsLookbackOption', minutes), String(minutes)));
}

// ---------------------------------------------------------------------------
// Connection to the service worker

let port = null;

function connectPort() {
  port = chrome.runtime.connect({ name: PORT_NAME });
  port.onMessage.addListener(message => {
    if (message?.type === STATE) {
      state = message;
      render();
    }
  });
  // The service worker can restart; reconnect so the popup keeps updating.
  port.onDisconnect.addListener(() => {
    port = null;
    setTimeout(() => { if (!port) connectPort(); }, 100);
  });
}

function send(type, payload = {}) {
  if (!port) connectPort();
  port.postMessage({ type, ...payload });
}

connectPort();

// ---------------------------------------------------------------------------
// Rendering

function render() {
  if (!state) return;
  const hasClient = Boolean(state.clientId) && !editingClient;
  const connected = hasClient && Boolean(state.email);
  if (!connected) showSettings = false;

  const view = !hasClient ? 'setup' : !connected ? 'connect' : showSettings ? 'settings' : 'main';
  for (const [name, el] of Object.entries(views)) el.hidden = name !== view;

  $('account').textContent = connected && !showSettings ? state.email : '';
  $('openSettings').hidden = !connected || showSettings;

  if (view === 'setup') renderSetup();
  if (view === 'connect') renderConnect();
  if (view === 'main') renderMain();
  if (view === 'settings') renderSettings();
}

function renderSetup() {
  $('setupRedirect').textContent = state.redirectUri;
  $('cancelClientEdit').hidden = !editingClient;
  const input = $('clientIdInput');
  if (!input.value && state.clientId) input.value = state.clientId;
}

function renderConnect() {
  const button = $('connectButton');
  button.disabled = state.connecting;
  button.textContent = t(state.connecting ? 'connectingButton' : 'connectButton');
  const error = $('connectError');
  error.hidden = !state.authError;
  error.textContent = state.authError;
}

function renderMain() {
  const { job, last } = state;

  const fill = $('fillButton');
  fill.disabled = Boolean(job);
  const kbd = $('fillShortcut');
  kbd.hidden = !state.shortcut;
  kbd.textContent = state.shortcut;

  $('fillHint').hidden = Boolean(job || last);
  renderProgress(job);
  renderResult(job ? null : last);
}

function renderProgress(job) {
  clearInterval(countdownTimer);
  const box = $('progress');
  box.hidden = !job;
  if (!job) return;

  const titles = {
    [PHASE.SIGNING_IN]: 'phaseSigningIn',
    [PHASE.CHECKING]: 'phaseChecking',
    [PHASE.WAITING]: 'phaseWaiting',
    [PHASE.FILLING]: 'phaseFilling'
  };
  $('progressTitle').textContent = t(titles[job.phase] || 'phaseChecking');

  const detail = $('progressDetail');
  const tick = () => {
    const seconds = Math.max(0, Math.round((job.deadline - Date.now()) / 1000));
    detail.textContent = job.phase === PHASE.WAITING ? t('phaseWaitingDetail', seconds) : '';
  };
  tick();
  if (job.phase === PHASE.WAITING) countdownTimer = setInterval(tick, 1000);
}

function renderResult(last) {
  const box = $('result');
  box.hidden = !last;
  if (!last) return;

  const hasCode = last.status === 'filled' || last.status === 'found';
  $('codeRow').hidden = !hasCode;
  $('resultCode').textContent = hasCode ? last.code : '';
  $('resultMeta').textContent = hasCode && last.from !== undefined
    ? t('resultFromSender', [last.from || 'Gmail', timeAgo(last.receivedAt)])
    : '';

  const copy = $('copyCode');
  copy.textContent = t('copy');

  let badge = '';
  let note = '';
  let tone = 'neutral';
  switch (last.status) {
    case 'filled':
      badge = t('resultFilled');
      tone = 'success';
      break;
    case 'found':
      badge = t('resultFound');
      tone = 'error';
      note = t({ 'no-field': 'resultNoField', blocked: 'resultBlocked', gone: 'resultGone' }[last.reason] || 'resultRejected');
      break;
    case 'none':
      badge = t('resultNone', last.lookbackMinutes ?? state.lookbackMinutes);
      tone = 'error';
      note = t('resultNoneHint');
      break;
    case 'cancelled':
      badge = t('resultCancelled');
      break;
    case 'error':
      badge = last.message;
      tone = 'error';
      break;
  }
  box.dataset.tone = tone;
  $('resultBadge').textContent = badge;
  $('resultNote').textContent = note;
}

function renderSettings() {
  $('settingsEmail').textContent = state.email || t('notConnected');
  lookbackSelect.value = String(state.lookbackMinutes);
  const shortcut = $('settingsShortcut');
  shortcut.textContent = state.shortcut || t('shortcutNone');
  $('settingsClientId').textContent = state.clientId;
  $('settingsRedirect').textContent = state.redirectUri;
}

function timeAgo(ms) {
  if (!ms) return '';
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  return minutes < 1 ? t('agoNow') : t('agoMinutes', minutes);
}

// ---------------------------------------------------------------------------
// Actions

$('clientForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('clientIdInput');
  const value = input.value.trim();
  const valid = CLIENT_ID_PATTERN.test(value);
  input.setAttribute('aria-invalid', String(!valid));
  $('clientIdError').hidden = valid;
  if (!valid) return;
  editingClient = false;
  send(REQUEST.SAVE_CLIENT_ID, { clientId: value });
});

$('cancelClientEdit').addEventListener('click', () => {
  editingClient = false;
  showSettings = true;
  render();
});

$('clientIdInput').addEventListener('input', () => {
  $('clientIdInput').removeAttribute('aria-invalid');
  $('clientIdError').hidden = true;
});

$('connectButton').addEventListener('click', () => send(REQUEST.CONNECT));

$('fillButton').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id !== undefined) send(REQUEST.FIND, { tabId: tab.id });
});

$('cancelButton').addEventListener('click', () => send(REQUEST.CANCEL));

$('openSettings').addEventListener('click', () => {
  showSettings = true;
  render();
});

$('closeSettings').addEventListener('click', () => {
  showSettings = false;
  render();
});

lookbackSelect.addEventListener('change', () => send(REQUEST.SET_LOOKBACK, { minutes: Number(lookbackSelect.value) }));

$('changeShortcut').addEventListener('click', () => send(REQUEST.OPEN_SHORTCUTS));

$('changeClient').addEventListener('click', () => {
  editingClient = true;
  showSettings = false;
  $('clientIdInput').value = state?.clientId || '';
  render();
});

$('disconnectButton').addEventListener('click', () => {
  showSettings = false;
  send(REQUEST.DISCONNECT);
});

$('copyCode').addEventListener('click', () => copyText(state?.last?.code, $('copyCode')));

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', () => copyText($(button.dataset.copy).textContent, button));
}

async function copyText(text, button) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = t('copied');
    setTimeout(() => { button.textContent = t('copy'); }, 1400);
  } catch {
    // Clipboard blocked; the text is selectable as a fallback.
  }
}
