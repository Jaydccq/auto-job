# Gmail Tracker — Phase 1: Extraction Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the three highest-frequency Gmail-signal defects — wrong eventType on LinkedIn application emails, garbage company names from prose extraction, and uniform-fake confidence scores — by tightening `scripts/gmail-oauth-refresh.mjs` against real-corpus regressions.

**Architecture:** Single-file scanner refactor with TDD. Add a sibling test file (`scripts/gmail-oauth-refresh.test.mjs`) that drives synthetic Gmail message objects through the existing exported pure functions (`classifyEvent`, `extractSignalFromMessage`, `isValidStoredSignal`). All changes stay inside the script — no new artifacts, no schema changes, no dashboard rework. Phase 2 (thread aggregation) and Phase 3 (`attention` first-class field) are tracked in separate plans and depend on Phase 1 landing first.

**Tech Stack:** Node 20 ESM, `node:test` built-in test runner, `node:assert/strict`. No new dependencies.

**Out of Scope (deferred to later phases):**
- New `data/gmail-applications.jsonl` aggregate file (Phase 2)
- State machine across thread timeline (Phase 2)
- Promoting `attention` to a scanner-computed first-class field (Phase 3)
- Deadline / due-date parsing (Phase 4)
- `config/gmail-senders.yml` taxonomy file (Phase 5)

**Success Criteria (verifiable):**
- LinkedIn `jobs-noreply@linkedin.com` emails never classify as `rejected` or `offer` (only `applied` or filtered out).
- Trusted-ATS senders (`*@ashbyhq.com`, `*@greenhouse.io`/`greenhouse-mail.io`, `*@hire.lever.co`/`lever.co`, `*@myworkday.com`/`workday.com`, `*@smartrecruiters.com`, `*@talent.icims.com`) yield a non-generic company derived from `from.name` after suffix stripping.
- Confidence score is a weighted-feature value in `[0.0, 1.0]`, not the hardcoded `0.78` / `0.52`.
- Zero-width / combining graphemes (`͏`, `​`–`‍`, `⁠`, `﻿`) are stripped from `summary` and `snippet`.
- Re-run `npm run gmail:scan --dry-run` after the change: at least every prior `rejected` signal whose sender is `linkedin.com` flips to `applied` (or is dropped).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `scripts/gmail-oauth-refresh.mjs` | Gmail scanner — OAuth, fetch, classify, extract, persist | Modify (extraction logic) |
| `scripts/gmail-oauth-refresh.test.mjs` | Unit tests for pure scanner functions | **Create** |
| `docs/GMAIL_SIGNALS.md` | Public contract for `data/gmail-signals.jsonl` consumers | Modify (document new confidence semantics + sender-aware rules) |
| `package.json` | Root npm scripts | Modify (add `test:gmail` script) |

The scanner stays a single file. It already exports the pure functions we need (`classifyEvent`, `extractSignalFromMessage`, `isValidStoredSignal`, `mergeSignals`, `parseOAuthCallback`, `isGmailApiSetupError`). All new helpers are added to the same file and exported only when the test file needs them.

**Code organization inside the scanner (logical, no file split):**
1. Constants (sender taxonomy, regex tables) — top of file, unchanged structure
2. Pure helpers (`hasAnyPattern`, `parseEmail`, `emailDomain`, etc.) — unchanged
3. **NEW** `sanitizeMessageText(raw)` — strips zero-width / combining chars; called before any classification
4. **NEW** `companyFromAtsSenderName(from)` — primary company source for trusted ATS
5. **NEW** `senderClassificationPolicy(from)` — returns `{ allowedEvents, isTrusted }`; used by `classifyEvent`
6. **NEW** `computeConfidence(features)` — weighted-feature confidence
7. **MODIFIED** `classifyEvent` — consults `senderClassificationPolicy`, splits rejection regex into `HARD_REJECTION_PATTERNS` (always-rejected) + `SOFT_REJECTION_PATTERNS` (need second hard signal)
8. **MODIFIED** `extractSignalFromMessage` — uses `companyFromAtsSenderName` first; calls `computeConfidence`; runs `sanitizeMessageText` on body before extract

---

## Task 1: Test infrastructure + zero-width / combining char sanitizer

**Files:**
- Create: `scripts/gmail-oauth-refresh.test.mjs`
- Modify: `scripts/gmail-oauth-refresh.mjs` (add `sanitizeMessageText` export, call from `compactText` callsites in body path)
- Modify: `package.json` (add `test:gmail` script)

- [ ] **Step 1.1: Add the test runner script to `package.json`**

In `package.json` `scripts` block, add (preserving alphabetical ordering near other test/verify entries):

```json
"test:gmail": "node --test scripts/gmail-oauth-refresh.test.mjs"
```

- [ ] **Step 1.2: Create the failing test file `scripts/gmail-oauth-refresh.test.mjs`**

