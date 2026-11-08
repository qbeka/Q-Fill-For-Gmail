/**
 * In-page autofill. The service worker injects this file into the tab you are
 * on only when you ask for a code, then calls the functions it exposes.
 *
 * It is a classic script, not a module, because chrome.scripting cannot
 * inject modules. Everything lives on one global in the extension's isolated
 * world, which the page's own scripts cannot see.
 *
 *   __qfill.probe(codeLength)  ->  { score, kind, size } | null
 *   __qfill.fill(code)         ->  Promise<{ ok, kind, reason }>
 *   __qfill.toast(text, tone)  ->  shows a short message on the page
 */
(() => {
  'use strict';

  const VERSION = 2;
  if (globalThis.__qfill?.version === VERSION) return;

  const MIN_SCORE = 50;

  const DEFINITIVE = [
    'one time code', 'onetimecode', 'one time password', 'otp', 'totp', 'hotp',
    'verification code', 'verificationcode', 'verify code', 'security code',
    'auth code', 'authcode', 'authentication code', 'sms code', 'smscode',
    '2fa', 'mfa', 'tfa', 'two factor', 'passcode', 'confirmation code',
    'login code', 'sign in code', 'access code', 'pin code', 'mfa code'
  ];
  const STRONG = ['verification', 'verify', 'authenticator', 'one time', 'onetime', 'challenge', 'token'];
  const MEDIUM = ['code', 'pin', 'digit', 'digits', 'otc'];
  const NEGATIVE = [
    'email', 'e mail', 'mail', 'user', 'username', 'userid', 'login id', 'account',
    'password', 'passwd', 'pwd', 'name', 'first', 'last', 'full name', 'nickname',
    'address', 'street', 'city', 'state', 'zip', 'zipcode', 'postal', 'postcode', 'country',
    'phone', 'mobile', 'telephone', 'cell', 'card', 'cc', 'cvv', 'cvc', 'csc', 'expiry',
    'expiration', 'exp', 'coupon', 'promo', 'promocode', 'discount', 'voucher', 'gift',
    'referral', 'invite', 'search', 'query', 'q', 'comment', 'message', 'subject', 'title',
    'amount', 'price', 'quantity', 'qty', 'date', 'year', 'month', 'day', 'birthday', 'dob',
    'url', 'website', 'company', 'captcha'
  ];
  /**
   * Fields that name a code but want a different one. These count against a
   * field even though they contain the word "code" or "pin".
   */
  const OTHER_CODES = [
    'promo', 'promocode', 'promotion', 'promotional', 'coupon', 'discount', 'voucher', 'gift',
    'giftcard', 'referral', 'invite', 'invitation', 'zip', 'zipcode', 'postal', 'postcode',
    'country code', 'area code', 'dial code', 'calling code', 'search', 'q', 'query',
    'reward', 'redeem', 'redemption', 'offer', 'card', 'cvv', 'cvc', 'csc', 'atm',
    'tracking', 'booking', 'reference', 'order', 'serial', 'license', 'product', 'captcha'
  ];
  /** Never a verification code, whatever else the field says. */
  const NEVER = ['cvv', 'cvv2', 'cvc', 'csc', 'card', 'credit', 'debit', 'iban', 'ssn', 'captcha'];
  const SKIP_TYPES = new Set([
    'button', 'checkbox', 'color', 'date', 'datetime-local', 'email', 'file', 'hidden',
    'image', 'month', 'radio', 'range', 'reset', 'search', 'submit', 'time', 'url', 'week'
  ]);
  const FIELD_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

  /** "otpInput_1" -> "otp input 1" */
  const words = value => String(value || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

  const has = (text, phrase) => ` ${text} `.includes(` ${phrase} `);
  const hasAny = (text, list) => list.some(p => has(text, p));

  function* allRoots(root = document) {
    yield root;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (node.shadowRoot) yield* allRoots(node.shadowRoot);
    }
  }

  function collectFields() {
    const fields = [];
    for (const root of allRoots()) {
      for (const el of root.querySelectorAll(FIELD_SELECTOR)) fields.push(el);
    }
    return fields;
  }

  function deepActiveElement() {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  }

  const isEditable = el => el.isContentEditable && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA';

  function isUsable(el) {
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (SKIP_TYPES.has(type)) return false;
    }
    if (el.disabled || el.readOnly) return false;
    if (el.closest('[inert], [aria-hidden="true"]')) return false;

    const visible = typeof el.checkVisibility === 'function'
      ? el.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true })
      : manualVisibility(el);
    if (!visible) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    // Off-screen honeypot fields.
    if (rect.right < -500 || rect.bottom < -500) return false;
    return getComputedStyle(el).pointerEvents !== 'none' || el.autocomplete === 'one-time-code';
  }

  function manualVisibility(el) {
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      if (node.hidden) return false;
    }
    return true;
  }

  function labelText(el) {
    const parts = [];
    try {
      for (const label of el.labels || []) parts.push(label.textContent);
    } catch {
      /* contenteditable has no labels */
    }
    const root = el.getRootNode();
    for (const attr of ['aria-labelledby', 'aria-describedby']) {
      for (const id of (el.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) {
        const ref = root.getElementById?.(id) || document.getElementById(id);
        if (ref) parts.push(ref.textContent);
      }
    }
    const prev = el.previousElementSibling;
    if (prev && !prev.matches(FIELD_SELECTOR)) parts.push(prev.textContent);

    // Nearby text in the closest small container, such as "Enter the 6-digit code".
    let parent = el.parentElement;
    for (let level = 0; level < 3 && parent; level++, parent = parent.parentElement) {
      const text = parent.textContent || '';
      if (text.length > 300) break;
      parts.push(text);
    }
    return words(parts.join(' ').slice(0, 600));
  }

  /** The field's own label only, without the text of nearby fields. */
  function ownLabelText(el) {
    const parts = [el.getAttribute('aria-label') || '', el.getAttribute('placeholder') || ''];
    try {
      for (const label of el.labels || []) parts.push(label.textContent);
    } catch {
      /* contenteditable has no labels */
    }
    const prev = el.previousElementSibling;
    if (prev && !prev.matches(FIELD_SELECTOR) && (prev.textContent || '').length < 80) parts.push(prev.textContent);
    return words(parts.join(' '));
  }

  function attributeText(el) {
    const attrs = ['id', 'name', 'class', 'placeholder', 'aria-label', 'title', 'autocomplete',
      'data-testid', 'data-test', 'data-cy', 'data-qa', 'formcontrolname', 'ng-model', 'v-model'];
    return words(attrs.map(a => el.getAttribute(a) || '').join(' '));
  }

  /**
   * How likely this field is to want a verification code. Higher is better.
   * @param {HTMLElement} el
   * @param {number} codeLength
   * @param {Element|null} active
   */
  function scoreField(el, codeLength, active) {
    const attrs = attributeText(el);
    const label = labelText(el);
    const type = (el.getAttribute('type') || 'text').toLowerCase();
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    const inputMode = (el.getAttribute('inputmode') || '').toLowerCase();
    const maxLength = typeof el.maxLength === 'number' ? el.maxLength : -1;
    let score = 0;

    const oneTimeCode = autocomplete.split(/\s+/).includes('one-time-code');
    if (oneTimeCode) score += 300;

    const ownLabel = ownLabelText(el);
    const attrStrong = hasAny(attrs, DEFINITIVE) || hasAny(attrs, STRONG);
    const labelStrong = hasAny(label, DEFINITIVE) || hasAny(label, STRONG);
    const attrPositive = attrStrong || hasAny(attrs, MEDIUM);
    const labelPositive = labelStrong || hasAny(label, MEDIUM);

    if (!oneTimeCode && (hasAny(attrs, NEVER) || hasAny(ownLabel, NEVER))) return -1000;

    // A password field is only a code field when it says so outright.
    if (type === 'password' && !oneTimeCode && !hasAny(attrs, DEFINITIVE) && !hasAny(ownLabel, DEFINITIVE)) {
      return -1000;
    }

    // "Promo code", "ZIP code", "gift card code": the word "code" is not enough.
    const otherCode = hasAny(attrs, OTHER_CODES) || hasAny(ownLabel, OTHER_CODES);
    if (otherCode && !oneTimeCode && !attrStrong && !hasAny(ownLabel, DEFINITIVE) && !hasAny(ownLabel, STRONG)) {
      return -1000;
    }

    if (hasAny(attrs, DEFINITIVE)) score += 150;
    else if (hasAny(attrs, STRONG)) score += 70;
    else if (hasAny(attrs, MEDIUM)) score += 40;

    if (hasAny(label, DEFINITIVE)) score += 80;
    else if (hasAny(label, STRONG)) score += 45;
    else if (hasAny(label, MEDIUM)) score += 30;

    if (maxLength === 1) score += 50;
    else if (maxLength === codeLength) score += 80;
    else if (maxLength >= 4 && maxLength <= 8) score += 40;
    else if (maxLength > 20 && maxLength < 500) score -= 60;

    if (inputMode === 'numeric' || inputMode === 'decimal') score += 40;
    if (type === 'tel') score += 20;
    if (type === 'number') score += 15;
    if (el.pattern && /\\d|\[0-9\]/.test(el.pattern)) score += 25;

    if (el === active) score += 70;
    if (el.tagName === 'TEXTAREA') score -= 60;
    if (isEditable(el)) score -= 30;

    const value = isEditable(el) ? el.textContent : el.value;
    if (!value) score += 10;
    else if (value.length > 12) score -= 100;

    const rect = el.getBoundingClientRect();
    if (rect.top < innerHeight && rect.bottom > 0) score += 20;
    if (parseFloat(getComputedStyle(el).opacity) === 0 && score < 300) score -= 40;

    if (hasAny(attrs, NEGATIVE) && !attrPositive) score -= 150;
    if (hasAny(label, NEGATIVE) && !labelPositive && !attrPositive) score -= 60;

    return score;
  }

  /** Single-character boxes that sit in one row, like most split OTP inputs. */
  function findBoxRows(fields) {
    const boxes = fields.filter(el => {
      if (el.tagName !== 'INPUT') return false;
      const rect = el.getBoundingClientRect();
      return el.maxLength === 1 || (el.maxLength <= 0 && rect.width <= 64);
    });

    const rows = [];
    let current = [];
    const flush = () => {
      if (current.length >= 4 && current.length <= 8) rows.push(current);
      current = [];
    };

    for (const box of boxes) {
      const prev = current[current.length - 1];
      if (!prev) {
        current.push(box);
        continue;
      }
      const a = prev.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      const sameRow = Math.abs(a.top - b.top) < 12 && Math.abs(a.height - b.height) < 12;
      const similar = Math.abs(a.width - b.width) <= Math.max(8, a.width * 0.35);
      const close = b.left > a.left && b.left - a.right < Math.max(48, a.width * 2.5);
      if (sameRow && similar && close) current.push(box);
      else {
        flush();
        current.push(box);
      }
    }
    flush();
    return rows;
  }

  /**
   * True for one segment of a multi-part number, such as a card number split
   * into four boxes of four digits. Such a field never takes a whole code.
   * @param {HTMLInputElement} el
   */
  function isSegment(el) {
    if (el.tagName !== 'INPUT' || !(el.maxLength > 1) || !el.parentElement) return false;
    const top = el.getBoundingClientRect().top;
    const peers = [...el.parentElement.children].filter(other =>
      other !== el && other.tagName === 'INPUT' && other.maxLength > 1 &&
      Math.abs(other.getBoundingClientRect().top - top) < 8);
    return peers.length >= 2;
  }

  /**
   * Picks where the code goes: one input, or a row of single-digit boxes.
   * @param {number} codeLength
   */
  function plan(codeLength) {
    const active = deepActiveElement();
    const fields = collectFields().filter(isUsable);
    if (!fields.length) return null;

    const scores = new Map(fields.map(el => [el, scoreField(el, codeLength, active)]));

    let bestRow = null;
    for (const row of findBoxRows(fields)) {
      const avg = row.reduce((sum, el) => sum + scores.get(el), 0) / row.length;
      const anyOtc = row.some(el => scores.get(el) >= 300);
      const score = Math.max(avg, anyOtc ? 300 : 0) + (row.length === codeLength ? 60 : -200) +
        (row.every(el => el.maxLength === 1) ? 40 : 0);
      if (!bestRow || score > bestRow.score) bestRow = { kind: 'boxes', fields: row, score };
    }

    let bestSingle = null;
    for (const el of fields) {
      const max = el.maxLength;
      // A box that holds fewer characters than the code cannot take it whole.
      if (typeof max === 'number' && max > 0 && max < codeLength) continue;
      if (isSegment(el)) continue;
      const score = scores.get(el);
      if (!bestSingle || score > bestSingle.score) bestSingle = { kind: 'single', fields: [el], score };
    }

    const candidates = [bestRow, bestSingle].filter(c => c && c.score >= MIN_SCORE);
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
  const readValue = el => (isEditable(el) ? el.textContent : el.value || '').replace(/[\s-]/g, '');

  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: value }));
    el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
  }

  /**
   * Types text the way a person would, so frameworks such as React, Vue and
   * Angular see the change. execCommand fires real input events; the native
   * value setter is the fallback for fields where it does nothing.
   */
  function typeInto(el, text) {
    el.focus({ preventScroll: false });
    if (isEditable(el)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand('insertText', false, text) || readValue(el) !== text) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'insertText', data: text }));
      }
      return;
    }
    try {
      el.select();
    } catch {
      /* number inputs cannot be selected */
    }
    let typed = false;
    try {
      typed = document.execCommand('insertText', false, text);
    } catch {
      typed = false;
    }
    if (!typed || readValue(el) !== text) setNativeValue(el, text);
  }

  function paste(el, text) {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.focus();
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true, composed: true }));
  }

  function highlight(fields) {
    for (const el of fields) {
      const { outline, outlineOffset, transition } = el.style;
      el.style.transition = 'outline-color 600ms ease';
      el.style.outline = '2px solid #2f7d4f';
      el.style.outlineOffset = '2px';
      setTimeout(() => {
        el.style.outline = outline;
        el.style.outlineOffset = outlineOffset;
        el.style.transition = transition;
      }, 1600);
    }
  }

  async function fill(rawCode) {
    const code = String(rawCode || '').replace(/[^0-9A-Za-z]/g, '');
    if (code.length < 4 || code.length > 8) return { ok: false, reason: 'bad-code' };

    const target = plan(code.length);
    if (!target) return { ok: false, reason: 'no-field' };

    if (target.kind === 'single') {
      const [el] = target.fields;
      typeInto(el, code);
      await nextFrame();
      if (readValue(el).toUpperCase() === code.toUpperCase()) {
        highlight([el]);
        return { ok: true, kind: 'single' };
      }
      return { ok: false, reason: 'rejected' };
    }

    const boxes = target.fields;
    const joined = () => boxes.map(readValue).join('').toUpperCase();

    for (let i = 0; i < boxes.length; i++) typeInto(boxes[i], code[i]);
    await nextFrame();

    if (joined() !== code.toUpperCase()) {
      // Many split-box widgets spread a pasted code across their boxes.
      for (const box of boxes) setNativeValue(box, '');
      paste(boxes[0], code);
      await nextFrame();
    }

    if (joined() === code.toUpperCase()) {
      boxes[boxes.length - 1].focus();
      highlight(boxes);
      return { ok: true, kind: 'boxes' };
    }
    return { ok: false, reason: 'rejected' };
  }

  function probe(codeLength) {
    const target = plan(codeLength || 6);
    return target ? { score: target.score, kind: target.kind, size: target.fields.length } : null;
  }

  let toastTimer = 0;

  /**
   * @param {string} text
   * @param {'success'|'error'|'info'} [tone]
   * @param {number} [durationMs]
   */
  function toast(text, tone = 'info', durationMs = 3200) {
    document.getElementById('qfill-toast-host')?.remove();
    clearTimeout(toastTimer);
    if (!text) return;

    const host = document.createElement('div');
    host.id = 'qfill-toast-host';
    host.style.cssText = 'all:initial;position:fixed;inset:auto 0 24px 0;display:flex;justify-content:center;z-index:2147483647;pointer-events:none';
    const shadow = host.attachShadow({ mode: 'closed' });
    const dot = { success: '#3fa36b', error: '#d4513d', info: '#9aa09b' }[tone] || '#9aa09b';
    shadow.innerHTML = `<style>
      .t{display:flex;align-items:center;gap:10px;max-width:min(420px,calc(100vw - 32px));padding:11px 16px 11px 14px;
        border-radius:999px;background:#121412;color:#f4f1ec;font:500 13.5px/1.35 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
        letter-spacing:.005em;box-shadow:0 10px 30px rgba(17,21,17,.22),0 0 0 1px rgba(255,255,255,.06) inset;
        animation:in 220ms cubic-bezier(.2,.8,.2,1)}
      .d{flex:none;width:7px;height:7px;border-radius:50%;background:${dot}}
      .b{flex:none;font-weight:600;color:#fff}
      @keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      @media (prefers-reduced-motion:reduce){.t{animation:none}}
    </style><div class="t" role="status" aria-live="polite"><span class="d"></span><span class="b">Q-Fill</span><span class="m"></span></div>`;
    shadow.querySelector('.m').textContent = text;
    (document.body || document.documentElement).appendChild(host);
    if (durationMs > 0) toastTimer = setTimeout(() => host.remove(), durationMs);
  }

  globalThis.__qfill = { version: VERSION, probe, fill, toast };
})();
