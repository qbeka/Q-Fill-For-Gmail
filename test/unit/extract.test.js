import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractCode, htmlToText, normalizeText, decodeEntities } from '../../extension/core/extract.js';
import { POSITIVE, NEGATIVE } from '../fixtures/emails.js';

for (const email of POSITIVE) {
  test(`finds the code: ${email.name}`, () => {
    const result = extractCode(email);
    assert.equal(result?.code ?? null, email.expect, `reason: ${result?.reason}, score: ${result?.score}`);
  });
}

for (const email of NEGATIVE) {
  test(`finds nothing: ${email.name}`, () => {
    const result = extractCode(email);
    assert.equal(result, null, `found ${result?.code} (${result?.reason}, score ${result?.score})`);
  });
}

test('returns null for an empty email', () => {
  assert.equal(extractCode({}), null);
  assert.equal(extractCode(), null);
  assert.equal(extractCode({ subject: '', text: '', html: '' }), null);
});

test('decodes numeric, hex and named entities', () => {
  assert.equal(decodeEntities('&#52;&#x32;&amp;&nbsp;&lt;b&gt;'), '42& <b>');
  assert.equal(decodeEntities('&unknown;'), '&unknown;');
  assert.equal(decodeEntities('&#99999999;'), '');
});

test('htmlToText drops head, style and script and keeps cells on their own lines', () => {
  const text = htmlToText('<html><head><title>T</title><style>p{}</style></head><body><script>x()</script><table><tr><td>A</td><td>123456</td></tr></table></body></html>');
  assert.ok(!text.includes('p{}'));
  assert.ok(!text.includes('x()'));
  assert.ok(!text.includes('T'));
  assert.match(normalizeText(text), /^A\n+123456$/);
});

test('normalizeText removes links and email addresses', () => {
  const text = normalizeText('Go to https://example.com/a?code=112233 or mail help@example.com now');
  assert.equal(text, 'Go to or mail now');
});

test('a code next to "expires" wording is still found when labelled', () => {
  assert.equal(extractCode({ subject: 'Code', text: 'Code: 4412 expires in 10 minutes' })?.code, '4412');
});

test('scores are reported for logging', () => {
  const result = extractCode({ subject: 'Your code', text: 'Your code is 123987' });
  assert.equal(result.code, '123987');
  assert.equal(typeof result.score, 'number');
  assert.equal(typeof result.reason, 'string');
});
