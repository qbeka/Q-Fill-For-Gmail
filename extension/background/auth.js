/**
 * Google sign-in with chrome.identity.launchWebAuthFlow.
 *
 * This flow works in every Chromium browser (Chrome, Edge, Brave, Arc,
 * Vivaldi, Opera) and with any Google account, not only the one signed in to
 * the browser. The access token lives in chrome.storage.session, which is
 * memory only, and is refreshed silently when it expires.
 */

import { GMAIL_SCOPE } from '../shared/constants.js';
import { getSettings } from './settings.js';

const TOKEN_KEY = 'accessToken';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

/** An auth failure with a stable code the popup can explain. */
export class AuthError extends Error {
  /**
   * @param {'no_client_id'|'cancelled'|'interaction_required'|'scope_denied'|'access_denied'|'failed'} code
   * @param {string} [detail]
   */
  constructor(code, detail = '') {
    super(detail || code);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** The redirect URI to add to your OAuth client: https://<extension-id>.chromiumapp.org/ */
export function redirectUri() {
  return chrome.identity.getRedirectURL();
}

/**
 * Builds the Google authorization URL for the implicit (token) flow.
 * @param {string} clientId
 * @param {{ interactive: boolean, loginHint?: string }} options
 * @returns {string}
 */
export function buildAuthUrl(clientId, { interactive, loginHint }) {
  const url = new URL(AUTH_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri(),
    scope: GMAIL_SCOPE,
    include_granted_scopes: 'true',
    prompt: interactive ? 'select_account' : 'none',
    ...(loginHint ? { login_hint: loginHint } : {})
  }).toString();
  return url.toString();
}

/**
 * Reads the token, or the error, from the URL Google redirected to.
 * @param {string} responseUrl
 * @param {number} [now]
 * @returns {{ token: string, expiresAt: number }}
 */
export function parseAuthResponse(responseUrl, now = Date.now()) {
  const url = new URL(responseUrl);
  const params = new URLSearchParams(url.hash.slice(1) || url.search.slice(1));
  const error = params.get('error');
  if (error === 'access_denied') throw new AuthError('access_denied');
  if (error === 'interaction_required' || error === 'login_required' || error === 'consent_required' || error === 'account_selection_required') {
    throw new AuthError('interaction_required', error);
  }
  if (error) throw new AuthError('failed', error);

  const token = params.get('access_token');
  if (!token) throw new AuthError('failed', 'No access token in the response');

  const scopes = (params.get('scope') || '').split(/\s+/);
  if (!scopes.includes(GMAIL_SCOPE)) throw new AuthError('scope_denied');

  const seconds = Number(params.get('expires_in')) || 3600;
  return { token, expiresAt: now + seconds * 1000 };
}

/**
 * @param {string} clientId
 * @param {boolean} interactive
 * @param {string} loginHint
 */
async function runFlow(clientId, interactive, loginHint) {
  const details = { url: buildAuthUrl(clientId, { interactive, loginHint }), interactive };
  if (!interactive) {
    // Google's prompt=none page redirects with script, so let it finish loading.
    details.abortOnLoadForNonInteractive = false;
    details.timeoutMsForNonInteractive = 10_000;
  }

  let responseUrl;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow(details);
  } catch (error) {
    const message = String(error?.message || error);
    if (!interactive) throw new AuthError('interaction_required', message);
    if (/did not approve|closed|cancel/i.test(message)) throw new AuthError('cancelled', message);
    throw new AuthError('failed', message);
  }
  if (!responseUrl) throw new AuthError('cancelled');

  const result = parseAuthResponse(responseUrl);
  await chrome.storage.session.set({ [TOKEN_KEY]: result });
  return result.token;
}

/**
 * Returns a valid access token. Uses the cached one, then tries a silent
 * refresh, then, if allowed, opens the Google sign-in window.
 * @param {{ interactive?: boolean }} [options]
 * @returns {Promise<string>}
 */
export async function getAccessToken({ interactive = false } = {}) {
  const { [TOKEN_KEY]: cached } = await chrome.storage.session.get(TOKEN_KEY);
  if (cached?.token && cached.expiresAt - Date.now() > 60_000) return cached.token;

  const { clientId, email } = await getSettings();
  if (!clientId) throw new AuthError('no_client_id');

  try {
    return await runFlow(clientId, false, email);
  } catch (error) {
    if (!interactive) throw error;
  }
  return runFlow(clientId, true, email);
}

/**
 * Opens the Google account picker and consent screen.
 * @returns {Promise<string>} The access token.
 */
export async function signIn() {
  const { clientId } = await getSettings();
  if (!clientId) throw new AuthError('no_client_id');
  await dropToken();
  return runFlow(clientId, true, '');
}

/** Forgets the cached token, for example after Gmail answers 401. */
export async function dropToken() {
  await chrome.storage.session.remove(TOKEN_KEY);
}

/** Revokes the token at Google and forgets it. */
export async function signOut() {
  const { [TOKEN_KEY]: cached } = await chrome.storage.session.get(TOKEN_KEY);
  await dropToken();
  if (!cached?.token) return;
  try {
    await fetch(REVOKE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: cached.token })
    });
  } catch {
    // The token expires on its own within an hour.
  }
}