```javascript
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
```

- [ ] **Step 1.3: Run tests to confirm they fail**

Run: `npm run test:gmail`
Expected: FAIL with `SyntaxError` or `The requested module './gmail-oauth-refresh.mjs' does not provide an export named 'sanitizeMessageText'`.

- [ ] **Step 1.4: Implement `sanitizeMessageText` in `scripts/gmail-oauth-refresh.mjs`**

Add immediately above `function compactText` (currently line 526):

```javascript
const ZERO_WIDTH_AND_INVISIBLE_RE = /[͏​‌‍⁠﻿]/g;

export function sanitizeMessageText(value) {
  if (typeof value !== 'string' || !value) return '';
  return value.replace(ZERO_WIDTH_AND_INVISIBLE_RE, '');
}
```

- [ ] **Step 1.5: Wire `sanitizeMessageText` into the body extraction path**

In `extractSignalFromMessage` (currently around line 698), change:

```javascript
const bodyText = compactText(collectTextParts(message.payload).join('\n'), 4000);
```

to:

```javascript
const bodyText = compactText(sanitizeMessageText(collectTextParts(message.payload).join('\n')), 4000);
```

And on the snippet/summary lines (currently 752–753), change:

```javascript
summary: compactText(message.snippet || bodyText, 220),
snippet: compactText(message.snippet || bodyText, 220),
```

to:

```javascript
summary: compactText(sanitizeMessageText(message.snippet || bodyText), 220),
snippet: compactText(sanitizeMessageText(message.snippet || bodyText), 220),
```

- [ ] **Step 1.6: Run tests to confirm they pass**

Run: `npm run test:gmail`
Expected: PASS — 4 tests pass.

- [ ] **Step 1.7: Commit**

```bash
git add scripts/gmail-oauth-refresh.mjs scripts/gmail-oauth-refresh.test.mjs package.json
git commit -m "feat(gmail-scan): strip zero-width and combining chars from message body

LinkedIn jobs-noreply emails embed U+034F combining grapheme joiners as
tracking pixels, polluting summary and snippet fields. Sanitize on the
body / snippet path before classification so downstream extraction sees
real text."
```

---

## Task 2: Sender-aware classification policy (block LinkedIn from non-`applied`)

**Files:**
- Modify: `scripts/gmail-oauth-refresh.mjs` (add `senderClassificationPolicy`, gate `classifyEvent` on it)
- Modify: `scripts/gmail-oauth-refresh.test.mjs` (new test cases)

- [ ] **Step 2.1: Add failing tests**

Append to `scripts/gmail-oauth-refresh.test.mjs`:

```javascript
import {
  classifyEvent,
  senderClassificationPolicy,
} from './gmail-oauth-refresh.mjs';

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
```

- [ ] **Step 2.2: Run tests to confirm they fail**

Run: `npm run test:gmail`
Expected: FAIL — `senderClassificationPolicy is not exported` and Kinstead/LinkedIn assertions fail because current `classifyEvent` doesn't gate on sender.

- [ ] **Step 2.3: Implement `senderClassificationPolicy`**

Add after the existing `isTrustedRecruitingSender` helper in `scripts/gmail-oauth-refresh.mjs`:

```javascript
const ALL_EVENT_TYPES = new Set([
  'applied',
  'responded',
  'online_assessment',
  'interview',
  'offer',
  'rejected',
  'action_required',
]);

const RESTRICTED_SENDER_DOMAINS = new Map([
  ['linkedin.com', new Set(['applied', 'responded'])],
]);

export function senderClassificationPolicy(from = {}) {
  const domain = emailDomain(from.email || '');
  for (const [restrictedDomain, allowedEvents] of RESTRICTED_SENDER_DOMAINS) {
    if (domain === restrictedDomain || domain.endsWith(`.${restrictedDomain}`)) {
      return { allowedEvents: new Set(allowedEvents), isTrusted: false };
    }
  }
  return {
    allowedEvents: new Set(ALL_EVENT_TYPES),
    isTrusted: isTrustedRecruitingSender(from),
  };
}
```

- [ ] **Step 2.4: Gate `classifyEvent` on the policy**

In `classifyEvent` (currently around line 653), at the very top of the function body, after the existing `haystack`/`lower` setup, add:

```javascript
const policy = senderClassificationPolicy(from);
```

Then for **every** `return '<event>'` line inside `classifyEvent`, wrap with the policy guard. Concretely, replace each pattern of the form:

```javascript
if (/.../.test(lower)) {
  return 'offer';
}
```

with a generalized helper. To keep the diff small, define right above the early-return chain:

```javascript
const decide = (event) => (policy.allowedEvents.has(event) ? event : '');
```

Then change the existing returns to consult `decide(...)` and fall through when the policy denies:

