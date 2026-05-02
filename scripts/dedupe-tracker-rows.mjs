#!/usr/bin/env node
/**
 * scripts/dedupe-tracker-rows.mjs
 *
 * One-shot repair for `data/applications.md`: collapses tracker rows that
 * share the same report number `[N]` into a single row.
 *
 * Selection rules within a duplicate group (highest-priority first wins):
 *   1. Highest score (parsed from "X.Y/5").
 *   2. Most-advanced status using STATUS_RANK.
 *
 * Critical safety: even when a different row is chosen as the survivor by
 * score, the survivor's status is bumped to the most-advanced status seen
 * across the group, so an `Applied` sibling never silently demotes to an
 * `Evaluated` survivor's status. The merge-tracker fix in Phase 3c handles
 * this on write; this script enforces the same invariant when collapsing
 * legacy duplicates.
 *
 * Default mode is dry-run. Pass `--apply` to write the trimmed file back.
 *
 *   node scripts/dedupe-tracker-rows.mjs               # dry-run (default)
 *   node scripts/dedupe-tracker-rows.mjs --apply       # actually write
 *
 * Phase 3d of docs/exec-plans/active/2026-05-02-job-dedup-fix.md.
 */

import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const trackerPath = join(repoRoot, 'data', 'applications.md');

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = !apply;

// Most-advanced wins. Mirrors dedup-tracker.mjs.
const STATUS_RANK = {
  rejected: 0,
  discarded: 0,
  skip: 1,
  evaluated: 2,
  applied: 3,
  responded: 4,
  interview: 5,
  offer: 6,
};

function parseScore(value) {
  const m = (value ?? '').replace(/\*\*/g, '').match(/([\d.]+)/);
  return m ? Number.parseFloat(m[1]) : 0;
}

function extractReportNumber(reportCell) {
  const m = (reportCell ?? '').match(/\[(\d+)\]/);
  return m ? m[1] : null;
}

function parseTrackerLine(line, lineIdx) {
  if (!line.startsWith('|')) return null;
  if (line.includes('---')) return null;
  if (/\|\s*#\s*\|/.test(line)) return null;
  const cols = line.split('|').map((c) => c.trim());
  if (cols.length < 10) return null;
  const num = Number.parseInt(cols[1], 10);
  if (Number.isNaN(num) || num <= 0) return null;
  const reportNumber = extractReportNumber(cols[8]);
  if (!reportNumber) return null;
  return {
    lineIdx,
    num,
    company: cols[3],
    role: cols[4],
    score: cols[5],
    status: cols[6],
    reportNumber,
  };
}

function chooseSurvivor(group) {
  // Sort by score desc, then by status rank desc.
  return [...group].sort((a, b) => {
    const ds = parseScore(b.score) - parseScore(a.score);
    if (ds !== 0) return ds;
    const ra = STATUS_RANK[a.status.toLowerCase()] ?? 0;
    const rb = STATUS_RANK[b.status.toLowerCase()] ?? 0;
    return rb - ra;
  })[0];
}

function bestStatus(group) {
  let best = group[0].status;
  let bestRank = STATUS_RANK[best.toLowerCase()] ?? 0;
  for (const entry of group.slice(1)) {
    const rank = STATUS_RANK[entry.status.toLowerCase()] ?? 0;
    if (rank > bestRank) {
      best = entry.status;
      bestRank = rank;
    }
  }
  return best;
}

function setLineStatus(line, status) {
  const cells = line.split('|');
  cells[6] = ` ${status} `;
  return cells.join('|');
}

function main() {
  if (!existsSync(trackerPath)) {
    console.log(`No tracker found at ${trackerPath} — nothing to do.`);
    return 0;
  }

  const original = readFileSync(trackerPath, 'utf8');
  const lines = original.split('\n');
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const parsed = parseTrackerLine(lines[i], i);
    if (parsed) entries.push(parsed);
  }

  console.log(`Loaded ${entries.length} tracker rows.`);

  // Group by report number.
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.reportNumber)) groups.set(entry.reportNumber, []);
    groups.get(entry.reportNumber).push(entry);
  }

  const dropIdxs = new Set();
  let promotedCount = 0;
  let droppedCount = 0;

  for (const [reportNumber, group] of groups) {
    if (group.length < 2) continue;
    const survivor = chooseSurvivor(group);
    const desiredStatus = bestStatus(group);

    if (survivor.status !== desiredStatus) {
      lines[survivor.lineIdx] = setLineStatus(lines[survivor.lineIdx], desiredStatus);
      console.log(
        `report [${reportNumber}]: keeper #${survivor.num} status promoted "${survivor.status}" → "${desiredStatus}".`,
      );
      promotedCount += 1;
    }

    for (const entry of group) {
      if (entry.lineIdx === survivor.lineIdx) continue;
      dropIdxs.add(entry.lineIdx);
      droppedCount += 1;
      console.log(
        `report [${reportNumber}]: drop #${entry.num} (${entry.company} — ${entry.role}); keeping #${survivor.num}.`,
      );
    }
  }

  console.log('');
  if (dryRun) {
    console.log(`would drop ${droppedCount} rows (across ${promotedCount} promoted survivors).`);
    console.log('(dry-run — pass --apply to write changes)');
    return 0;
  }

  if (droppedCount === 0 && promotedCount === 0) {
    console.log('Nothing to do — tracker has no report-number duplicates.');
    return 0;
  }

  // Drop in reverse to keep indices stable.
  const sortedDrops = [...dropIdxs].sort((a, b) => b - a);
  for (const idx of sortedDrops) {
    lines.splice(idx, 1);
  }

  copyFileSync(trackerPath, `${trackerPath}.bak`);
  writeFileSync(trackerPath, lines.join('\n'));
  console.log(`dropped ${droppedCount} rows; wrote ${trackerPath} (backup: ${trackerPath}.bak).`);
  return 0;
}

process.exit(main());
