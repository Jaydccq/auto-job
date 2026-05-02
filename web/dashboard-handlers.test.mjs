// Tests for updateApplicationsMarkdownStatus — Phase 3d of
// docs/exec-plans/active/2026-05-02-job-dedup-fix.md.
//
// Run: node --test web/dashboard-handlers.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { updateApplicationsMarkdownStatus } from './dashboard-handlers.mjs';

const HEADER = [
  '# Career-Ops Applications Tracker',
  '',
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|------|---------|------|-------|--------|-----|--------|-------|',
].join('\n');

function row({ num, company = 'Qualcomm', role = 'Machine Learning Engineer - College Graduate', score = '4.3/5', status = 'Evaluated', report = 588, notes = 'note' }) {
  return `| ${num} | 2026-05-02 | ${company} | ${role} | ${score} | ${status} | ❌ | [${report}](reports/${report}-foo-2026-05-02.md) | ${notes} |`;
}

function build(rows) {
  return [HEADER, ...rows, ''].join('\n');
}

function statusOf(markdown, num) {
  const line = markdown.split('\n').find((l) => l.startsWith(`| ${num} `));
  if (!line) return null;
  return line.split('|')[6].trim();
}

describe('updateApplicationsMarkdownStatus — duplicate report-number co-promotion', () => {
  it('flips both rows when their report cells share the same [N]', () => {
    const md = build([
      row({ num: 587, report: 588 }),
      row({ num: 588, report: 588 }),
    ]);

    const result = updateApplicationsMarkdownStatus(md, 587, true);

    assert.equal(result.changed, true);
    assert.equal(result.status, 'Applied');
    assert.deepEqual(result.mutatedNums.sort((a, b) => a - b), [587, 588]);
    assert.equal(statusOf(result.markdown, 587), 'Applied');
    assert.equal(statusOf(result.markdown, 588), 'Applied');
  });

  it('only flips the matched row when no sibling shares the report number', () => {
    const md = build([
      row({ num: 600, report: 600 }),
      row({ num: 601, company: 'Acme', role: 'Software Engineer', report: 601 }),
    ]);

    const result = updateApplicationsMarkdownStatus(md, 600, true);

    assert.equal(result.changed, true);
    assert.deepEqual(result.mutatedNums, [600]);
    assert.equal(statusOf(result.markdown, 600), 'Applied');
    assert.equal(statusOf(result.markdown, 601), 'Evaluated');
  });

  it('does NOT co-promote same-company rows with overlapping titles but different report numbers (Codex regression)', () => {
    const md = build([
      row({ num: 700, company: 'Acme', role: 'Software Engineer I', report: 700 }),
      row({ num: 701, company: 'Acme', role: 'Software Engineer II', report: 701 }),
    ]);

    const result = updateApplicationsMarkdownStatus(md, 700, true);

    assert.equal(result.changed, true);
    assert.deepEqual(result.mutatedNums, [700]);
    assert.equal(statusOf(result.markdown, 700), 'Applied');
    assert.equal(statusOf(result.markdown, 701), 'Evaluated');
  });

  it('un-marking applied=false reverts both sibling rows from Applied to Evaluated', () => {
    const md = build([
      row({ num: 587, report: 588, status: 'Applied' }),
      row({ num: 588, report: 588, status: 'Applied' }),
    ]);

    const result = updateApplicationsMarkdownStatus(md, 587, false);

    assert.equal(result.changed, true);
    assert.equal(result.status, 'Evaluated');
    assert.deepEqual(result.mutatedNums.sort((a, b) => a - b), [587, 588]);
    assert.equal(statusOf(result.markdown, 587), 'Evaluated');
    assert.equal(statusOf(result.markdown, 588), 'Evaluated');
  });

  it('preserves a more-advanced terminal status on a sibling when marking applied=true', () => {
    // Sibling already at Interview must NOT get downgraded to Applied.
    const md = build([
      row({ num: 800, report: 800, status: 'Evaluated' }),
      row({ num: 801, report: 800, status: 'Interview' }),
    ]);

    const result = updateApplicationsMarkdownStatus(md, 800, true);

    assert.equal(result.changed, true);
    assert.equal(result.status, 'Applied');
    assert.deepEqual(result.mutatedNums, [800]);
    assert.equal(statusOf(result.markdown, 800), 'Applied');
    assert.equal(statusOf(result.markdown, 801), 'Interview');
  });

  it('throws ClientError-style 404 when the row is not found', () => {
    const md = build([row({ num: 587, report: 588 })]);

    assert.throws(
      () => updateApplicationsMarkdownStatus(md, 9999, true),
      (err) => {
        assert.match(err.message, /9999.*not found/);
        assert.equal(err.status, 404);
        return true;
      },
    );
  });

  it('throws when num is invalid', () => {
    const md = build([row({ num: 587, report: 588 })]);
    assert.throws(() => updateApplicationsMarkdownStatus(md, 'abc', true), /num is required/);
  });

  it('throws when applied is not boolean', () => {
    const md = build([row({ num: 587, report: 588 })]);
    assert.throws(() => updateApplicationsMarkdownStatus(md, 587, 'yes'), /applied must be boolean/);
  });

  it('returns mutatedNums:[] (and changed:false) when status already matches', () => {
    const md = build([row({ num: 587, report: 588, status: 'Applied' })]);
    const result = updateApplicationsMarkdownStatus(md, 587, true);
    assert.equal(result.changed, false);
    assert.deepEqual(result.mutatedNums, []);
    assert.equal(result.status, 'Applied');
  });
});