```javascript
if (/\b(offer letter|job offer|...)/.test(lower)) {
  const result = decide('offer');
  if (result) return result;
}
if (/\b(unfortunately|not moving forward|...)/.test(lower)) {
  const result = decide('rejected');
  if (result) return result;
}
// ...same pattern for interview, online_assessment, action_required, applied, responded
```

A bare `return decide('offer')` would NOT fall through — when the policy denies, `decide` returns `''` and `return ''` exits `classifyEvent` with no event. The `if (result) return result;` form is required for the LinkedIn rejection-shaped-noise test (rejection regex matches → policy denies → next pattern `applied` matches → policy permits → returns `'applied'`).

- [ ] **Step 2.5: Run tests to confirm they pass**

Run: `npm run test:gmail`
Expected: PASS — all 4 new tests pass; the 4 from Task 1 still pass.

- [ ] **Step 2.6: Commit**

```bash
git add scripts/gmail-oauth-refresh.mjs scripts/gmail-oauth-refresh.test.mjs
git commit -m "feat(gmail-scan): restrict LinkedIn jobs-noreply to applied/responded events

LinkedIn application-confirmation emails contain noisy filler that
matches rejection and offer regexes by accident. Add a per-sender
allowlist of event types so a sender domain can be denied terminal
classifications without disabling the scanner for that sender."
```

---

## Task 3: ATS-sender-name as primary company source

**Files:**
- Modify: `scripts/gmail-oauth-refresh.mjs` (add `companyFromAtsSenderName`, prepend to candidate list)
- Modify: `scripts/gmail-oauth-refresh.test.mjs` (new tests)

- [ ] **Step 3.1: Add failing tests**

Append to `scripts/gmail-oauth-refresh.test.mjs`:

```javascript
import {
  companyFromAtsSenderName,
  extractSignalFromMessage,
} from './gmail-oauth-refresh.mjs';

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
```

- [ ] **Step 3.2: Run tests to confirm they fail**

Run: `npm run test:gmail`
Expected: FAIL — `companyFromAtsSenderName is not exported`; `extractSignalFromMessage` returns the prose-extracted name (not "Whatnot") on the ATS test.

- [ ] **Step 3.3: Implement `companyFromAtsSenderName`**

Add after `cleanCompany` in `scripts/gmail-oauth-refresh.mjs`:

```javascript
const ATS_SENDER_NAME_SUFFIX_RE = /\s+(?:hiring team|recruiting team|recruiting|talent acquisition|talent team|talent|careers|candidate experience|people team|hr team|human resources)\s*$/i;

export function companyFromAtsSenderName(from = {}) {
  const domain = emailDomain(from.email || '');
  const isAts = TRUSTED_RECRUITING_DOMAINS.some(
    (trusted) => domain === trusted || domain.endsWith(`.${trusted}`)
  );
  if (!isAts) return '';
  const rawName = (from.name || '').trim();
  if (!rawName) return '';
  if (GENERIC_SENDER_NAMES.has(rawName.toLowerCase())) return '';
  const stripped = rawName.replace(ATS_SENDER_NAME_SUFFIX_RE, '').trim();
  if (!stripped) return '';
  if (GENERIC_SENDER_NAMES.has(stripped.toLowerCase())) return '';
  if (isGenericCompany(stripped)) return '';
  return cleanCompany(stripped);
}
```

- [ ] **Step 3.4: Use `companyFromAtsSenderName` as the first company candidate**

In `extractSignalFromMessage` (currently around line 703), change the `companyCandidates` array — make `companyFromAtsSenderName(from)` the **first** entry:

```javascript
const companyCandidates = [
  companyFromAtsSenderName(from),
  cleanCompany(firstPattern([
    /application for\s+.+?\s+at\s+([A-Z][A-Za-z0-9&' -]{2,90}?)(?:\.|,|!|\n|\s{2,}|$)/i,
    // ...rest of the existing patterns unchanged
  ], searchText)),
  // ...rest of the existing candidates unchanged
].filter((candidate) => candidate && !isGenericCompany(candidate));
```

- [ ] **Step 3.5: Run tests to confirm they pass**

Run: `npm run test:gmail`
Expected: PASS — all 4 new tests pass; prior 8 still pass.

- [ ] **Step 3.6: Commit**

```bash
git add scripts/gmail-oauth-refresh.mjs scripts/gmail-oauth-refresh.test.mjs
git commit -m "feat(gmail-scan): use ATS sender name as primary company source

Whatnot/Kinstead/Stripe-style 'CompanyName Hiring Team' senders carry
the most reliable company signal in the message. Strip ATS suffixes
from from.name and treat that as the first company candidate, ahead
of fragile body-prose extraction."
```

---

## Task 4: Tighten company stop-list

**Files:**
- Modify: `scripts/gmail-oauth-refresh.mjs` (extend `isGenericCompany`)
- Modify: `scripts/gmail-oauth-refresh.test.mjs` (new tests)

