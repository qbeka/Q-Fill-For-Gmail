/**
 * Q-Fill for Gmail - Content Script
 * 
 * Intelligent verification code input detection and filling.
 * Uses multi-signal scoring to find the SINGLE best input field.
 * 
 * @fileoverview Content script for detecting and filling verification codes
 * @version 1.2.0
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEBUG = false;
const log = (...args) => DEBUG && console.log('[Q-Fill]', ...args);
const logAlways = (...args) => console.log('[Q-Fill]', ...args);

// ============================================================================
// KEYWORD DICTIONARIES
// ============================================================================

// Definitive OTP/verification indicators (highest confidence)
const DEFINITIVE_KEYWORDS = [
  'one-time-code', 'onetimecode', 'onetime-code',
  'verification-code', 'verificationcode',
  'otp-input', 'otpinput', 'otp-field',
  'totp', '2fa-code', 'mfa-code',
  'sms-code', 'smscode',
  'security-code', 'securitycode',
  'auth-code', 'authcode',
  'passcode-input', 'pin-input'
];

// Strong indicators (high confidence)
const STRONG_KEYWORDS = [
  'otp', 'verification', 'verify', '2fa', 'tfa', 'mfa',
  'passcode', 'authenticator', 'one-time', 'onetime',
  'confirmation-code', 'confirmcode'
];

// Medium indicators (moderate confidence)
const MEDIUM_KEYWORDS = [
  'code', 'pin', 'token', 'digit', 'secure', 'confirm',
  'validate', 'auth', 'factor'
];

// Negative indicators - definitely NOT a verification input
const STRONG_NEGATIVE = [
  'search', 'query', 'find', 'lookup',
  'email', 'mail', 'e-mail',
  'username', 'user-name', 'userid', 'user-id', 'login-name',
  'password', 'passwd', 'pwd',
  'name', 'firstname', 'first-name', 'lastname', 'last-name', 'fullname',
  'address', 'street', 'city', 'state', 'zip', 'postal', 'country',
  'phone', 'mobile', 'telephone', 'cell',
  'cvv', 'cvc', 'ccv', 'security-number',
  'card', 'credit', 'debit', 'payment',
  'expiry', 'expire', 'expiration',
  'ssn', 'social-security', 'tax-id',
  'coupon', 'promo', 'discount', 'voucher', 'gift',
  'referral', 'invite', 'invitation',
  'comment', 'message', 'note', 'description', 'bio',
  'subject', 'title', 'headline',
  'url', 'website', 'link', 'href',
  'company', 'organization', 'business'
];

// Weak negative indicators
const WEAK_NEGATIVE = [
  'amount', 'price', 'cost', 'quantity', 'qty',
  'date', 'day', 'month', 'year', 'birthday', 'dob',
  'age', 'gender', 'sex'
];

// Skip these input types entirely
const SKIP_TYPES = new Set([
  'checkbox', 'radio', 'submit', 'button', 'file', 'hidden',
  'image', 'reset', 'color', 'date', 'datetime-local',
  'month', 'week', 'time', 'range', 'url'
]);

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

const MESSAGE_ACTIONS = {
  FILL_CODE: 'fillCode',
  FILL_FAILED: 'fillFailed',
  CONTENT_SCRIPT_READY: 'contentScriptReady'
};

const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 8;

if (!globalThis.__QFILL_INITIALIZED__) {
  globalThis.__QFILL_INITIALIZED__ = true;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    log('Received:', message.action);

    if (message.action === MESSAGE_ACTIONS.FILL_CODE && message.code) {
      const result = fillCode(message.code);
      logAlways(`Fill result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);
      sendResponse(result);
      return true;
    }

    if (message.action === MESSAGE_ACTIONS.FILL_FAILED) {
      showToast(message.message || 'Could not fill verification code on this page', 'error');
      sendResponse({ success: true });
      return true;
    }

    sendResponse({ success: false, message: 'Unknown action' });
    return false;
  });

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (target?.matches?.('input, textarea, [contenteditable="true"]')) {
      const score = calculateScore(target, MAX_CODE_LENGTH);
      if (score >= 30) {
        globalThis.__QFILL_LAST_FOCUSED__ = target;
      }
    }
  }, true);

  logAlways('Content script loaded v1.2.0');
}

// ============================================================================
// TEXT MATCHING
// ============================================================================

/**
 * Match keywords on word boundaries (avoids "name" matching "username")
 */
