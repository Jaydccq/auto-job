#!/usr/bin/env node

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CONFIG_DIR = join(ROOT, 'config');
const DATA_DIR = join(ROOT, 'data');
const CREDENTIALS_PATH = join(CONFIG_DIR, 'gmail-oauth-credentials.json');
const TOKEN_PATH = join(CONFIG_DIR, 'gmail-oauth-token.json');
const SIGNALS_PATH = join(DATA_DIR, 'gmail-signals.jsonl');
const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const SETUP_REQUIRED_EXIT = 78;

const DEFAULT_QUERIES = [
  'in:anywhere newer_than:12m {from:hire.lever.co from:greenhouse-mail.io from:ashbyhq.com from:smartrecruiters.com from:talent.icims.com from:myworkday.com from:greenhouse.io from:lever.co from:workday.com}',
  'in:anywhere newer_than:12m -category:promotions -category:social {"thank you for applying" "received your application" "your application" "application status" "application for" "interview invitation" "schedule interview" "your interview" "online assessment" "coding challenge" hackerrank codesignal "offer letter" "job offer" "employment offer" "not moving forward" "not selected" "talent acquisition"}',
];

const TRUSTED_RECRUITING_DOMAINS = [
  'hire.lever.co',
  'greenhouse-mail.io',
  'greenhouse.io',
  'ashbyhq.com',
  'smartrecruiters.com',
  'talent.icims.com',
  'icims.com',
  'myworkday.com',
  'workday.com',
  'lever.co',
  'workablemail.com',
  'jobvite.com',
  'bamboohr.com',
];

const GENERIC_SENDER_NAMES = new Set([
  'recruiting',
  'recruiter',
  'talent',
  'careers',
  'jobs',
  'notifications',
  'no reply',
  'noreply',
  'no-reply',
  'candidate experience',
  'human resources',
  'marketing',
  'email',
  'mailer',
  'newsletter',
  'news',
  'updates',
  'customer service',
]);

const PERSONAL_HIRING_CONTEXT_PATTERNS = [
  /\bthank you for applying\b/i,
  /\b(?:we|i|our team)\s+(?:have\s+)?received your application\b/i,
  /\byour application (?:for|to|with|has|was|is|status|update|received|submitted)\b/i,
  /\bapplication status\b/i,
  /\bapplication (?:for|to|with)\b/i,
  /\b(?:job|employment) offer\b/i,
  /\boffer letter\b/i,
  /\bextend(?:ing)? (?:you )?an offer\b/i,
  /\binterview schedul(?:e|ing|ed)\b/i,
  /\binterview (?:invitation|schedule|scheduled|with|for|availability)\b/i,
  /\byour interview\b/i,
  /\bschedule (?:an? |your |the )?(?:interview|call|phone screen)\b/i,
  /\bself-schedule\b/i,
  /\bphone screen\b/i,
  /\btechnical screen\b/i,
  /\bonline assessment\b/i,
  /\bcoding challenge\b/i,
  /\bhackerrank\b/i,
  /\bcodesignal\b/i,
  /\bnot moving forward\b/i,
  /\bwill not be moving forward\b/i,
  /\bnot selected\b/i,
  /\bdecided not to proceed\b/i,
  /\bposition has been filled\b/i,
  /\btalent acquisition\b/i,
  /\bhiring team\b/i,
  /\bwould like to (?:speak|schedule|connect)\b/i,
  /\bnext steps? (?:for|in)\b/i,
];

const APPLICATION_RECEIPT_PATTERNS = [
  /\bthank you for applying\b/i,
  /\bthanks for applying\b/i,
  /\breceived your application\b/i,
  /\bwe have received your application\b/i,
  /\byour application has been received\b/i,
  /\bsubmitted your application\b/i,
];

const APPLICATION_REVIEW_ONLY_PATTERNS = [
  /\bcurrently reviewing\b/i,
  /\bwill be reviewed\b/i,
  /\bwill review\b/i,
  /\breviewing (?:all|your|resumes|applications|your background)\b/i,
  /\bwill evaluate\b/i,
  /\bcarefully evaluate\b/i,
  /\bif your application (?:seems|is|looks)\b/i,
  /\bif (?:we|our team) (?:believe|find|determine)\b/i,
  /\bwe will contact you\b/i,
  /\bwe will be in touch\b/i,
  /\bwe will reach out\b/i,
];