- [ ] **Step 4.1: Add failing tests**

Append to `scripts/gmail-oauth-refresh.test.mjs`:

```javascript
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
```

- [ ] **Step 4.2: Run tests to confirm they fail**

Run: `npm run test:gmail`
Expected: FAIL — `isGenericCompany('Software Engineer')` and the prepositional fragments currently return `false`.

- [ ] **Step 4.3: Extend `isGenericCompany`**

In `scripts/gmail-oauth-refresh.mjs`, replace the existing `isGenericCompany` (currently around line 640) with:

```javascript
const ROLE_NOUN_PATTERN = /^(?:senior\s+|staff\s+|principal\s+|junior\s+|lead\s+)?(?:software|data|machine learning|ml|ai|backend|frontend|full[- ]?stack|platform|systems?|security|devops|site reliability|infrastructure|product|research|applied)\s+(?:engineer|scientist|developer|manager|analyst|researcher)s?$/i;
const PREPOSITION_FRAGMENT_PATTERN = /^(?:this|that|the|an?|our|your|their|his|her)\b/i;
const ROLE_AT_COMPANY_PATTERN = /\b(?:engineer|scientist|developer|manager|analyst|researcher|intern)\s+(?:at|with|for)\s+/i;

export function isGenericCompany(value = '') {
  if (!value) return true;
  if (/^(jobvite|ats|greenhouse|workday|myworkday|rippling|unknown company)$/i.test(value)) return true;
  if (/^(?:an?\s+)?unattended mailbox\b/i.test(value)) return true;
  if (/\b(position|role|job|opening)\s+at\b/i.test(value)) return true;
  if (ROLE_NOUN_PATTERN.test(value.trim())) return true;
  if (PREPOSITION_FRAGMENT_PATTERN.test(value.trim())) return true;
  if (ROLE_AT_COMPANY_PATTERN.test(value)) return true;
  return false;
}
```

Note: `isGenericCompany` was previously declared with `function`. Convert to a `const`-arrow or keep `function` — the export form must match the existing one. Use `function` to keep the diff minimal:

```javascript
export function isGenericCompany(value = '') {
  // ...body as above
}
```

If there is no existing `export` on the prior declaration, add one — it is needed for the test import.

- [ ] **Step 4.4: Run tests to confirm they pass**

Run: `npm run test:gmail`
Expected: PASS — all 4 new tests pass; prior tests still pass.

- [ ] **Step 4.5: Commit**

```bash
git add scripts/gmail-oauth-refresh.mjs scripts/gmail-oauth-refresh.test.mjs
git commit -m "feat(gmail-scan): broaden generic-company stop-list

Reject bare role nouns ('Software Engineer'), preposition-led
fragments ('this time', 'our Graduate 2026...'), and role-at-company
smushed phrases ('AI Engineer at PRI Global') so they fall through
to the next candidate instead of polluting the company field."
```

---

## Task 5: Split rejection regex into hard and soft tiers

**Files:**
- Modify: `scripts/gmail-oauth-refresh.mjs` (split rejection patterns, require hard match OR soft + corroborating signal)
- Modify: `scripts/gmail-oauth-refresh.test.mjs` (new tests)

- [ ] **Step 5.1: Add failing tests**

Append to `scripts/gmail-oauth-refresh.test.mjs`:

```javascript
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
```

- [ ] **Step 5.2: Run tests to confirm they fail**

Run: `npm run test:gmail`
Expected: FAIL — current rejection regex includes `unfortunately` as a primary trigger, so the second test wrongly returns `rejected`.

- [ ] **Step 5.3: Split rejection patterns**

In `scripts/gmail-oauth-refresh.mjs`, locate the rejection branch in `classifyEvent` (currently around line 667):

```javascript
if (/\b(unfortunately|not moving forward|will not be moving forward|not selected|decided not to proceed|filled the position|closed the role|position has been filled)\b/.test(lower)) {
  return 'rejected';
}
```

Replace with two-tier logic. Add these constants near the other regex tables (above `classifyEvent`):

```javascript
const HARD_REJECTION_PATTERNS = [
  /\bnot moving forward\b/i,
  /\bwill not be moving forward\b/i,
  /\bnot selected (?:for|to|at)\b/i,
  /\bnot been selected\b/i,
  /\bdecided not to proceed\b/i,
  /\b(?:filled the position|position has been filled|closed the role|role has been (?:closed|filled))\b/i,
  /\bunable to (?:move forward|proceed)\b/i,
  /\bnot able to offer\b/i,
];

const SOFT_REJECTION_PATTERNS = [
  /\bunfortunately\b/i,
  /\bnot (?:an? )?(?:ideal|right) fit\b/i,
  /\bother candidates\b/i,
  /\bmore aligned with\b/i,
];
```

Then change the rejection branch in `classifyEvent` to:

```javascript
const hasHardRejection = hasAnyPattern(HARD_REJECTION_PATTERNS, lower);
const hasSoftRejection = hasAnyPattern(SOFT_REJECTION_PATTERNS, lower);
if (hasHardRejection) {
  return decide('rejected');
}
if (hasSoftRejection && /\b(?:application|candidacy|interview|role|position)\b/i.test(lower) &&
    !hasAnyPattern(APPLICATION_RECEIPT_PATTERNS, lower)) {
  return decide('rejected');
}
```

The `!hasAnyPattern(APPLICATION_RECEIPT_PATTERNS, lower)` guard prevents the "Thank you for applying" body that happens to contain `unfortunately` from flipping to rejection.

- [ ] **Step 5.4: Run tests to confirm they pass**

Run: `npm run test:gmail`
Expected: PASS — all 3 new tests pass; prior Kinstead test (Task 2) still passes because Kinstead body contains `not moving forward`.

- [ ] **Step 5.5: Commit**

```bash
git add scripts/gmail-oauth-refresh.mjs scripts/gmail-oauth-refresh.test.mjs
git commit -m "feat(gmail-scan): split rejection signals into hard and soft tiers

The lone keyword 'unfortunately' was promoting application receipts
to rejected. Require either an unambiguous hard phrase ('not moving
forward', 'decided not to proceed', 'position has been filled', etc.)
or a soft phrase combined with hiring-noun context AND no application
receipt phrase."
```

---

## Task 6: Weighted-feature confidence score

**Files:**
- Modify: `scripts/gmail-oauth-refresh.mjs` (add `computeConfidence`, replace hardcoded values)
- Modify: `scripts/gmail-oauth-refresh.test.mjs` (new tests)

- [ ] **Step 6.1: Add failing tests**

Append to `scripts/gmail-oauth-refresh.test.mjs`:

```javascript
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
```

- [ ] **Step 6.2: Run tests to confirm they fail**

Run: `npm run test:gmail`
Expected: FAIL — `computeConfidence` not exported; `extractSignalFromMessage` still returns hardcoded 0.78.

- [ ] **Step 6.3: Implement `computeConfidence`**

Add to `scripts/gmail-oauth-refresh.mjs` near the other helpers:

```javascript
export function computeConfidence(features = {}) {
  let score = 0.2;
  if (features.isTrustedAtsSender) score += 0.30;
  if (features.hasExplicitCompany) score += 0.20;
  if (features.hasExplicitRole) score += 0.15;
  if (features.hasHardEventPhrase) score += 0.15;
  if (features.hasWeakEventPhrase && !features.hasHardEventPhrase) score += 0.05;
  if (features.hasExplicitSubjectMatch) score += 0.10;
  return Math.max(0, Math.min(1, Number(score.toFixed(2))));
}
```

- [ ] **Step 6.4: Wire `computeConfidence` into `extractSignalFromMessage`**

Replace the existing tail of `extractSignalFromMessage` (currently lines 742–757) with:

```javascript
const policy = senderClassificationPolicy(from);
const confidence = computeConfidence({
  isTrustedAtsSender: policy.isTrusted,
  hasExplicitCompany: Boolean(company) && !isGenericCompany(company),
  hasExplicitRole: Boolean(extractedRole),
  hasHardEventPhrase: hasAnyPattern(HARD_REJECTION_PATTERNS, searchText) ||
    /\b(offer letter|job offer|interview is scheduled|online assessment)\b/i.test(searchText),
  hasWeakEventPhrase: hasWeakHiringContext(searchText),
  hasExplicitSubjectMatch: hasAnyPattern(APPLICATION_RECEIPT_PATTERNS, subject) ||
    /\b(application update|interview|offer|assessment)\b/i.test(subject),
});

return {
  id: `${message.id}:${eventType}`,
  company: company || 'Unknown Company',
  role,
  eventType,
  eventDate: receivedAt.slice(0, 10),
  receivedAt,
  recentContact,
  sender: headers.from || '',
  subject,
  summary: compactText(sanitizeMessageText(message.snippet || bodyText), 220),
  snippet: compactText(sanitizeMessageText(message.snippet || bodyText), 220),
  messageId: message.id,
  threadId: message.threadId,
  confidence,
};
```

- [ ] **Step 6.5: Run tests to confirm they pass**

Run: `npm run test:gmail`
Expected: PASS — all 4 new tests pass; prior tests still pass.

- [ ] **Step 6.6: Commit**

```bash
git add scripts/gmail-oauth-refresh.mjs scripts/gmail-oauth-refresh.test.mjs
git commit -m "feat(gmail-scan): replace hardcoded confidence with weighted features

Confidence is now computed from ATS-sender trust, explicit company,
explicit role, hard/weak event phrase presence, and subject match.
Range stays [0,1]; downstream consumers can finally filter noisy
signals by threshold."
```

---

