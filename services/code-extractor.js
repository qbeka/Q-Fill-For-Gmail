/**
 * Extract verification codes from email plain text.
 * @module services/code-extractor
 */

import {
  CODE_VALIDATION,
  STRONG_VERIFICATION_KEYWORDS
} from '../utils/constants.js';

/** Verification codes are almost always digits */
const NUMERIC_CODE = '([0-9]{4,8})';

/** Rare alphanumeric codes must contain at least one digit */
const ALNUM_CODE = '([A-Z0-9]*[0-9][A-Z0-9]*)';

const EXPLICIT_PATTERNS_NUMERIC = [
  new RegExp(
    `(?:verification|security|confirmation|login|sign-?in|auth(?:entication)?|one-?time|otp|2fa)\\s*code\\s*(?:is|:)\\s*[:=]?\\s*${NUMERIC_CODE}`,
    'gi'
  ),
  new RegExp(`(?:your|the)\\s+(?:code|otp|pin|passcode)\\s*(?:is|:)\\s*[:=]?\\s*${NUMERIC_CODE}`, 'gi'),
  new RegExp(`(?:code|pin|otp|passcode)\\s*(?:is|:)\\s*[:=]?\\s*${NUMERIC_CODE}`, 'gi'),
  new RegExp(
    `(?:enter|use|input|type|copy)\\s+(?:this\\s+)?(?:code|otp|pin)?\\s*[:=]?\\s*${NUMERIC_CODE}`,
    'gi'
  ),
  new RegExp(`(?:code|otp|pin)\\s*(?:is|:)\\s*${NUMERIC_CODE}`, 'gi')
];

const EXPLICIT_PATTERNS_ALNUM = [
  new RegExp(
    `(?:verification|security|confirmation|otp|2fa)\\s*code\\s*(?:is|:)\\s*[:=]?\\s*${ALNUM_CODE}`,
    'gi'
  ),
  new RegExp(`(?:your|the)\\s+(?:code|otp|pin)\\s*(?:is|:)\\s*[:=]?\\s*${ALNUM_CODE}`, 'gi')
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
  /<b[^>]*>([0-9]{4,8})<\/b>/gi,
  /<strong[^>]*>([0-9]{4,8})<\/strong>/gi
];

/** All-letter tokens that are not verification codes */
const BLOCKED_WORDS = new Set([
  'EMAIL', 'INBOX', 'GMAIL', 'GOOGLE', 'CLICK', 'HTTPS', 'HTTP', 'LOGIN',
  'PHONE', 'MOBILE', 'TOKEN', 'WORDS', 'HELLO', 'THANK', 'TEAMS', 'OFFER',
  'STORE', 'SHARE', 'LINKS', 'UNSUB', 'ORDER', 'TOTAL', 'QUOTE', 'APPLE',
  'AMAZON', 'FACEB', 'INSTA', 'TWITT', 'YAHOO', 'OUTLO', 'INBOX', 'SPAM',
  'TRASH', 'DRAFT', 'SENT', 'MAIL', 'INFO', 'NEWS', 'DEAL', 'SALE', 'FREE',
  'VIEW', 'OPEN', 'READ', 'REPLY', 'SEND', 'FROM', 'SUBJECT', 'BODY', 'TEXT',
  'HTML', 'HTTP', 'WWW', 'COM', 'ORG', 'NET', 'THESE', 'THOSE', 'THEIR',
  'YOUR', 'OURS', 'THIS', 'THAT', 'WITH', 'HAVE', 'WILL', 'BEEN', 'WERE'
]);

/**
 * @param {string} text
 * @returns {string}
 */
function normalizeEmailText(text) {
  return text
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} subject
 * @param {string} lowerCombined
 * @returns {number}
 */
function emailIntentScore(subject, lowerCombined) {
  let score = 0;

  if (STRONG_VERIFICATION_KEYWORDS.some(kw => lowerCombined.includes(kw))) {
    score += 40;
  }

  if (/\b(otp|2fa|mfa|verification|verify|passcode|one-?time)\b/i.test(subject)) {
    score += 35;
  }

  if (/\b\d{4,8}\b/.test(lowerCombined)) {
    score += 15;
  }

  return score;
}

/**
 * @param {string} code
 * @param {{ strict?: boolean }} [options]
 * @returns {boolean}
 */
export function isValidVerificationCode(code, options = {}) {
  const { strict = false } = options;

  if (!code) return false;

  const normalized = String(code).trim().toUpperCase();
  const len = normalized.length;

  if (len < CODE_VALIDATION.MIN_LENGTH || len > CODE_VALIDATION.MAX_LENGTH) return false;
  if (!/^[0-9A-Z]+$/.test(normalized)) return false;
  if (BLOCKED_WORDS.has(normalized)) return false;

  const digitCount = (normalized.match(/[0-9]/g) || []).length;
  const letterCount = (normalized.match(/[A-Z]/g) || []).length;

  // Real OTPs are numeric; alphanumeric must include digits and not be a dictionary word
  if (digitCount === 0) return false;
  if (letterCount > 0 && digitCount === 0) return false;
  if (letterCount === len) return false;

  if (strict && /^(\d)\1+$/.test(normalized)) return false;
  if (strict && len === 4 && /^(19|20)\d{2}$/.test(normalized)) return false;

  return true;
}

/**
 * @param {RegExp} pattern
 * @param {string} text
 * @param {(match: RegExpExecArray) => void} onMatch
 */
function forEachMatch(pattern, text, onMatch) {
  const re = new RegExp(pattern.source, pattern.flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    onMatch(match);
  }
}

/**
 * @param {Array<{ code: string, score: number, source: string }>} candidates
 * @returns {{ code: string, score: number, source: string } | null}
 */