const APPLICATION_OWNED_CONTEXT_PATTERNS = [
  /\bthank you for applying\b/i,
  /\b(?:we|i|our team)\s+(?:have\s+)?received your application\b/i,
  /\byour application (?:for|to|with|has|was|is|status|update|received|submitted)\b/i,
  /\bapplication status\b/i,
  /\bapplication (?:for|to|with)\b/i,
  /\b(?:job|employment) offer\b/i,
  /\boffer letter\b/i,
  /\bextend(?:ing)? (?:you )?an offer\b/i,
  /\binterview invitation\b/i,
  /\byour interview\b/i,
  /\binterview is scheduled\b/i,
  /\bmeeting is scheduled\b/i,
  /\bonline assessment\b/i,
  /\bcoding challenge\b/i,
  /\bhackerrank\b/i,
  /\bcodesignal\b/i,
  /\bnot moving forward\b/i,
  /\bwill not be moving forward\b/i,
  /\bnot selected\b/i,
  /\bdecided not to proceed\b/i,
  /\bposition has been filled\b/i,
];

const DIRECT_SIGNAL_CONTEXT_PATTERNS = [
  /\bthank you for applying\b/i,
  /\breceived your application\b/i,
  /\byour application (?:has|was|is|status|update|received|submitted)\b/i,
  /\bapplication status\b/i,
  /\binterview invitation\b/i,
  /\byour interview\b/i,
  /\binterview is scheduled\b/i,
  /\bmeeting is scheduled\b/i,
  /\bonline assessment\b/i,
  /\bcoding challenge\b/i,
  /\boffer letter\b/i,
  /\b(?:job|employment) offer\b/i,
  /\bnot moving forward\b/i,
  /\bnot selected\b/i,
  /\bdecided not to proceed\b/i,
];

const WEAK_HIRING_CONTEXT_PATTERNS = [
  /\b(?:candidate|recruiter|recruiting|careers?|hiring|position|role|job|opening|applicant)\b/i,
  /\b(?:software|data|machine learning|ai|backend|frontend|full stack|platform|systems?) engineer\b/i,
];

const NEWSLETTER_NOISE_PATTERNS = [
  /\btalent community\b/i,
  /\bcareer opportunities\b/i,
  /\bupdates from\b/i,
  /\bemail banner\b/i,
  /\bweekly roundup\b/i,
  /\bmorning coffees?\b/i,
  /\bsunday ['’]?spresso\b/i,
];

const MARKETING_NOISE_PATTERNS = [
  /\bview in browser\b/i,
  /\bunsubscribe\b/i,
  /\b(?:sale|discount|coupon|promo|promotion|deal|savings|shop now|book today)\b/i,
  /\b\d+%\s*off\b/i,
  /\b(?:cash back|bonus points|credit card|account activity|rewards?)\b/i,
  /\b(?:member exclusive|exclusive offer|offer ends|final hours|last call)\b/i,
  /\b(?:daily digest|weekly digest|newsletter)\b/i,
  /\br\/[a-z0-9_]+\b/i,
  /\b(?:usage alert|billing cycle|rent|payment|statement|order)\b/i,
];

function usage() {
  return `career-ops Gmail OAuth scanner

Usage:
  bun run gmail:auth
  bun run gmail:scan [--max-messages 250] [--query "..."] [--dry-run]
  node scripts/gmail-oauth-refresh.mjs auth
  node scripts/gmail-oauth-refresh.mjs scan

Setup:
  1. Create a Google Cloud OAuth client with Application type "Desktop app".
  2. Save the downloaded client JSON to config/gmail-oauth-credentials.json.
  3. Run bun run gmail:auth and approve gmail.readonly access.

The scanner writes derived hiring facts to data/gmail-signals.jsonl.
`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    command: 'scan',
    dryRun: false,
    maxMessages: 250,
    queries: [],
  };

  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) {
    args.command = rest.shift();
  }

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') args.command = 'help';
    else if (arg === '--max-messages') args.maxMessages = Number.parseInt(rest[++i] || '', 10);
    else if (arg.startsWith('--max-messages=')) args.maxMessages = Number.parseInt(arg.slice('--max-messages='.length), 10);
    else if (arg === '--query') args.queries.push(rest[++i] || '');
    else if (arg.startsWith('--query=')) args.queries.push(arg.slice('--query='.length));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isFinite(args.maxMessages) || args.maxMessages <= 0) {
    throw new Error('--max-messages must be a positive number');
  }
  args.queries = args.queries.map((q) => q.trim()).filter(Boolean);
  return args;
}

