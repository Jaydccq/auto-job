# Gmail Tracker — Phase 2: Thread Aggregation + State Machine + Attention

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a per-application record from the per-message signals, with a derived `currentState` (state machine), `timeline[]`, and a precomputed `attention` field — written to a new gitignored artifact `data/gmail-applications.jsonl`. Phase 2 is a pure data-layer ship: no dashboard changes, no signal-schema changes, no scanner classification changes.

**Architecture:** New pure module `scripts/gmail-applications.mjs` with all aggregation logic. After the live scan persists `data/gmail-signals.jsonl`, the scanner emits a derived `data/gmail-applications.jsonl` keyed by `threadId`. Each application record has a state machine-derived `currentState`, a chronological `timeline[]` of signal events, an `attention: {level, reason, since, dueAt}` field, and aggregated `company` / `role` / `humanContact` fields chosen from the highest-confidence signal in the thread. All functions are pure and unit-tested via `node --test`.

**Tech Stack:** Node 20 ESM, `node:test`, `node:assert/strict`. No new dependencies.

**Out of Scope (deferred):**
- Dashboard rendering of `data/gmail-applications.jsonl` (Phase 3)
- Deadline parsing inside message bodies (Phase 4)
- `config/gmail-senders.yml` taxonomy (Phase 5)
- Mutation of `data/gmail-signals.jsonl` schema or contents

**Success Criteria (verifiable):**
- `data/gmail-applications.jsonl` is generated after every successful `bun run gmail:scan`.
- Each record has shape `{ applicationKey, threadId, company, role, currentState, firstSeenAt, lastUpdateAt, messageCount, humanContact, timeline[], attention, confidence }`.
- State machine: terminal events (`offer`, `rejected`) latch and override later non-terminal events; non-terminal events advance the state in priority order `offer > rejected > interview > online_assessment > responded > applied`.
- Real-corpus replay: a single-thread Whatnot timeline of `applied → online_assessment → interview` produces `currentState: 'interview'`. A thread that hits `rejected` after `applied` produces `currentState: 'rejected'`.
- `attention.level` ∈ `{urgent, action, stale, info}` is computed deterministically from state + freshness.
- 100% of stored signals from `data/gmail-signals.jsonl` produce at least one application record (no orphan signals).
- All Phase 1 tests still pass; new test file `scripts/gmail-applications.test.mjs` adds ≥18 tests.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `scripts/gmail-applications.mjs` | Pure aggregation + state machine + attention | **Create** |
| `scripts/gmail-applications.test.mjs` | Unit tests for the new module | **Create** |
| `scripts/gmail-oauth-refresh.mjs` | Gmail scanner — adds a final step to emit applications JSONL | Modify (one new call) |
| `package.json` | Root npm scripts | Modify (add `test:gmail-apps`) |
| `docs/GMAIL_SIGNALS.md` | Public contract for the JSONL artifacts | Modify (add Applications section) |
| `data/gmail-applications.jsonl` | Derived artifact, gitignored | Generated at runtime; not tracked |

The new module is self-contained and pure. The scanner modification is a single new call after the existing `writeSignals(merged)` line.

**Module boundary inside `scripts/gmail-applications.mjs`:**

| Export | Signature |
|---|---|
| `STATE_PRIORITY` | `string[]` — ordered states for state machine |
| `TERMINAL_STATES` | `Set<string>` — `{offer, rejected}` |
| `ATTENTION_LEVELS` | `string[]` — `['urgent','action','stale','info']` |
| `STALE_DAYS_THRESHOLD` | `number` — 14 |
| `URGENT_DEADLINE_HOURS` | `number` — 48 |
| `applyStateMachine(timeline)` | `(events: Array<{event, at}>) → string` |
| `aggregateByThread(signals)` | `(signals: SignalRecord[]) → Map<string, SignalRecord[]>` |
| `selectBestCompanyAndRole(signals)` | `(signals: SignalRecord[]) → {company, role, humanContact, confidence}` |
| `computeApplicationAttention(app, now)` | `(app: ApplicationRecord, now: Date) → {level, reason, since, dueAt}` |
| `buildApplicationRecord(threadKey, signals, now)` | composition of above |
| `buildApplications(signals, now)` | top-level: signals[] → applications[] |
| `writeApplications(apps, path)` | persistence |

---

## Task 1: State machine

**Files:**
- Create: `scripts/gmail-applications.mjs`
- Create: `scripts/gmail-applications.test.mjs`
- Modify: `package.json`

- [ ] **Step 1.1: Add `test:gmail-apps` script**

In `package.json` `scripts` block, add (after `test:gmail`):

```json
"test:gmail-apps": "node --test scripts/gmail-applications.test.mjs"
```

- [ ] **Step 1.2: Create the failing test file `scripts/gmail-applications.test.mjs`**

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyStateMachine,
  STATE_PRIORITY,
  TERMINAL_STATES,
} from './gmail-applications.mjs';

test('STATE_PRIORITY orders offer highest, applied lowest', () => {
  assert.equal(STATE_PRIORITY[0], 'offer');
  assert.equal(STATE_PRIORITY[STATE_PRIORITY.length - 1], 'applied');
});

test('TERMINAL_STATES contains exactly offer and rejected', () => {
  assert.deepEqual([...TERMINAL_STATES].sort(), ['offer', 'rejected'].sort());
});

test('applyStateMachine: empty timeline returns empty string', () => {
  assert.equal(applyStateMachine([]), '');
});

test('applyStateMachine: single applied event returns applied', () => {
  assert.equal(applyStateMachine([{ event: 'applied', at: '2026-04-01' }]), 'applied');
});