export function pickBestCandidate(candidates) {
  if (!candidates.length) return null;

  const viable = candidates.filter(c => isValidVerificationCode(c.code));
  if (!viable.length) return null;

  viable.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aNum = /^[0-9]+$/.test(a.code) ? 1 : 0;
    const bNum = /^[0-9]+$/.test(b.code) ? 1 : 0;
    if (bNum !== aNum) return bNum - aNum;
    return (b.code.length === 6 ? 1 : 0) - (a.code.length === 6 ? 1 : 0);
  });

  const unique = [...new Map(viable.map(c => [c.code, c])).values()];
  return unique[0] ?? null;
}

/**
 * @param {string} rawText
 * @param {string} subject
 * @returns {Array<{ code: string, score: number, source: string }>}
 */
export function extractCodeCandidates(rawText, subject = '') {
  if (!rawText && !subject) return [];

  const cleanText = normalizeEmailText(rawText || '');
  const combined = `${subject} ${cleanText}`.trim();
  const lowerText = combined.toLowerCase();
  const intent = emailIntentScore(subject, lowerText);

  const candidates = [];

  const addNumeric = (match, score, source) => {
    const code = match[1].replace(/\s/g, '');
    if (!isValidVerificationCode(code)) return;

    const index = match.index ?? 0;
    const nearby = combined
      .substring(Math.max(0, index - 50), index + 80)
      .toLowerCase();

    if (/\b(phone|mobile|tel:|call us|\+1\d{10})\b/.test(nearby)) {
      score = Math.min(score, 80);
    }

    candidates.push({ code, score, source });
  };

  for (const pattern of EXPLICIT_PATTERNS_NUMERIC) {
    forEachMatch(pattern, cleanText, (match) => addNumeric(match, 100, 'explicit'));
  }

  for (const pattern of EXPLICIT_PATTERNS_ALNUM) {
    forEachMatch(pattern, cleanText, (match) => {
      const code = match[1].replace(/\s/g, '').toUpperCase();
      if (!isValidVerificationCode(code)) return;
      candidates.push({ code, score: 95, source: 'explicitAlnum' });
    });
  }

  for (const pattern of SPACED_PATTERNS) {
    forEachMatch(pattern, cleanText, (match) => {
      const code = match.slice(1).join('');
      if (!isValidVerificationCode(code)) return;
      const index = match.index ?? 0;
      const nearby = combined.substring(Math.max(0, index - 60), index + 60).toLowerCase();
      const nearStrong = STRONG_VERIFICATION_KEYWORDS.some(kw => nearby.includes(kw));
      if (nearStrong) {
        candidates.push({ code, score: 88, source: 'spaced' });
      }
    });
  }

  for (const keyword of STRONG_VERIFICATION_KEYWORDS) {
    let searchFrom = 0;
    let keywordIndex;

    while ((keywordIndex = lowerText.indexOf(keyword, searchFrom)) !== -1) {
      searchFrom = keywordIndex + keyword.length;
      const start = Math.max(0, keywordIndex - 30);
      const end = Math.min(combined.length, keywordIndex + keyword.length + 80);
      const nearbyText = combined.substring(start, end);
      const numPattern = /\b([0-9]{4,8})\b/g;
      let match;

      while ((match = numPattern.exec(nearbyText)) !== null) {
        const code = match[1];
        if (!isValidVerificationCode(code)) continue;
        const distance = Math.abs(match.index - (keywordIndex - start));
        candidates.push({
          code,
          score: 85 - Math.min(distance / 3, 30),
          source: 'nearStrongKeyword'
        });
      }
    }
  }

  for (const pattern of HIGHLIGHT_PATTERNS) {
    forEachMatch(pattern, rawText || '', (match) => {
      const code = match[1];
      if (isValidVerificationCode(code) && intent >= 30) {
        candidates.push({ code, score: 76, source: 'highlighted' });
      }
    });
  }

  const subjectCodes = subject.match(/\b([0-9]{4,8})\b/g);
  if (subjectCodes) {
    for (const code of subjectCodes) {
      if (isValidVerificationCode(code)) {
        candidates.push({ code, score: 94, source: 'subject' });
      }
    }
  }

  if (/^\s*otp\s*$/i.test(subject.trim()) || /\botp\b/i.test(subject)) {
    const bodyCode = cleanText.match(/\b([0-9]{4,8})\b/);
    if (bodyCode && isValidVerificationCode(bodyCode[1])) {
      candidates.push({ code: bodyCode[1], score: 93, source: 'otpSubject' });
    }
  }

  // Last resort: any number in a clearly verification-related email only
  if (candidates.length === 0 && intent >= 50) {
    forEachMatch(/\b([0-9]{4,8})\b/g, cleanText, (match) => {
      const code = match[1];
      if (isValidVerificationCode(code, { strict: true })) {
        candidates.push({ code, score: 50, source: 'fallback' });
      }
    });
  }

  // Drop low-confidence hits from non-verification emails (newsletters, etc.)
  const minScore = intent >= 40 ? 70 : 85;
  return candidates.filter(c => c.score >= minScore);
}

/**
 * @param {string} rawText
 * @param {string} subject
 * @returns {string|null}
 */
export function extractVerificationCode(rawText, subject = '') {
  return pickBestCandidate(extractCodeCandidates(rawText, subject))?.code ?? null;
}

/**
 * @param {string} rawText
 * @param {string} subject
 * @returns {{ code: string, score: number, source: string } | null}
 */
export function extractBestCode(rawText, subject = '') {
  return pickBestCandidate(extractCodeCandidates(rawText, subject));
}
