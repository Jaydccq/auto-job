#!/usr/bin/env node

// Re-derives `company` for stored Gmail signal rows whose company is missing or junk
// (`Unknown Company`, `this time`, broken-prose strings). Re-runs the same extractor
// helpers (`companyFromExplicitSubject`, `companyFromAtsSenderName`,
// `companyFromExplicitBody`, `inferAtsTenantCompany`, plus weak fallbacks) over the
// stored sender/subject/summary so existing rows benefit from the new attribution logic
// without re-fetching Gmail.
//
// Usage:
//   node scripts/backfill-unknown-company.mjs                   # rewrite in place
//   node scripts/backfill-unknown-company.mjs --dry-run         # report only
//   node scripts/backfill-unknown-company.mjs --path ./data/gmail-signals.jsonl

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  companyFromAtsSenderName,
  companyFromDisplayName,
  companyFromExplicitSubject,
  companyFromExplicitBody,
  inferAtsTenantCompany,
  isGenericCompany,
} from './gmail-oauth-refresh.mjs';

const DEFAULT_SIGNALS_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'gmail-signals.jsonl'
);

function parseEmail(raw = '') {
  const match = String(raw || '').match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  const text = String(raw || '');
  return {
    name: text.replace(/<[^>]+>/g, '').trim(),
    email: text.includes('@') ? text.trim() : '',
  };
}

function deriveCompany(row) {
  const from = parseEmail(row.sender || row.from || '');
  const subject = String(row.subject || '');
  const body = String(row.summary || row.snippet || '');
  const candidates = [
    companyFromExplicitSubject(subject),
    companyFromAtsSenderName(from),
    companyFromExplicitBody(body),
    inferAtsTenantCompany(from),
    companyFromDisplayName(from),
  ].filter(Boolean).filter((c) => !isGenericCompany(c) && !/[@<>]/.test(c));
  return candidates[0] || '';
}

// Same generic-company gate as the live extractor, plus the legacy garbage values that
// landed in the file before this fix existed.
const KNOWN_BAD_COMPANY_VALUES = new Set([
  '',
  'unknown company',
  'this time',
  'an ideal fit',
]);

function isBrokenCompany(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return true;
  if (KNOWN_BAD_COMPANY_VALUES.has(normalized)) return true;
  if (isGenericCompany(value)) return true;
  if (/[@<>]/.test(value)) return true;
  return false;
}

export function backfillUnknownCompany({ path, dryRun = false, auditPath = null } = {}) {
  const target = path || DEFAULT_SIGNALS_PATH;
  const result = {
    path: target,
    dryRun,
    totalRows: 0,
    rewritten: 0,
    skippedAlreadyKnown: 0,
    skippedUnrecoverable: 0,
    unrecoverable: [],
    rewrites: [],
  };
  if (!existsSync(target)) return result;

  const lines = readFileSync(target, 'utf8').split('\n');
  const outLines = [];
  const auditEntries = [];

  for (const line of lines) {
    const text = line.trim();
    if (!text) {
      outLines.push(line);
      continue;
    }
    if (text.startsWith('#')) {
      outLines.push(line);
      continue;
    }
    let row;
    try {
      row = JSON.parse(text);
    } catch {
      outLines.push(line); // preserve malformed rows verbatim
      continue;
    }
    result.totalRows += 1;
    const oldCompany = row.company;
    if (!isBrokenCompany(oldCompany)) {
      result.skippedAlreadyKnown += 1;
      outLines.push(JSON.stringify(row));
      continue;
    }
    const newCompany = deriveCompany(row);
    if (!newCompany) {
      result.skippedUnrecoverable += 1;
      result.unrecoverable.push({
        messageId: row.messageId || row.id,
        sender: row.sender,
        subject: row.subject,
        reason: 'no candidate from subject/sender/body/tenant',
      });
      outLines.push(JSON.stringify(row));
      continue;
    }
    const updated = { ...row, company: newCompany };
    result.rewritten += 1;
    result.rewrites.push({
      messageId: row.messageId || row.id,
      oldCompany,
      newCompany,
      sender: row.sender,
      subject: row.subject,
    });
    auditEntries.push({
      messageId: row.messageId || row.id,
      threadId: row.threadId,
      oldCompany,
      newCompany,
      sender: row.sender,
      subject: row.subject,
      timestamp: new Date().toISOString(),
    });
    outLines.push(JSON.stringify(updated));
  }

  if (!dryRun) {
    if (result.rewritten > 0) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, outLines.join('\n').replace(/\n*$/, '\n'));
    }
    if (auditPath && auditEntries.length > 0) {
      mkdirSync(dirname(auditPath), { recursive: true });
      const body = auditEntries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
      writeFileSync(auditPath, body);
    }
  }

  return result;
}

function formatTable(rows) {
  if (rows.length === 0) return '(none)';
  const lines = ['  message-id            old → new                                       subject'];
  for (const r of rows) {
    const id = String(r.messageId || '').padEnd(20).slice(0, 20);
    const change = `${(r.oldCompany || '∅').padEnd(22).slice(0, 22)} → ${String(r.newCompany || '').padEnd(22).slice(0, 22)}`;
    const subj = String(r.subject || '').replace(/\s+/g, ' ').slice(0, 60);
    lines.push(`  ${id}  ${change}  ${subj}`);
  }
  return lines.join('\n');
}

function isMain() {
  return import.meta.url === `file://${process.argv[1]}`;
}

if (isMain()) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const pathFlag = args.indexOf('--path');
  const path = pathFlag >= 0 ? args[pathFlag + 1] : undefined;
  const auditFlag = args.indexOf('--audit');
  const auditPath = auditFlag >= 0
    ? args[auditFlag + 1]
    : (path || DEFAULT_SIGNALS_PATH).replace(/\.jsonl$/, '.backfill-log.jsonl');

  const result = backfillUnknownCompany({ path, dryRun, auditPath });
  console.log(`backfill-unknown-company`);
  console.log(`  path:                ${result.path}`);
  console.log(`  mode:                ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`  total rows:          ${result.totalRows}`);
  console.log(`  rewritten:           ${result.rewritten}`);
  console.log(`  already known:       ${result.skippedAlreadyKnown}`);
  console.log(`  unrecoverable:       ${result.skippedUnrecoverable}`);
  console.log('');
  console.log('rewrites:');
  console.log(formatTable(result.rewrites));
  if (result.unrecoverable.length > 0) {
    console.log('');
    console.log('unrecoverable (left as Unknown Company):');
    for (const u of result.unrecoverable) {
      console.log(`  ${u.messageId}  ${String(u.sender || '').slice(0, 50)}  ${String(u.subject || '').slice(0, 60)}`);
    }
  }
  if (!dryRun && result.rewritten > 0) {
    console.log('');
    console.log(`audit log: ${auditPath}`);
    console.log(`next step: npm run dashboard:build`);
  }
}
