/**
 * Extract verification codes from email plain text.
 * @module services/code-extractor
 */

import {
  CODE_VALIDATION,
  STRONG_VERIFICATION_KEYWORDS,
  WEAK_VERIFICATION_KEYWORDS
} from '../utils/constants.js';

const CODE_CAPTURE = '([0-9]{4,8}|[A-Z0-9]{4,8})';

const EXPLICIT_PATTERNS = [
  new RegExp(
    `(?:verification|security|confirmation|login|sign-?in|auth(?:entication)?|one-?time|otp|2fa)\\s*code\\s*(?:is|:|\\s)\\s*[:=]?\\s*${CODE_CAPTURE}`,
    'gi'
  ),
  new RegExp(`(?:your|the)\\s+(?:code|otp|pin|passcode)\\s*(?:is|:)\\s*[:=]?\\s*${CODE_CAPTURE}`, 'gi'),
  new RegExp(`(?:code|pin|otp|passcode)\\s*[:=]\\s*${CODE_CAPTURE}`, 'gi'),
  new RegExp(`(?:enter|use|input)\\s+(?:code|otp)?\\s*[:=]?\\s*${CODE_CAPTURE}`, 'gi')
];

const SPACED_PATTERNS = [
  /\b([0-9]{3})\s+([0-9]{3})\b/g,
  /\b([0-9]{3})-([0-9]{3})\b/g,
  /\b([0-9]{2})\s+([0-9]{2})\s+([0-9]{2})\b/g
];

const HIGHLIGHT_PATTERNS = [
  /["']([0-9]{4,8})["']/g,
  /\*\*([0-9]{4,8})\*\*/g,
  /\[([0-9]{4,8})\]/g,
  /\(([0-9]{4,8})\)/g,
  /<b>([0-9]{4,8})<\/b>/gi,
  /<strong>([0-9]{4,8})<\/strong>/gi
];

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeEmailText(text) {
  return text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} code
 * @returns {boolean}
 */
export function isValidVerificationCode(code) {
  if (!code) return false;

  const len = code.length;
  if (len < CODE_VALIDATION.MIN_LENGTH || len > CODE_VALIDATION.MAX_LENGTH) return false;
  if (!/^[0-9A-Z]+$/i.test(code)) return false;
  if (/^0x[0-9a-f]+$/i.test(code)) return false;
  if (/^(\d)\1+$/.test(code)) return false;

  const isSequential = (s) => {
    for (let i = 1; i < s.length; i++) {
      if (parseInt(s[i], 10) !== parseInt(s[i - 1], 10) + 1) return false;
    }
    return true;
  };

  const isReverseSequential = (s) => {
    for (let i = 1; i < s.length; i++) {
      if (parseInt(s[i], 10) !== parseInt(s[i - 1], 10) - 1) return false;
    }
    return true;
  };

  if (isSequential(code) || isReverseSequential(code)) return false;
  if (len === 4 && /^(19|20)\d{2}$/.test(code)) return false;
  if (/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code)) return false;
  if (/^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])$/.test(code)) return false;

  return true;
}

/**
 * @param {string} rawText - HTML or plain email body
 * @param {string} subject
 * @returns {string|null}
 */
export function extractVerificationCode(rawText, subject = '') {
  if (!rawText) return null;

  const cleanText = normalizeEmailText(rawText);
  const lowerText = cleanText.toLowerCase();

  const hasStrongContext = STRONG_VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasWeakContext = WEAK_VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));

  if (!hasStrongContext && !hasWeakContext) {
    return null;
  }

  const requireHighConfidence = !hasStrongContext;
  const candidates = [];

  for (const pattern of EXPLICIT_PATTERNS) {
    let match;
    while ((match = pattern.exec(cleanText)) !== null) {
      const code = match[1].replace(/\s/g, '').toUpperCase();
      if (!isValidVerificationCode(code)) continue;
      const nearby = cleanText
        .substring(Math.max(0, match.index - 40), match.index + 60)
        .toLowerCase();
      const phoneContext = /phone|mobile|tel:|call us|\+\d/.test(nearby);
      candidates.push({ code, score: phoneContext ? 70 : 100, source: 'explicit' });
    }
  }

  for (const pattern of SPACED_PATTERNS) {
    let match;
    while ((match = pattern.exec(cleanText)) !== null) {
      const code = match.slice(1).join('');
      if (!isValidVerificationCode(code)) continue;
      const nearbyText = cleanText
        .substring(Math.max(0, match.index - 50), match.index + 50)
        .toLowerCase();
      const nearKeyword = STRONG_VERIFICATION_KEYWORDS.some(kw => nearbyText.includes(kw));
      candidates.push({ code, score: nearKeyword ? 90 : 60, source: 'spaced' });
    }
  }

  for (const keyword of STRONG_VERIFICATION_KEYWORDS) {
    const keywordIndex = lowerText.indexOf(keyword);
    if (keywordIndex === -1) continue;

    const start = Math.max(0, keywordIndex - 30);
    const end = Math.min(cleanText.length, keywordIndex + keyword.length + 100);
    const nearbyText = cleanText.substring(start, end);
    const numPattern = /\b([0-9]{4,8})\b/g;
    let match;

    while ((match = numPattern.exec(nearbyText)) !== null) {
      const code = match[1];
      if (!isValidVerificationCode(code)) continue;
      const distance = Math.abs(match.index - (keywordIndex - start));
      candidates.push({ code, score: 80 - Math.min(distance / 5, 30), source: 'nearContext' });
    }
  }

  for (const pattern of HIGHLIGHT_PATTERNS) {
    let match;
    while ((match = pattern.exec(rawText)) !== null) {
      const code = match[1];
      if (isValidVerificationCode(code)) {
        candidates.push({ code, score: 75, source: 'highlighted' });
      }
    }
  }

  const subjectCodes = subject.match(/\b([0-9]{4,8})\b/g);
  if (subjectCodes) {
    for (const code of subjectCodes) {
      if (isValidVerificationCode(code)) {
        candidates.push({ code, score: 95, source: 'subject' });
      }
    }
  }

  if (candidates.length === 0 && hasStrongContext) {
    const fallbackPattern = /\b([0-9]{6})\b/g;
    let match;
    while ((match = fallbackPattern.exec(cleanText)) !== null) {
      const code = match[1];
      if (isValidVerificationCode(code)) {
        candidates.push({ code, score: 40, source: 'fallback6digit' });
      }
    }
  }

  if (candidates.length === 0) return null;

  const filtered = requireHighConfidence
    ? candidates.filter(c => c.score >= 75)
    : candidates;

  if (filtered.length === 0) return null;

  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.code.length === 6 ? 1 : 0) - (a.code.length === 6 ? 1 : 0);
  });

  const unique = [...new Map(filtered.map(c => [c.code, c])).values()];
  return unique[0]?.code ?? null;
}
