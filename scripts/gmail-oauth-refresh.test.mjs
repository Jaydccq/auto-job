import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeMessageText,
  classifyEvent,
  senderClassificationPolicy,
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

test('senderClassificationPolicy: linkedin jobs-noreply restricted to applied/responded only', () => {
  const policy = senderClassificationPolicy({
    name: 'LinkedIn',
    email: 'jobs-noreply@linkedin.com',
  });
  assert.deepEqual(
    [...policy.allowedEvents].sort(),
    ['applied', 'responded'].sort()
  );
  assert.equal(policy.isTrusted, false);
});

test('senderClassificationPolicy: trusted ATS senders allow all event types', () => {
  const policy = senderClassificationPolicy({
    name: 'Whatnot Hiring Team',
    email: 'no-reply@ashbyhq.com',
  });
  assert.equal(policy.isTrusted, true);
  for (const event of ['applied', 'responded', 'online_assessment', 'interview', 'offer', 'rejected', 'action_required']) {
    assert.ok(policy.allowedEvents.has(event), `expected ${event} allowed for ATS sender`);
  }
});

test('classifyEvent: LinkedIn email with rejection-shaped noise returns applied not rejected', () => {
  const event = classifyEvent({
    subject: 'Your application to AI Engineer at PRI Global',
    text: 'Your application to AI Engineer at PRI Global has been received. We will not be moving forward unfortunately is filler text.',
    from: { name: 'LinkedIn', email: 'jobs-noreply@linkedin.com' },
  });
  assert.notEqual(event, 'rejected');
  assert.notEqual(event, 'offer');
  assert.ok(['applied', 'responded', ''].includes(event), `got ${event}`);
});

test('classifyEvent: real Kinstead rejection from ATS still classifies as rejected', () => {
  const event = classifyEvent({
    subject: 'Kinstead Application Update',
    text: 'Hi Hongxi, Thank you for applying for the Senior Backend Engineer, Workflow Systems role at Kinstead. After reviewing your application we have determined that there is not an ideal fit at this time and will not be moving forward with your candidacy.',
    from: { name: 'Kinstead Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.equal(event, 'rejected');
});
