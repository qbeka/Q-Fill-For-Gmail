/**
 * Q-Fill for Gmail - Content Script
 * 
 * Handles finding and filling verification code input fields on web pages.
 * Uses intelligent detection to find the most appropriate input field.
 * 
 * @fileoverview Content script for detecting and filling verification codes
 * @version 1.1.0
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const DEBUG_LEVEL = {
  NONE: 0,
  BASIC: 1,
  VERBOSE: 2
};

const CURRENT_DEBUG_LEVEL = DEBUG_LEVEL.BASIC;

// Keywords that strongly indicate a verification code input
const STRONG_VERIFICATION_KEYWORDS = [
  'otp', 'verification', 'verify', '2fa', 'tfa', 'mfa',
  'one-time', 'onetime', 'passcode', 'security-code',
  'auth-code', 'authenticator', 'sms-code', 'totp'
];

// Keywords that weakly indicate a verification code input
const WEAK_VERIFICATION_KEYWORDS = [
  'code', 'pin', 'token', 'auth', 'secure', 'confirm',
  'digit', 'number', 'validation'
];

// Input types that should be skipped entirely
const SKIP_INPUT_TYPES = [
  'checkbox', 'radio', 'submit', 'button', 'file',
  'hidden', 'image', 'reset', 'color', 'date',
  'datetime-local', 'month', 'time', 'week', 'range'
];

// Input types suitable for verification codes
const CODE_INPUT_TYPES = ['text', 'tel', 'number', ''];

// Common autocomplete values for OTP fields
const OTP_AUTOCOMPLETE_VALUES = [
  'one-time-code', 'otp', 'verification-code'
];

const MESSAGE_ACTIONS = {
  FILL_CODE: 'fillCode',
  NO_CODE_FOUND: 'noCodeFound',
  CONTENT_SCRIPT_READY: 'contentScriptReady'
};

// ============================================================================
// LOGGING
// ============================================================================

const logInfo = (msg) => CURRENT_DEBUG_LEVEL >= DEBUG_LEVEL.BASIC && console.log(`[Q-Fill] ${msg}`);
const logDebug = (msg) => CURRENT_DEBUG_LEVEL >= DEBUG_LEVEL.VERBOSE && console.log(`[Q-Fill] ${msg}`);
const logError = (err) => console.error(`[Q-Fill] Error: ${err.message || err}`);

// ============================================================================
// STATE
// ============================================================================

let hasFilledCode = false;
let readyToFill = true;
let pendingCode = null;

console.log('Q-Fill for Gmail: Content script loaded');

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  logDebug(`Received message: ${JSON.stringify(message)}`);
  
  if (message.action === MESSAGE_ACTIONS.FILL_CODE && message.code) {
    fillVerificationCode(message.code)
      .then(success => {
        logInfo(`Code fill ${success ? 'successful' : 'failed'}`);
        sendResponse({ success });
      })
      .catch(error => {
        logError(error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  
  if (message.action === MESSAGE_ACTIONS.NO_CODE_FOUND) {
    handleNoCodeFound()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  sendResponse({ success: false, error: 'Invalid request' });
  return false;
});

// ============================================================================
// DOM OBSERVER (for dynamically loaded inputs)
// ============================================================================

const observer = new MutationObserver(() => {
  if (pendingCode) {
    clearTimeout(window.qfillDebounceTimer);
    window.qfillDebounceTimer = setTimeout(() => {
      if (fillVerificationCodeSync(pendingCode)) {
        pendingCode = null;
      }
    }, 200);
  }
});

observer.observe(document, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style', 'class', 'display', 'visibility']
});

logInfo('Content script initialized');

// ============================================================================
// INPUT DETECTION - IMPROVED
// ============================================================================

/**
 * Check if element is visible and interactable
 * @param {HTMLElement} el - Element to check
 * @returns {boolean}
 */
function isVisible(el) {
  if (!el) return false;
  
  const style = window.getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden') return false;
  if (style.opacity === '0') return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  
  // Check if element is in viewport (approximately)
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  
  return true;
}

/**
 * Check if element is in the visible viewport
 * @param {HTMLElement} el - Element to check
 * @returns {boolean}
 */
function isInViewport(el) {
  const rect = el.getBoundingClientRect();
  return (
    rect.top >= -100 &&
    rect.left >= -100 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) + 100 &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) + 100
  );
}

/**
 * Get all attributes as lowercase string for searching
 * @param {HTMLElement} el - Element
 * @returns {string}
 */
function getAttributeString(el) {
  const attrs = [];
  for (const attr of el.attributes) {
    attrs.push(`${attr.name}="${attr.value}"`);
  }
  return attrs.join(' ').toLowerCase();
}

