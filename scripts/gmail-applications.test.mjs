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
      { event: 'applied', at: '2026-04-20' },
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
  assert.equal(result.humanContact, '"Sarah K." <sarah@acme.com>');
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
  assert.equal(computeApplicationAttention(app, NOW).level, 'urgent');
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
    { messageId: 'm1', threadId: 't1', company: 'Acme', role: 'SE',
      eventType: 'applied', receivedAt: '2026-04-10T10:00:00Z', confidence: 0.85 },
    { messageId: 'm2', threadId: 't1', company: 'Acme', role: 'SE',
      eventType: 'interview', receivedAt: '2026-04-20T14:00:00Z', confidence: 0.92 },
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