function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writePrivateJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on filesystems that support POSIX permissions.
  }
}

function setupRequired(message) {
  const error = new Error(message);
  error.setupRequired = true;
  return error;
}

export function readOAuthClient(path = CREDENTIALS_PATH) {
  const raw = readJson(path);
  if (!raw) {
    throw setupRequired(
      `Missing ${path}. Save a Google OAuth Desktop client JSON there, then run bun run gmail:auth.`
    );
  }
  if (raw.web && !raw.installed) {
    throw setupRequired(
      `Invalid OAuth client in ${path}: found a Web application client. Create an OAuth client with Application type "Desktop app", download that JSON, replace this file, then run bun run gmail:auth again.`
    );
  }
  const client = raw.installed || raw;
  if (!client.client_id) throw new Error('OAuth credentials are missing client_id');
  return {
    clientId: client.client_id,
    clientSecret: client.client_secret || '',
  };
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function makeCodeVerifier() {
  return base64Url(randomBytes(64)).slice(0, 128);
}

function makeCodeChallenge(verifier) {
  return base64Url(createHash('sha256').update(verifier).digest());
}

async function postForm(url, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(json.error_description || json.error || `HTTP ${response.status}`);
  }
  return json;
}

export function isGmailApiSetupError(message = '') {
  return /gmail api has not been used|gmail api.*disabled/i.test(message);
}

export function parseOAuthCallback(reqUrl, redirectUri, expectedState) {
  const requestUrl = new URL(reqUrl || '/', redirectUri);
  if (requestUrl.pathname !== '/oauth2callback') return { status: 'not_found' };

  const state = requestUrl.searchParams.get('state');
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  if (!state && !code && !error) return { status: 'waiting' };
  if (state !== expectedState) return { status: 'state_mismatch' };
  if (error) return { status: 'error', error };
  if (!code) return { status: 'missing_code' };
  return { status: 'success', code };
}

async function runAuth() {
  const client = readOAuthClient();
  mkdirSync(CONFIG_DIR, { recursive: true });

  const server = createServer();
  const port = await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePort(server.address().port));
  });

  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const state = base64Url(randomBytes(32));
  const verifier = makeCodeVerifier();
  const challenge = makeCodeChallenge(verifier);
  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', client.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GMAIL_READONLY_SCOPE);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  console.log('Open this URL in your browser and approve Gmail readonly access:');
  console.log(authUrl.toString());
  console.log(`\nWaiting for OAuth callback on ${redirectUri}`);

  const code = await new Promise((resolveCode, reject) => {
    server.on('request', (req, res) => {
      const callback = parseOAuthCallback(req.url, redirectUri, state);
      if (callback.status === 'not_found') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      if (callback.status === 'waiting') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end('<p>Waiting for Google OAuth redirect. Return to the terminal and use the printed Google URL.</p>');
        return;
      }
      if (callback.status === 'state_mismatch') {
        res.writeHead(400);
        res.end('State mismatch. Return to the terminal and retry.');
        reject(new Error('OAuth state mismatch'));
        return;
      }
      if (callback.status === 'error') {
        res.writeHead(400);
        res.end('Authorization was not completed.');
        reject(new Error(callback.error));
        return;
      }
      if (callback.status === 'missing_code') {
        res.writeHead(400);
        res.end('OAuth callback did not include a code.');
        reject(new Error('OAuth callback did not include a code'));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<p>Gmail authorization complete. You can close this tab and return to Career-Ops.</p>');
      resolveCode(callback.code);
    });
  }).finally(() => server.close());

  if (!code) throw new Error('OAuth callback did not include a code');
  const token = await postForm(TOKEN_ENDPOINT, {
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    code,
    code_verifier: verifier,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });

  writePrivateJson(TOKEN_PATH, {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    scope: token.scope || GMAIL_READONLY_SCOPE,
    token_type: token.token_type || 'Bearer',
    expiry_date: Date.now() + (Number(token.expires_in || 3600) * 1000),
    created_at: new Date().toISOString(),
  });
  console.log(`Saved Gmail OAuth token to ${TOKEN_PATH}`);
}

