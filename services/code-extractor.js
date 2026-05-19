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

/** Patterns that strongly indicate the captured digits are a verification code */
const EXPLICIT_PATTERNS = [
  new RegExp(
    `(?:verification|security|confirmation|login|sign-?in|auth(?:entication)?|one-?time|otp|2fa)\\s*code\\s*(?:is|:)\\s*[:=]?\\s*${CODE_CAPTURE}`,
    'gi'
  ),
  new RegExp(`(?:your|the)\\s+(?:code|otp|pin|passcode)\\s*(?:is|:)\\s*[:=]?\\s*${CODE_CAPTURE}`, 'gi'),
  new RegExp(`(?:code|pin|otp|passcode)\\s*(?:is|:)\\s*[:=]?\\s*${CODE_CAPTURE}`, 'gi'),
  new RegExp(`(?:enter|use|input|type)\\s+(?:this\\s+)?(?:code|otp)?\\s*[:=]?\\s*${CODE_CAPTURE}`, 'gi'),
  new RegExp(`(?:is|:)\\s*${CODE_CAPTURE}(?:\\s|$|[.!,])`, 'gi')
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
  /<b[^>]*>([0-9]{4,8})<\/b>/gi,
  /<strong[^>]*>([0-9]{4,8})<\/strong>/gi,
  /font-size:\s*(?:2[4-9]|[3-9]\d)px[^>]*>([0-9]{4,8})</gi
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
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} code
 * @param {{ strict?: boolean }} [options]
 * @returns {boolean}
 */
export function isValidVerificationCode(code, options = {}) {
  const { strict = false } = options;

  if (!code) return false;

  const len = code.length;
  if (len < CODE_VALIDATION.MIN_LENGTH || len > CODE_VALIDATION.MAX_LENGTH) return false;
  if (!/^[0-9A-Z]+$/i.test(code)) return false;
  if (/^0x[0-9a-f]+$/i.test(code)) return false;

  // Reject obvious placeholders (000000, 111111) in strict mode only
  if (strict && /^(\d)\1+$/.test(code)) return false;

  if (strict && len === 4 && /^(19|20)\d{2}$/.test(code)) return false;
  if (strict && /^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(code)) return false;
  if (strict && /^(0[1-9]|[12]\d|3[01])(0[1-9]|1[0-2])$/.test(code)) return false;

  // Do NOT reject sequential codes (123456) — real services and test emails use them
  return true;
}

/**
 * @param {RegExp} pattern
 * @param {string} text
 * @param {(code: string, index: number) => void} onMatch
 */
function forEachMatch(pattern, text, onMatch) {
  const re = new RegExp(pattern.source, pattern.flags);
  let match;
  while ((match = re.exec(text)) !== null) {
    onMatch(match, match.index);
  }
}

/**
 * @param {string} rawText
 * @param {string} subject
 * @returns {string|null}
 */
export function extractVerificationCode(rawText, subject = '') {
  if (!rawText && !subject) return null;

  const cleanText = normalizeEmailText(rawText || '');
  const combined = `${subject} ${cleanText}`.trim();
  const lowerText = combined.toLowerCase();

  const hasStrongContext = STRONG_VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasWeakContext = WEAK_VERIFICATION_KEYWORDS.some(kw => lowerText.includes(kw));
  const hasAnyContext = hasStrongContext || hasWeakContext;

  const candidates = [];

  for (const pattern of EXPLICIT_PATTERNS) {
    forEachMatch(pattern, cleanText, (match) => {
      const code = match[1].replace(/\s/g, '').toUpperCase();
      if (!isValidVerificationCode(code)) return;

      const nearby = combined
        .substring(Math.max(0, match.index - 40), match.index + 80)
        .toLowerCase();
      const phoneContext = /\b(phone|mobile|tel:|call us|\+1\d)/.test(nearby);
      candidates.push({
        code,
        score: phoneContext ? 85 : 100,
        source: 'explicit'
      });
    });
  }

  for (const pattern of SPACED_PATTERNS) {
    forEachMatch(pattern, cleanText, (match) => {
      const code = match.slice(1).join('');
      if (!isValidVerificationCode(code)) return;

      const nearbyText = combined
        .substring(Math.max(0, match.index - 50), match.index + 50)
        .toLowerCase();
      const nearKeyword = STRONG_VERIFICATION_KEYWORDS.some(kw => nearbyText.includes(kw));
      candidates.push({ code, score: nearKeyword ? 90 : 65, source: 'spaced' });
    });
  }

  for (const keyword of STRONG_VERIFICATION_KEYWORDS) {
    let searchFrom = 0;
    let keywordIndex;

    while ((keywordIndex = lowerText.indexOf(keyword, searchFrom)) !== -1) {
      searchFrom = keywordIndex + keyword.length;
      const start = Math.max(0, keywordIndex - 40);
      const end = Math.min(combined.length, keywordIndex + keyword.length + 120);
      const nearbyText = combined.substring(start, end);
      const numPattern = /\b([0-9]{4,8})\b/g;
      let match;

      while ((match = numPattern.exec(nearbyText)) !== null) {
        const code = match[1];
        if (!isValidVerificationCode(code)) continue;
        const distance = Math.abs(match.index - (keywordIndex - start));
        candidates.push({
          code,
          score: 82 - Math.min(distance / 4, 35),
          source: 'nearContext'
        });
      }
    }
  }

  for (const pattern of HIGHLIGHT_PATTERNS) {
    forEachMatch(pattern, rawText || '', (match) => {
      const code = match[1];
      if (isValidVerificationCode(code)) {
        candidates.push({ code, score: 78, source: 'highlighted' });
      }
    });
  }

  const subjectCodes = subject.match(/\b([0-9]{4,8})\b/g);
  if (subjectCodes) {
    for (const code of subjectCodes) {
      if (isValidVerificationCode(code)) {
        candidates.push({ code, score: 95, source: 'subject' });
      }
    }
  }

  // Subject-only OTP / verification hint with code in body
  if (/^\s*otp\s*$/i.test(subject.trim()) || /\botp\b/i.test(subject)) {
    const bodyCode = cleanText.match(/\b([0-9]{4,8})\b/);
    if (bodyCode && isValidVerificationCode(bodyCode[1])) {
      candidates.push({ code: bodyCode[1], score: 92, source: 'otpSubject' });
    }
  }

  if (candidates.length === 0 && hasStrongContext) {
    forEachMatch(/\b([0-9]{4,8})\b/g, cleanText, (match) => {
      const code = match[1];
      if (isValidVerificationCode(code, { strict: true })) {
        candidates.push({ code, score: 45, source: 'fallback' });
      }
    });
  }

  if (candidates.length === 0) return null;

  // High-confidence matches do not require extra keyword context
  const highConfidence = candidates.filter(c => c.score >= 75);
  const pool = highConfidence.length > 0
    ? highConfidence
    : (hasAnyContext ? candidates.filter(c => c.score >= 60) : []);

  if (pool.length === 0) return null;

  pool.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.code.length === 6 ? 1 : 0) - (a.code.length === 6 ? 1 : 0);
  });

  const unique = [...new Map(pool.map(c => [c.code, c])).values()];
  return unique[0]?.code ?? null;
}
