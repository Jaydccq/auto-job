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
