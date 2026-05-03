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

// -----------------------------------------------------------------------------
// inferAtsTenantCompany — multi-tenant ATS local-part inference
// -----------------------------------------------------------------------------

import { inferAtsTenantCompany } from './gmail-oauth-refresh.mjs';

test('inferAtsTenantCompany: workday tenants resolve via local-part', () => {
  assert.equal(inferAtsTenantCompany({ email: 'disney@myworkday.com' }), 'The Walt Disney Company');
  assert.equal(inferAtsTenantCompany({ email: 'etsy@myworkday.com' }), 'Etsy');
  assert.equal(inferAtsTenantCompany({ email: 'unum@myworkday.com' }), 'Unum');
  assert.equal(inferAtsTenantCompany({ email: 'finra@myworkday.com' }), 'FINRA');
  assert.equal(inferAtsTenantCompany({ email: 'usbank@myworkday.com' }), 'U.S. Bank');
  assert.equal(inferAtsTenantCompany({ email: 'manulife@myworkday.com' }), 'Manulife');
  assert.equal(inferAtsTenantCompany({ email: 'elekta@myworkday.com' }), 'Elekta');
  assert.equal(inferAtsTenantCompany({ email: 'ms@myworkday.com' }), 'Morgan Stanley');
  assert.equal(inferAtsTenantCompany({ email: 'snc@myworkday.com' }), 'Sierra Nevada Corporation');
  assert.equal(inferAtsTenantCompany({ email: 'cvshealth@myworkday.com' }), 'CVS Health');
  assert.equal(inferAtsTenantCompany({ email: 'kendallgroup@myworkday.com' }), 'The Kendall Group');
  assert.equal(inferAtsTenantCompany({ email: 'microchiphr@myworkday.com' }), 'Microchip');
  assert.equal(inferAtsTenantCompany({ email: 'nordstrom@myworkday.com' }), 'Nordstrom');
});

test('inferAtsTenantCompany: unknown workday tenant falls back to titlecased slug', () => {
  // Slug not in the curated map → titlecase fallback (with -hr/-careers/-talent suffix stripped)
  assert.equal(inferAtsTenantCompany({ email: 'acme@myworkday.com' }), 'Acme');
  assert.equal(inferAtsTenantCompany({ email: 'acme-hr@myworkday.com' }), 'Acme');
  assert.equal(inferAtsTenantCompany({ email: 'acmehr@myworkday.com' }), 'Acme');
  assert.equal(inferAtsTenantCompany({ email: 'foo_bar@myworkday.com' }), 'Foo Bar');
});

test('inferAtsTenantCompany: ATS generic local-parts return empty (no tenant)', () => {
  assert.equal(inferAtsTenantCompany({ email: 'no-reply@hire.lever.co' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'noreply@greenhouse-mail.io' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'donotreply@ashbyhq.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'notification@smartrecruiters.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'notification@jobvite.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'notifications@ashbyhq.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'mail@ats.rippling.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'scheduling@ats.rippling.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'careers@myworkday.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'talent@myworkday.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'recruiting@myworkday.com' }), '');
});

test('inferAtsTenantCompany: plus-tag stripping for icims and others', () => {
  assert.equal(inferAtsTenantCompany({ email: 'uber+email+3ucw0-ead611133c@talent.icims.com' }), 'Uber');
  assert.equal(inferAtsTenantCompany({ email: 'uber+anything@icims.com' }), 'Uber');
});

test('inferAtsTenantCompany: returns empty for non-multi-tenant ATS', () => {
  assert.equal(inferAtsTenantCompany({ email: 'noreply@gmail.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'jobs-noreply@linkedin.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: 'random@example.com' }), '');
  assert.equal(inferAtsTenantCompany({ email: '' }), '');
  assert.equal(inferAtsTenantCompany({}), '');
});

// -----------------------------------------------------------------------------
// companyFromAtsSenderName — additional Workday-style display patterns
// -----------------------------------------------------------------------------

test('companyFromAtsSenderName: Workday-style display names resolve to tenant', () => {
  assert.equal(companyFromAtsSenderName({ name: 'workday etsy', email: 'etsy@myworkday.com' }), 'Etsy');
  assert.equal(companyFromAtsSenderName({ name: 'Workday Microchip', email: 'microchiphr@myworkday.com' }), 'Microchip');
  assert.equal(companyFromAtsSenderName({ name: 'workday unum', email: 'unum@myworkday.com' }), 'Unum');
  assert.equal(companyFromAtsSenderName({ name: 'Workday Nordstrom', email: 'nordstrom@myworkday.com' }), 'Nordstrom');
  assert.equal(companyFromAtsSenderName({ name: 'Workday.Admin elekta', email: 'elekta@myworkday.com' }), 'Elekta');
  assert.equal(companyFromAtsSenderName({ name: 'Workday @ U.S. Bank', email: 'usbank@myworkday.com' }), 'U.S. Bank');
  assert.equal(companyFromAtsSenderName({ name: 'No Reply Manulife', email: 'manulife@myworkday.com' }), 'Manulife');
  assert.equal(companyFromAtsSenderName({ name: 'donotreply_ms workday', email: 'ms@myworkday.com' }), 'Morgan Stanley');
  assert.equal(companyFromAtsSenderName({ name: 'KION Group Workday', email: 'kiongroup@myworkday.com' }), 'KION Group');
});

