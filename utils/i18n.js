/**
 * Thin wrapper around chrome.i18n for background/popup/content.
 * @module utils/i18n
 */

/**
 * @param {string} key
 * @param {string|string[]} [substitutions]
 * @returns {string}
 */
export function t(key, substitutions) {
  try {
    const message = chrome.i18n.getMessage(key, substitutions);
    return message || key;
  } catch {
    return key;
  }
}

/**
 * @param {string} key
 * @param {string} version
 */
export function tVersion(key, version) {
  return t(key, [version]);
}
