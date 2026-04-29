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

const NOREPLY_PATTERNS = [
  /no[-_.]?reply/i,
  /donotreply/i,
  /^notifications?$/i,
];

const TEAM_NAME_PATTERN = /(hiring team|recruiting team|talent acquisition|talent team|careers|candidate experience|people team|hr team|human resources)/i;

function isHumanContact(signal) {
  const sender = String(signal?.sender || '').toLowerCase();
  const contact = String(signal?.recentContact || '');
  if (!sender || !contact) return false;
  if (NOREPLY_PATTERNS.some((re) => re.test(sender))) return false;
  if (TEAM_NAME_PATTERN.test(contact)) return false;
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