function textIncludesKeyword(text, keyword) {
  if (!text || !keyword) return false;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[\\s_\\-.])${escaped}(?:[\\s_\\-.]|$)`, 'i').test(text);
}

// ============================================================================
// VISIBILITY CHECKS
// ============================================================================

/**
 * Check if element is visible and can receive input
 */
function isVisible(el) {
  if (!el) return false;
  
  // Check if element or ancestor is hidden
  let current = el;
  while (current) {
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0' ||
        current.hidden) {
      return false;
    }
    current = current.parentElement;
  }
  
  // Check dimensions
  const rect = el.getBoundingClientRect();
  if (rect.width < 5 || rect.height < 5) return false;
  
  return true;
}

/**
 * Check if element is within the visible viewport
 */
function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  const margin = 100;
  return (
    rect.top >= -margin &&
    rect.left >= -margin &&
    rect.bottom <= (window.innerHeight + margin) &&
    rect.right <= (window.innerWidth + margin)
  );
}

/**
 * Check if element is inside a modal/dialog/popup
 */
function isInModal(el) {
  const modalSelectors = [
    '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
    '.modal', '.popup', '.overlay', '.dialog', '.lightbox',
    '[class*="modal"]', '[class*="popup"]', '[class*="dialog"]',
    '[id*="modal"]', '[id*="popup"]', '[id*="dialog"]'
  ];
  
  for (const selector of modalSelectors) {
    if (el.closest(selector)) return true;
  }
  return false;
}

/**
 * Walk document including open shadow roots
 */
function* walkRoots(root) {
  yield root;
  const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (const el of elements) {
    if (el.shadowRoot) {
      yield* walkRoots(el.shadowRoot);
    }
  }
}

/**
 * Collect inputs from light DOM and shadow DOM
 */
function collectInputs() {
  const seen = new Set();
  const inputs = [];

  for (const root of walkRoots(document)) {
    const nodes = root.querySelectorAll(
      'input, textarea, [contenteditable="true"], [role="textbox"]'
    );
    for (const node of nodes) {
      if (!seen.has(node)) {
        seen.add(node);
        inputs.push(node);
      }
    }
  }

  return inputs;
}

/**
 * Skip honeypots and non-interactive fields
 */
function isInteractable(el) {
  if (el.disabled || el.readOnly) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;

  const tabIndex = el.getAttribute('tabindex');
  if (tabIndex === '-1' && document.activeElement !== el) return false;

  const style = window.getComputedStyle(el);
  if (style.pointerEvents === 'none') return false;

  return true;
}

// ============================================================================
// ATTRIBUTE & CONTEXT EXTRACTION
// ============================================================================

/**
 * Get all text content from element attributes
 */
function getAttributeText(el) {
  const parts = [];
  const attrs = ['id', 'name', 'class', 'placeholder', 'title', 
                 'aria-label', 'data-testid', 'data-cy', 'data-test',
                 'autocomplete', 'inputmode', 'pattern'];
  
  for (const attr of attrs) {
    const val = el.getAttribute(attr);
    if (val) parts.push(val);
  }
  
  return parts.join(' ').toLowerCase().replace(/[-_]/g, ' ');
}

/**
 * Get contextual text from labels, nearby elements, and parent containers
 */
function getContextText(input) {
  const parts = [];
  
  // 1. Associated label by 'for' attribute
  if (input.id) {
    const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (label) parts.push(label.textContent);
  }
  
  // 2. Parent label element
  const parentLabel = input.closest('label');
  if (parentLabel) parts.push(parentLabel.textContent);
  
  // 3. ARIA references
  const ariaLabelledBy = input.getAttribute('aria-labelledby');
  const ariaDescribedBy = input.getAttribute('aria-describedby');
  
  if (ariaLabelledBy) {
    ariaLabelledBy.split(' ').forEach(id => {
      const el = document.getElementById(id);
      if (el) parts.push(el.textContent);
    });
  }
  
  if (ariaDescribedBy) {
    ariaDescribedBy.split(' ').forEach(id => {
      const el = document.getElementById(id);
      if (el) parts.push(el.textContent);
    });
  }
  
  // 4. Sibling and parent text (up to 3 levels)
  let parent = input.parentElement;
  for (let level = 0; level < 3 && parent; level++) {
    // Direct text nodes
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        parts.push(child.textContent);
      }
    }
    
    // Label, span, p, small, strong elements
    const textElements = parent.querySelectorAll(':scope > label, :scope > span, :scope > p, :scope > small, :scope > strong, :scope > div > label');
    textElements.forEach(el => {
      if (!el.contains(input)) parts.push(el.textContent);
    });
    
    parent = parent.parentElement;
  }
  
  // 5. Previous sibling
  let sibling = input.previousElementSibling;
  if (sibling && ['LABEL', 'SPAN', 'P', 'DIV'].includes(sibling.tagName)) {
    parts.push(sibling.textContent);
  }
  
  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ============================================================================
// SCORING ENGINE
// ============================================================================

/**
 * Calculate confidence score for an input being a verification code field
 * Higher score = more likely to be the correct field
 * 
 * @param {HTMLElement} input - Input element to score
 * @param {number} codeLength - Expected verification code length
 * @returns {number} Score (can be negative)
 */
function calculateScore(input, codeLength = 6) {
  let score = 0;
  const reasons = [];
  
  const attrText = getAttributeText(input);
  const contextText = getContextText(input);
  const combinedText = attrText + ' ' + contextText;
  const type = (input.type || 'text').toLowerCase();
  const autocomplete = (input.autocomplete || '').toLowerCase();
  const inputmode = (input.inputMode || input.getAttribute('inputmode') || '').toLowerCase();
  const maxLen = input.maxLength;
  
  // ========== DEFINITIVE SIGNALS (very high confidence) ==========
  
  // autocomplete="one-time-code" is the HTML standard for OTP
  if (autocomplete === 'one-time-code') {
    score += 300;
    reasons.push('autocomplete=one-time-code +300');
  }
  
  // Definitive keywords in attributes
  for (const kw of DEFINITIVE_KEYWORDS) {
    if (attrText.includes(kw.replace('-', ' ')) || attrText.includes(kw)) {
      score += 150;
      reasons.push(`definitive keyword "${kw}" +150`);
      break; // Only count once
    }
  }
  
  // ========== STRONG SIGNALS ==========
  
  // Strong keywords in attributes (id, name, class, etc.)
  for (const kw of STRONG_KEYWORDS) {
    if (attrText.includes(kw)) {
      score += 60;
      reasons.push(`strong keyword in attrs "${kw}" +60`);
    }
  }
  
  // Strong keywords in context (labels, nearby text)
  for (const kw of STRONG_KEYWORDS) {
    if (contextText.includes(kw) && !attrText.includes(kw)) {
      score += 40;
      reasons.push(`strong keyword in context "${kw}" +40`);
    }
  }
  
  // ========== MEDIUM SIGNALS ==========
  
  // Medium keywords in attributes
  for (const kw of MEDIUM_KEYWORDS) {
    if (attrText.includes(kw)) {
      score += 25;
      reasons.push(`medium keyword in attrs "${kw}" +25`);
    }
  }
  
  // Medium keywords in context
  for (const kw of MEDIUM_KEYWORDS) {
    if (contextText.includes(kw) && !attrText.includes(kw)) {
      score += 15;
      reasons.push(`medium keyword in context "${kw}" +15`);
    }
  }
  
  // ========== INPUT CHARACTERISTICS ==========
  
  // maxLength === 1 (single digit OTP field)
  if (maxLen === 1) {
    score += 100;
    reasons.push('maxLength=1 (OTP digit) +100');
  }
  // maxLength matches the code we're filling (very strong signal)
  if (maxLen > 0 && maxLen === codeLength) {
    score += 95;
    reasons.push(`maxLength matches code (${maxLen}) +95`);
  }
  // maxLength 4-8 (typical verification code length)
  else if (maxLen >= 4 && maxLen <= 8) {
    score += 70;
    reasons.push(`maxLength=${maxLen} (code length) +70`);
  }
  // maxLength 9-12 (possible but less common)
  else if (maxLen >= 9 && maxLen <= 12) {
    score += 30;
    reasons.push(`maxLength=${maxLen} (longer code) +30`);
  }
  
  // inputmode="numeric" - strong signal for number-only input
  if (inputmode === 'numeric') {
    score += 50;
    reasons.push('inputmode=numeric +50');
  } else if (inputmode === 'tel') {
    score += 35;
    reasons.push('inputmode=tel +35');
  }
  
  // Input type
  if (type === 'tel') {
    score += 40;
    reasons.push('type=tel +40');
  } else if (type === 'number') {
    score += 30;
    reasons.push('type=number +30');
  }
  
  // Pattern attribute suggests numeric
  const pattern = input.pattern || '';
  if (pattern && (/\\d/.test(pattern) || /\[0-9\]/.test(pattern))) {
    score += 35;
    reasons.push('pattern suggests digits +35');
  }
  
  // ========== CONTEXTUAL SIGNALS ==========
  
  // Currently focused or recently focused verification field
  if (document.activeElement === input) {
    score += 80;
    reasons.push('currently focused +80');
  } else if (globalThis.__QFILL_LAST_FOCUSED__ === input) {
    score += 55;
    reasons.push('recently focused +55');
  }

  // Common OTP container patterns
  const otpContainer = input.closest(
    '[class*="otp"], [class*="pin-input"], [class*="code-input"], [data-otp], [data-testid*="otp"], [id*="otp"]'
  );
  if (otpContainer) {
    score += 45;
    reasons.push('inside OTP container +45');
  }

  // aria-label like "Digit 3 of 6"
  const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
  if (/digit|character|position/.test(ariaLabel) && /of|\//.test(ariaLabel)) {
    score += 40;
    reasons.push('aria-label digit position +40');
  }
  
  // In a modal/dialog (often verification flows use modals)
  if (isInModal(input)) {
    score += 50;
    reasons.push('in modal/dialog +50');
  }
  
  // In viewport (visible on screen)
  if (isInViewport(input)) {
    score += 30;
    reasons.push('in viewport +30');
  }
  
  // Input is empty and ready for input
  if (!input.value || input.value.trim() === '') {
    score += 20;
    reasons.push('empty (ready for input) +20');
  }
  
  // Page title or URL contains verification keywords
  const pageContext = (document.title + ' ' + window.location.href).toLowerCase();
  if (STRONG_KEYWORDS.some(kw => pageContext.includes(kw))) {
    score += 25;
    reasons.push('page context has verification keywords +25');
  }
  
  // ========== NEGATIVE SIGNALS ==========
  
  // Strong negative keywords in attributes (definitely not a code field)
  for (const kw of STRONG_NEGATIVE) {
    if (textIncludesKeyword(attrText, kw)) {
      score -= 100;
      reasons.push(`NEGATIVE: "${kw}" in attrs -100`);
    }
  }
  
  // Strong negative keywords in context
  for (const kw of STRONG_NEGATIVE) {
    if (textIncludesKeyword(contextText, kw) && !STRONG_KEYWORDS.some(sk => contextText.includes(sk))) {
      score -= 50;
      reasons.push(`NEGATIVE: "${kw}" in context -50`);
    }
  }
  
  // Weak negative keywords
  for (const kw of WEAK_NEGATIVE) {
    if (textIncludesKeyword(combinedText, kw)) {
      score -= 30;
      reasons.push(`weak negative: "${kw}" -30`);
    }
  }
  
  // Type=email is almost never a verification code field
  if (type === 'email') {
    score -= 150;
    reasons.push('type=email -150');
  }
  
  // Type=password without OTP indicators
  if (type === 'password' && !combinedText.includes('otp') && !combinedText.includes('code') && !combinedText.includes('pin')) {
    score -= 80;
    reasons.push('type=password (no OTP indicators) -80');
  }
  
  // Very long maxLength = probably not a code
  if (maxLen > 20 && maxLen < 1000) {
    score -= 80;
    reasons.push(`maxLength=${maxLen} (too long) -80`);
  }
  
  // Already has a long value
  if (input.value && input.value.length > 12) {
    score -= 100;
    reasons.push('already has long value -100');
  }
  
  // Looks like a textarea (even if it's an input)
  if (input.rows > 1 || (input.style.height && parseInt(input.style.height) > 50)) {
    score -= 50;
    reasons.push('looks like textarea -50');
  }
  
  log(`Score for ${input.id || input.name || input.className || 'unnamed'}: ${score}`, reasons.slice(0, 5));
  
  return score;
}

// ============================================================================
// INPUT FINDING
// ============================================================================

/**
 * Find the single best input for verification code
 * @returns {{ input: HTMLElement, score: number } | null}
 */
function findBestInput(codeLength = 6) {
  const inputs = collectInputs();
  let bestCandidate = null;
  let bestScore = -Infinity;
  
  for (const input of inputs) {
    if (input.tagName === 'INPUT') {
      const type = (input.type || 'text').toLowerCase();
      if (SKIP_TYPES.has(type)) continue;
    }
    
    if (!isInteractable(input)) continue;
    if (!isVisible(input)) continue;
    
    const score = calculateScore(input, codeLength);
    
    // Track best candidate
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = { input, score };
    }
  }
  
  // Require meaningful confidence to avoid filling random text fields
  if (bestCandidate && bestCandidate.score >= 40) {
    logAlways(`Best input found: score=${bestCandidate.score}`, 
      bestCandidate.input.id || bestCandidate.input.name || bestCandidate.input.placeholder || '(unnamed)');
    return bestCandidate;
  }
  
  logAlways('No suitable input found (all scores <= 0)');
  return null;
}

/**
 * Find single-character OTP inputs
 */
function findSingleCharInputs(codeLength) {
  const results = [];

  for (const input of collectInputs()) {
    if (input.tagName !== 'INPUT') continue;
    if (!isVisible(input) || !isInteractable(input)) continue;

    const type = (input.type || 'text').toLowerCase();
    if (SKIP_TYPES.has(type)) continue;

    const maxLen = input.maxLength;
    const size = input.size;
    const isSingle = maxLen === 1 || (size === 1 && (maxLen === -1 || maxLen === 1));

    if (isSingle && calculateScore(input, codeLength) > -80) {
      results.push(input);
    }
  }

  return results;
}

/**
 * Cluster OTP inputs by shared container (avoids mixing unrelated digit fields)
 */
function clusterOTPInputs(inputs) {
  const clusters = new Map();

  for (const input of inputs) {
    const container = input.closest(
      '[class*="otp"], [class*="pin"], [class*="code"], [data-otp], [role="group"], form, fieldset'
    ) || input.parentElement?.parentElement || input.parentElement;

    if (!clusters.has(container)) clusters.set(container, []);
    clusters.get(container).push(input);
  }

  return [...clusters.values()];
}

/**
 * Sort inputs left-to-right, top-to-bottom
 */
function sortByVisualPosition(inputs) {
  return [...inputs].sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    if (Math.abs(rectA.top - rectB.top) < 20) {
      return rectA.left - rectB.left;
    }
    return rectA.top - rectB.top;
  });
}

/**
 * Validate a cluster is one aligned OTP row
 */
function validateOTPRow(inputs) {
  if (inputs.length < 4 || inputs.length > 8) return null;

  const sorted = sortByVisualPosition(inputs);
  const firstRect = sorted[0].getBoundingClientRect();

  const aligned = sorted.filter(input => {
    const rect = input.getBoundingClientRect();
    return Math.abs(rect.top - firstRect.top) < 30;
  });

  if (aligned.length < 4) return null;

  for (let i = 1; i < aligned.length; i++) {
    const prevRect = aligned[i - 1].getBoundingClientRect();
    const currRect = aligned[i].getBoundingClientRect();
    if (currRect.left - prevRect.right > 100) return null;
  }

  return aligned;
}

/**
 * Find the best OTP input group on the page
 * @param {number} codeLength
 * @returns {HTMLElement[]}
 */
function findOTPGroup(codeLength = 6) {
  const singles = findSingleCharInputs(codeLength);
  if (singles.length < 4) return [];

  const clusters = clusterOTPInputs(singles);
  let bestGroup = [];
  let bestScore = -Infinity;

  for (const cluster of clusters) {
    const row = validateOTPRow(cluster);
    if (!row) continue;

    const avgScore = row.reduce((sum, input) => sum + calculateScore(input, codeLength), 0) / row.length;
    if (avgScore < 40) continue;

    const lengthBonus = row.length === codeLength ? 25 : 0;
    const total = avgScore + lengthBonus;

    if (total > bestScore) {
      bestScore = total;
      bestGroup = row;
    }
  }

  if (bestGroup.length) {
    logAlways(`Found OTP group: ${bestGroup.length} inputs (score ${bestScore.toFixed(0)})`);
  }

  return bestGroup;
}

/**
 * Score an OTP group relative to a single-field candidate
 */
function scoreOTPGroup(inputs, codeLength) {
  if (!inputs.length) return 0;
  const avg = inputs.reduce((sum, input) => sum + calculateScore(input, codeLength), 0) / inputs.length;
  const lengthMatch = inputs.length === codeLength ? 35 : 0;
  return avg + (inputs.length >= 6 ? 30 : 15) + lengthMatch;
}

/**
 * Pick the best fill strategy for this page
 * @param {string} code
 * @returns {{ type: 'otp'|'single', inputs?: HTMLElement[], input?: HTMLElement, score?: number }|null}
 */
function chooseFillStrategy(code) {
  const codeLength = code.length;
  const otpGroup = findOTPGroup(codeLength);
  const best = findBestInput(codeLength);
  const otpScore = otpGroup.length >= codeLength ? scoreOTPGroup(otpGroup, codeLength) : 0;
  const singleScore = best?.score || 0;

  // autocomplete=one-time-code on a single field beats split OTP boxes
  const hasOneTimeCode = best?.input?.autocomplete === 'one-time-code';

  if (hasOneTimeCode && best) {
    return { type: 'single', input: best.input, score: singleScore };
  }

  if (otpGroup.length >= codeLength && otpScore >= 70 && otpScore >= singleScore - 10) {
    return { type: 'otp', inputs: otpGroup.slice(0, codeLength) };
  }

  if (best && singleScore >= 40) {
    return { type: 'single', input: best.input, score: singleScore };
  }

  if (otpGroup.length >= codeLength && otpScore >= 50) {
    return { type: 'otp', inputs: otpGroup.slice(0, codeLength) };
  }

  return null;
}

// ============================================================================
// VALUE SETTING
// ============================================================================

/**
 * Read normalized value from an input
 */
function getInputValue(input) {
  if (input.getAttribute('contenteditable') === 'true') {
    return (input.textContent || '').replace(/\s/g, '');
  }
  return (input.value || '').replace(/\s/g, '');
}

/**
 * Dispatch framework-friendly input events
 */
function dispatchInputEvents(input, value) {
  try {
    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value
    }));
  } catch {
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
}

/**
 * Set value on input with comprehensive event dispatching
 * @param {HTMLElement} input 
 * @param {string} value 
 * @returns {boolean}
 */
function getNativeValueSetter(input) {
  const proto = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  return Object.getOwnPropertyDescriptor(proto, 'value')?.set;
}

/**
 * Simulate per-character typing (works with strict React controlled inputs)
 */
function simulateTyping(input, text) {
  const nativeSetter = getNativeValueSetter(input);
  if (!nativeSetter) return false;

  input.focus();
  nativeSetter.call(input, '');

  for (const char of text) {
    const next = getInputValue(input) + char;
    nativeSetter.call(input, next);
    dispatchInputEvents(input, char);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
  }

  return getInputValue(input) === text;
}

function setValue(input, value) {
  const sanitized = String(value).replace(/[^a-zA-Z0-9]/g, '');
  if (!sanitized) return false;
  
  try {
    input.focus();
    if (input.select) input.select();
    
    if (input.getAttribute('contenteditable') === 'true') {
      input.textContent = sanitized;
      dispatchInputEvents(input, sanitized);
      return getInputValue(input) === sanitized;
    }
    
    const nativeSetter = getNativeValueSetter(input);
    
    if (nativeSetter) {
      nativeSetter.call(input, '');
      nativeSetter.call(input, sanitized);
    } else {
      input.value = sanitized;
    }
    
    input.setAttribute('value', sanitized);
    dispatchInputEvents(input, sanitized);
    input.focus();
    
    if (getInputValue(input) === sanitized) return true;

    // Fallback: character-by-character for stubborn frameworks
    return simulateTyping(input, sanitized);
  } catch (e) {
    logAlways('Error setting value:', e.message);
    return false;
  }
}

/**
 * Fill one OTP digit and advance focus
 */
function setOTPDigit(input, char, isLast) {
  const ok = setValue(input, char);
  if (ok && !isLast) {
    const next = input.nextElementSibling;
    if (next?.tagName === 'INPUT' && next.maxLength === 1) {
      next.focus();
    }
  }
  return ok;
}

// ============================================================================
// MAIN FILL FUNCTION
// ============================================================================

/**
 * Fill the verification code into the best matching input
 * ONLY fills exactly ONE input (or OTP group)
 * 
 * @param {string} code - The verification code to fill
 * @returns {{ success: boolean, message: string }}
 */
function fillCode(code) {
  if (!code) {
    return { success: false, message: 'No code provided' };
  }
  
  const sanitized = String(code).replace(/[^a-zA-Z0-9]/g, '');
  
  if (sanitized.length < MIN_CODE_LENGTH || sanitized.length > MAX_CODE_LENGTH) {
    return { success: false, message: `Invalid code length: ${sanitized.length}` };
  }
  
  logAlways(`Attempting to fill code (${sanitized.length} chars)`);
  
  const strategy = chooseFillStrategy(sanitized);
  
  if (!strategy) {
    return {
      success: false,
      message: 'No verification input found on this page'
    };
  }
  
  if (strategy.type === 'otp') {
    let filledCount = 0;
    const filledInputs = [];
    
    for (let i = 0; i < strategy.inputs.length; i++) {
      const isLast = i === strategy.inputs.length - 1;
      if (setOTPDigit(strategy.inputs[i], sanitized[i], isLast)) {
        filledCount++;
        filledInputs.push(strategy.inputs[i]);
      }
    }
    
    if (filledCount === strategy.inputs.length) {
      strategy.inputs[strategy.inputs.length - 1].focus();
      showSuccess(filledInputs);
      showToast('Code filled', 'success');
      return { success: true, message: `Filled ${filledCount} OTP digits` };
    }
    
    return {
      success: false,
      message: `Only filled ${filledCount} of ${strategy.inputs.length} OTP fields`
    };
  }
  
  let filled = setValue(strategy.input, sanitized);

  if (!filled) {
    filled = simulateTyping(strategy.input, sanitized);
  }

  if (filled) {
    showSuccess([strategy.input]);
    showToast('Code filled', 'success');
    return {
      success: true,
      message: `Filled input (score: ${strategy.score})`
    };
  }

  return {
    success: false,
    message: 'Failed to set input value'
  };
}

// ============================================================================
// UI FEEDBACK
// ============================================================================

/**
 * Show success animation on filled inputs
 */
function showSuccess(inputs) {
  const successColor = 'rgba(16, 185, 129, 0.25)';
  const successBorder = 'rgb(16, 185, 129)';
  
  inputs.forEach(input => {
    const originalStyles = {
      backgroundColor: input.style.backgroundColor,
      borderColor: input.style.borderColor,
      boxShadow: input.style.boxShadow,
      outline: input.style.outline,
      transition: input.style.transition
    };
    
    input.style.transition = 'all 0.2s ease-out';
    input.style.backgroundColor = successColor;
    input.style.borderColor = successBorder;
    input.style.boxShadow = `0 0 0 3px ${successColor}`;
    input.style.outline = `2px solid ${successBorder}`;
    
    setTimeout(() => {
      input.style.backgroundColor = originalStyles.backgroundColor;
      input.style.borderColor = originalStyles.borderColor;
      input.style.boxShadow = originalStyles.boxShadow;
      input.style.outline = originalStyles.outline;
      setTimeout(() => {
        input.style.transition = originalStyles.transition;
      }, 200);
    }, 1800);
  });
}

/**
 * Show toast notification
 */
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.getElementById('qfill-toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.id = 'qfill-toast';
  
  const colors = {
    success: '#10B981',
    error: '#EF4444',
    info: '#6366F1'
  };
  
  const icons = {
    success: '\u2713', // ✓
    error: '\u2717',   // ✗
    info: '\u2139'     // ℹ
  };
  
  const bg = colors[type] || colors.info;
  const icon = icons[type] || icons.info;
  
  toast.style.cssText = `
    position: fixed !important;
    bottom: 24px !important;
    right: 24px !important;
    background: ${bg} !important;
    color: white !important;
    padding: 14px 20px !important;
    border-radius: 8px !important;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2) !important;
    z-index: 2147483647 !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    animation: qfill-toast-in 0.3s ease-out !important;
  `;
  
  toast.textContent = `${icon} ${message}`;
  
  // Add animation styles if not present
  if (!document.getElementById('qfill-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'qfill-toast-styles';
    style.textContent = `
      @keyframes qfill-toast-in {
        from { opacity: 0; transform: translateY(16px) scale(0.95); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @keyframes qfill-toast-out {
        from { opacity: 1; transform: translateY(0) scale(1); }
        to { opacity: 0; transform: translateY(-16px) scale(0.95); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // Auto-remove after delay
  setTimeout(() => {
    toast.style.animation = 'qfill-toast-out 0.3s ease-in forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

if (!globalThis.__QFILL_READY_SENT__) {
  globalThis.__QFILL_READY_SENT__ = true;
  try {
    chrome.runtime.sendMessage({
      action: MESSAGE_ACTIONS.CONTENT_SCRIPT_READY,
      url: window.location.href
    });
  } catch (e) {
    // Extension context may not be available
  }
}
