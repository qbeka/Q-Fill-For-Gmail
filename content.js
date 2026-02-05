/**
 * Q-Fill for Gmail - Content Script
 * 
 * Intelligent verification code input detection and filling.
 * Uses multi-signal scoring to find the SINGLE best input field.
 * 
 * @fileoverview Content script for detecting and filling verification codes
 * @version 1.1.0
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
  NO_CODE_FOUND: 'noCodeFound',
  CONTENT_SCRIPT_READY: 'contentScriptReady'
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Received:', message.action);
  
  if (message.action === MESSAGE_ACTIONS.FILL_CODE && message.code) {
    const result = fillCode(message.code);
    logAlways(`Fill result: ${result.success ? 'SUCCESS' : 'FAILED'} - ${result.message}`);
    sendResponse(result);
    return true;
  }
  
  if (message.action === MESSAGE_ACTIONS.NO_CODE_FOUND) {
    showToast('No verification code found in recent emails', 'error');
    sendResponse({ success: true });
    return true;
  }
  
  sendResponse({ success: false });
  return false;
});

logAlways('Content script loaded v1.1.0');

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
 * @returns {number} Score (can be negative)
 */
function calculateScore(input) {
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
  
  // Currently focused input (user is likely interacting with it)
  if (document.activeElement === input) {
    score += 80;
    reasons.push('currently focused +80');
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
    if (attrText.includes(kw)) {
      score -= 100;
      reasons.push(`NEGATIVE: "${kw}" in attrs -100`);
    }
  }
  
  // Strong negative keywords in context
  for (const kw of STRONG_NEGATIVE) {
    if (contextText.includes(kw) && !STRONG_KEYWORDS.some(sk => contextText.includes(sk))) {
      score -= 50;
      reasons.push(`NEGATIVE: "${kw}" in context -50`);
    }
  }
  
  // Weak negative keywords
  for (const kw of WEAK_NEGATIVE) {
    if (combinedText.includes(kw)) {
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
function findBestInput() {
  const inputs = document.querySelectorAll('input, [contenteditable="true"]');
  let bestCandidate = null;
  let bestScore = -Infinity;
  
  for (const input of inputs) {
    // Skip invalid input types
    if (input.tagName === 'INPUT') {
      const type = (input.type || 'text').toLowerCase();
      if (SKIP_TYPES.has(type)) continue;
    }
    
    // Skip disabled/readonly
    if (input.disabled || input.readOnly) continue;
    
    // Skip invisible
    if (!isVisible(input)) continue;
    
    // Calculate score
    const score = calculateScore(input);
    
    // Track best candidate
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = { input, score };
    }
  }
  
  // Only return if score is positive (indicates it's likely a verification field)
  if (bestCandidate && bestCandidate.score > 0) {
    logAlways(`Best input found: score=${bestCandidate.score}`, 
      bestCandidate.input.id || bestCandidate.input.name || bestCandidate.input.placeholder || '(unnamed)');
    return bestCandidate;
  }
  
  logAlways('No suitable input found (all scores <= 0)');
  return null;
}

/**
 * Find OTP input group (multiple single-character inputs in a row)
 * @returns {HTMLElement[]}
 */
function findOTPGroup() {
  const allInputs = document.querySelectorAll('input');
  const singleCharInputs = [];
  
  for (const input of allInputs) {
    if (!isVisible(input)) continue;
    if (input.disabled || input.readOnly) continue;
    
    // Check for single character input
    const maxLen = input.maxLength;
    const size = input.size;
    
    if (maxLen === 1 || (size === 1 && (maxLen === -1 || maxLen === 1))) {
      singleCharInputs.push(input);
    }
  }
  
  // Need 4-8 single char inputs to be considered an OTP group
  if (singleCharInputs.length < 4 || singleCharInputs.length > 8) {
    return [];
  }
  
  // Sort by visual position (left to right, top to bottom)
  singleCharInputs.sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    
    // If on same row (within 20px), sort by left position
    if (Math.abs(rectA.top - rectB.top) < 20) {
      return rectA.left - rectB.left;
    }
    return rectA.top - rectB.top;
  });
  
  // Verify all inputs are roughly aligned (same row)
  const firstRect = singleCharInputs[0].getBoundingClientRect();
  const allAligned = singleCharInputs.every(input => {
    const rect = input.getBoundingClientRect();
    return Math.abs(rect.top - firstRect.top) < 30;
  });
  
  if (!allAligned) {
    log('Single char inputs found but not aligned');
    return [];
  }
  
  // Verify reasonable spacing (not too far apart)
  for (let i = 1; i < singleCharInputs.length; i++) {
    const prevRect = singleCharInputs[i - 1].getBoundingClientRect();
    const currRect = singleCharInputs[i].getBoundingClientRect();
    const gap = currRect.left - prevRect.right;
    
    if (gap > 100) {
      log('OTP inputs too far apart');
      return [];
    }
  }
  
  logAlways(`Found OTP group: ${singleCharInputs.length} aligned inputs`);
  return singleCharInputs;
}

