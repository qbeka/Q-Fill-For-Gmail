/**
 * Constants for Q-Fill for Gmail
 * 
 * Centralizes all magic numbers and string constants
 * to improve code maintainability and readability.
 * 
 * @fileoverview Centralized constants module
 */

/**
 * Time-related constants (in milliseconds unless otherwise specified)
 */
export const TIME = {
  /** Delay before retrying message send after script injection */
  INJECTION_RETRY_DELAY_MS: 300,
  
  /** Time window for fetching recent emails (5 minutes in seconds) */
  EMAIL_FETCH_WINDOW_MINUTES: 5,
  
  /** Initial check time offset (2 minutes in ms) */
  INITIAL_CHECK_OFFSET_MS: 2 * 60 * 1000,
  
  /** Time to consider an email as "fresh" (10 minutes) */
  EMAIL_FRESHNESS_MINUTES: 10
};

/**
 * Verification code validation constants
 */
export const CODE_VALIDATION = {
  /** Minimum length for a valid verification code */
  MIN_LENGTH: 4,
  
  /** Maximum length for a valid verification code */
  MAX_LENGTH: 8,
  
  /** Minimum email content length to likely contain a code */
  MIN_EMAIL_CONTENT_LENGTH: 50,
  
  /** Maximum results to fetch from Gmail API */
  MAX_GMAIL_RESULTS: 10
};

/**
 * Keywords for identifying verification-related emails
 */
export const VERIFICATION_KEYWORDS = Object.freeze([
  'verification',
  'verify',
  'code',
  'pin',
  'otp',
  'passcode',
  'secure',
  'security',
  'authorization',
  'authenticate',
  'auth',
  'confirm',
  'confirmation',
  'login',
  'sign-in',
  '2fa',
  'two-factor',
  'one-time',
  'password',
  'token'
]);

/**
 * Keywords for scoring verification input fields
 */
export const INPUT_VERIFICATION_KEYWORDS = Object.freeze([
  'code',
  'verification',
  'verify',
  'otp',
  'token',
  'auth',
  'secure',
  'pin',
  'confirm',
  'passcode',
  'tfa',
  '2fa'
]);

/**
 * Restricted URL patterns where content scripts cannot run
 */
export const RESTRICTED_URLS = Object.freeze([
  'chrome://',
  'chrome-extension://',
  'chrome.google.com/webstore',
  'chrome.google.com/extensions'
]);

/**
 * Error message patterns indicating content script needs injection
 */
export const INJECTION_ERROR_PATTERNS = Object.freeze([
  'receiving end does not exist',
  'Could not establish connection',
  'port closed',
  'disconnected'
]);

/**
 * Input types to skip when looking for verification code fields
 */
export const SKIP_INPUT_TYPES = Object.freeze([
  'checkbox',
  'radio',
  'submit',
  'button',
  'file',
  'hidden',
  'image',
  'reset',
  'color'
]);

/**
 * Valid text-like input types for code filling
 */
export const TEXT_INPUT_TYPES = Object.freeze([
  'text',
  '',
  'tel',
  'number',
  'password',
  'email'
]);

/**
 * Message actions used between background/content/popup scripts
 */
export const MESSAGE_ACTIONS = Object.freeze({
  GET_AUTH_STATUS: 'getAuthStatus',
  AUTHENTICATE: 'authenticate',
  CLEAR_AUTH: 'clearAuth',
  FORCE_CHECK_EMAILS: 'forceCheckEmails',
  CONTENT_SCRIPT_READY: 'contentScriptReady',
  FILL_CODE: 'fillCode',
  NO_CODE_FOUND: 'noCodeFound',
  CHECKING_STATUS: 'checkingStatus'
});

/**
 * Checking status states
 */
export const CHECKING_STATUS = Object.freeze({
  CHECKING: 'checking',
  NO_EMAILS: 'noEmails',
  CODE_FOUND: 'codeFound',
  NO_CODE_FOUND: 'noCodeFound',
  ERROR: 'error'
});

/**
 * Regex patterns for extracting verification codes
 * Ordered by specificity (most specific first)
 */
export const CODE_PATTERNS = Object.freeze([
  // Very specific patterns for numeric codes with clear labeling
  /(?:verification|auth|security|confirmation|login|sign-in|2fa|authorization)\s+code(?:\s+is|\s*[:=]\s*)([0-9]{4,8})/i,
  /(?:your|the)\s+(?:code|otp|pin|passcode)(?:\s+is|\s*[:=]\s*)([0-9]{4,8})/i,
  /(?:code|pin|otp|passcode)\s*[:=]\s*([0-9]{4,8})/i,
  
  // Common formatted codes with spaces or dashes
  /\b(?:code|pin|otp|passcode)\s*[:=]?\s*([0-9]{3}[\s\-][0-9]{3})\b/i,
  
  // Special formats with clear labeling
  /\b(?:code|pin|otp|passcode)\s*[:=]?\s*([A-Z0-9]{1,2}[\s\-]+[0-9]{3,6})\b/i,
  
  // Look for more general labeled codes
  /(?:code|pin|otp|token|passcode|password)\s*(?:is|:=|:|\s)\s*([a-zA-Z0-9]{4,8})/i,
  
  // Codes highlighted in quotes, brackets, etc.
  /"([0-9]{4,8})"/,
  /'([0-9]{4,8})'/,
  /\s\*\*([0-9]{4,8})\*\*/,
  /\(([0-9]{4,8})\)/,
  
  // Codes in verification context
  /verification[\s\S]{1,50}?([0-9]{4,8})/i,
  /authentication[\s\S]{1,50}?([0-9]{4,8})/i,
  /one-time[\s\S]{1,50}?([0-9]{4,8})/i,
  /security[\s\S]{1,50}?([0-9]{4,8})/i,
  
  // Common numeric patterns near context words
  /\b([0-9]{6})\b/,  // 6-digit (most common)
  /\b([0-9]{5})\b/,  // 5-digit
  /\b([0-9]{4})\b/,  // 4-digit PIN
  /\b([0-9]{8})\b/,  // 8-digit
  
  // Alphanumeric codes (less common)
  /\b([A-Za-z0-9]{6,8})\b/
]);

/**
 * Debug levels for logging
 */
export const DEBUG_LEVEL = {
  NONE: 0,
  BASIC: 1,
  VERBOSE: 2
};
