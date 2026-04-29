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
