/**
 * The three Gmail API calls Q-Fill makes. All are read-only.
 */

const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export class GmailError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = 'GmailError';
    this.status = status;
  }
}

/**
 * @param {string} path
 * @param {string} token
 * @param {AbortSignal} [signal]
 */
async function request(path, token, signal) {
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new GmailError(0, 'Could not reach Gmail. Check your connection.');
  }

  if (!response.ok) {
    let message = `Gmail answered ${response.status}`;
    try {
      const body = await response.json();
      if (body?.error?.message) message = body.error.message;
    } catch {
      // Keep the status message.
    }
    throw new GmailError(response.status, message);
  }
  return response.json();
}

/**
 * The Gmail search used to list candidate messages. Everything received after
 * the given time, in every folder including spam, except drafts and trash.
 * @param {number} afterMs
 * @returns {string}
 */
export function recentQuery(afterMs) {
  return `after:${Math.floor(afterMs / 1000)} -in:drafts -in:trash -in:chats`;
}

/**
 * IDs of the newest messages received after a point in time.
 * @param {string} token
 * @param {{ afterMs: number, max: number, signal?: AbortSignal }} options
 * @returns {Promise<string[]>}
 */
export async function listRecentMessageIds(token, { afterMs, max, signal }) {
  const params = new URLSearchParams({
    q: recentQuery(afterMs),
    maxResults: String(max),
    includeSpamTrash: 'true'
  });
  const data = await request(`/messages?${params}`, token, signal);
  return (data.messages || []).map(m => m.id).filter(Boolean);
}

/**
 * @param {string} token
 * @param {string} id
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} Gmail message resource, format=full.
 */
export function getMessage(token, id, signal) {
  return request(`/messages/${encodeURIComponent(id)}?format=full`, token, signal);
}

/**
 * @param {string} token
 * @returns {Promise<string>} The connected Gmail address.
 */
export async function getEmailAddress(token) {
  const profile = await request('/profile', token);
  return profile.emailAddress || '';
}
