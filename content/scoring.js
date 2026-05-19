/**
 * Confidence scoring for verification-code input fields.
 * @module content/scoring
 */

import {
  DEFINITIVE_KEYWORDS,
  STRONG_KEYWORDS,
  MEDIUM_KEYWORDS,
  STRONG_NEGATIVE,
  WEAK_NEGATIVE
} from '../utils/input-keywords.js';
import {
  textIncludesKeyword,
  getAttributeText,
  getContextText,
  isInModal,
  isInViewport
} from './dom.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger(false).debug;

/**
 * @param {HTMLElement} input
 * @param {number} codeLength
 * @returns {number}
 */
export function calculateScore(input, codeLength = 6) {
  let score = 0;
  const attrText = getAttributeText(input);
  const contextText = getContextText(input);
  const combinedText = `${attrText} ${contextText}`;
  const type = (input.type || 'text').toLowerCase();
  const autocomplete = (input.autocomplete || '').toLowerCase();
  const inputmode = (input.inputMode || input.getAttribute('inputmode') || '').toLowerCase();
  const maxLen = input.maxLength;

  if (autocomplete === 'one-time-code') score += 300;

  for (const kw of DEFINITIVE_KEYWORDS) {
    if (attrText.includes(kw.replace(/-/g, ' ')) || attrText.includes(kw)) {
      score += 150;
      break;
    }
  }

  for (const kw of STRONG_KEYWORDS) {
    if (attrText.includes(kw)) score += 60;
    if (contextText.includes(kw) && !attrText.includes(kw)) score += 40;
  }

  for (const kw of MEDIUM_KEYWORDS) {
    if (attrText.includes(kw)) score += 25;
    if (contextText.includes(kw) && !attrText.includes(kw)) score += 15;
  }

  if (maxLen === 1) score += 100;
  else if (maxLen > 0 && maxLen === codeLength) score += 95;
  else if (maxLen >= 4 && maxLen <= 8) score += 70;
  else if (maxLen >= 9 && maxLen <= 12) score += 30;

  if (inputmode === 'numeric') score += 50;
  else if (inputmode === 'tel') score += 35;

  if (type === 'tel') score += 40;
  else if (type === 'number') score += 30;

  const pattern = input.pattern || '';
  if (pattern && (/\\d/.test(pattern) || /\[0-9\]/.test(pattern))) score += 35;

  if (document.activeElement === input) score += 80;
  else if (globalThis.__QFILL_LAST_FOCUSED__ === input) score += 55;

  if (input.closest(
    '[class*="otp"], [class*="pin-input"], [class*="code-input"], [data-otp], [data-testid*="otp"], [id*="otp"]'
  )) {
    score += 45;
  }

  const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
  if (/digit|character|position/.test(ariaLabel) && /of|\//.test(ariaLabel)) score += 40;

  if (isInModal(input)) score += 50;
  if (isInViewport(input)) score += 30;
  if (!input.value?.trim()) score += 20;

  const pageContext = `${document.title} ${window.location.href}`.toLowerCase();
  if (STRONG_KEYWORDS.some(kw => pageContext.includes(kw))) score += 25;

  for (const kw of STRONG_NEGATIVE) {
    if (textIncludesKeyword(attrText, kw)) score -= 100;
    if (textIncludesKeyword(contextText, kw) && !STRONG_KEYWORDS.some(sk => contextText.includes(sk))) {
      score -= 50;
    }
  }

  for (const kw of WEAK_NEGATIVE) {
    if (textIncludesKeyword(combinedText, kw)) score -= 30;
  }

  if (type === 'email') score -= 150;
  if (type === 'password' && !/otp|code|pin/.test(combinedText)) score -= 80;
  if (maxLen > 20 && maxLen < 1000) score -= 80;
  if (input.value?.length > 12) score -= 100;
  if (input.rows > 1 || (input.style.height && parseInt(input.style.height, 10) > 50)) score -= 50;

  log(`Score ${input.id || input.name || 'unnamed'}: ${score}`);
  return score;
}
