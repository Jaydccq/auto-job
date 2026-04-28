#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const DEFAULT_SIGNALS_PATH = join(DATA_DIR, 'gmail-signals.jsonl');
const DEFAULT_STATUS_PATH = join(DATA_DIR, 'gmail-refresh-status.json');
const DEFAULT_REFRESH_SCRIPT = join(ROOT, 'scripts', 'gmail-oauth-refresh.mjs');
const DEFAULT_TIMEOUT_MS = 120_000;
const SETUP_REQUIRED_EXIT = 78;

function relativeToRoot(filePath) {
  return filePath.startsWith(`${ROOT}/`) ? filePath.slice(ROOT.length + 1) : filePath;
}

export function parseRefreshCommand(raw, { useDefault = true } = {}) {
  if (!raw || !String(raw).trim()) {
    return useDefault && existsSync(DEFAULT_REFRESH_SCRIPT)
      ? [process.execPath, DEFAULT_REFRESH_SCRIPT]
      : [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'CAREER_OPS_GMAIL_REFRESH_COMMAND must be a JSON array, for example ["node","scripts/gmail-oauth-refresh.mjs"].'
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('CAREER_OPS_GMAIL_REFRESH_COMMAND must contain at least one command item.');
  }

  const command = parsed.map((item) => String(item).trim());
  if (command.some((item) => item.length === 0)) {
    throw new Error('CAREER_OPS_GMAIL_REFRESH_COMMAND cannot contain empty command items.');
  }
  return command;
}

export function summarizeGmailSignals(filePath = DEFAULT_SIGNALS_PATH) {
  const summary = {
    path: relativeToRoot(filePath),
    exists: existsSync(filePath),
    rows: 0,
    errors: 0,
    updatedAt: null,
  };
  if (!summary.exists) return summary;

  const raw = readFileSync(filePath, 'utf8');
  const trimmed = raw.trim();
  summary.updatedAt = statSync(filePath).mtime.toISOString();
  if (!trimmed) return summary;

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      summary.rows = Array.isArray(parsed) ? parsed.filter(Boolean).length : 0;
    } catch {
      summary.errors = 1;
    }
    return summary;
  }

  for (const line of raw.split('\n')) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    try {
      JSON.parse(text);
      summary.rows += 1;
    } catch {
      summary.errors += 1;
    }
  }
  return summary;
}

function writeStatus(status, statusPath) {
  mkdirSync(dirname(statusPath), { recursive: true });
  writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`);
}

function failedStatus(base, message, signalSummary, extra = {}) {
  return {
    ...base,
    status: 'failed',
    message,
    signalSummary,
    ...extra,
  };
}

export function runGmailRefresh({
  env = process.env,
  cwd = ROOT,
  signalsPath = DEFAULT_SIGNALS_PATH,
  statusPath = DEFAULT_STATUS_PATH,
  trigger = 'manual',
} = {}) {
  const attemptedAt = new Date().toISOString();
  const signalSummary = summarizeGmailSignals(signalsPath);
  const base = { attemptedAt, trigger };

  if (env.CAREER_OPS_GMAIL_REFRESH === '0' || env.CAREER_OPS_DASHBOARD_REFRESH_GMAIL === '0') {
    const status = {
      ...base,
      status: 'skipped',
      message: 'Gmail refresh disabled by environment.',
      signalSummary,
    };
    writeStatus(status, statusPath);
    return status;
  }

  let command;
  try {
    command = parseRefreshCommand(env.CAREER_OPS_GMAIL_REFRESH_COMMAND);
  } catch (error) {
    const status = failedStatus(base, error.message, signalSummary);
    writeStatus(status, statusPath);
    return status;
  }

  if (command.length === 0) {
    const status = {
      ...base,
      status: 'skipped',
      message: 'No standalone Gmail refresh command configured; run /career-ops gmail-scan inside Codex or configure CAREER_OPS_GMAIL_REFRESH_COMMAND.',
      signalSummary,
    };
    writeStatus(status, statusPath);
    return status;
  }

  const timeoutMs = Number.parseInt(env.CAREER_OPS_GMAIL_REFRESH_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS;
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
  });

  if (result.error) {
    const status = failedStatus(base, result.error.message, summarizeGmailSignals(signalsPath), {
      command: command[0],
      exitCode: null,
    });
    writeStatus(status, statusPath);
    return status;
  }

  if (result.status !== 0) {
    const status = {
      ...base,
      status: result.status === SETUP_REQUIRED_EXIT ? 'setup_required' : 'failed',
      message: result.stderr?.trim() || `Refresh command exited with status ${result.status}.`,
      signalSummary: summarizeGmailSignals(signalsPath),
      command: command[0],
      exitCode: result.status,
    };
    writeStatus(status, statusPath);
    return status;
  }

  const status = {
    ...base,
    status: 'ok',
    message: 'Gmail refresh command completed.',
    command: command[0],
    exitCode: result.status,
    signalSummary: summarizeGmailSignals(signalsPath),
  };
  writeStatus(status, statusPath);
  return status;
}

export function formatRefreshStatus(status) {
  const rows = status.signalSummary?.rows ?? 0;
  const errors = status.signalSummary?.errors ?? 0;
  return `${status.status}: ${status.message} (${rows} signals, ${errors} parse errors)`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const status = runGmailRefresh();
  console.log(`[gmail-refresh] ${formatRefreshStatus(status)}`);
  if (status.status === 'failed') process.exitCode = 1;
}
