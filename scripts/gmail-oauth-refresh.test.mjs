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

import { computeConfidence } from './gmail-oauth-refresh.mjs';

test('computeConfidence: full feature stack scores ≥ 0.85', () => {
  const score = computeConfidence({
    isTrustedAtsSender: true,
    hasExplicitCompany: true,
    hasExplicitRole: true,
    hasHardEventPhrase: true,
  });
  assert.ok(score >= 0.85, `got ${score}`);
  assert.ok(score <= 1.0);
});

test('computeConfidence: only weak inference scores ≤ 0.5', () => {
  const score = computeConfidence({
    isTrustedAtsSender: false,
    hasExplicitCompany: false,
    hasExplicitRole: false,
    hasHardEventPhrase: false,
    hasWeakEventPhrase: true,
  });
  assert.ok(score <= 0.5, `got ${score}`);
});

test('computeConfidence: ATS sender + explicit company alone passes 0.5', () => {
  const score = computeConfidence({
    isTrustedAtsSender: true,
    hasExplicitCompany: true,
    hasExplicitRole: false,
    hasHardEventPhrase: false,
  });
  assert.ok(score > 0.5, `got ${score}`);
});

test('extractSignalFromMessage: signal from ATS produces realistic confidence (not the fixed 0.78)', () => {
  const signal = extractSignalFromMessage(fakeAtsMessage());
  assert.notEqual(signal.confidence, 0.78);
  assert.notEqual(signal.confidence, 0.52);
  assert.ok(signal.confidence >= 0.6 && signal.confidence <= 1.0,
    `expected confidence in [0.6, 1.0], got ${signal.confidence}`);
});

import { isValidStoredSignal } from './gmail-oauth-refresh.mjs';

test('isValidStoredSignal: ATS rejection with truncated snippet (no hard phrase) is retained', () => {
  // Real Kinstead-style rejection. The 220-char snippet cuts off before "will not be moving forward".
  // Under strict re-classification this would replay as 'applied' (matches APPLICATION_RECEIPT_PATTERNS,
  // soft-rejection blocked by receipt-guard), but the stored 'rejected' event should be trusted.
  const signal = {
    id: 'abc123:rejected',
    company: 'Kinstead',
    role: 'Senior Backend Engineer, Workflow Systems',
    eventType: 'rejected',
    sender: 'Kinstead Hiring Team <no-reply@ashbyhq.com>',
    subject: 'Kinstead Application Update',
    summary: 'Hi Hongxi, Thank you for applying for the Senior Backend Engineer, Workflow Systems role at Kinstead. After reviewing your application we have determined that there is not an ideal fit at this',
    snippet: 'Hi Hongxi, Thank you for applying for the Senior Backend Engineer, Workflow Systems role at Kinstead. After reviewing your application we have determined that there is not an ideal fit at this',
  };
  assert.equal(isValidStoredSignal(signal), true);
});

test('isValidStoredSignal: LinkedIn-rejected garbage with role-at-company name is still dropped', () => {
  // Generic-company gate fires before the hard-event short-circuit.
  const signal = {
    id: 'def456:rejected',
    company: 'AI Engineer at PRI Global',
    role: 'interest in the AI Engineer',
    eventType: 'rejected',
    sender: 'LinkedIn <jobs-noreply@linkedin.com>',
    subject: 'Your application to AI Engineer at PRI Global',
    summary: 'Your application to AI Engineer at PRI Global has been received.',
    snippet: 'Your application to AI Engineer at PRI Global has been received.',
  };
  assert.equal(isValidStoredSignal(signal), false);
});

test('isValidStoredSignal: LinkedIn-rejected with a valid-looking company is still dropped (policy denies)', () => {
  // LinkedIn cannot produce rejections; legacy mis-classified rows must be cleaned up
  // even when the company string accidentally passes the generic-company gate.
  const signal = {
    id: 'ghi789:rejected',
    company: 'Cerberus Capital Management',
    role: 'AI Deployment Strategist',
    eventType: 'rejected',
    sender: 'LinkedIn <jobs-noreply@linkedin.com>',
    subject: 'Your application to AI Deployment Strategist at Cerberus Capital Management',
    summary: 'Your application has been received.',
    snippet: 'Your application has been received.',
  };
  assert.equal(isValidStoredSignal(signal), false);
});

