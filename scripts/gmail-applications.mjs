import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

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
    const upcoming = (Array.isArray(app.timeline) ? app.timeline : [])
      .map((t) => t?.dueAt)
      .filter(Boolean)
      .map((iso) => ({ iso, ms: new Date(iso).getTime() }))
      .filter((d) => Number.isFinite(d.ms) && d.ms >= now.getTime())
      .sort((a, b) => a.ms - b.ms)[0];
    if (upcoming && upcoming.ms - now.getTime() <= URGENT_DEADLINE_HOURS * 3_600_000) {
      return { level: 'urgent', reason: `deadline within ${URGENT_DEADLINE_HOURS}h`, since, dueAt: upcoming.iso };
    }
    return { level: 'action', reason: `${state.replace(/_/g, ' ')} active`, since, dueAt: upcoming ? upcoming.iso : '' };
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

const DEADLINE_EVENTS = new Set(['interview', 'online_assessment', 'action_required']);

export function buildApplicationRecord(threadKey, signals, now = new Date()) {
  const sorted = [...signals].sort((a, b) =>
    String(a.receivedAt || a.eventDate || '').localeCompare(String(b.receivedAt || b.eventDate || ''))
  );
  const timeline = sorted
    .filter((s) => s.eventType)
    .map((s) => {
      const entry = {
        event: s.eventType,
        at: s.receivedAt || s.eventDate || '',
        messageId: s.messageId,
        subject: s.subject,
        summary: s.summary || s.snippet || '',
      };
      if (DEADLINE_EVENTS.has(s.eventType)) {
        if (s.dueAt) {
          entry.dueAt = s.dueAt;
        } else {
          const text = `${s.subject || ''}\n${s.summary || s.snippet || ''}`;
          const ref = entry.at ? new Date(entry.at) : now;
          const due = parseDeadline(text, ref);
          if (due) entry.dueAt = due;
        }
      }
      return entry;
    });
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

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const WEEKDAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

function monthIndex(name) {
  const needle = String(name || '').toLowerCase().replace(/\.$/, '');
  return MONTH_NAMES.findIndex((full) => full === needle || full.startsWith(needle));
}

function weekdayIndex(name) {
  const needle = String(name || '').toLowerCase().replace(/\.$/, '');
  return WEEKDAY_NAMES.findIndex((full) => full === needle || full.startsWith(needle));
}

function nextWeekdayDate(ref, targetDow, { advanceWeek = false } = {}) {
  const refDow = ref.getUTCDay();
  let delta = (targetDow - refDow + 7) % 7;
  if (advanceWeek) delta += 7;
  return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + delta));
}

export function parseDeadline(text, referenceDate = new Date()) {
  if (typeof text !== 'string' || !text) return '';
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  if (!Number.isFinite(ref.getTime())) return '';

  const iso = text.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (iso) {
    const d = new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
    return Number.isFinite(d.getTime()) ? d.toISOString() : '';
  }

  const inDays = text.match(/\b(?:due|complete|finish|submit|respond)\s+(?:[a-z]+\s+){0,2}?(\d+)\s+(day|days|week|weeks)\b/i);
  if (inDays) {
    const n = parseInt(inDays[1], 10);
    const unit = inDays[2].toLowerCase();
    const ms = (unit.startsWith('week') ? n * 7 : n) * 86_400_000;
    return new Date(ref.getTime() + ms).toISOString();
  }

  const monthDay = text.match(/\b(?:by|before|until|due|complete)\s+(?:end\s+of\s+)?([A-Za-z]+\.?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i);
  if (monthDay) {
    const monthIdx = monthIndex(monthDay[1]);
    if (monthIdx >= 0) {
      const day = parseInt(monthDay[2], 10);
      const year = monthDay[3] ? parseInt(monthDay[3], 10) : ref.getUTCFullYear();
      let date = new Date(Date.UTC(year, monthIdx, day));
      if (!monthDay[3] && date.getTime() < ref.getTime() - 30 * 86_400_000) {
        date = new Date(Date.UTC(year + 1, monthIdx, day));
      }
      return date.toISOString();
    }
  }

  const tomorrow = text.match(/\b(?:by|before|until|due|complete|respond|submit)\s+(?:[a-z]+\s+){0,2}?tomorrow\b/i);
  if (tomorrow) {
    return new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + 1)).toISOString();
  }

  const endOfWeek = /\b(?:by|before|until|due|complete)\s+(?:the\s+)?end\s+of\s+(?:the\s+)?week\b/i;
  if (endOfWeek.test(text)) {
    return nextWeekdayDate(ref, 5).toISOString(); // Friday (UTC dow = 5)
  }

  const weekday = text.match(/\b(?:by|before|until|due|complete|respond|submit)\s+(?:[a-z]+\s+){0,3}?(?:end\s+of\s+(?:the\s+)?day\s+|eod\s+|cob\s+)?(this\s+|next\s+)?([A-Za-z]+day)\b/i);
  if (weekday) {
    const wIdx = weekdayIndex(weekday[2]);
    if (wIdx >= 0) {
      const advanceWeek = !!(weekday[1] && /^next/i.test(weekday[1].trim()));
      return nextWeekdayDate(ref, wIdx, { advanceWeek }).toISOString();
    }
  }

  return '';
}

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