/**
 * Get text content around an input (labels, nearby text)
 * @param {HTMLElement} input - Input element
 * @returns {string}
 */
function getContextText(input) {
  let text = '';
  
  // Check for associated label
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label) text += ' ' + label.textContent;
  }
  
  // Check aria-label and aria-describedby
  if (input.getAttribute('aria-label')) {
    text += ' ' + input.getAttribute('aria-label');
  }
  if (input.getAttribute('aria-describedby')) {
    const describedBy = document.getElementById(input.getAttribute('aria-describedby'));
    if (describedBy) text += ' ' + describedBy.textContent;
  }
  
  // Check placeholder
  if (input.placeholder) {
    text += ' ' + input.placeholder;
  }
  
  // Check parent elements (up to 4 levels) for text
  let parent = input.parentElement;
  for (let i = 0; i < 4 && parent; i++) {
    // Get direct text nodes and label children
    for (const child of parent.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += ' ' + child.textContent;
      } else if (child.tagName === 'LABEL' || child.tagName === 'SPAN' || child.tagName === 'P') {
        text += ' ' + child.textContent;
      }
    }
    parent = parent.parentElement;
  }
  
  return text.toLowerCase().trim();
}

/**
 * Calculate a score for how likely an input is a verification code field
 * Higher score = more likely to be a verification code input
 * @param {HTMLElement} input - Input element
 * @returns {number}
 */
function calculateInputScore(input) {
  let score = 0;
  
  const attrString = getAttributeString(input);
  const contextText = getContextText(input);
  const inputType = (input.type || '').toLowerCase();
  
  // === STRONG POSITIVE SIGNALS ===
  
  // Autocomplete attribute for OTP
  const autocomplete = (input.autocomplete || '').toLowerCase();
  if (OTP_AUTOCOMPLETE_VALUES.some(v => autocomplete.includes(v))) {
    score += 50;
  }
  
  // Strong keywords in attributes
  for (const keyword of STRONG_VERIFICATION_KEYWORDS) {
    if (attrString.includes(keyword)) score += 20;
    if (contextText.includes(keyword)) score += 15;
  }
  
  // Weak keywords in attributes
  for (const keyword of WEAK_VERIFICATION_KEYWORDS) {
    if (attrString.includes(keyword)) score += 8;
    if (contextText.includes(keyword)) score += 5;
  }
  
  // Input pattern suggests numeric code
  const pattern = input.pattern || '';
  if (pattern.includes('\\d') || pattern.includes('[0-9]')) {
    score += 15;
  }
  if (pattern === '[0-9]*' || pattern === '\\d*' || pattern === '\\d+') {
    score += 20;
  }
  
  // maxLength between 4-8 (common for verification codes)
  if (input.maxLength >= 4 && input.maxLength <= 8) {
    score += 25;
  }
  // Single character input (OTP style)
  if (input.maxLength === 1) {
    score += 30;
  }
  
  // Input type is tel or number (common for codes)
  if (inputType === 'tel') score += 15;
  if (inputType === 'number') score += 10;
  
  // inputmode attribute
  const inputMode = (input.inputMode || input.getAttribute('inputmode') || '').toLowerCase();
  if (inputMode === 'numeric' || inputMode === 'tel') {
    score += 20;
  }
  
  // === CONTEXT SIGNALS ===
  
  // Input is currently focused
  if (document.activeElement === input) {
    score += 30;
  }
  
  // Input is in viewport
  if (isInViewport(input)) {
    score += 15;
  }
  
  // Input is empty (ready for filling)
  if (!input.value || input.value.trim() === '') {
    score += 10;
  }
  
  // === NEGATIVE SIGNALS ===
  
  // Looks like a search box
  if (attrString.includes('search') || contextText.includes('search')) {
    score -= 30;
  }
  
  // Looks like email field
  if (inputType === 'email' || attrString.includes('email')) {
    score -= 25;
  }
  
  // Looks like username field
  if (attrString.includes('username') || attrString.includes('user-name') || attrString.includes('login')) {
    score -= 20;
  }
  
  // Looks like phone number field (full phone, not code)
  if (attrString.includes('phone') && !attrString.includes('code')) {
    if (input.maxLength > 10 || !input.maxLength) {
      score -= 15;
    }
  }
  
  // Very long maxLength (not a code)
  if (input.maxLength > 20) {
    score -= 20;
  }
  
  return score;
}

/**
 * Find all candidate verification code inputs, sorted by score
 * @returns {Array<{input: HTMLElement, score: number}>}
 */