## Task 7: Re-run on real corpus, verify the fix

**Files:**
- No code changes — verification step.
- Modify: `docs/exec-plans/active/2026-04-28-gmail-tracker-extraction-quality.md` (this file's progress log).

- [ ] **Step 7.1: Snapshot the current `data/gmail-signals.jsonl`**

```bash
cp data/gmail-signals.jsonl /tmp/gmail-signals.before.jsonl
wc -l /tmp/gmail-signals.before.jsonl
```

Expected: ~295 lines (or current count).

- [ ] **Step 7.2: Re-classify the existing corpus through the updated `isValidStoredSignal` (no Gmail API call)**

Create a one-off node script `scripts/replay-gmail-signals.mjs` to verify behavior. **Note:** this script is verification-only and will be deleted at the end of the task.

```javascript
#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { isValidStoredSignal } from './gmail-oauth-refresh.mjs';

const lines = readFileSync('data/gmail-signals.jsonl', 'utf8').split('\n').filter(Boolean);
let kept = 0;
let dropped = 0;
const droppedSamples = [];
for (const line of lines) {
  let signal;
  try { signal = JSON.parse(line); } catch { continue; }
  if (isValidStoredSignal(signal)) kept += 1;
  else {
    dropped += 1;
    if (droppedSamples.length < 10) droppedSamples.push({
      sender: signal.sender, subject: signal.subject, eventType: signal.eventType,
    });
  }
}
console.log(`kept=${kept} dropped=${dropped} total=${lines.length}`);
console.log('first 10 dropped:'); console.log(JSON.stringify(droppedSamples, null, 2));
```

Run: `node scripts/replay-gmail-signals.mjs`

Expected: `dropped > 0` (some signals are now invalid under new rules — at minimum every LinkedIn `rejected` signal). Inspect the `dropped` samples — every dropped signal should be a clear extraction error (LinkedIn-rejected, generic-company, role-noun-as-company).

Record the numbers in this plan's progress log.

- [ ] **Step 7.3: Run the live scanner with `--dry-run` (requires Gmail OAuth set up)**

```bash
npm run gmail:scan -- --dry-run --max-messages 250 2>&1 | tee /tmp/gmail-dry-run.log
grep -E '\[gmail-oauth\]' /tmp/gmail-dry-run.log
```

Expected output:
```
[gmail-oauth] scanned NNN messages
[gmail-oauth] extracted MMM signals
[gmail-oauth] retained X/295 existing signals after strict validation
[gmail-oauth] would write Y total signals to data/gmail-signals.jsonl
```

Where `MMM > 0`, `X < 295` (some old signals invalidated by new rules), and the run completes without error.

- [ ] **Step 7.4: Spot-check 10 signals manually**

```bash
node -e "
const lines = require('fs').readFileSync('data/gmail-signals.jsonl','utf8').split('\n').filter(Boolean);
const linkedin = lines.map(JSON.parse).filter(s => (s.sender||'').includes('linkedin.com'));
console.log('LinkedIn signals total:', linkedin.length);
console.log('LinkedIn rejected count:', linkedin.filter(s => s.eventType==='rejected').length);
console.log('Unknown Company count:', lines.map(JSON.parse).filter(s => s.company==='Unknown Company').length);
"
```

Expected: `LinkedIn rejected count: 0`. `Unknown Company count` should be lower than the pre-fix baseline (was 14).

- [ ] **Step 7.5: Run the live scanner without `--dry-run` to persist the cleaned corpus**

```bash
npm run gmail:scan
```

- [ ] **Step 7.6: Rebuild the dashboard and visually confirm**

```bash
npm run dashboard:build
open web/index.html  # or visit http://127.0.0.1:47319/dashboard/
```

Click into the Tracker tab. The Gmail-only column should no longer show:
- Companies named "Software Engineer", "this time", "our Graduate 2026 Software Engineer I"
- LinkedIn application-confirmation rows in the rejected stage

- [ ] **Step 7.7: Delete the verification-only replay script**

```bash
rm scripts/replay-gmail-signals.mjs
```

- [ ] **Step 7.8: Update the plan progress log**

Append to the "Progress Log" section at the bottom of this file:

```markdown
- 2026-MM-DD: Phase 1 implemented in 6 commits. Replay script reported kept=K dropped=D out of 295 prior signals. Live scan confirmed 0 LinkedIn-rejected signals and N (was 14) Unknown-Company signals after the fix.
```

- [ ] **Step 7.9: Commit**

```bash
git add docs/exec-plans/active/2026-04-28-gmail-tracker-extraction-quality.md
git commit -m "docs: record gmail tracker phase 1 verification outcome"
```

---

## Task 8: Update `docs/GMAIL_SIGNALS.md`

**Files:**
- Modify: `docs/GMAIL_SIGNALS.md`

- [ ] **Step 8.1: Replace the current "Recommended fields" section**

Open `docs/GMAIL_SIGNALS.md`. Replace lines 15–19 (the JSON sample) with:

````markdown
Recommended fields:

```json
{"id":"gmail-message-id:event","applicationNum":123,"company":"Example Co","role":"Software Engineer","eventType":"interview","eventDate":"2026-04-25","priority":"attention","summary":"Recruiter sent an interview scheduling link","recommendedAction":"Schedule interview","messageId":"...","threadId":"...","confidence":0.91}
```

`confidence` is computed from a weighted feature set (ATS-sender trust 0.30, explicit company 0.20, explicit role 0.15, hard event phrase 0.15, weak event phrase 0.05, explicit subject match 0.10, plus a 0.20 floor). Consumers may filter signals below a threshold (e.g., 0.55) for noisier dashboards.
````

- [ ] **Step 8.2: Add a "Sender policy" section after "Scanner rule"**

After the paragraph that ends with `…and shopping mail should be ignored.` (around line 13), insert:

```markdown
Sender policy:

- Trusted ATS senders (`*@ashbyhq.com`, `*@greenhouse.io`/`greenhouse-mail.io`,
  `*@hire.lever.co`/`lever.co`, `*@myworkday.com`/`workday.com`,
  `*@smartrecruiters.com`, `*@talent.icims.com`, `*@jobvite.com`) yield the
  highest-confidence company via the sender display name minus suffixes
  (`Hiring Team`, `Recruiting`, `Talent Acquisition`, `Careers`).
- LinkedIn `*@linkedin.com` senders are restricted to `applied` or `responded`
  events only — they cannot produce `rejected`, `offer`, or `interview`
  signals because their generated body content frequently contains misleading
  phrasing.
- Rejection requires either a hard phrase (`not moving forward`,
  `decided not to proceed`, `position has been filled`, `not selected for`)
  or a soft phrase (`unfortunately`, `not an ideal fit`) combined with
  hiring-noun context AND no application-receipt phrase in the same body.
```

- [ ] **Step 8.3: Commit**

```bash
git add docs/GMAIL_SIGNALS.md
git commit -m "docs(gmail-signals): document sender policy and weighted confidence"
```

---

## Verification Approach

| Layer | How |
|---|---|
| Unit | `npm run test:gmail` — covers sanitizer, sender policy, ATS-name extraction, generic-company stop-list, hard/soft rejection split, weighted confidence |
| Integration | `node scripts/replay-gmail-signals.mjs` against current `data/gmail-signals.jsonl` — counts dropped/kept signals, samples errors |
| End-to-end | `npm run gmail:scan --dry-run` then `npm run gmail:scan` — exercises live OAuth path with no API mocks |
| Visual | `npm run dashboard:build` + open dashboard Tracker tab — confirm LinkedIn-rejected rows and "Software Engineer"-as-company rows are gone |
| Repo health | `npm run verify` — workspace tests + repo-guard pass (must remain green throughout) |

## Risks and Blockers

- **Existing `data/gmail-signals.jsonl` is gitignored user-layer state**, so verification numbers must be recorded in the progress log inside this plan, not asserted in repo CI.
- **Gmail OAuth is required** for the live `gmail:scan` step; if `config/gmail-oauth-token.json` is missing, Tasks 7.3–7.6 are skipped with a note in the progress log.
- **Suffix stripping is English-only**; non-English ATS sender names ("Reclutamiento", "人才招聘") are not handled. Acceptable for Phase 1 — the user's mailbox is English. Track in `docs/exec-plans/tech-debt-tracker.md` if observed.
- **`isGenericCompany` is also imported** by `isValidStoredSignal` for re-validation. Tightening it will invalidate some previously-stored signals on the next scan — by design, but worth noting in the progress log.

## Progress Log

- 2026-04-28: Plan created after reviewing scanner internals (`scripts/gmail-oauth-refresh.mjs:653` `classifyEvent`, line 694 `extractSignalFromMessage`), dashboard consumption (`web/template.html:3157` `attentionFor`), and the actual 295-row signal corpus. Identified six concrete defects with corpus-grounded evidence.
- 2026-04-28: Tasks 1–6 implemented in 6 commits via subagent-driven development (implementer + spec review + code-quality review per task). 25 unit tests covering sanitizer, sender policy, ATS company extractor, generic-company stop-list, hard/soft rejection split, weighted confidence — all passing.
- 2026-04-28: Task 4 review surfaced false-positive on "The X" company names (Disney/Home Depot/Trade Desk); fix amended into the same commit, added `THE_FRAGMENT_PATTERN` (no `i` flag) so capitalized brand prefixes pass while lowercase prose is still rejected. Aligned `intern` between `ROLE_NOUN_PATTERN` and `ROLE_AT_COMPANY_PATTERN`. 2 new positive-case tests added.
- 2026-04-28: Real-corpus replay (Task 7) ran the new `isValidStoredSignal` against all 295 stored signals. First pass dropped 106 records — but 20 of them were legitimate ATS rejections (Kinstead/Anyscale/Cohere/Mistral AI/Foresight Health/Axon/Bisnow/AfterQuery/Figma/Flex/Fluency/Hazel/Outset/Guidewire/etc.) whose 220-char snippets cut off the hard-rejection phrase. Phase 1's stricter classifier had broken validator idempotency.
- 2026-04-28: Added Task 5b. `isValidStoredSignal` now trusts hard-stored events (`offer`/`rejected`/`interview`/`online_assessment`) without re-classifying, but gates that trust on the current sender policy so legacy LinkedIn-rejected misclassifications still get cleaned up. 4 new tests (Kinstead retained, LinkedIn-with-garbage-company dropped, LinkedIn-with-valid-company-but-policy-denies dropped, soft event still re-classifies). Final replay against the 295-signal corpus: 222 retained, 73 dropped — including all 9 LinkedIn-rejected garbage rows, 4 legacy LinkedIn-rejected rows that survived the company gate but failed the policy gate, and ~60 generic-company / generic-role rows. Unknown-Company count: 0 retained (was 14 baseline). LinkedIn-rejected count: 0 retained (Phase 1 goal achieved).
- 2026-04-28: Skipped live `npm run gmail:scan` and dashboard rebuild (Steps 7.3 / 7.5 / 7.6) — OAuth credentials live in the main checkout's `config/`, not the worktree, and we should not mutate user-layer data from a feature branch. The next scheduled `gmail:scan` (after Phase 1 lands on `main`) will apply the new validator naturally.
- 2026-04-28: Two follow-ups recorded in `docs/exec-plans/tech-debt-tracker.md`: (a) extend `HARD_REJECTION_PATTERNS` with `we regret to inform`, `moving in a different direction`, `not (be )?advancing`, `position has been put on hold`, plus add `opportunity`/`opening` to the hiring-noun list; (b) collapse the duplicate `senderClassificationPolicy(from)` call between `classifyEvent` and `extractSignalFromMessage`, and promote two inline regexes to named constants.

## Key Decisions

- **Phase 1 is single-file, single-script.** No new artifacts, no schema changes, no dashboard changes. This keeps the diff reviewable and reversible.
- **Tests use `node --test` (built-in)**, not vitest. The scanner sits at the repo root and shares no `package.json` with workspace test runners; introducing vitest at root just for one script is overkill.
- **`computeConfidence` floor is 0.20**, ceiling 1.0. This guarantees consumers can use `>= 0.55` as a meaningful "trustworthy signal" threshold without losing legitimately-weak signals entirely.
- **LinkedIn allowlist is hardcoded for now.** Phase 5 promotes it to `config/gmail-senders.yml`. Premature externalization would dilute Phase 1 scope.
- **`decide('event')` returns `''` on policy denial — the call site uses `if (result) return result;` to fall through to the next regex pattern.** A bare `return decide('event')` would exit `classifyEvent` early and break the LinkedIn rejection-shaped-noise → applied path.
- **Validator trusts hard-stored events but gates on current sender policy (Task 5b).** Re-classifying every stored signal made the validator non-idempotent across classifier upgrades. Hard events represent past classifier judgment; the policy gate still cleans up legacy mis-classifications when a sender's allowed-events set tightens.
- **No backfill of stored signals.** The next live scan automatically drops invalidated rows via `isValidStoredSignal`. Avoiding a one-off rewrite script keeps the change reversible — to roll back, revert the commits and the next scan re-stores the old data.

## Final Outcome

Phase 1 shipped in 7 commits on `feature/gmail-tracker-phase1` (`f024c66`, `ef659a7`, `843f21a`, `d560474`, `3e6d3ca`, `03fed3c`, `7b75296`). 30 unit tests pass via `npm run test:gmail`.

Real-corpus impact (replay against the user's 295-signal `data/gmail-signals.jsonl`):

| Bucket | Pre-Phase-1 | Post-Phase-1 | Change |
|---|---:|---:|---|
| Total signals | 295 | 222 (after next merge) | -73 |
| LinkedIn `rejected` misclassifications | 9 | **0** | -9 (goal) |
| `Unknown Company` rows | 14 | **0** | -14 (goal) |
| Generic-company / generic-role garbage | ~60 | 0 | -60 (cleanup) |
| Legitimate ATS rejections | retained | **retained** | 0 (regression averted by Task 5b) |
| Confidence distribution | flat 0.78 / 0.52 | weighted [0.20, 1.00] | filterable |

The user's next scheduled `gmail:scan` will rewrite `data/gmail-signals.jsonl` to the cleaned form. Phase 2 (thread aggregation + state machine) and Phase 3 (`attention` first-class field) can build on the cleaner Phase 1 corpus.
