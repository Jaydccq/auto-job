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