function findCandidateInputs() {
  // Get all inputs
  const allInputs = document.querySelectorAll('input');
  const candidates = [];
  
  for (const input of allInputs) {
    // Skip hidden and non-text inputs
    const inputType = (input.type || 'text').toLowerCase();
    if (SKIP_INPUT_TYPES.includes(inputType)) continue;
    if (input.disabled || input.readOnly) continue;
    if (!isVisible(input)) continue;
    
    const score = calculateInputScore(input);
    
    // Only include inputs with positive score
    if (score > 0) {
      candidates.push({ input, score });
    }
  }
  
  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);
  
  logDebug(`Found ${candidates.length} candidate inputs`);
  candidates.slice(0, 5).forEach((c, i) => {
    logDebug(`  ${i + 1}. Score: ${c.score}, Input: ${getInputDescription(c.input)}`);
  });
  
  return candidates;
}

/**
 * Find inputs that appear to be single-digit OTP fields
 * @returns {Array<HTMLElement>}
 */
function findOTPInputGroup() {
  const singleCharInputs = [];
  const allInputs = document.querySelectorAll('input');
  
  for (const input of allInputs) {
    if (!isVisible(input)) continue;
    if (input.disabled || input.readOnly) continue;
    if (input.maxLength === 1) {
      singleCharInputs.push(input);
    }
  }
  
  // If we have 4-8 single char inputs, likely an OTP group
  if (singleCharInputs.length >= 4 && singleCharInputs.length <= 8) {
    // Sort by position (left to right, then top to bottom)
    singleCharInputs.sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      // Same row (within 10px)
      if (Math.abs(rectA.top - rectB.top) < 10) {
        return rectA.left - rectB.left;
      }
      return rectA.top - rectB.top;
    });
    
    logInfo(`Found OTP input group with ${singleCharInputs.length} fields`);
    return singleCharInputs;
  }
  
  return [];
}

/**
 * Get human-readable description of an input
 * @param {HTMLElement} input - Input element
 * @returns {string}
 */
function getInputDescription(input) {
  const parts = [];
  if (input.id) parts.push(`id="${input.id}"`);
  if (input.name) parts.push(`name="${input.name}"`);
  if (input.type) parts.push(`type="${input.type}"`);
  if (input.placeholder) parts.push(`placeholder="${input.placeholder.substring(0, 20)}"`);
  if (input.maxLength > 0) parts.push(`maxLength=${input.maxLength}`);
  return parts.length > 0 ? parts.join(' ') : 'unnamed input';
}

// ============================================================================
// INPUT FILLING
// ============================================================================

/**
 * Safely set value on an input (XSS-safe)
 * @param {HTMLElement} input - Input element
 * @param {string} value - Value to set
 */
function safeSetValue(input, value) {
  // Sanitize - only allow alphanumeric
  const sanitizedValue = String(value).replace(/[^a-zA-Z0-9]/g, '');
  
  try {
    // Focus the input first
    input.focus();
    
    // Clear existing value
    input.value = '';
    
    // Use native setter for React/Angular/Vue compatibility
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype, 'value'
    )?.set;
    
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, sanitizedValue);
    } else {
      input.value = sanitizedValue;
    }
    
    // For contenteditable
    if (input.getAttribute('contenteditable') === 'true') {
      input.textContent = sanitizedValue;
    }
    
    // Also set attribute for some frameworks
    input.setAttribute('value', sanitizedValue);
    
    // Dispatch events
    input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    
    logDebug(`Set value "${sanitizedValue}" on ${getInputDescription(input)}`);
  } catch (e) {
    logError(`Failed to set value: ${e.message}`);
  }
}

/**
 * Fill verification code synchronously (for mutation observer)
 * @param {string} code - Code to fill
 * @returns {boolean}
 */
function fillVerificationCodeSync(code) {
  if (!code) return false;
  
  const sanitizedCode = String(code).replace(/[^a-zA-Z0-9]/g, '');
  logInfo(`Attempting to fill code: ${sanitizedCode}`);
  
  // First, check for OTP input groups
  const otpInputs = findOTPInputGroup();
  if (otpInputs.length > 0 && sanitizedCode.length <= otpInputs.length) {
    logInfo('Filling OTP input group');
    for (let i = 0; i < sanitizedCode.length; i++) {
      safeSetValue(otpInputs[i], sanitizedCode[i]);
    }
    showFillAnimation(otpInputs.slice(0, sanitizedCode.length));
    showToast('Verification code filled successfully', 'success');
    return true;
  }
  
  // Otherwise, find the best single input
  const candidates = findCandidateInputs();
  if (candidates.length === 0) {
    logInfo('No suitable inputs found');
    return false;
  }
  
  // Use the highest-scored input
  const bestInput = candidates[0].input;
  logInfo(`Filling best input: ${getInputDescription(bestInput)} (score: ${candidates[0].score})`);
  
  safeSetValue(bestInput, sanitizedCode);
  showFillAnimation([bestInput]);
  showToast('Verification code filled successfully', 'success');
  
  return true;
}

