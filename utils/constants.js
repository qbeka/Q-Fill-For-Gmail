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
  
  /** Time window for fetching recent emails (5 minutes) */
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
  MIN_EMAIL_CONTENT_LENGTH: 20,
  
  /** Recent emails to scan (newest first) for a verification code */
  MAX_GMAIL_RESULTS: 5,

  /** Max age of emails to consider (Gmail query: newer_than:Nd) */
  GMAIL_MAX_AGE_DAYS: 2
};

/**
 * Gmail search query prioritizing verification-related messages
 */
export const GMAIL_VERIFICATION_QUERY = Object.freeze(
  'newer_than:2d (' +
    'subject:(verification OR verify OR code OR OTP OR otp OR 2fa OR confirm OR security OR passcode) OR ' +
    '"verification code" OR "one-time code" OR "one time code" OR "security code"' +
  ')'
);

/**
 * Strong verification keywords - high confidence the email contains a code
 */
export const STRONG_VERIFICATION_KEYWORDS = Object.freeze([
  'verification code',
  'verify code',
  'confirmation code',
  'security code',
  'login code',
  'sign-in code',
  'signin code',
  'authentication code',
  'authorization code',
  'one-time code',
  'one time code',
  'otp',
  '2fa',
  'two-factor',
  'two factor',
  'passcode',
  'one-time password',
  'temporary password',
  'access code'
]);

/**
 * Weak verification keywords - may indicate a code
 */
export const WEAK_VERIFICATION_KEYWORDS = Object.freeze([
  'verification',
  'verify',
  'code',
  'confirm',
  'secure',
  'security',
  'authenticate',
  'login',
  'sign in',
  'sign-in',
  'token',
  'pin'
]);

/**
 * All verification keywords (combined)
 */
export const VERIFICATION_KEYWORDS = Object.freeze([
  ...STRONG_VERIFICATION_KEYWORDS,
  ...WEAK_VERIFICATION_KEYWORDS
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
  '2fa',
  'mfa',
  'one-time',
  'onetime'
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
  'color',
  'date',
  'datetime-local',
  'month',
  'week',
  'time',
  'range'
]);

/**
 * Valid text-like input types for code filling
 */
export const TEXT_INPUT_TYPES = Object.freeze([
  'text',
  '',
  'tel',
  'number',
  'password'
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
  FILL_FAILED: 'fillFailed',
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
  FILL_FAILED: 'fillFailed',
  ERROR: 'error'
});

/**
 * Debug levels for logging
 */
export const DEBUG_LEVEL = {
  NONE: 0,
  BASIC: 1,
  VERBOSE: 2
};
