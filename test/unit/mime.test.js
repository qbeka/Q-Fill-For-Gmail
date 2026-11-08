import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseMessage, decodeBody, charsetOf, getHeader, senderName } from '../../extension/core/mime.js';

const b64url = (text, encoding = 'utf8') =>
  Buffer.from(text, encoding).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

test('decodes base64url UTF-8 with and without padding', () => {
  assert.equal(decodeBody(b64url('Código 482913 für Sie')), 'Código 482913 für Sie');
  assert.equal(decodeBody(Buffer.from('ab').toString('base64')), 'ab');
});

test('decodes Latin-1 bodies using the declared charset', () => {
  const data = b64url('Votre code est 827364, merci beaucoup à vous', 'latin1');
  assert.equal(decodeBody(data, 'iso-8859-1'), 'Votre code est 827364, merci beaucoup à vous');
  assert.notEqual(decodeBody(data, 'utf-8'), 'Votre code est 827364, merci beaucoup à vous');
});

test('falls back to UTF-8 for an unknown charset and returns empty for bad data', () => {
  assert.equal(decodeBody(b64url('hello'), 'x-not-a-charset'), 'hello');
  assert.equal(decodeBody('%%%'), '');
  assert.equal(decodeBody(''), '');
});

test('reads the charset from a content-type header', () => {
  assert.equal(charsetOf('text/html; charset="ISO-8859-1"'), 'iso-8859-1');
  assert.equal(charsetOf('text/plain; charset=utf-8; format=flowed'), 'utf-8');
  assert.equal(charsetOf(''), 'utf-8');
});

test('header lookup ignores case', () => {
  assert.equal(getHeader([{ name: 'Subject', value: 'Hi' }], 'subject'), 'Hi');
  assert.equal(getHeader(undefined, 'subject'), '');
});

test('parses a nested multipart message and skips attachments', () => {
  const message = {
    id: 'abc',
    internalDate: '1762500000000',
    payload: {
      mimeType: 'multipart/mixed',
      headers: [
        { name: 'Subject', value: 'Your code' },
        { name: 'From', value: '"Acme Security" <no-reply@acme.test>' }
      ],
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', headers: [], body: { data: b64url('Your code is 111222') } },
            { mimeType: 'text/html', headers: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: { data: b64url('<b>111222</b>') } }
          ]
        },
        { mimeType: 'text/plain', filename: 'notes.txt', headers: [], body: { data: b64url('999888') } },
        { mimeType: 'image/png', filename: 'logo.png', headers: [], body: { attachmentId: 'x' } }
      ]
    }
  };

  const parsed = parseMessage(message);
  assert.equal(parsed.id, 'abc');
  assert.equal(parsed.receivedAt, 1762500000000);
  assert.equal(parsed.subject, 'Your code');
  assert.equal(parsed.from, '"Acme Security" <no-reply@acme.test>');
  assert.equal(parsed.text, 'Your code is 111222');
  assert.equal(parsed.html, '<b>111222</b>');
});

test('parses a single-part HTML message', () => {
  const parsed = parseMessage({
    id: 'x',
    internalDate: '5',
    payload: { mimeType: 'text/html', headers: [], body: { data: b64url('<p>hi</p>') } }
  });
  assert.equal(parsed.html, '<p>hi</p>');
  assert.equal(parsed.text, '');
});

test('survives a message with no payload', () => {
  const parsed = parseMessage({});
  assert.deepEqual(parsed, { id: '', receivedAt: 0, subject: '', from: '', text: '', html: '' });
});

test('extracts a readable sender name', () => {
  assert.equal(senderName('"Acme Security" <no-reply@acme.test>'), 'Acme Security');
  assert.equal(senderName('Acme <a@acme.test>'), 'Acme');
  assert.equal(senderName('a@acme.test'), 'a@acme.test');
  assert.equal(senderName(''), '');
});