/**
 * Fill verification code (async version)
 * @param {string} code - Code to fill
 * @returns {Promise<boolean>}
 */
async function fillVerificationCode(code) {
  if (!code || !readyToFill) return false;
  
  readyToFill = false;
  pendingCode = code;
  
  try {
    const success = fillVerificationCodeSync(code);
    
    if (success) {
      hasFilledCode = true;
      pendingCode = null;
    }
    
    readyToFill = true;
    return success;
  } catch (error) {
    logError(error);
    readyToFill = true;
    return false;
  }
}

// ============================================================================
// UI FEEDBACK
// ============================================================================

/**
 * Show success animation on filled inputs
 * @param {Array<HTMLElement>} inputs - Filled inputs
 */
function showFillAnimation(inputs) {
  const successColor = 'rgba(16, 185, 129, 0.2)';
  const successBorder = 'rgba(16, 185, 129, 0.8)';
  
  inputs.forEach(input => {
    const originalBg = input.style.backgroundColor;
    const originalBorder = input.style.borderColor;
    const originalBoxShadow = input.style.boxShadow;
    
    input.style.transition = 'all 0.3s ease';
    input.style.backgroundColor = successColor;
    input.style.borderColor = successBorder;
    input.style.boxShadow = `0 0 0 3px ${successColor}`;
    
    setTimeout(() => {
      input.style.backgroundColor = originalBg;
      input.style.borderColor = originalBorder;
      input.style.boxShadow = originalBoxShadow;
    }, 1500);
  });
}

/**
 * Show error animation when no code found
 * @param {Array<HTMLElement>} inputs - Input elements
 */
function showNoCodeAnimation(inputs) {
  const errorColor = 'rgba(239, 68, 68, 0.1)';
  const errorBorder = 'rgba(239, 68, 68, 0.6)';
  
  inputs.forEach(input => {
    const originalBg = input.style.backgroundColor;
    const originalBorder = input.style.borderColor;
    const originalTransform = input.style.transform;
    
    input.style.transition = 'all 0.3s ease';
    input.style.backgroundColor = errorColor;
    input.style.borderColor = errorBorder;
    
    // Shake animation
    const shake = [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(4px)' },
      { transform: 'translateX(-4px)' },
      { transform: 'translateX(0)' }
    ];
    
    input.animate(shake, { duration: 400, easing: 'ease-in-out' });
    
    setTimeout(() => {
      input.style.backgroundColor = originalBg;
      input.style.borderColor = originalBorder;
      input.style.transform = originalTransform;
    }, 1500);
  });
}

/**
 * Show toast notification
 * @param {string} message - Message to show
 * @param {string} type - 'success', 'error', or 'info'
 */
function showToast(message, type = 'info') {
  // Remove existing toast
  const existingToast = document.getElementById('qfill-toast');
  if (existingToast) existingToast.remove();
  
  const toast = document.createElement('div');
  toast.id = 'qfill-toast';
  
  const bgColor = type === 'success' ? '#10B981' : type === 'error' ? '#EF4444' : '#5469D4';
  
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: ${bgColor};
    color: white;
    padding: 14px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 10px;
    animation: qfill-slidein 0.3s ease;
  `;
  
  // Icon
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.textContent = `${icon} ${message}`;
  
  // Add animation style
  if (!document.getElementById('qfill-toast-style')) {
    const style = document.createElement('style');
    style.id = 'qfill-toast-style';
    style.textContent = `
      @keyframes qfill-slidein {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes qfill-slideout {
        from { opacity: 1; transform: translateY(0); }
        to { opacity: 0; transform: translateY(-20px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    toast.style.animation = 'qfill-slideout 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Handle no code found scenario
 * @returns {Promise<boolean>}
 */
async function handleNoCodeFound() {
  try {
    const candidates = findCandidateInputs();
    
    if (candidates.length > 0) {
      showNoCodeAnimation(candidates.slice(0, 3).map(c => c.input));
    }
    
    showToast('No verification code found in recent emails', 'error');
    return true;
  } catch (error) {
    logError(error);
    showToast('No verification code found', 'error');
    return false;
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

function sendReadySignal() {
  try {
    chrome.runtime.sendMessage(
      { action: MESSAGE_ACTIONS.CONTENT_SCRIPT_READY, url: window.location.href },
      response => {
        if (chrome.runtime.lastError) {
          logDebug('Ready signal error (normal on first load)');
        }
      }
    );
  } catch (error) {
    logError(`Ready signal failed: ${error}`);
  }
}

sendReadySignal();
