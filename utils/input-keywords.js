/**
 * Heuristics for detecting verification-code input fields on web pages.
 * @module utils/input-keywords
 */

export const DEFINITIVE_KEYWORDS = Object.freeze([
  'one-time-code', 'onetimecode', 'onetime-code',
  'verification-code', 'verificationcode',
  'otp-input', 'otpinput', 'otp-field',
  'totp', '2fa-code', 'mfa-code',
  'sms-code', 'smscode',
  'security-code', 'securitycode',
  'auth-code', 'authcode',
  'passcode-input', 'pin-input'
]);

export const STRONG_KEYWORDS = Object.freeze([
  'otp', 'verification', 'verify', '2fa', 'tfa', 'mfa',
  'passcode', 'authenticator', 'one-time', 'onetime',
  'confirmation-code', 'confirmcode'
]);

export const MEDIUM_KEYWORDS = Object.freeze([
  'code', 'pin', 'token', 'digit', 'secure', 'confirm',
  'validate', 'auth', 'factor'
]);

export const STRONG_NEGATIVE = Object.freeze([
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
]);

export const WEAK_NEGATIVE = Object.freeze([
  'amount', 'price', 'cost', 'quantity', 'qty',
  'date', 'day', 'month', 'year', 'birthday', 'dob',
  'age', 'gender', 'sex'
]);

export const SKIP_INPUT_TYPES = Object.freeze([
  'checkbox', 'radio', 'submit', 'button', 'file', 'hidden',
  'image', 'reset', 'color', 'date', 'datetime-local',
  'month', 'week', 'time', 'range', 'url'
]);

export const SKIP_TYPES = new Set(SKIP_INPUT_TYPES);
