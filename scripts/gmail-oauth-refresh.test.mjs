import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeMessageText,
  classifyEvent,
  senderClassificationPolicy,
  companyFromAtsSenderName,
  extractSignalFromMessage,
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

test('companyFromAtsSenderName strips Hiring Team / Recruiting / Talent Acquisition / Careers suffixes', () => {
  assert.equal(companyFromAtsSenderName({ name: 'Whatnot Hiring Team', email: 'no-reply@ashbyhq.com' }), 'Whatnot');
  assert.equal(companyFromAtsSenderName({ name: 'Kinstead Hiring Team', email: 'no-reply@ashbyhq.com' }), 'Kinstead');
  assert.equal(companyFromAtsSenderName({ name: 'Stripe Recruiting', email: 'noreply@greenhouse-mail.io' }), 'Stripe');
  assert.equal(companyFromAtsSenderName({ name: 'Datadog Talent Acquisition', email: 'donotreply@hire.lever.co' }), 'Datadog');
  assert.equal(companyFromAtsSenderName({ name: 'Acme Careers', email: 'careers@myworkday.com' }), 'Acme');
});

test('companyFromAtsSenderName returns empty for non-ATS senders', () => {
  assert.equal(companyFromAtsSenderName({ name: 'Whatnot Hiring Team', email: 'recruiter@example.com' }), '');
});

test('companyFromAtsSenderName returns empty for generic-only names', () => {
  assert.equal(companyFromAtsSenderName({ name: 'Recruiting', email: 'noreply@greenhouse-mail.io' }), '');
  assert.equal(companyFromAtsSenderName({ name: 'no-reply', email: 'noreply@ashbyhq.com' }), '');
});

function fakeAtsMessage({ id = 'mid-1', threadId = 'tid-1', from = '"Whatnot Hiring Team" <no-reply@ashbyhq.com>', subject = 'Thank you for applying to Whatnot!', body = 'Hongxi, Thanks so much for applying for the Software Engineer, Fraud role at Whatnot!', date = 'Mon, 27 Apr 2026 06:40:05 +0000', internalDate = '1745822405000' } = {}) {
  return {
    id,
    threadId,
    snippet: body.slice(0, 120),
    internalDate,
    payload: {
      headers: [
        { name: 'From', value: from },
        { name: 'Subject', value: subject },
        { name: 'Date', value: date },
      ],
      mimeType: 'text/plain',
      body: { data: Buffer.from(body, 'utf8').toString('base64url') },
    },
  };
}

test('extractSignalFromMessage uses ATS sender name as company for ashbyhq.com', () => {
  const signal = extractSignalFromMessage(fakeAtsMessage());
  assert.equal(signal.company, 'Whatnot');
  assert.equal(signal.eventType, 'applied');
});

import { isGenericCompany } from './gmail-oauth-refresh.mjs';

test('isGenericCompany rejects bare role nouns', () => {
  assert.equal(isGenericCompany('Software Engineer'), true);
  assert.equal(isGenericCompany('Data Scientist'), true);
  assert.equal(isGenericCompany('Machine Learning Engineer'), true);
});

test('isGenericCompany rejects short prepositional fragments', () => {
  assert.equal(isGenericCompany('this time'), true);
  assert.equal(isGenericCompany('our Graduate 2026 Software Engineer I'), true);
  assert.equal(isGenericCompany('an ideal fit'), true);
});

test('isGenericCompany rejects role-at-company smushed phrases', () => {
  assert.equal(isGenericCompany('AI Engineer at PRI Global'), true);
  assert.equal(isGenericCompany('Backend Engineer at Acme'), true);
});

test('isGenericCompany accepts real company names', () => {
  assert.equal(isGenericCompany('Whatnot'), false);
  assert.equal(isGenericCompany('Kinstead'), false);
  assert.equal(isGenericCompany('LendingClub'), false);
  assert.equal(isGenericCompany('Grant Street Group'), false);
});

test('isGenericCompany accepts capitalized "The X" company names', () => {
  assert.equal(isGenericCompany('The Walt Disney Company'), false);
  assert.equal(isGenericCompany('The Trade Desk'), false);
  assert.equal(isGenericCompany('The Home Depot'), false);
});

test('isGenericCompany still rejects "the X" lowercase prose fragments', () => {
  assert.equal(isGenericCompany('the next step'), true);
  assert.equal(isGenericCompany('the ideal candidate'), true);
  assert.equal(isGenericCompany('the role'), true);
});

test('classifyEvent: hard rejection phrase alone is enough', () => {
  for (const phrase of [
    'we will not be moving forward with your application',
    'we have decided not to proceed with your candidacy',
    'this position has been filled',
    'unfortunately you have not been selected for the role',
  ]) {
    const event = classifyEvent({
      subject: 'Application Update',
      text: `Hi Hongxi, ${phrase}. Best, The Team`,
      from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
    });
    assert.equal(event, 'rejected', `expected rejected for: ${phrase}`);
  }
});

test('classifyEvent: soft phrase alone is NOT rejection', () => {
  const event = classifyEvent({
    subject: 'Application Update',
    text: 'Hi Hongxi, unfortunately our schedule is full this week. We hope to follow up soon.',
    from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.notEqual(event, 'rejected');
});

test('classifyEvent: applied receipt is not rejection even if body has filler "unfortunately"', () => {
  const event = classifyEvent({
    subject: 'Thank you for applying to Acme!',
    text: 'Thanks for applying for the Software Engineer role at Acme. Unfortunately our team is large so review may take time. We will reach out soon.',
    from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.equal(event, 'applied');
});
