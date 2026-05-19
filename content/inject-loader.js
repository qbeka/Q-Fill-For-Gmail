/**
 * Classic-script loader for dynamic injection (tab-messenger fallback).
 * Manifest loads content/index.js as a module; this loader is used when injecting.
 */
(function () {
  if (globalThis.__QFILL_INITIALIZED__) return;
  const url = chrome.runtime.getURL('content/index.js');
  import(url).catch(err => console.error('[Q-Fill] inject load failed:', err));
})();
