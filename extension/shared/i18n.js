/**
 * Looks up a string in _locales/<lang>/messages.json.
 * Falls back to the key itself so a missing string is visible, not blank.
 * @param {string} key
 * @param {string|number|Array<string|number>} [substitutions]
 * @returns {string}
 */
export function t(key, substitutions) {
  const subs = substitutions === undefined ? undefined : [].concat(substitutions).map(String);
  try {
    return chrome.i18n.getMessage(key, subs) || key;
  } catch {
    return key;
  }
}
