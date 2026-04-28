#!/usr/bin/env node
// Build a standalone static HTML snapshot for career-ops.
// Reads: reports/*.md, data/applications.md, data/pipeline.md, data/scan-history.tsv
// Writes: web/index.html (open with double-click, no server needed)

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function readOr(path, fallback = '') {
  return existsSync(path) ? readFileSync(path, 'utf8') : fallback;
}

export function parseReports() {
  const dir = join(ROOT, 'reports');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => /^\d{3}-.+\.md$/.test(f))
    .sort()
    .reverse()
    .map(filename => {
      const raw = readFileSync(join(dir, filename), 'utf8');
      const num = filename.slice(0, 3);
      const title = (raw.match(/^#\s+(.+)$/m) || [, filename])[1];
      const meta = {};
      for (const key of ['Fecha', 'Date', 'Arquetipo', 'Score', 'Legitimacy', 'URL', 'Decision']) {
        const m = raw.match(new RegExp(`\\*\\*${key}:\\*\\*\\s*(.+)`));
        if (m) meta[key.toLowerCase()] = m[1].trim();
      }
      return { num, filename, title, content: raw, ...meta };
    });
}

export function parseApplications() {
  const raw = readOr(join(ROOT, 'data', 'applications.md'));
  const rows = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('|') || line.includes('---') || /\|\s*#\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length < 9 || !/^\d+$/.test(cells[0])) continue;
    const [num, date, company, role, score, status, pdf, report, notes] = cells;
    const reportMatch = report.match(/\((reports\/[^)]+)\)/);
    rows.push({
      num, date, company, role, score, status, pdf,
      reportPath: reportMatch ? reportMatch[1] : null,
      notes
    });
  }
  return rows;
}

export function parsePipeline() {
  const raw = readOr(join(ROOT, 'data', 'pipeline.md'));
  const items = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^-\s+\[([ x])\]\s+(.+)$/);
    if (!m) continue;
    const done = m[1] === 'x';
    const body = m[2];
    const parts = body.split('|').map(s => s.trim());
    const urlMatch = body.match(/https?:\/\/\S+/);
    items.push({
      done,
      tag: parts[0] || '',
      url: urlMatch ? urlMatch[0] : '',
      raw: body
    });
  }
  return items;
}

export function parseScanHistory() {
  const raw = readOr(join(ROOT, 'data', 'scan-history.tsv'));
  const lines = raw.split('\n').filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split('\t');
  const rows = lines.slice(1).map(l => {
    const cells = l.split('\t');
    const obj = {};
    headers.forEach((h, i) => obj[h] = cells[i] || '');
    return obj;
  });
  return { headers, rows };
}

export function parseKeywordStats() {
  const raw = readOr(join(ROOT, 'data', 'newgrad-skill-stats.json'));
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseGmailSignals(filePath = join(ROOT, 'data', 'gmail-signals.jsonl')) {
  const raw = readOr(filePath);
  const result = { rows: [], errors: [] };
  if (!raw.trim()) return result;

  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      result.rows = Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (error) {
      result.errors.push({ line: 1, error: error.message });
    }
    return result;
  }

  raw.split('\n').forEach((line, index) => {
    const text = line.trim();
    if (!text || text.startsWith('#')) return;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') result.rows.push(parsed);
    } catch (error) {
      result.errors.push({ line: index + 1, error: error.message });
    }
  });
  return result;
}

export function parseProfile(filePath = join(ROOT, 'config', 'profile.yml')) {
  const raw = readOr(filePath);
  const emailMatch = raw.match(/^\s*email:\s*["']?([^"'\n#]+)["']?/m);
  return {
    email: emailMatch ? emailMatch[1].trim() : ''
  };
}

export function parseGmailRefreshStatus(filePath = join(ROOT, 'data', 'gmail-refresh-status.json')) {
  const raw = readOr(filePath).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return {
      status: 'failed',
      message: `Could not read Gmail refresh status: ${error.message}`,
      signalSummary: null,
    };
  }
}

export function buildDashboardData({ includeGmailSignals = false, includeProfile = false } = {}) {
  return {
    generated: new Date().toISOString(),
    profile: includeProfile ? parseProfile() : { email: '' },
    reports: parseReports(),
    applications: parseApplications(),
    pipeline: parsePipeline(),
    scanHistory: parseScanHistory(),
    keywordStats: parseKeywordStats(),
    gmailSignals: includeGmailSignals ? parseGmailSignals() : { rows: [], errors: [] },
    gmailRefresh: includeGmailSignals ? parseGmailRefreshStatus() : null
  };
}

export function renderDashboardHtml({ extraHead = '', includeGmailSignals = false, includeProfile = false } = {}) {
  const data = buildDashboardData({ includeGmailSignals, includeProfile });
  const template = readFileSync(join(__dirname, 'template.html'), 'utf8');
  const withData = template.replace(
    '/*__DATA__*/',
    'window.DATA = ' + JSON.stringify(data) + ';'
  );
  const html = extraHead
    ? withData.replace('</head>', `${extraHead}\n</head>`)
    : withData;
  return { html, data };
}

export function writeDashboard() {
  const { html, data } = renderDashboardHtml();
  const outPath = join(__dirname, 'index.html');
  writeFileSync(outPath, html);

  console.log(`[dashboard] wrote ${outPath}`);
  console.log(`  reports: ${data.reports.length}`);
  console.log(`  applications: ${data.applications.length}`);
  console.log(`  pipeline: ${data.pipeline.length}`);
  console.log(`  scan-history: ${data.scanHistory.rows.length}`);
  console.log(`\nOpen in browser:`);
  console.log(`  open ${outPath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeDashboard();
}