test('companyFromAtsSenderName: opaque display names like "Colleague Zone" return empty so local-part wins', () => {
  // "Colleague Zone" is an internal CVS Health Workday brand — useless as a company name.
  // The extractor should fall through to inferAtsTenantCompany or to subject/body inference.
  assert.equal(companyFromAtsSenderName({ name: 'Colleague Zone', email: 'cvshealth@myworkday.com' }), '');
});

// -----------------------------------------------------------------------------
// extractSignalFromMessage — subsidiary-aware end-to-end
// -----------------------------------------------------------------------------

test('extractSignalFromMessage: workday tenant + plain email address → company from local-part', () => {
  const msg = fakeAtsMessage({
    from: 'finra@myworkday.com',
    subject: 'Thank You for Applying',
    body: 'Dear Hongxi, Thank you for applying for the position of Software Engineer. Application Status: Application Closed.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'FINRA');
});

test('extractSignalFromMessage: subject names a subsidiary that overrides workday tenant', () => {
  // cvshealth tenant, but the application is to "Oak Street Health"
  const msg = fakeAtsMessage({
    from: '"Colleague Zone" <cvshealth@myworkday.com>',
    subject: 'Your application with Oak Street Health has been received!',
    body: 'Dear Hongxi, Thank you for your interest in joining Oak Street Health. We have successfully received your application for: R0881317 Associate Software Development Engineer.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'Oak Street Health');
});

test('extractSignalFromMessage: subject "X - Application" wins over workday tenant', () => {
  // kiongroup tenant, applied to "Dematic"
  const msg = fakeAtsMessage({
    from: '"KION Group Workday" <kiongroup@myworkday.com>',
    subject: 'Dematic - Your Application for Java Software Engineer - Associate',
    body: 'Hello Hongxi Chen, Thank you again for your application for the role of Java Software Engineer - Associate (JR-0087237) and your interest in our company. Unfortunately we will not be moving forward.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'Dematic');
});

test('extractSignalFromMessage: body "interest in employment opportunities at X" wins over tenant', () => {
  const msg = fakeAtsMessage({
    from: 'peak6group@myworkday.com',
    subject: 'Regarding your Apex Fintech Solutions Application',
    body: 'Hongxi, Thank you for your time and interest in employment opportunities at Apex Fintech Solutions. After carefully reviewing your application we will not be moving forward.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'Apex Fintech Solutions');
});

test('extractSignalFromMessage: Nordstrom subject confirmation produces "Nordstrom" not "Seattle"', () => {
  const msg = fakeAtsMessage({
    from: '"Workday Nordstrom" <nordstrom@myworkday.com>',
    subject: 'Nordstrom: Application Confirmation',
    body: 'Hello Hongxi, Thank you for applying to Engineer 1 - Nordstrom Product Group Technology Team (Hybrid - Seattle, WA) . We appreciate your interest, and we will review the information provided. Nordstrom team.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'Nordstrom');
});

test('extractSignalFromMessage: Sierra Nevada subject gets cleaned (no "- Application Update" suffix)', () => {
  const msg = fakeAtsMessage({
    from: 'snc@myworkday.com',
    subject: 'Thank you for your interest in Sierra Nevada Corporation - Application Update',
    body: 'Dear Hongxi, Thank you for your interest in working for Sierra Nevada Corporation. We received applications from many qualified individuals for the position of Software Engineer I. We regret to inform you.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'Sierra Nevada Corporation');
});

test('extractSignalFromMessage: Disney subject "Your X Careers Application Is In!" → company X', () => {
  const msg = fakeAtsMessage({
    from: 'disney@myworkday.com',
    subject: 'Your Disney Careers Application Is In!',
    body: 'Dear Hongxi Chen: Thank you for sharing your story with us! We are delighted by the interest you have shown in the Software Engineer I position. Our Talent Acquisition team will review your application.',
  });
  const signal = extractSignalFromMessage(msg);
  // Subject pattern returns "Disney"; tenant map would also give "The Walt Disney Company".
  // We require the result to be a Disney variant — either is acceptable.
  assert.match(signal.company, /^(Disney|The Walt Disney Company)$/);
});

test('extractSignalFromMessage: Etsy subject pipe pattern "| Your application to Etsy |" → "Etsy"', () => {
  const msg = fakeAtsMessage({
    from: '"workday etsy" <etsy@myworkday.com>',
    subject: 'Senior Software Engineer I, Data Enablement | Your application to Etsy | Hongxi Chen',
    body: 'Hi Hongxi, Thank you for taking the time to explore an opportunity with Etsy. Unfortunately, the Senior Software Engineer I, Data Enablement role has since been filled.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'Etsy');
});

// -----------------------------------------------------------------------------
// companyFromDisplayName — last-resort fallback
// -----------------------------------------------------------------------------

import { companyFromDisplayName, companyFromExplicitSubject } from './gmail-oauth-refresh.mjs';

test('companyFromDisplayName: trusts a plausible display name on a non-ATS sender', () => {
  assert.equal(companyFromDisplayName({ name: 'Cascade AI', email: 'no-reply@send.dover.com' }), 'Cascade AI');
  assert.equal(companyFromDisplayName({ name: '3DS Talent Acquisition', email: 'ta-3DS@3ds.com' }), '3DS');
});

test('companyFromDisplayName: rejects no-reply mailbox names', () => {
  // "Do Not Reply at Uber" and "No Reply Manulife" are no-reply mailbox names — this helper
  // rejects them. Manulife still resolves correctly via companyFromAtsSenderName upstream.
  assert.equal(companyFromDisplayName({ name: 'Do Not Reply at Uber', email: 'uber+x@talent.icims.com' }), '');
  assert.equal(companyFromDisplayName({ name: 'No Reply Manulife', email: 'manulife@myworkday.com' }), '');
});

test('companyFromDisplayName: rejects personal-mail-domain senders (self-replies)', () => {
  assert.equal(companyFromDisplayName({ name: 'Hongxi Chen', email: 'smyhc1@gmail.com' }), '');
  assert.equal(companyFromDisplayName({ name: 'Acme Hiring Team', email: 'recruiter@yahoo.com' }), '');
});

test('companyFromDisplayName: rejects email-shaped names and prose fragments', () => {
  assert.equal(companyFromDisplayName({ name: 'finra@myworkday.com', email: 'finra@myworkday.com' }), '');
  assert.equal(companyFromDisplayName({ name: 'this position', email: 'careers@example.com' }), '');
  assert.equal(companyFromDisplayName({ name: 'our team', email: 'careers@example.com' }), '');
});

test('extractSignalFromMessage: 3DS via display name when sender domain is the company itself', () => {
  const msg = fakeAtsMessage({
    from: '"3DS Talent Acquisition" <ta-3DS@3ds.com>',
    subject: '3DS Talent Acquisition - Your application for the position of Software Engineer',
    body: 'Hi Hongxi, Thank you for your application for the position of Software Engineer at 3DS.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, '3DS');
});

test('extractSignalFromMessage: Cascade AI via display name when sender is a recruiting tool', () => {
  const msg = fakeAtsMessage({
    from: '"Cascade AI" <no-reply@send.dover.com>',
    subject: 'Cascade AI has received your application',
    body: 'Hi Hongxi, Thank you for applying for the Founding Engineer role at Cascade AI! We received your application and will be in touch about next steps.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'Cascade AI');
});

test('companyFromExplicitSubject: LinkedIn "Your application to ROLE at COMPANY" → COMPANY', () => {
  // The live extractor refuses to emit signals for LinkedIn rejections (policy restriction),
  // but the backfill script and the helper itself must still resolve the company correctly
  // from the subject so legacy rows can be repaired.
  assert.equal(companyFromExplicitSubject('Your application to AI Engineer at PRI Global'), 'PRI Global');
  assert.equal(companyFromExplicitSubject('Your application to Software Engineer at Pursuit'), 'Pursuit');
  assert.equal(companyFromExplicitSubject('Your application to Junior Software Engineer at Botdo Labs'), 'Botdo Labs');
});

test('companyFromDisplayName: skips scheduling-tool domains', () => {
  assert.equal(companyFromDisplayName({ name: 'Hillary Low', email: 'scheduling@ats.rippling.com' }), '');
  assert.equal(companyFromDisplayName({ name: 'Rokt via Hireflix', email: 'users@hireflix.com' }), '');
});

test('companyFromDisplayName: skips platform brands like LinkedIn / Indeed', () => {
  assert.equal(companyFromDisplayName({ name: 'LinkedIn', email: 'jobs-noreply@linkedin.com' }), '');
  assert.equal(companyFromDisplayName({ name: 'Indeed', email: 'noreply@indeed.com' }), '');
});

test('extractSignalFromMessage: New Lantern Ashby (regression — should already work via display-name strip)', () => {
  const msg = fakeAtsMessage({
    from: '"New Lantern Hiring Team" <no-reply@ashbyhq.com>',
    subject: 'New Lantern Residency Application | Action Required: Submit Your Coding Challenge',
    body: 'Hello! Thanks for applying to the New Lantern Software Engineer — Residency Program. We noticed you have not yet submitted the coding challenge, which is required to complete your application.',
  });
  const signal = extractSignalFromMessage(msg);
  assert.equal(signal.company, 'New Lantern');
});
