/**
 * OAuth client ID lives in manifest.json (required by chrome.identity).
 * @module utils/oauth-config
 */

const PLACEHOLDER_PATTERN = /YOUR_|PLACEHOLDER|INSERT|REPLACE|xxx{3,}/i;
const CLIENT_ID_PATTERN = /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

/**
 * Client ID from manifest — this is what chrome.identity.getAuthToken uses.
 * @returns {string}
 */
export function getManifestClientId() {
  try {
    return chrome.runtime.getManifest()?.oauth2?.client_id?.trim() ?? '';
  } catch {
    return '';
  }
}

/**
 * @param {string} clientId
 * @returns {boolean}
 */
export function isValidClientIdFormat(clientId) {
  if (!clientId) return false;
  if (PLACEHOLDER_PATTERN.test(clientId)) return false;
  return CLIENT_ID_PATTERN.test(clientId);
}

/**
 * @returns {string|null} User-facing setup error, or null if OK
 */
export function getOAuthSetupError() {
  const clientId = getManifestClientId();

  if (!clientId) {
    return (
      'OAuth is not configured. Copy manifest_template.json to manifest.json and set oauth2.client_id to your Google Cloud Chrome Extension client ID.'
    );
  }

  if (!isValidClientIdFormat(clientId)) {
    return (
      `Invalid OAuth client ID in manifest.json: "${clientId}". ` +
      'It must look like 123456789012-abcdefghijklmnop.apps.googleusercontent.com ' +
      '(from Google Cloud → Credentials → OAuth client ID → Chrome extension). ' +
      'The extension ID on chrome://extensions must match the item ID in that credential.'
    );
  }

  return null;
}

/**
 * @param {string} rawMessage
 * @returns {string}
 */
export function explainOAuthError(rawMessage) {
  const msg = String(rawMessage || '');
  const lower = msg.toLowerCase();

  if (lower.includes('bad client id') || lower.includes('invalid_client')) {
    return getOAuthSetupError() || (
      'Google rejected the OAuth client ID. In Google Cloud, create an OAuth client of type ' +
      '"Chrome extension", paste your extension ID from chrome://extensions, then put the ' +
      'generated Client ID in manifest.json under oauth2.client_id and reload the extension.'
    );
  }

  if (lower.includes('access_denied') || lower.includes('user denied')) {
    return 'Sign-in was cancelled. Try Connect to Gmail again.';
  }

  return msg || 'Authentication failed';
}
