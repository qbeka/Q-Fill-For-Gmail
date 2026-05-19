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
  try {
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)) % 4, '=');
    const raw = atob(padded);
    return decodeURIComponent(
      Array.from(raw)
        .map(c => `%${`00${c.charCodeAt(0).toString(16)}`.slice(-2)}`)
        .join('')
    );
  } catch {
    return '';
  }
}

/**
 * @param {Object} part - Gmail message part
 * @returns {string}
 */
export function extractBodyContent(part) {
  let content = '';

  if (part.body?.data) {
    content += `${decodeBase64Url(part.body.data)} `;
  }

  if (part.parts?.length) {
    for (const child of part.parts) {
      content += `${extractBodyContent(child)} `;
    }
  }

  return content;
}

/**
 * @param {Object} message - Full Gmail message resource
 * @returns {{ subject: string, from: string, text: string }}
 */
export function toPlainText(message) {
  const subject = getHeader(message, 'subject');
  const from = getHeader(message, 'from');
  const body = extractBodyContent(message.payload);
  return {
    subject,
    from,
    text: `${subject} ${body}`.trim()
  };
}