function readToken() {
  const token = readJson(TOKEN_PATH);
  if (!token?.refresh_token) {
    throw setupRequired(
      `Missing Gmail OAuth token. Run bun run gmail:auth first; token path: ${TOKEN_PATH}`
    );
  }
  return token;
}

async function refreshAccessToken(client, token) {
  if (token.access_token && Number(token.expiry_date || 0) > Date.now() + 60_000) {
    return token;
  }

  const refreshed = await postForm(TOKEN_ENDPOINT, {
    client_id: client.clientId,
    ...(client.clientSecret ? { client_secret: client.clientSecret } : {}),
    refresh_token: token.refresh_token,
    grant_type: 'refresh_token',
  });

  const nextToken = {
    ...token,
    access_token: refreshed.access_token,
    scope: refreshed.scope || token.scope || GMAIL_READONLY_SCOPE,
    token_type: refreshed.token_type || token.token_type || 'Bearer',
    expiry_date: Date.now() + (Number(refreshed.expires_in || 3600) * 1000),
    refreshed_at: new Date().toISOString(),
  };
  writePrivateJson(TOKEN_PATH, nextToken);
  return nextToken;
}

async function gmailFetch(path, token, params = {}) {
  const url = new URL(`${GMAIL_API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
    else url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = json.error?.message || json.error || `Gmail API HTTP ${response.status}`;
    if (isGmailApiSetupError(message)) {
      throw setupRequired(`${message}\nEnable Gmail API for the same Google Cloud project as config/gmail-oauth-credentials.json, then retry bun run gmail:scan.`);
    }
    throw new Error(message);
  }
  return json;
}

async function listMessages(query, token, maxMessages) {
  const messages = [];
  let pageToken = '';
  while (messages.length < maxMessages) {
    const page = await gmailFetch('/messages', token, {
      q: query,
      maxResults: Math.min(100, maxMessages - messages.length),
      pageToken,
    });
    messages.push(...(page.messages || []));
    pageToken = page.nextPageToken || '';
    if (!pageToken) break;
  }
  return messages;
}

async function getMessage(messageId, token) {
  return gmailFetch(`/messages/${encodeURIComponent(messageId)}`, token, {
    format: 'full',
    metadataHeaders: ['From', 'To', 'Subject', 'Date'],
  });
}

function decodeBase64Url(value = '') {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function stripHtml(html = '') {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function collectTextParts(part, out = []) {
  if (!part) return out;
  const mime = part.mimeType || '';
  const data = part.body?.data;
  if (data && (mime === 'text/plain' || mime === 'text/html')) {
    const decoded = decodeBase64Url(data);
    out.push(mime === 'text/html' ? stripHtml(decoded) : decoded);
  }
  for (const child of part.parts || []) collectTextParts(child, out);
  return out;
}

function compactText(text = '', max = 420) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trim()}...` : clean;
}

function headersFor(message) {
  const headers = {};
  for (const h of message.payload?.headers || []) {
    headers[h.name.toLowerCase()] = h.value;
  }
  return headers;
}

function parseEmail(raw = '') {
  const match = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: raw.replace(/<[^>]+>/g, '').trim(), email: raw.includes('@') ? raw.trim() : '' };
}

function emailDomain(email = '') {
  return (email.split('@')[1] || '').trim().toLowerCase();
}

function hasAnyPattern(patterns, text = '') {
  return patterns.some((pattern) => pattern.test(text));
}

function isTrustedRecruitingSender(from = {}) {
  const domain = emailDomain(from.email || '');
  if (domain && TRUSTED_RECRUITING_DOMAINS.some((trusted) => domain === trusted || domain.endsWith(`.${trusted}`))) {
    return true;
  }
  return /\b(recruiting|talent acquisition|candidate experience|careers)\b/i.test(`${from.name || ''} ${from.email || ''}`);
}

function hasPersonalHiringContext(text = '') {
  return hasAnyPattern(PERSONAL_HIRING_CONTEXT_PATTERNS, text);
}

function hasApplicationOwnedContext(text = '') {
  return hasAnyPattern(APPLICATION_OWNED_CONTEXT_PATTERNS, text);
}

function hasDirectSignalContext(text = '') {
  return hasAnyPattern(DIRECT_SIGNAL_CONTEXT_PATTERNS, text);
}

