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
  INJECTION_RETRY_DELAY_MS: 300,
  INITIAL_CHECK_OFFSET_MS: 2 * 60 * 1000
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
  MAX_GMAIL_RESULTS: 15,

  /** Max age of emails to consider (Gmail query: newer_than:Nd) */
  GMAIL_MAX_AGE_DAYS: 7
};

/**
 * Gmail search — verification-related (broad; OTP subject lines, etc.)
 */
export const GMAIL_VERIFICATION_QUERY = Object.freeze(
  `newer_than:${CODE_VALIDATION.GMAIL_MAX_AGE_DAYS}d (` +
    'subject:(otp OR OTP OR verification OR verify OR code OR 2fa OR confirm OR security OR passcode) OR ' +
    '"verification code" OR "your code" OR "one-time" OR "one time" OR "security code"' +
  ')'
);

/**
 * Recent inbox scan (no subject filter) — catches self-sent tests and odd senders
 */
export const GMAIL_RECENT_QUERY = Object.freeze(
  `newer_than:${CODE_VALIDATION.GMAIL_MAX_AGE_DAYS}d in:anywhere`
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
 * Restricted URL patterns where content scripts cannot run (Chrome + Edge)
 */
export const RESTRICTED_URLS = Object.freeze([
  'chrome://',
  'chrome-extension://',
  'chrome.google.com/webstore',
  'chrome.google.com/extensions',
  'edge://',
  'extension://',
  'microsoftedge.microsoft.com/extensions'
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

