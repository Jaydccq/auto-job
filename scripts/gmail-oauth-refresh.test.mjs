import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeMessageText,
} from './gmail-oauth-refresh.mjs';

test('sanitizeMessageText strips combining grapheme joiner U+034F', () => {
  const raw = 'Your application to AI Engineer at PRI Global ͏ ͏ ͏ hello';
  const cleaned = sanitizeMessageText(raw);
  assert.equal(cleaned.includes('͏'), false);
  assert.match(cleaned, /Your application to AI Engineer at PRI Global/);
  assert.match(cleaned, /hello/);
});

test('sanitizeMessageText strips zero-width chars (U+200B, U+200C, U+200D, U+2060, U+FEFF)', () => {
  const raw = 'Hello​‌‍⁠﻿World';
  assert.equal(sanitizeMessageText(raw), 'HelloWorld');
});

test('sanitizeMessageText preserves normal whitespace and newlines', () => {
  const raw = 'Line 1\n  Line 2\tIndent';
  assert.equal(sanitizeMessageText(raw), 'Line 1\n  Line 2\tIndent');
});

test('sanitizeMessageText is a no-op on empty / non-string input', () => {
  assert.equal(sanitizeMessageText(''), '');
  assert.equal(sanitizeMessageText(undefined), '');
  assert.equal(sanitizeMessageText(null), '');
});
