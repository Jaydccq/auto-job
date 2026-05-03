import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backfillUnknownCompany } from './backfill-unknown-company.mjs';

function tempJsonl(rows) {
  const dir = mkdtempSync(join(tmpdir(), 'backfill-'));
  const path = join(dir, 'gmail-signals.jsonl');
  writeFileSync(path, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return { dir, path };
}

const FIXTURE_ROWS = [
  // Recoverable: workday tenant + subject names subsidiary
  {
    id: 'a1:applied',
    company: 'Unknown Company',
    role: 'Unknown Role',
    eventType: 'applied',
    sender: '"Colleague Zone" <cvshealth@myworkday.com>',
    subject: 'Your application with Oak Street Health has been received!',
    summary: 'Dear Hongxi, Thank you for your interest in joining Oak Street Health.',
    snippet: 'Dear Hongxi, Thank you for your interest in joining Oak Street Health.',
    messageId: 'a1', threadId: 'a1', confidence: 0.52,
    receivedAt: '2026-04-13T23:51:07.000Z', eventDate: '2026-04-13', recentContact: 'Colleague Zone',
  },
  // Recoverable via tenant local-part
  {
    id: 'b1:applied',
    company: 'Unknown Company',
    role: 'Unknown Role',
    eventType: 'applied',
    sender: 'finra@myworkday.com',
    subject: 'Thank You for Applying',
    summary: 'Dear Hongxi, Thank you for applying for the position of Software Engineer.',
    snippet: 'Dear Hongxi, Thank you for applying for the position of Software Engineer.',
    messageId: 'b1', threadId: 'b1', confidence: 0.52,
    receivedAt: '2026-04-17T03:45:42.000Z', eventDate: '2026-04-17', recentContact: 'finra@myworkday.com',
  },
  // Truly unknown — self-reply with no inferable company. Must NOT be rewritten.
  {
    id: 'c1:interview',
    company: 'Unknown Company',
    role: 'Unknown Role',
    eventType: 'interview',
    sender: 'Hongxi Chen <smyhc1@gmail.com>',
    subject: 'Re: Please provide your interview availability',
    summary: 'I am available from 23rd to 29th this month, 12:00 PM to 7:00 PM EST.',
    snippet: 'I am available from 23rd to 29th this month, 12:00 PM to 7:00 PM EST.',
    messageId: 'c1', threadId: 'c1', confidence: 0.52,
    receivedAt: '2026-04-21T19:39:30.000Z', eventDate: '2026-04-21', recentContact: 'Hongxi Chen',
  },
  // Already correct — must NOT be touched.
  {
    id: 'd1:applied',
    company: 'Whatnot',
    role: 'Software Engineer, Fraud',
    eventType: 'applied',
    sender: 'Whatnot Hiring Team <no-reply@ashbyhq.com>',
    subject: '👋 Thank you for applying to Whatnot!',
    summary: 'Hongxi, Thanks so much for applying for the Software Engineer, Fraud role at Whatnot!',
    snippet: 'Hongxi, Thanks so much for applying for the Software Engineer, Fraud role at Whatnot!',
    messageId: 'd1', threadId: 'd1', confidence: 0.78,
    receivedAt: '2026-04-27T06:40:05.000Z', eventDate: '2026-04-27', recentContact: 'Whatnot Hiring Team',
  },
];

test('backfillUnknownCompany: dry-run does not write the file', () => {
  const { path } = tempJsonl(FIXTURE_ROWS);
  const before = readFileSync(path, 'utf8');
  const result = backfillUnknownCompany({ path, dryRun: true });
  const after = readFileSync(path, 'utf8');
  assert.equal(after, before, 'file must not change in dry-run mode');
  assert.equal(result.totalRows, 4);
  assert.equal(result.rewritten, 2, 'two rows should be rewritten');
  assert.equal(result.skippedAlreadyKnown, 1);
  assert.equal(result.skippedUnrecoverable, 1);
});

test('backfillUnknownCompany: actual write rewrites only Unknown Company rows', () => {
  const { path } = tempJsonl(FIXTURE_ROWS);
  const result = backfillUnknownCompany({ path, dryRun: false });
  assert.equal(result.rewritten, 2);

  const rows = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows.length, 4);
  assert.equal(rows[0].company, 'Oak Street Health');
  assert.equal(rows[1].company, 'FINRA');
  assert.equal(rows[2].company, 'Unknown Company', 'self-reply unrecoverable');
  assert.equal(rows[3].company, 'Whatnot', 'already-correct row preserved');
  // Original metadata preserved on rewritten rows.
  assert.equal(rows[0].messageId, 'a1');
  assert.equal(rows[0].receivedAt, '2026-04-13T23:51:07.000Z');
});

