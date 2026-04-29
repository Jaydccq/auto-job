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