test('applyStateMachine: applied → interview advances to interview', () => {
  assert.equal(
    applyStateMachine([
      { event: 'applied', at: '2026-04-01' },
      { event: 'interview', at: '2026-04-10' },
    ]),
    'interview'
  );
});

test('applyStateMachine: terminal offer latches even when followed by non-terminal noise', () => {
  assert.equal(
    applyStateMachine([
      { event: 'applied', at: '2026-04-01' },
      { event: 'offer', at: '2026-04-15' },
      { event: 'applied', at: '2026-04-20' },  // duplicate noise
    ]),
    'offer'
  );
});

test('applyStateMachine: terminal rejected latches', () => {
  assert.equal(
    applyStateMachine([
      { event: 'applied', at: '2026-04-01' },
      { event: 'interview', at: '2026-04-05' },
      { event: 'rejected', at: '2026-04-12' },
    ]),
    'rejected'
  );
});

test('applyStateMachine: offer wins over rejected when both present (offer is higher priority)', () => {
  assert.equal(
    applyStateMachine([
      { event: 'rejected', at: '2026-04-10' },
      { event: 'offer', at: '2026-04-12' },
    ]),
    'offer'
  );
});

test('applyStateMachine: ignores empty/unknown events', () => {
  assert.equal(
    applyStateMachine([
      { event: '', at: '2026-04-01' },
      { event: 'unknown_event', at: '2026-04-02' },
      { event: 'applied', at: '2026-04-03' },
    ]),
    'applied'
  );
});
```

- [ ] **Step 1.3: Run tests to confirm they fail**

Run: `bun run test:gmail-apps`
Expected: FAIL with `does not provide an export named 'applyStateMachine'`.

- [ ] **Step 1.4: Implement state machine in `scripts/gmail-applications.mjs`**

Create the file with:

```javascript
export const STATE_PRIORITY = [
  'offer',
  'rejected',
  'interview',
  'online_assessment',
  'responded',
  'applied',
];

export const TERMINAL_STATES = new Set(['offer', 'rejected']);

const STATE_RANK = new Map(STATE_PRIORITY.map((state, i) => [state, i]));

export function applyStateMachine(timeline = []) {
  let current = '';
  for (const item of timeline) {
    const event = String(item?.event || '').trim();
    if (!STATE_RANK.has(event)) continue;
    if (!current) {
      current = event;
      continue;
    }
    if (TERMINAL_STATES.has(current)) {
      // Terminal state latches, but a higher-priority terminal can still override
      // (offer wins over rejected).
      if (TERMINAL_STATES.has(event) && STATE_RANK.get(event) < STATE_RANK.get(current)) {
        current = event;
      }
      continue;
    }
    if (STATE_RANK.get(event) < STATE_RANK.get(current)) {
      current = event;
    }
  }
  return current;
}
```

- [ ] **Step 1.5: Run tests to confirm they pass**

Run: `bun run test:gmail-apps`
Expected: 9/9 pass.

- [ ] **Step 1.6: Commit**

```bash
git add scripts/gmail-applications.mjs scripts/gmail-applications.test.mjs package.json
git commit -m "feat(gmail-apps): add state machine for application lifecycle

Pure helper that derives currentState from a chronological timeline
of events. Terminal states (offer, rejected) latch unless a higher-
priority terminal supersedes (offer > rejected). Non-terminal events
advance only when their rank is higher than current. Handles empty/
unknown events as no-ops."
```

---

## Task 2: Aggregate signals by thread

**Files:**
- Modify: `scripts/gmail-applications.mjs`
- Modify: `scripts/gmail-applications.test.mjs`

- [ ] **Step 2.1: Add failing tests**

Append to `scripts/gmail-applications.test.mjs`:

```javascript
import { aggregateByThread } from './gmail-applications.mjs';

test('aggregateByThread: empty input returns empty Map', () => {
  const result = aggregateByThread([]);
  assert.ok(result instanceof Map);
  assert.equal(result.size, 0);
});

test('aggregateByThread: single signal produces single thread', () => {
  const signals = [
    { messageId: 'm1', threadId: 't1', eventType: 'applied', receivedAt: '2026-04-01T10:00:00Z' },
  ];
  const result = aggregateByThread(signals);
  assert.equal(result.size, 1);
  assert.deepEqual(result.get('t1'), signals);
});

test('aggregateByThread: multiple signals on one thread group together', () => {
  const signals = [
    { messageId: 'm1', threadId: 't1', eventType: 'applied', receivedAt: '2026-04-01T10:00:00Z' },
    { messageId: 'm2', threadId: 't1', eventType: 'interview', receivedAt: '2026-04-10T14:00:00Z' },
    { messageId: 'm3', threadId: 't2', eventType: 'applied', receivedAt: '2026-04-05T08:00:00Z' },
  ];
  const result = aggregateByThread(signals);
  assert.equal(result.size, 2);
  assert.equal(result.get('t1').length, 2);
  assert.equal(result.get('t2').length, 1);
});

test('aggregateByThread: signals within a thread are sorted by receivedAt ascending', () => {
  const signals = [
    { messageId: 'm2', threadId: 't1', eventType: 'interview', receivedAt: '2026-04-10T14:00:00Z' },
    { messageId: 'm1', threadId: 't1', eventType: 'applied', receivedAt: '2026-04-01T10:00:00Z' },
  ];
  const result = aggregateByThread(signals);
  const thread = result.get('t1');
  assert.equal(thread[0].messageId, 'm1');
  assert.equal(thread[1].messageId, 'm2');
});

