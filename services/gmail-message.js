/**
 * Parse Gmail API message payloads into plain text.
 * @module services/gmail-message
 */

/**
 * @param {Object} message
 * @param {string} headerName
 * @returns {string}
 */
export function getHeader(message, headerName) {
  const headers = message?.payload?.headers || [];
  const found = headers.find(h => h.name.toLowerCase() === headerName.toLowerCase());
  return found?.value || '';
}

/**
 * @param {string} data - Base64url-encoded chunk
 * @returns {string}
 */
export function decodeBase64Url(data) {
  if (!data) return '';

  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=');
    const raw = atob(padded);

    try {
      return decodeURIComponent(
        Array.from(raw)
          .map(c => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
          .join('')
      );
    } catch {
      return raw;
    }
  } catch {
    return '';
  }
}

/**
 * Prefer plain-text parts, then HTML.
 * @param {Object} part
 * @returns {string}
 */
export function extractBodyContent(part) {
  if (!part) return '';

  if (part.parts?.length) {
    const plainParts = [];
    const otherParts = [];

    const walk = (p) => {
      if (p.parts?.length) {
        p.parts.forEach(walk);
        return;
      }
      if (p.mimeType === 'text/plain' && p.body?.data) {
        plainParts.push(decodeBase64Url(p.body.data));
      } else if (p.body?.data) {
        otherParts.push(decodeBase64Url(p.body.data));
      }
    };

    part.parts.forEach(walk);

    if (plainParts.length) return plainParts.join(' ');
    if (otherParts.length) return otherParts.join(' ');
  }

  if (part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  return '';
}

/**
 * @param {Object} message - Full Gmail message resource
 * @returns {{ subject: string, from: string, text: string, body: string }}
 */
export function toPlainText(message) {
  const subject = getHeader(message, 'subject');
  const from = getHeader(message, 'from');
  const body = extractBodyContent(message.payload);

  return {
    subject,
    from,
    body,
    text: `${subject}\n${body}`.trim()
  };
}