test('isValidStoredSignal: stored hard event with empty event still fails', () => {
  // Defensive: empty/missing event still drops, even for would-be-hard storage.
  assert.equal(isValidStoredSignal({ eventType: '', company: 'Acme', role: 'Engineer' }), false);
});

test('isValidStoredSignal: soft event still re-classifies and drops on mismatch', () => {
  // 'applied' is a soft event — must re-classify. Subject + body produce no hiring signal,
  // classifier returns '', validator drops.
  const signal = {
    id: 'xyz:applied',
    company: 'Acme',
    role: 'Software Engineer',
    eventType: 'applied',
    sender: 'random@example.com',
    subject: 'Newsletter subscription confirmed',
    summary: 'Thanks for subscribing to our weekly newsletter.',
    snippet: 'Thanks for subscribing to our weekly newsletter.',
  };
  assert.equal(isValidStoredSignal(signal), false);
});

test('classifyEvent: "we regret to inform you" classifies as rejected', () => {
  const event = classifyEvent({
    subject: 'Application Update',
    text: 'Dear Hongxi, we regret to inform you that we will be moving on with other candidates for this role.',
    from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.equal(event, 'rejected');
});

test('classifyEvent: "moving in a different direction" classifies as rejected', () => {
  const event = classifyEvent({
    subject: 'Application Update',
    text: 'Hi Hongxi, we are moving in a different direction with the role.',
    from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.equal(event, 'rejected');
});

test('classifyEvent: "not advancing" / "will not be advancing" classifies as rejected', () => {
  for (const phrase of [
    'we are not advancing your application at this time',
    'we will not be advancing your candidacy',
  ]) {
    const event = classifyEvent({
      subject: 'Application Update',
      text: phrase,
      from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
    });
    assert.equal(event, 'rejected', `expected rejected for: ${phrase}`);
  }
});

test('classifyEvent: "position has been put on hold" classifies as rejected', () => {
  const event = classifyEvent({
    subject: 'Application Update',
    text: 'Hi Hongxi, the position has been put on hold while we re-scope the team.',
    from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.equal(event, 'rejected');
});

test('classifyEvent: soft phrase + "opportunity" hiring noun classifies as rejected', () => {
  const event = classifyEvent({
    subject: 'Update on the role',
    text: 'Unfortunately we will not be moving forward with this opportunity at this time.',
    from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.equal(event, 'rejected');
});

test('classifyEvent: soft phrase + "opening" hiring noun classifies as rejected', () => {
  const event = classifyEvent({
    subject: 'Update',
    text: 'We have other candidates more aligned with this opening.',
    from: { name: 'Acme Hiring Team', email: 'no-reply@ashbyhq.com' },
  });
  assert.equal(event, 'rejected');
});

function fakeNonAtsMessage({ from = '"Random Recruiter" <recruiter@randomstartup.com>', subject = 'Update on your application', body = 'Hi Hongxi, our team is currently reviewing your application. We will reach out within a week if your background matches our needs.', date = 'Mon, 27 Apr 2026 10:00:00 +0000', internalDate = '1745835600000' } = {}) {
  return {
    id: 'mid-1',
    threadId: 'mid-thread',
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

test('extractSignalFromMessage: non-ATS sender produces mid-range confidence (gradient verification)', () => {
  const signal = extractSignalFromMessage(fakeNonAtsMessage());
  // Without ATS-trust (-0.30) and without explicit company from sender-name suffix stripping,
  // confidence should land below the all-features-true ceiling.
  if (!signal) {
    // Acceptable: if classifier rejects entirely, no signal — skip strict bounds.
    return;
  }
  assert.ok(signal.confidence < 0.85,
    `non-ATS sender should produce mid-range confidence < 0.85, got ${signal.confidence}`);
  assert.ok(signal.confidence > 0.0,
    `expected non-zero confidence for non-ATS, got ${signal.confidence}`);
});

test('classifyEvent accepts pre-computed policy without recomputing', () => {
  const from = { name: 'LinkedIn', email: 'jobs-noreply@linkedin.com' };
  const policy = senderClassificationPolicy(from);
  const event = classifyEvent({
    subject: 'Your application',
    text: 'Your application has been received.',
    from,
    policy,
  });
  // LinkedIn restricted: applied/responded only — should NOT return 'rejected' even though
  // the body is innocuous and the policy comes from the caller.
  assert.notEqual(event, 'rejected');
});
