/**
 * Application Constants
 * Centralized constant values to avoid magic numbers throughout the codebase
 */

// Time constants (in milliseconds)
export const TIMEOUTS = {
  EMAIL_CHECK_WINDOW: 5 * 60 * 1000,        // 5 minutes - time window for checking emails
  SCRIPT_INIT_DELAY: 300,                   // 300ms - delay for script initialization
  ANIMATION_STEP: 100,                      // 100ms - animation step duration
  DEBOUNCE_DELAY: 200,                      // 200ms - debounce delay for DOM changes
  RETRY_DELAY_BASE: 2000,                   // 2s - base delay for retry operations
  NOTIFICATION_DISPLAY: 3500,               // 3.5s - notification display duration
  TOAST_FADEOUT: 3000,                      // 3s - toast fadeout time
  ANIMATION_CLEANUP: 2500,                  // 2.5s - cleanup after animations
  MESSAGE_HIDE_DELAY: 5000,                 // 5s - auto-hide messages
  AUTH_STATUS_REFRESH: 500                  // 500ms - auth status refresh delay
};

// Input field constraints
export const INPUT_CONSTRAINTS = {
  MIN_CODE_LENGTH: 4,                       // Minimum verification code length
  MAX_CODE_LENGTH: 8,                       // Maximum verification code length
  SINGLE_CHAR_INPUT: 1,                     // Single character input (OTP)
  MIN_EMAIL_CONTENT_LENGTH: 50              // Minimum email content length
};

// Gmail API settings
export const GMAIL_API = {
  MAX_RESULTS: 10,                          // Maximum number of messages to retrieve
  TIME_WINDOW_MINUTES: 5,                   // Time window in minutes for recent emails
  FALLBACK_WINDOW_DAYS: 1                   // Fallback time window in days
};

// Code extraction patterns
export const CODE_PATTERNS = {
  NUMERIC_MIN: 4,                           // Minimum numeric code length
  NUMERIC_MAX: 8,                           // Maximum numeric code length
  ALPHANUMERIC_MIN: 6,                      // Minimum alphanumeric code length
  ALPHANUMERIC_MAX: 8                       // Maximum alphanumeric code length
};

// Verification keywords
export const VERIFICATION_KEYWORDS = [
  'verification', 'verify', 'code', 'pin', 'otp', 'passcode',
  'secure', 'security', 'authorization', 'authenticate', 'auth',
  'confirm', 'confirmation', 'login', 'sign-in', '2fa', 'two-factor',
  'one-time', 'password', 'token'
];

// Verification terms for scoring
export const VERIFICATION_TERMS = [
  'verification', 'verify', 'code', 'otp', 'one-time', 'onetime',
  'confirm', 'confirmation', 'security', 'auth', 'authenticate',
  'validation', 'pin', 'passcode', 'token'
];

// Restricted URL patterns
export const RESTRICTED_URLS = [
  'chrome://',
  'chrome-extension://',
  'chrome.google.com/webstore',
  'chrome.google.com/extensions'
];

// Input score weights
export const SCORE_WEIGHTS = {
  ATTRIBUTE_MATCH: 3,                       // Score for attribute matching verification terms
  NEARBY_TEXT_MATCH: 2,                     // Score for nearby text matching
  OPTIMAL_LENGTH: 4,                        // Score for optimal maxLength (4-8)
  INPUT_TYPE: 2,                            // Score for tel/number input type
  PATTERN_MATCH: 2,                         // Score for digit pattern
  AUTOCOMPLETE: 5,                          // Score for one-time-code autocomplete
  NUMERIC_PATTERN: 3,                       // Score for numeric pattern
  SINGLE_CHAR: 2                            // Score for single character input
};

// Debug levels
export const DEBUG_LEVELS = {
  NONE: 0,
  BASIC: 1,
  VERBOSE: 2
};

// Message actions
export const MESSAGE_ACTIONS = {
  GET_AUTH_STATUS: 'getAuthStatus',
  AUTHENTICATE: 'authenticate',
  CLEAR_AUTH: 'clearAuth',
  FORCE_CHECK_EMAILS: 'forceCheckEmails',
  CONTENT_SCRIPT_READY: 'contentScriptReady',
  FILL_CODE: 'fillCode',
  NO_CODE_FOUND: 'noCodeFound',
  CHECKING_STATUS: 'checkingStatus'
};

// Checking status values
export const CHECKING_STATUS = {
  CHECKING: 'checking',
  NO_EMAILS: 'noEmails',
  CODE_FOUND: 'codeFound',
  NO_CODE_FOUND: 'noCodeFound',
  ERROR: 'error'
};

// Animation durations
export const ANIMATIONS = {
  SHAKE_STEP_1: 0,
  SHAKE_STEP_2: 100,
  SHAKE_STEP_3: 200,
  SHAKE_STEP_4: 300,
  CLEANUP: 1200,
  FADE_IN: 150,
  FADE_NORMAL: 250,
  FADE_SLOW: 350
};

// DOM observer configuration
export const OBSERVER_CONFIG = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['style', 'class', 'display', 'visibility']
};

// Error messages
export const ERROR_MESSAGES = {
  NO_TOKEN: 'Failed to get authentication token',
  NO_MESSAGES: 'No emails found in your inbox',
  NO_CODE: 'No verification code found in the most recent email',
  AUTH_FAILED: 'Authentication failed',
  CHECK_FAILED: 'Failed to check emails',
  INVALID_MESSAGE: 'Invalid message format received',
  INJECTION_FAILED: 'Failed to inject content script'
};

// Success messages
export const SUCCESS_MESSAGES = {
  CODE_FILLED: 'Verification code detected and applied successfully',
  CONNECTED: 'Successfully connected to Gmail',
  DISCONNECTED: 'Successfully disconnected from Gmail'
};

// Input types to skip
export const SKIP_INPUT_TYPES = [
  'checkbox', 'radio', 'submit', 'button', 'file',
  'hidden', 'image', 'reset', 'color'
];

// Text input types
export const TEXT_INPUT_TYPES = [
  'text', '', 'tel', 'number', 'password', 'email'
];