test('backfillUnknownCompany: idempotent — second run is a no-op', () => {
  const { path } = tempJsonl(FIXTURE_ROWS);
  backfillUnknownCompany({ path, dryRun: false });
  const second = backfillUnknownCompany({ path, dryRun: false });
  assert.equal(second.rewritten, 0);
});

test('backfillUnknownCompany: also fixes broken-prose company values like "this time"', () => {
  const { path } = tempJsonl([
    {
      id: 'e1:rejected',
      company: 'this time',
      role: 'application for the',
      eventType: 'rejected',
      sender: '"KION Group Workday" <kiongroup@myworkday.com>',
      subject: 'Dematic - Your Application for Java Software Engineer - Associate',
      summary: 'Hello Hongxi Chen, Thank you again for your application for the role of Java Software Engineer - Associate. Unfortunately we will not be moving forward.',
      snippet: 'Hello Hongxi Chen, Thank you again for your application for the role of Java Software Engineer - Associate. Unfortunately we will not be moving forward.',
      messageId: 'e1', threadId: 'e1', confidence: 0.78,
      receivedAt: '2026-04-12T22:40:29.000Z', eventDate: '2026-04-12', recentContact: 'KION Group Workday',
    },
  ]);
  const result = backfillUnknownCompany({ path, dryRun: false });
  assert.equal(result.rewritten, 1);
  const rows = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(rows[0].company, 'Dematic');
});

test('backfillUnknownCompany: writes audit log with applicationKey diff in non-dry mode', () => {
  const { path, dir } = tempJsonl(FIXTURE_ROWS);
  const auditPath = join(dir, 'gmail-signals.backfill-log.jsonl');
  backfillUnknownCompany({ path, dryRun: false, auditPath });
  assert.equal(existsSync(auditPath), true, 'audit log should be written in non-dry mode');
  const lines = readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean);
  assert.ok(lines.length >= 2, `expected at least 2 audit entries, got ${lines.length}`);
  const entry = JSON.parse(lines[0]);
  assert.ok(entry.messageId);
  assert.ok(entry.oldCompany);
  assert.ok(entry.newCompany);
});

test('backfillUnknownCompany: dry-run does not write audit log', () => {
  const { path, dir } = tempJsonl(FIXTURE_ROWS);
  const auditPath = join(dir, 'gmail-signals.backfill-log.jsonl');
  backfillUnknownCompany({ path, dryRun: true, auditPath });
  assert.equal(existsSync(auditPath), false, 'audit log must not be written in dry-run mode');
});

test('backfillUnknownCompany: returns reason for each unrecoverable row', () => {
  const { path } = tempJsonl([FIXTURE_ROWS[2]]); // self-reply only
  const result = backfillUnknownCompany({ path, dryRun: true });
  assert.equal(result.unrecoverable.length, 1);
  assert.equal(result.unrecoverable[0].messageId, 'c1');
  assert.ok(result.unrecoverable[0].reason);
});

test('backfillUnknownCompany: handles missing file gracefully', () => {
  const result = backfillUnknownCompany({ path: '/tmp/does-not-exist-' + Date.now() + '.jsonl', dryRun: true });
  assert.equal(result.totalRows, 0);
  assert.equal(result.rewritten, 0);
});