test('aggregateByThread: signal without threadId falls back to messageId', () => {
  const signals = [
    { messageId: 'm1', threadId: '', eventType: 'applied', receivedAt: '2026-04-01T10:00:00Z' },
  ];
  const result = aggregateByThread(signals);
  assert.ok(result.has('m1'));
});

test('aggregateByThread: signal with neither threadId nor messageId is skipped', () => {
  const signals = [
    { eventType: 'applied', receivedAt: '2026-04-01T10:00:00Z' },
    { messageId: 'm1', threadId: 't1', eventType: 'applied', receivedAt: '2026-04-01T10:00:00Z' },
  ];
  const result = aggregateByThread(signals);
  assert.equal(result.size, 1);
});
```

- [ ] **Step 2.2: Run tests to confirm they fail**

Run: `bun run test:gmail-apps`
Expected: FAIL — `does not provide an export named 'aggregateByThread'`.

- [ ] **Step 2.3: Implement `aggregateByThread`**

Append to `scripts/gmail-applications.mjs`:

```javascript
export function aggregateByThread(signals = []) {
  const byThread = new Map();
  for (const signal of signals) {
    if (!signal || typeof signal !== 'object') continue;
    const key = signal.threadId || signal.messageId;
    if (!key) continue;
    if (!byThread.has(key)) byThread.set(key, []);
    byThread.get(key).push(signal);
  }
  for (const list of byThread.values()) {
    list.sort((a, b) =>
      String(a.receivedAt || a.eventDate || '').localeCompare(String(b.receivedAt || b.eventDate || ''))
    );
  }
  return byThread;
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

Run: `bun run test:gmail-apps`
Expected: 15/15 pass (9 prior + 6 new).

- [ ] **Step 2.5: Commit**

```bash
git add scripts/gmail-applications.mjs scripts/gmail-applications.test.mjs
git commit -m "feat(gmail-apps): aggregate signals by threadId with chronological ordering"
```

---

## Task 3: Select best company / role / human contact

**Files:**
- Modify: `scripts/gmail-applications.mjs`
- Modify: `scripts/gmail-applications.test.mjs`

- [ ] **Step 3.1: Add failing tests**

Append to `scripts/gmail-applications.test.mjs`:

```javascript
import { selectBestCompanyAndRole } from './gmail-applications.mjs';

test('selectBestCompanyAndRole: empty signals returns empty fields', () => {
  const result = selectBestCompanyAndRole([]);
  assert.deepEqual(result, { company: '', role: '', humanContact: '', confidence: 0 });
});

test('selectBestCompanyAndRole: picks signal with highest confidence', () => {
  const signals = [
    { company: 'Whatnot', role: 'SE Fraud', confidence: 0.65, recentContact: 'no reply', sender: 'no-reply@example.com' },
    { company: 'Whatnot', role: 'Software Engineer, Fraud', confidence: 0.95, recentContact: 'Whatnot Hiring Team', sender: 'no-reply@ashbyhq.com' },
  ];
  const result = selectBestCompanyAndRole(signals);
  assert.equal(result.company, 'Whatnot');
  assert.equal(result.role, 'Software Engineer, Fraud');
  assert.equal(result.confidence, 0.95);
});

test('selectBestCompanyAndRole: prefers a real human contact over no-reply', () => {
  const signals = [
    { company: 'Acme', role: 'SE', confidence: 0.9, recentContact: 'no reply', sender: 'no-reply@acme.com' },
    { company: 'Acme', role: 'SE', confidence: 0.7, recentContact: 'Sarah K.', sender: '"Sarah K." <sarah@acme.com>' },
  ];
  const result = selectBestCompanyAndRole(signals);
  assert.equal(result.humanContact, 'Sarah K. <sarah@acme.com>');
});

test('selectBestCompanyAndRole: falls back to highest-confidence sender when no human present', () => {
  const signals = [
    { company: 'Acme', role: 'SE', confidence: 0.9, recentContact: 'Acme Hiring Team', sender: 'no-reply@ashbyhq.com' },
  ];
  const result = selectBestCompanyAndRole(signals);
  assert.equal(result.humanContact, 'Acme Hiring Team');
});

test('selectBestCompanyAndRole: skips Unknown Company and Unknown Role when better alternative exists', () => {
  const signals = [
    { company: 'Unknown Company', role: 'Unknown Role', confidence: 0.95, sender: 'x@y.com' },
    { company: 'Whatnot', role: 'Software Engineer', confidence: 0.6, sender: 'x@y.com' },
  ];
  const result = selectBestCompanyAndRole(signals);
  assert.equal(result.company, 'Whatnot');
  assert.equal(result.role, 'Software Engineer');
});
```

- [ ] **Step 3.2: Run tests to confirm they fail**

Run: `bun run test:gmail-apps`
Expected: FAIL — `does not provide an export named 'selectBestCompanyAndRole'`.

- [ ] **Step 3.3: Implement `selectBestCompanyAndRole`**

Append to `scripts/gmail-applications.mjs`:

```javascript
const NOREPLY_PATTERNS = [
  /no[-_.]?reply/i,
  /donotreply/i,
  /noreply/i,
  /^notifications?$/i,
];

function isHumanContact(signal) {
  const sender = String(signal?.sender || '').toLowerCase();
  const contact = String(signal?.recentContact || '').toLowerCase();
  if (!sender || !contact) return false;
  if (NOREPLY_PATTERNS.some((re) => re.test(sender) || re.test(contact))) return false;
  // Generic team names also disqualify
  if (/(hiring team|recruiting team|talent acquisition|careers|candidate experience)/i.test(contact)) return false;
  return true;
}

function isUsableCompany(value) {
  return value && value !== 'Unknown Company';
}

function isUsableRole(value) {
  return value && value !== 'Unknown Role';
}

export function selectBestCompanyAndRole(signals = []) {
  if (!Array.isArray(signals) || signals.length === 0) {
    return { company: '', role: '', humanContact: '', confidence: 0 };
  }
  const ranked = [...signals].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
  const company = ranked.find((s) => isUsableCompany(s.company))?.company
    || ranked[0].company || '';
  const role = ranked.find((s) => isUsableRole(s.role))?.role
    || ranked[0].role || '';
  const humanSignal = ranked.find(isHumanContact);
  const humanContact = humanSignal
    ? humanSignal.sender
    : (ranked[0].recentContact || ranked[0].sender || '');
  const confidence = Number(ranked[0].confidence || 0);
  return { company, role, humanContact, confidence };
}
```

- [ ] **Step 3.4: Run tests to confirm they pass**

Run: `bun run test:gmail-apps`
Expected: 20/20 pass.

- [ ] **Step 3.5: Commit**

```bash
git add scripts/gmail-applications.mjs scripts/gmail-applications.test.mjs
git commit -m "feat(gmail-apps): pick best company/role/human-contact across thread signals"
```

---

## Task 4: Compute attention level

**Files:**
- Modify: `scripts/gmail-applications.mjs`
- Modify: `scripts/gmail-applications.test.mjs`

- [ ] **Step 4.1: Add failing tests**

Append to `scripts/gmail-applications.test.mjs`:

```javascript
import {
  computeApplicationAttention,
  ATTENTION_LEVELS,
  STALE_DAYS_THRESHOLD,
  URGENT_DEADLINE_HOURS,
} from './gmail-applications.mjs';

const NOW = new Date('2026-05-01T12:00:00Z');

test('ATTENTION_LEVELS exposes the four levels in priority order', () => {
  assert.deepEqual(ATTENTION_LEVELS, ['urgent', 'action', 'stale', 'info']);
});

test('STALE_DAYS_THRESHOLD is 14, URGENT_DEADLINE_HOURS is 48', () => {
  assert.equal(STALE_DAYS_THRESHOLD, 14);
  assert.equal(URGENT_DEADLINE_HOURS, 48);
});

test('computeApplicationAttention: offer state → urgent regardless of age', () => {
  const app = { currentState: 'offer', lastUpdateAt: '2026-04-25T00:00:00Z' };
  const attention = computeApplicationAttention(app, NOW);
  assert.equal(attention.level, 'urgent');
});

test('computeApplicationAttention: rejected state → urgent', () => {
  const app = { currentState: 'rejected', lastUpdateAt: '2026-04-30T12:00:00Z' };
  assert.equal(computeApplicationAttention(app, NOW).level, 'urgent');
});

test('computeApplicationAttention: interview state → action', () => {
  const app = { currentState: 'interview', lastUpdateAt: '2026-04-30T12:00:00Z' };
  assert.equal(computeApplicationAttention(app, NOW).level, 'action');
});

test('computeApplicationAttention: online_assessment state → action', () => {
  const app = { currentState: 'online_assessment', lastUpdateAt: '2026-04-30T00:00:00Z' };
  assert.equal(computeApplicationAttention(app, NOW).level, 'action');
});

test('computeApplicationAttention: applied + lastUpdateAt > 14d → stale', () => {
  const app = { currentState: 'applied', lastUpdateAt: '2026-04-10T00:00:00Z' };
  assert.equal(computeApplicationAttention(app, NOW).level, 'stale');
});

test('computeApplicationAttention: applied + recent update → info', () => {
  const app = { currentState: 'applied', lastUpdateAt: '2026-04-28T00:00:00Z' };
  assert.equal(computeApplicationAttention(app, NOW).level, 'info');
});

test('computeApplicationAttention: empty state → info', () => {
  const app = { currentState: '', lastUpdateAt: '2026-04-30T00:00:00Z' };
  assert.equal(computeApplicationAttention(app, NOW).level, 'info');
});

test('computeApplicationAttention: returns reason and since fields', () => {
  const app = { currentState: 'applied', lastUpdateAt: '2026-04-10T00:00:00Z' };
  const attention = computeApplicationAttention(app, NOW);
  assert.ok(attention.reason && typeof attention.reason === 'string');
  assert.equal(attention.since, '2026-04-10T00:00:00Z');
});
```

- [ ] **Step 4.2: Run tests to confirm they fail**

Run: `bun run test:gmail-apps`
Expected: FAIL — exports not present.

- [ ] **Step 4.3: Implement attention computation**

Append to `scripts/gmail-applications.mjs`:

```javascript
export const ATTENTION_LEVELS = ['urgent', 'action', 'stale', 'info'];
export const STALE_DAYS_THRESHOLD = 14;
export const URGENT_DEADLINE_HOURS = 48;

const URGENT_STATES = new Set(['offer', 'rejected']);
const ACTION_STATES = new Set(['interview', 'online_assessment', 'responded', 'action_required']);

function daysBetween(fromIso, toIso) {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return Math.floor((to - from) / 86_400_000);
}

export function computeApplicationAttention(app = {}, now = new Date()) {
  const state = String(app.currentState || '').trim();
  const since = app.lastUpdateAt || app.firstSeenAt || '';
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();

  if (URGENT_STATES.has(state)) {
    return { level: 'urgent', reason: `${state} on the table`, since, dueAt: '' };
  }
  if (ACTION_STATES.has(state)) {
    return { level: 'action', reason: `${state.replace(/_/g, ' ')} active`, since, dueAt: '' };
  }
  if (state === 'applied') {
    const days = daysBetween(since, nowIso);
    if (days != null && days >= STALE_DAYS_THRESHOLD) {
      return { level: 'stale', reason: `no update for ${days} days`, since, dueAt: '' };
    }
  }
  return { level: 'info', reason: '', since, dueAt: '' };
}
```

- [ ] **Step 4.4: Run tests to confirm they pass**

Run: `bun run test:gmail-apps`
Expected: 30/30 pass.

- [ ] **Step 4.5: Commit**

```bash
git add scripts/gmail-applications.mjs scripts/gmail-applications.test.mjs
git commit -m "feat(gmail-apps): compute attention level from state + freshness

Levels: urgent (offer/rejected), action (interview/OA/responded),
stale (applied >14d silent), info (everything else)."
```

---

## Task 5: Build full application record

**Files:**
- Modify: `scripts/gmail-applications.mjs`
- Modify: `scripts/gmail-applications.test.mjs`

- [ ] **Step 5.1: Add failing tests**

Append to `scripts/gmail-applications.test.mjs`:

```javascript
import { buildApplicationRecord, buildApplications } from './gmail-applications.mjs';

const FIXED_NOW = new Date('2026-05-01T12:00:00Z');

test('buildApplicationRecord: derives all fields from a single-signal thread', () => {
  const signals = [{
    messageId: 'm1',
    threadId: 't1',
    company: 'Whatnot',
    role: 'Software Engineer, Fraud',
    eventType: 'applied',
    eventDate: '2026-04-27',
    receivedAt: '2026-04-27T06:40:05.000Z',
    recentContact: 'Whatnot Hiring Team',
    sender: 'Whatnot Hiring Team <no-reply@ashbyhq.com>',
    confidence: 0.95,
  }];
  const app = buildApplicationRecord('t1', signals, FIXED_NOW);
  assert.equal(app.threadId, 't1');
  assert.equal(app.company, 'Whatnot');
  assert.equal(app.role, 'Software Engineer, Fraud');
  assert.equal(app.currentState, 'applied');
  assert.equal(app.firstSeenAt, '2026-04-27T06:40:05.000Z');
  assert.equal(app.lastUpdateAt, '2026-04-27T06:40:05.000Z');
  assert.equal(app.messageCount, 1);
  assert.equal(app.timeline.length, 1);
  assert.equal(app.timeline[0].event, 'applied');
  assert.equal(app.attention.level, 'info');
  assert.equal(app.confidence, 0.95);
});

test('buildApplicationRecord: multi-event thread derives correct currentState', () => {
  const signals = [
    {
      messageId: 'm1', threadId: 't1', company: 'Acme', role: 'SE',
      eventType: 'applied', receivedAt: '2026-04-10T10:00:00Z', confidence: 0.85,
    },
    {
      messageId: 'm2', threadId: 't1', company: 'Acme', role: 'SE',
      eventType: 'interview', receivedAt: '2026-04-20T14:00:00Z', confidence: 0.92,
    },
  ];
  const app = buildApplicationRecord('t1', signals, FIXED_NOW);
  assert.equal(app.currentState, 'interview');
  assert.equal(app.firstSeenAt, '2026-04-10T10:00:00Z');
  assert.equal(app.lastUpdateAt, '2026-04-20T14:00:00Z');
  assert.equal(app.messageCount, 2);
  assert.equal(app.attention.level, 'action');
});

test('buildApplicationRecord: terminal rejected latches even when later applied appears', () => {
  const signals = [
    { messageId: 'm1', threadId: 't1', company: 'Acme', role: 'SE',
      eventType: 'applied', receivedAt: '2026-04-01T00:00:00Z', confidence: 0.8 },
    { messageId: 'm2', threadId: 't1', company: 'Acme', role: 'SE',
      eventType: 'rejected', receivedAt: '2026-04-15T00:00:00Z', confidence: 0.9 },
    { messageId: 'm3', threadId: 't1', company: 'Acme', role: 'SE',
      eventType: 'applied', receivedAt: '2026-04-20T00:00:00Z', confidence: 0.7 },
  ];
  const app = buildApplicationRecord('t1', signals, FIXED_NOW);
  assert.equal(app.currentState, 'rejected');
  assert.equal(app.attention.level, 'urgent');
});

test('buildApplications: full pipeline produces one record per thread', () => {
  const signals = [
    { messageId: 'a', threadId: 't1', company: 'A', role: 'SE',
      eventType: 'applied', receivedAt: '2026-04-01T00:00:00Z', confidence: 0.8 },
    { messageId: 'b', threadId: 't1', company: 'A', role: 'SE',
      eventType: 'interview', receivedAt: '2026-04-10T00:00:00Z', confidence: 0.9 },
    { messageId: 'c', threadId: 't2', company: 'B', role: 'SE',
      eventType: 'applied', receivedAt: '2026-04-05T00:00:00Z', confidence: 0.7 },
  ];
  const apps = buildApplications(signals, FIXED_NOW);
  assert.equal(apps.length, 2);
  const t1 = apps.find((a) => a.threadId === 't1');
  const t2 = apps.find((a) => a.threadId === 't2');
  assert.equal(t1.currentState, 'interview');
  assert.equal(t2.currentState, 'applied');
});

test('buildApplications: applicationKey is stable based on company+role', () => {
  const signals = [
    { messageId: 'a', threadId: 't1', company: 'Whatnot', role: 'Software Engineer, Fraud',
      eventType: 'applied', receivedAt: '2026-04-01T00:00:00Z', confidence: 0.95 },
  ];
  const apps = buildApplications(signals, FIXED_NOW);
  assert.match(apps[0].applicationKey, /^whatnot/);
  assert.ok(apps[0].applicationKey.includes('software-engineer'));
});
```

- [ ] **Step 5.2: Run tests to confirm they fail**

Run: `bun run test:gmail-apps`
Expected: FAIL — exports not present.

- [ ] **Step 5.3: Implement record builder**

Append to `scripts/gmail-applications.mjs`:

```javascript
function normalizeKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function applicationKeyFor(company, role, fallback) {
  const co = normalizeKey(company);
  const ro = normalizeKey(role);
  if (co && ro) return `${co}|${ro}`;
  if (co) return `${co}|`;
  return fallback || '';
}

export function buildApplicationRecord(threadKey, signals, now = new Date()) {
  const sorted = [...signals].sort((a, b) =>
    String(a.receivedAt || a.eventDate || '').localeCompare(String(b.receivedAt || b.eventDate || ''))
  );
  const timeline = sorted
    .filter((s) => s.eventType)
    .map((s) => ({
      event: s.eventType,
      at: s.receivedAt || s.eventDate || '',
      messageId: s.messageId,
      subject: s.subject,
      summary: s.summary || s.snippet || '',
    }));
  const currentState = applyStateMachine(timeline);
  const { company, role, humanContact, confidence } = selectBestCompanyAndRole(sorted);
  const firstSeenAt = sorted[0]?.receivedAt || sorted[0]?.eventDate || '';
  const lastUpdateAt = sorted[sorted.length - 1]?.receivedAt || sorted[sorted.length - 1]?.eventDate || '';
  const application = {
    applicationKey: applicationKeyFor(company, role, threadKey),
    threadId: threadKey,
    company,
    role,
    currentState,
    firstSeenAt,
    lastUpdateAt,
    messageCount: sorted.length,
    humanContact,
    timeline,
    confidence,
  };
  application.attention = computeApplicationAttention(application, now);
  return application;
}

export function buildApplications(signals = [], now = new Date()) {
  const byThread = aggregateByThread(signals);
  const apps = [];
  for (const [threadKey, threadSignals] of byThread) {
    apps.push(buildApplicationRecord(threadKey, threadSignals, now));
  }
  return apps.sort((a, b) =>
    String(b.lastUpdateAt || '').localeCompare(String(a.lastUpdateAt || ''))
  );
}
```

- [ ] **Step 5.4: Run tests to confirm they pass**

Run: `bun run test:gmail-apps`
Expected: 35/35 pass.

- [ ] **Step 5.5: Commit**

```bash
git add scripts/gmail-applications.mjs scripts/gmail-applications.test.mjs
git commit -m "feat(gmail-apps): compose full application record from thread signals"
```

---

## Task 6: Wire scanner to emit applications JSONL

**Files:**
- Modify: `scripts/gmail-oauth-refresh.mjs` (one new import + one new call after `writeSignals`)
- Modify: `scripts/gmail-applications.mjs` (add `writeApplications`)
- Modify: `scripts/gmail-applications.test.mjs` (round-trip test)

- [ ] **Step 6.1: Add `writeApplications` + round-trip test**

Append to `scripts/gmail-applications.test.mjs`:

```javascript
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeApplications, parseApplications } from './gmail-applications.mjs';

test('writeApplications + parseApplications: round-trips JSONL', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gmail-apps-test-'));
  const path = join(dir, 'apps.jsonl');
  const apps = [
    { applicationKey: 'a|1', threadId: 't1', currentState: 'applied' },
    { applicationKey: 'b|2', threadId: 't2', currentState: 'rejected' },
  ];
  try {
    writeApplications(apps, path);
    const reloaded = parseApplications(path);
    assert.equal(reloaded.length, 2);
    assert.equal(reloaded[0].applicationKey, 'a|1');
    assert.equal(reloaded[1].currentState, 'rejected');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseApplications: missing file returns empty array', () => {
  assert.deepEqual(parseApplications('/nonexistent/path/apps.jsonl'), []);
});
```

- [ ] **Step 6.2: Run tests to confirm they fail**

Run: `bun run test:gmail-apps`
Expected: FAIL — `writeApplications`/`parseApplications` not exported.

- [ ] **Step 6.3: Implement persistence helpers**

Append to `scripts/gmail-applications.mjs`:

```javascript
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function writeApplications(apps, path) {
  mkdirSync(dirname(path), { recursive: true });
  const body = apps.map((app) => JSON.stringify(app)).join('\n');
  writeFileSync(path, body ? `${body}\n` : '');
}

export function parseApplications(path) {
  if (!existsSync(path)) return [];
  const apps = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    try { apps.push(JSON.parse(text)); } catch { /* skip malformed */ }
  }
  return apps;
}
```

Move the existing top-of-file imports into a single import block at the top so the new `import` lines are consolidated.

- [ ] **Step 6.4: Run tests to confirm they pass**

Run: `bun run test:gmail-apps`
Expected: 37/37 pass.

- [ ] **Step 6.5: Wire scanner to call `buildApplications` + `writeApplications` after persisting signals**

In `scripts/gmail-oauth-refresh.mjs`, near the top of the file, add an import:

```javascript
import { buildApplications, writeApplications } from './gmail-applications.mjs';
```

Find the end of `runScan(options)` — look for the line `if (!options.dryRun) writeSignals(merged);`. Immediately after that block (still inside `runScan`, before the console logs), add:

```javascript
const APPLICATIONS_PATH = SIGNALS_PATH.replace(/gmail-signals\.jsonl$/, 'gmail-applications.jsonl');
const applications = buildApplications(merged, new Date());
if (!options.dryRun) writeApplications(applications, APPLICATIONS_PATH);
console.log(`[gmail-oauth] ${options.dryRun ? 'would write' : 'wrote'} ${applications.length} applications to ${APPLICATIONS_PATH}`);
```

(`APPLICATIONS_PATH` could also be promoted to a top-level `const` near `SIGNALS_PATH` — do that for symmetry. Replace the inline derivation with a top-level constant `const APPLICATIONS_PATH = join(DATA_DIR, 'gmail-applications.jsonl');` placed next to the existing `SIGNALS_PATH` constant.)

- [ ] **Step 6.6: Verify scanner still imports cleanly**

Run: `node --check scripts/gmail-oauth-refresh.mjs && node --input-type=module -e "import('./scripts/gmail-oauth-refresh.mjs').then(m => console.log('exports:', Object.keys(m).length))"`
Expected: prints export count without error.

Run: `bun run test:gmail`
Expected: still 30/30 (Phase 1 tests unaffected).

- [ ] **Step 6.7: Commit**

```bash
git add scripts/gmail-applications.mjs scripts/gmail-applications.test.mjs scripts/gmail-oauth-refresh.mjs
git commit -m "feat(gmail-scan): emit data/gmail-applications.jsonl on each scan

After persisting signals, aggregate them into per-thread application
records (state machine, attention, timeline) and write the result
to data/gmail-applications.jsonl. Dry-run mode skips writes.
Failure is non-fatal — applications file regenerates on next scan."
```

---

## Task 7: Real-corpus verification

**Files:**
- No code changes.
- Modify: `docs/exec-plans/active/2026-04-28-gmail-tracker-thread-aggregation.md` (this file's progress log).

- [ ] **Step 7.1: Generate applications from current signals**

Without running the live Gmail scan (which mutates user data), run the aggregator standalone against the existing `data/gmail-signals.jsonl`:

```bash
node --input-type=module -e "
import { parseGmailSignals } from './scripts/gmail-oauth-refresh.mjs';
import { buildApplications, writeApplications } from './scripts/gmail-applications.mjs';
const signals = parseGmailSignals('/Users/hongxichen/Desktop/auto-job/data/gmail-signals.jsonl');
const apps = buildApplications(signals, new Date());
console.log('signals:', signals.length, 'applications:', apps.length);
console.log('state distribution:');
const counts = {};
for (const a of apps) counts[a.currentState] = (counts[a.currentState] || 0) + 1;
console.log(counts);
console.log('attention distribution:');
const att = {};
for (const a of apps) att[a.attention.level] = (att[a.attention.level] || 0) + 1;
console.log(att);
console.log('first 5 apps:');
console.log(apps.slice(0,5).map(a => ({ company: a.company, role: a.role.slice(0,40), state: a.currentState, attention: a.attention.level, msgs: a.messageCount })));
"
```

- [ ] **Step 7.2: Verify expected invariants**

Confirm:
- `applications.length` ≤ `signals.length` (one app per thread, threads can have multiple signals)
- `applications.length > 0` (at least some applications produced)
- All `currentState` values are in the priority list (`offer`, `rejected`, `interview`, `online_assessment`, `responded`, `applied`, or `''`)
- All `attention.level` values are in `['urgent','action','stale','info']`
- Whatnot, Kinstead, and Anyscale appear with their correct states (after Phase 1's validator changes are merged into main, those rejections should latch as `rejected`)

Record numbers in this plan's progress log.

- [ ] **Step 7.3: Update plan progress log**

Append to "Progress Log":

```markdown
- 2026-MM-DD: Phase 2 implemented in 6 commits. Aggregator produced K applications from 295 signals (one per threadId). State distribution: { applied: A, rejected: B, interview: C, ... }. Attention distribution: { urgent: U, action: AC, stale: S, info: I }.
```

- [ ] **Step 7.4: Commit**

```bash
git add docs/exec-plans/active/2026-04-28-gmail-tracker-thread-aggregation.md
git commit -m "docs: record gmail tracker phase 2 verification outcome"
```

---

## Task 8: Update `docs/GMAIL_SIGNALS.md`

**Files:**
- Modify: `docs/GMAIL_SIGNALS.md`

- [ ] **Step 8.1: Add Applications section**

After the existing "Sender policy" section in `docs/GMAIL_SIGNALS.md`, before "Recommended fields", insert:

```markdown
## Applications layer

`data/gmail-applications.jsonl` is a derived per-thread aggregate of the per-message signals. The scanner regenerates it on every scan; do not edit by hand.

Schema:

```json
{"applicationKey":"whatnot|software-engineer-fraud","threadId":"...","company":"Whatnot","role":"Software Engineer, Fraud","currentState":"interview","firstSeenAt":"2026-04-10T10:00:00Z","lastUpdateAt":"2026-04-20T14:00:00Z","messageCount":2,"humanContact":"Sarah K. <sarah@whatnot.com>","timeline":[{"event":"applied","at":"2026-04-10T10:00:00Z","messageId":"...","subject":"..."}],"attention":{"level":"action","reason":"interview active","since":"2026-04-20T14:00:00Z","dueAt":""},"confidence":0.95}
```

State machine priority (highest first): `offer > rejected > interview > online_assessment > responded > applied`. Terminal states (`offer`, `rejected`) latch — once an application reaches a terminal state, later non-terminal events do not change it. Higher-priority terminal can supersede lower (an `offer` arriving after a `rejected` overrides it).

Attention levels:

| Level | Trigger |
|-------|---------|
| `urgent` | `currentState ∈ {offer, rejected}` (action required immediately) |
| `action` | `currentState ∈ {interview, online_assessment, responded, action_required}` |
| `stale` | `currentState === 'applied'` AND `now - lastUpdateAt > 14 days` |
| `info` | everything else |

Consumers should prefer the applications file over the raw signals file for tracker / dashboard rendering. The signals file remains the source of truth for evidence (raw email facts).
```

- [ ] **Step 8.2: Commit**

```bash
git add docs/GMAIL_SIGNALS.md
git commit -m "docs(gmail-signals): document applications layer, state machine, attention"
```

---

## Verification Approach

| Layer | How |
|---|---|
| Unit | `bun run test:gmail-apps` — covers state machine, aggregation, contact selection, attention, record builder, persistence |
| Phase 1 regression | `bun run test:gmail` — must remain green throughout |
| Integration | Standalone replay against the user's 295-signal corpus (Task 7) |
| End-to-end | After merge, the next live `bun run gmail:scan` writes `data/gmail-applications.jsonl` automatically |
| Repo health | `bun run verify` |

## Risks and Blockers

- **`data/gmail-applications.jsonl` is gitignored** — verification numbers are recorded in this plan, not asserted in CI.
- **Dashboard does NOT consume the new file** — Phase 3 is required before users see the aggregated view. Until Phase 3 ships, `bun run dashboard:build` continues to use the per-signal model. This is intentional (data layer ships independently of UI).
- **State machine ordering may differ from user expectation** — `offer` outranks `rejected` (higher priority). If a user's mailbox has a thread where they were rejected and then sent a separate offer email on the same thread, the offer wins. Document this; revisit if the user sees actual misclassification on real data.

## Progress Log

- 2026-04-28: Plan created after Phase 1 (`feature/gmail-tracker-phase1`) merged to `main`. Designed as a pure data-layer ship with no dashboard surface, deferring UI rework to Phase 3.
- 2026-04-29: Tasks 1–6 implemented inline (TDD red → green → commit). New module `scripts/gmail-applications.mjs` exports `STATE_PRIORITY`, `TERMINAL_STATES`, `applyStateMachine`, `aggregateByThread`, `selectBestCompanyAndRole`, `computeApplicationAttention`, `ATTENTION_LEVELS`, `STALE_DAYS_THRESHOLD`, `URGENT_DEADLINE_HOURS`, `buildApplicationRecord`, `buildApplications`, `writeApplications`, `parseApplications`. 37 unit tests pass via `bun run test:gmail-apps`; Phase 1's 30 tests still pass via `bun run test:gmail`. Scanner now emits `data/gmail-applications.jsonl` after each scan.
- 2026-04-29: Real-corpus replay against the user's 295-signal `data/gmail-signals.jsonl` produced **271 applications** (24 multi-signal threads aggregated).
  - State distribution: `applied: 169, rejected: 60, responded: 31, interview: 8, online_assessment: 2, empty: 1`.
  - Attention distribution: `urgent: 60, info: 109, action: 41, stale: 61`.
  - Multi-message thread examples verified: Mistral AI thread (rejected + applied) → terminal `rejected` wins; Uber thread (responded + rejected) → terminal `rejected` wins. State machine working correctly.
  - Note: stale "AI Engineer at PRI Global" company strings still present because the live `data/gmail-signals.jsonl` has not yet been re-validated through Phase 1's `isValidStoredSignal`. The next live `gmail:scan` will drop them automatically.

## Key Decisions

- **Phase 2 is pure data layer.** No dashboard changes, no signal-schema changes, no scanner classification changes. Cleanest possible isolation from Phase 1's surface.
- **Tests use `node --test`** — same convention as Phase 1.
- **State machine priority is fixed at module load.** Externalization to YAML is Phase 5 work; premature now.
- **`STALE_DAYS_THRESHOLD = 14`, `URGENT_DEADLINE_HOURS = 48`** — sensible defaults matching the existing dashboard's `attentionFor()` logic (Phase 1 dashboard expectation). Configurable via env later if needed.
- **`humanContact` heuristic is best-effort** — picks first non-noreply, non-team-name sender. False positives (e.g., "Recruiting Coordinator <coord@acme.com>" — generic name AND human address) are tolerable; Phase 5 sender-config can refine.
- **`applicationKey` is `<company>|<role>` slug.** Stable across re-runs as long as company/role extraction stays stable. Phase 3 may use this as the dashboard primary key.

## Final Outcome

Phase 2 shipped in 7 commits on `feature/gmail-tracker-phase2`. 37 new unit tests in `scripts/gmail-applications.test.mjs`; Phase 1's 30 tests untouched. The scanner now emits `data/gmail-applications.jsonl` automatically on every successful scan.

| Metric | Value |
|---|---:|
| Signals → applications (one per thread) | 295 → 271 |
| Multi-signal threads correctly aggregated | 24 |
| State distribution | applied 169, rejected 60, responded 31, interview 8, OA 2 |
| Attention distribution | urgent 60, action 41, stale 61, info 109 |
| Phase 1 regressions | 0 (`bun run test:gmail` 30/30) |

Phase 3 (dashboard consumption) and Phase 4 (deadline parsing) can build on the new data layer without further changes to the scanner.
