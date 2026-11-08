/**
 * The in-page autofill script on its own, in real Chromium, against small
 * pages. Fast to run and easy to extend: add a page to the lists below.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { ROOT } from './harness.js';

let browser;
let page;
let script;

before(async () => {
  script = await readFile(join(ROOT, 'extension/content/autofill.js'), 'utf8');
  browser = await chromium.launch();
  page = await browser.newPage();
});

after(async () => {
  await browser?.close();
});

async function fillOn(html, code = '482913') {
  await page.setContent(`<!doctype html><body>${html}</body>`);
  await page.addScriptTag({ content: script });
  const result = await page.evaluate(value => globalThis.__qfill.fill(value), code);
  const filled = await page.evaluate(() =>
    [...document.querySelectorAll('input')].filter(i => i.value && !i.defaultValue).map(i => i.name || i.id));
  return { result, filled };
}

const MUST_NOT_FILL = {
  'promo code field': '<form><label>Email <input type=email name=email></label><label>Promo code <input name=promoCode></label><button>Apply</button></form>',
  'ZIP code field': '<form><label>Street <input name=street></label><label>City <input name=city></label><label>ZIP code <input name=zipCode inputmode=numeric></label></form>',
  'gift card code field': '<label>Gift card code <input id=giftCardCode maxlength=8></label>',
  'country code field': '<label>Country code <input name=countryCode size=4></label><label>Phone <input type=tel name=phone></label>',
  'focused username': '<form><label>Username <input name=username autofocus></label><label>Password <input type=password name=password></label></form>',
  'card PIN password field': '<label>Card PIN <input type=password name=pin maxlength=4></label>',
  'search box mentioning code': '<input name=q placeholder="Search code snippets" aria-label="Search code">',
  'referral code field': '<label>Referral code (optional) <input name=referralCode></label>',
  'coupon code field': '<label for=c>Coupon code</label><input id=c name=coupon_code>',
  'card security code labelled as verification code': '<label>Card verification code (CVV) <input name=cardVerificationCode maxlength=4 inputmode=numeric></label>',
  'card number in four boxes': '<div>Card number <input maxlength=4 style="width:60px" name=c1><input maxlength=4 style="width:60px" name=c2><input maxlength=4 style="width:60px" name=c3><input maxlength=4 style="width:60px" name=c4></div>'
};

for (const [name, html] of Object.entries(MUST_NOT_FILL)) {
  test(`leaves alone: ${name}`, async () => {
    for (const code of ['482913', '4829']) {
      const { result, filled } = await fillOn(html, code);
      assert.equal(result.ok, false, `filled ${filled.join(', ')} with ${code}`);
      assert.deepEqual(filled, []);
    }
  });
}

const MUST_FILL = {
  'plain code field labelled with email wording': ['<label for=c>Enter the code we sent to your email</label><input id=c name=code>', 'code'],
  'one-time-code field next to a birthday row': ['<div>Birthday <input name=mm maxlength=2 style="width:40px"><input name=dd maxlength=2 style="width:40px"><input name=yyyy maxlength=4 style="width:60px"></div><label>Verification code <input name=otp autocomplete=one-time-code></label>', 'otp'],
  'verification field beside a promo field': ['<label>Promo code <input name=promo></label><label>Verification code <input name=verificationCode></label>', 'verificationCode'],
  'password-type OTP field': ['<label>One-time code <input type=password name=otp autocomplete=one-time-code></label>', 'otp'],
  '2FA token field': ['<label>Authentication code <input name=totp inputmode=numeric maxlength=6></label>', 'totp']
};

for (const [name, [html, expected]] of Object.entries(MUST_FILL)) {
  test(`fills: ${name}`, async () => {
    const { result, filled } = await fillOn(html);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(filled, [expected]);
  });
}

test('fills six unnamed boxes in a row', async () => {
  const boxes = Array.from({ length: 6 }, (_, i) => `<input maxlength=1 inputmode=numeric style="width:40px" name=d${i}>`).join('');
  const { result, filled } = await fillOn(`<p>Enter the 6-digit code</p><div>${boxes}</div>`);
  assert.equal(result.ok, true);
  assert.equal(filled.length, 6);
});

test('refuses a code of the wrong length for a row of boxes', async () => {
  const boxes = Array.from({ length: 6 }, (_, i) => `<input maxlength=1 inputmode=numeric style="width:40px" name=d${i}>`).join('');
  const { result } = await fillOn(`<div>${boxes}</div>`, '48291377');
  assert.equal(result.ok, false);
});