function isApplicationReviewOnly(text = '') {
  return hasAnyPattern(APPLICATION_RECEIPT_PATTERNS, text) &&
    hasAnyPattern(APPLICATION_REVIEW_ONLY_PATTERNS, text);
}

function hasWeakHiringContext(text = '') {
  return hasAnyPattern(WEAK_HIRING_CONTEXT_PATTERNS, text);
}

function isLikelyMailboxNoise({ text = '', from = {} } = {}) {
  if (hasAnyPattern(NEWSLETTER_NOISE_PATTERNS, text) && !hasDirectSignalContext(text)) return true;
  if (isTrustedRecruitingSender(from)) return false;
  return hasAnyPattern(MARKETING_NOISE_PATTERNS, text) && !hasApplicationOwnedContext(text);
}

function titleCase(value = '') {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.length <= 3 && word === word.toUpperCase()
      ? word
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function domainCompany(email = '') {
  const domain = emailDomain(email);
  const root = domain.split('.').filter(Boolean)[0] || '';
  if (!root || ['gmail', 'google', 'greenhouse-mail', 'hire', 'lever', 'ashbyhq', 'myworkday', 'smartrecruiters', 'icims'].includes(root)) {
    return '';
  }
  return titleCase(root.replace(/[-_]+/g, ' '));
}

function senderNameCompany(name = '') {
  const cleanedName = name.trim();
  if (!cleanedName || GENERIC_SENDER_NAMES.has(cleanedName.toLowerCase())) return '';
  return cleanCompany(firstPattern([
    /\bfrom\s+([A-Z][A-Za-z0-9&' -]{2,70})$/i,
    /\bat\s+([A-Z][A-Za-z0-9&' -]{2,70})$/i,
  ], cleanedName)) || '';
}

function cleanCompany(value = '') {
  return value
    .replace(/^(the\s+)?/i, '')
    .replace(/^(?:an?\s+)?unattended mailbox\b.*$/i, '')
    .replace(/\s+(team|careers|recruiting|talent|inc\.?|llc|corp\.?)$/i, '')
    .replace(/[.,:;]+$/g, '')
    .trim();
}

function cleanRole(value = '') {
  return value
    .replace(/\s+(position|role|job|opening)$/i, '')
    .replace(/[.,:;]+$/g, '')
    .trim();
}

function firstPattern(patterns, text) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function isGenericCompany(value = '') {
  return !value ||
    /^(jobvite|ats|greenhouse|workday|myworkday|rippling|unknown company)$/i.test(value) ||
    /^(?:an?\s+)?unattended mailbox\b/i.test(value) ||
    /\b(position|role|job|opening)\s+at\b/i.test(value);
}

function isGenericRole(value = '') {
  return !value ||
    value.length > 90 ||
    /\b(application has been received|your application seems|we will contact you|requirements of the|needs of the team|role\. in the meantime|world who help|first 90 days)\b/i.test(value);
}

export function classifyEvent({ subject = '', text = '', from = {} }) {
  const haystack = `${subject}\n${text}`;
  const lower = haystack.toLowerCase();
  const trustedSender = isTrustedRecruitingSender(from);
  const personalHiringContext = hasPersonalHiringContext(haystack);
  const weakHiringContext = hasWeakHiringContext(haystack);
  const hiringContext = personalHiringContext || (trustedSender && weakHiringContext);

  if (hasAnyPattern(NEWSLETTER_NOISE_PATTERNS, subject) && !hasDirectSignalContext(subject)) return '';
  if (!hiringContext || isLikelyMailboxNoise({ text: haystack, from })) return '';

  if (/\b(offer letter|job offer|employment offer|extend(?:ing)? (?:you )?an offer|offer for (?:the )?(?:position|role|job|opening))\b/.test(lower)) {
    return 'offer';
  }
  if (/\b(unfortunately|not moving forward|will not be moving forward|not selected|decided not to proceed|filled the position|closed the role|position has been filled)\b/.test(lower)) {
    return 'rejected';
  }
  if (isApplicationReviewOnly(haystack)) {
    return 'applied';
  }
  if (/\b(interview invitation|your interview|interview schedul(?:e|ing|ed)|interview is scheduled|meeting is scheduled|self-schedule|schedule (?:an? |your |the )?(?:interview|call|phone screen)|google meet|exploratory call|phone screen|onsite|technical screen)\b/.test(lower)) {
    return 'interview';
  }
  if (/\b(online assessment|coding challenge|hackerrank|codesignal|oa\b|complete your test|assessment for (?:the )?(?:position|role|job))\b/.test(lower)) {
    return 'online_assessment';
  }
  if (/\b(action required|please complete|deadline|due by|requires your attention)\b/.test(lower)) {
    return 'action_required';
  }
  if (/\b(received your application|thank you for applying|application received|we received your application|submitted your application)\b/.test(lower)) {
    return 'applied';
  }
  if (/\bapplication status\b/.test(lower)) {
    return 'responded';
  }
  if (/\b(talent acquisition|next step|invite you|would like to speak|would like to schedule|would like to connect)\b/.test(lower)) {
    return 'responded';
  }
  return '';
}

export function extractSignalFromMessage(message) {
  const headers = headersFor(message);
  const from = parseEmail(headers.from || '');
  const subject = headers.subject || '';
  const bodyText = compactText(collectTextParts(message.payload).join('\n'), 4000);
  const searchText = `${subject}\n${bodyText}`;
  const eventType = classifyEvent({ subject, text: bodyText, from });
  if (!eventType) return null;

  const companyCandidates = [
    cleanCompany(firstPattern([
      /application for\s+.+?\s+at\s+([A-Z][A-Za-z0-9&' -]{2,90}?)(?:\.|,|!|\n|\s{2,}|$)/i,
      /(?:thank you|thanks) for applying to\s+([A-Z][A-Za-z0-9&' -]{2,90}?)(?:\.|,|!|\||\n|\s{2,}|$)/i,
      /interest in\s+(?:a career with|joining)?\s*([A-Z][A-Za-z0-9&' -]{2,90}?)(?:\.|,|!|\n|\s{2,}|$)/i,
      /(?:position|role|job|opening|interview)\s+(?:at|with)\s+([A-Z][A-Za-z0-9&' -]{2,90}?)(?:\.|,|!|\n|\s{2,}|$)/i,
      /-\s*([A-Z][A-Za-z0-9&' -]{2,90}?)(?:\.|,|!|\n|\s{2,}|$)/i,
    ], searchText)),
    cleanCompany(firstPattern([
    /applying to\s+(?:the\s+)?(?:.+?)\s+at\s+([A-Z][A-Za-z0-9&' -]{2,70}?)(?:\.|,|\n|\s{2,}|$)/i,
    /application (?:to|with)\s+([A-Z][A-Za-z0-9&' -]{2,70}?)(?:\.|,|\n|\s{2,}|$)/i,
    /career opportunities at\s+([A-Z][A-Za-z0-9&' -]{2,70}?)(?:\.|,|\n|\s{2,}|$)/i,
    /from\s+([A-Z][A-Za-z0-9&' -]{2,70}?)(?:\.|,|\n|\s{2,}|$)/i,
    ], searchText)),
    domainCompany(from.email),
    senderNameCompany(from.name),
  ].filter((candidate) => !isGenericCompany(candidate));
  const company = companyCandidates[0] || '';

  const roleCandidates = [
    cleanRole(firstPattern([
      /application for\s+(?:our\s+)?([A-Z][A-Za-z0-9,&/()' .+-]{3,90}?)\s+at\s+[A-Z]/i,
      /(?:our|the)\s+([A-Z][A-Za-z0-9,&/()' .+-]{3,90}?)\s+(?:position|role|job|opening)/i,
      /(?:the|for the)\s+([A-Z][A-Za-z0-9,&/()' .+-]{3,90})\s+(?:position|role|job|opening)/i,
      /application for\s+([A-Z][A-Za-z0-9,&/()' .+-]{3,90})/i,
      /applying to\s+(?:the\s+)?([A-Z][A-Za-z0-9,&/()' .+-]{3,90})\s+at\s+/i,
    ], searchText)),
  ].filter((candidate) => !isGenericRole(candidate));
  const extractedRole = roleCandidates[0] || '';
  const role = extractedRole || 'Unknown Role';

  const genericName = GENERIC_SENDER_NAMES.has(from.name.toLowerCase());
  const recentContact = !genericName && from.name ? from.name : domainCompany(from.email) || 'no reply';
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : headers.date
      ? new Date(headers.date).toISOString()
      : new Date().toISOString();

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
    summary: compactText(message.snippet || bodyText, 220),
    snippet: compactText(message.snippet || bodyText, 220),
    messageId: message.id,
    threadId: message.threadId,
    confidence: company ? 0.78 : 0.52,
  };
}

export function parseGmailSignals(filePath = SIGNALS_PATH) {
  if (!existsSync(filePath)) return [];
  const rows = [];
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    try {
      rows.push(JSON.parse(text));
    } catch {
      // Keep the scanner tolerant; dashboard parser reports malformed lines.
    }
  }
  return rows;
}

function signalKey(signal) {
  return signal.id ||
    (signal.messageId && signal.eventType ? `${signal.messageId}:${signal.eventType}` : '') ||
    [signal.company, signal.role, signal.eventType, signal.eventDate].map((v) => String(v || '').toLowerCase()).join('|');
}

function normalizeEventType(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'oa') return 'online_assessment';
  if (normalized === 'rejection') return 'rejected';
  return normalized;
}

export function isValidStoredSignal(signal = {}) {
  const expectedEvent = normalizeEventType(signal.eventType || signal.type || signal.status || '');
  if (!expectedEvent) return false;
  if (isGenericCompany(signal.company || '') || isGenericRole(signal.role || '')) return false;
  const from = parseEmail(signal.sender || signal.from || '');
  const subject = signal.subject || '';
  const text = [
    signal.summary,
    signal.snippet,
    signal.recommendedAction,
    signal.action,
  ].filter(Boolean).join('\n');
  const actualEvent = normalizeEventType(classifyEvent({ subject, text, from }));
  return Boolean(actualEvent) && actualEvent === expectedEvent;
}

export function mergeSignals(existing, next) {
  const byKey = new Map();
  for (const signal of existing) {
    if (isValidStoredSignal(signal)) byKey.set(signalKey(signal), signal);
  }
  for (const signal of next) byKey.set(signalKey(signal), { ...byKey.get(signalKey(signal)), ...signal });
  return [...byKey.values()].sort((a, b) => String(b.receivedAt || b.eventDate || '').localeCompare(String(a.receivedAt || a.eventDate || '')));
}

function writeSignals(signals, filePath = SIGNALS_PATH) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${signals.map((signal) => JSON.stringify(signal)).join('\n')}\n`);
}

async function runScan(options) {
  const client = readOAuthClient();
  const token = await refreshAccessToken(client, readToken());
  const queries = options.queries.length ? options.queries : DEFAULT_QUERIES;
  const seen = new Set();
  const signals = [];

  for (const query of queries) {
    const messages = await listMessages(query, token, options.maxMessages);
    for (const item of messages) {
      if (!item.id || seen.has(item.id)) continue;
      seen.add(item.id);
      const message = await getMessage(item.id, token);
      const signal = extractSignalFromMessage(message);
      if (signal) signals.push(signal);
    }
  }

  const existingSignals = parseGmailSignals();
  const retainedExistingCount = existingSignals.filter(isValidStoredSignal).length;
  const merged = mergeSignals(existingSignals, signals);
  if (!options.dryRun) writeSignals(merged);

  console.log(`[gmail-oauth] scanned ${seen.size} messages`);
  console.log(`[gmail-oauth] extracted ${signals.length} signals`);
  console.log(`[gmail-oauth] retained ${retainedExistingCount}/${existingSignals.length} existing signals after strict validation`);
  console.log(`[gmail-oauth] ${options.dryRun ? 'would write' : 'wrote'} ${merged.length} total signals to ${SIGNALS_PATH}`);
  if (existsSync(SIGNALS_PATH)) {
    console.log(`[gmail-oauth] current signal file mtime ${statSync(SIGNALS_PATH).mtime.toISOString()}`);
  }
}

async function main() {
  let args;
  try {
    args = parseArgs();
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  try {
    if (args.command === 'help') console.log(usage());
    else if (args.command === 'auth') await runAuth();
    else if (args.command === 'scan') await runScan(args);
    else throw new Error(`Unknown command: ${args.command}`);
  } catch (error) {
    console.error(`[gmail-oauth] ${error.message}`);
    process.exitCode = error.setupRequired ? SETUP_REQUIRED_EXIT : 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await main();
}