// ============================================================================
// VALUE SETTING
// ============================================================================

/**
 * Set value on input with comprehensive event dispatching
 * @param {HTMLElement} input 
 * @param {string} value 
 * @returns {boolean}
 */
function setValue(input, value) {
  const sanitized = String(value).replace(/[^a-zA-Z0-9]/g, '');
  
  try {
    // Focus the input
    input.focus();
    
    // Select any existing content
    if (input.select) input.select();
    
    // Clear existing value
    input.value = '';
    
    // Try using the native setter (works with React/Angular/Vue)
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    
    if (nativeSetter) {
      nativeSetter.call(input, sanitized);
    } else {
      input.value = sanitized;
    }
    
    // Also set the attribute
    input.setAttribute('value', sanitized);
    
    // Handle contenteditable
    if (input.getAttribute('contenteditable') === 'true') {
      input.textContent = sanitized;
    }
    
    // Dispatch comprehensive events for framework compatibility
    
    // Input event (most important for React)
    const inputEvent = new Event('input', { bubbles: true, cancelable: true });
    input.dispatchEvent(inputEvent);
    
    // Change event
    const changeEvent = new Event('change', { bubbles: true, cancelable: true });
    input.dispatchEvent(changeEvent);
    
    // Keyboard events
    for (const char of sanitized) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    }
    
    // Focus/blur cycle can trigger validation
    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    input.focus();
    
    return true;
  } catch (e) {
    logAlways('Error setting value:', e.message);
    return false;
  }
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
  
  if (sanitized.length < 4 || sanitized.length > 8) {
    return { success: false, message: `Invalid code length: ${sanitized.length}` };
  }
  
  logAlways(`Attempting to fill code: ${sanitized} (${sanitized.length} chars)`);
  
  // STRATEGY 1: Check for OTP group (multiple single-char inputs)
  const otpGroup = findOTPGroup();
  
  if (otpGroup.length > 0) {
    // Fill OTP group
    if (sanitized.length > otpGroup.length) {
      logAlways(`Code (${sanitized.length}) longer than OTP fields (${otpGroup.length})`);
    }
    
    const fillCount = Math.min(sanitized.length, otpGroup.length);
    
    for (let i = 0; i < fillCount; i++) {
      setValue(otpGroup[i], sanitized[i]);
    }
    
    // Focus the last filled input (or next empty one)
    const focusIndex = Math.min(fillCount, otpGroup.length - 1);
    otpGroup[focusIndex].focus();
    
    showSuccess(otpGroup.slice(0, fillCount));
    showToast('Code filled', 'success');
    
    return { 
      success: true, 
      message: `Filled ${fillCount} OTP digits` 
    };
  }
  
  // STRATEGY 2: Find single best input
  const best = findBestInput();
  
  if (!best) {
    showToast('No verification input found on this page', 'error');
    return { 
      success: false, 
      message: 'No suitable input field found' 
    };
  }
  
  // Fill ONLY the best input
  const filled = setValue(best.input, sanitized);
  
  if (filled) {
    showSuccess([best.input]);
    showToast('Code filled', 'success');
    return { 
      success: true, 
      message: `Filled input (score: ${best.score})` 
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

// Send ready signal
try {
  chrome.runtime.sendMessage({ 
    action: MESSAGE_ACTIONS.CONTENT_SCRIPT_READY, 
    url: window.location.href 
  });
} catch (e) {
  // Extension context may not be available
}
