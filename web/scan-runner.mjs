// web/scan-runner.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.env.AUTO_JOB_REPO_ROOT || process.cwd();
const RUNS_DIR = join(ROOT, 'data', 'scan-runs');

/** Per-skill defaults. The catalog is the single source of truth. */
const SKILLS = [
  {
    id: 'scan',
    label: 'Portal scan (ATS)',
    description: 'Greenhouse/Ashby/Lever/Built-In/A16Z/Amazon. Zero-token discovery; LLM evaluation per runner.',
    npmScript: 'scan',
    runners: ['real-codex', 'real-claude', 'real-openrouter', 'fake'],
    advancedRunners: ['discovery-only'],
    defaultRunner: 'real-codex',
    inputs: [
      { id: 'evaluateLimit', label: 'Eval limit', type: 'number', default: 5, help: '--evaluate-limit' },
      { id: 'builtinOnly', label: 'Built In only', type: 'checkbox', default: false, help: '--builtin-only' },
      { id: 'dryRun', label: 'Dry run', type: 'checkbox', default: false, help: '--dry-run' },
    ],
  },
  {
    id: 'builtin-scan',
    label: 'Built In',
    description: "Built In ATS direct (BB-browser). Discovery → enrich → evaluate via the bridge’s configured runner (default codex).",
    npmScript: 'builtin-scan',
    runners: ['real-codex', 'real-claude', 'real-openrouter', 'fake'],
    advancedRunners: ['discovery-only'],
    defaultRunner: 'real-codex',
    inputs: [
      { id: 'url', label: 'Search URL', type: 'url', help: 'Optional Built In search URL' },
      { id: 'pages', label: 'Pages', type: 'number', default: 1 },
      { id: 'limit', label: 'Limit', type: 'number', default: 50 },
      { id: 'enrichLimit', label: 'Enrich limit', type: 'number', default: 5 },
      { id: 'evaluateLimit', label: 'Eval limit', type: 'number', default: 5, help: '--evaluate-limit' },
      { id: 'scoreOnly', label: 'Score only', type: 'checkbox', default: false, help: '--score-only' },
    ],
  },
  {
    id: 'indeed-scan',
    label: 'Indeed',
    description: "Indeed search (BB-browser). Discovery → enrich → evaluate via the bridge’s configured runner (default codex).",
    npmScript: 'indeed-scan',
    runners: ['real-codex', 'real-claude', 'real-openrouter', 'fake'],
    advancedRunners: ['discovery-only'],
    defaultRunner: 'real-codex',
    inputs: [
      { id: 'url', label: 'Search URL', type: 'url', help: 'Optional Indeed search URL' },
      { id: 'pages', label: 'Pages', type: 'number', default: 1 },
      { id: 'limit', label: 'Limit', type: 'number', default: 50 },
      { id: 'enrichLimit', label: 'Enrich limit', type: 'number', default: 5 },
      { id: 'evaluateLimit', label: 'Eval limit', type: 'number', default: 5, help: '--evaluate-limit' },
      { id: 'scoreOnly', label: 'Score only', type: 'checkbox', default: false, help: '--score-only' },
    ],
  },
  {
    id: 'linkedin-scan',
    label: 'LinkedIn jobs',
    description: 'LinkedIn search URL → BB-browser scrape → optional LLM scoring.',
    npmScript: 'linkedin-scan',
    runners: ['real-codex', 'real-claude', 'real-openrouter', 'fake'],
    advancedRunners: ['discovery-only'],
    defaultRunner: 'real-codex',
    inputs: [
      { id: 'url', label: 'Search URL', type: 'url', required: true, help: 'LinkedIn /jobs/search/ URL' },
      { id: 'pages', label: 'Pages', type: 'number', default: 3 },
      { id: 'limit', label: 'Limit', type: 'number', default: 75 },
      { id: 'scoreOnly', label: 'Score only', type: 'checkbox', default: false, help: '--score-only' },
    ],
  },
  {
    id: 'newgrad-scan',
    label: 'New-grad list',
    description: 'pittcsc/SimplifyJobs/coderQuad lists → enrich → score.',
    npmScript: 'newgrad-scan',
    runners: ['real-codex', 'real-claude', 'real-openrouter', 'fake'],
    advancedRunners: ['discovery-only'],
    defaultRunner: 'real-codex',
    inputs: [
      { id: 'enrichLimit', label: 'Enrich limit', type: 'number', default: 20 },
      { id: 'scoreOnly', label: 'Score only', type: 'checkbox', default: false },
    ],
  },
  {
    id: 'gmail-scan',
    label: 'Gmail signals',
    description: 'Refresh Gmail-based application signals (rejection/interview/etc.).',
    npmScript: 'gmail:update',
    runners: ['discovery-only'],
    defaultRunner: 'discovery-only',
    inputs: [],
  },
];

const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]));

/**
 * Build the catalog with `lastRun` filled in.
 * `registryLastRunBySkill` is an optional map from skillId → ScanLastRun,
 * supplied by the route layer from the in-memory job registry. When present,
 * we merge with the on-disk summary and pick whichever is newer. This is the
 * only way a script that crashes before writing its own summary file shows up
 * as failed in the UI on the next catalog fetch.
 */
export async function getScanCatalog({ registryLastRunBySkill = new Map() } = {}) {
  const enriched = await Promise.all(SKILLS.map(async s => {
    const fromDisk = await readLastRun(s.id);
    const fromRegistry = registryLastRunBySkill.get(s.id) ?? null;
    return { ...s, lastRun: pickNewer(fromDisk, fromRegistry) };
  }));
  return enriched;
}

function pickNewer(a, b) {
  if (!a) return b;
  if (!b) return a;
  const ta = Date.parse(a.finishedAt ?? a.startedAt ?? 0);
  const tb = Date.parse(b.finishedAt ?? b.startedAt ?? 0);
  return tb > ta ? b : a;
}

async function readLastRun(skillId) {
  try {
    const entries = await readdir(RUNS_DIR);
    const prefix = skillIdToRunPrefix(skillId);
    const candidates = entries.filter(f => f.startsWith(`${prefix}-`)
                                        && f.endsWith('-summary.json'));
    if (candidates.length === 0) return null;
    candidates.sort();
    const latest = candidates.at(-1);
    const raw = await readFile(join(RUNS_DIR, latest), 'utf8');
    const summary = JSON.parse(raw);
    return {
      startedAt: summary.startedAt ?? null,
      finishedAt: summary.finishedAt ?? null,
      exitCode: summary.exitCode ?? 0,
      status: (summary.exitCode ?? 0) === 0 ? 'ok' : 'failed',
      summaryPath: latest,
    };
  } catch {
    return null;
  }
}

function skillIdToRunPrefix(id) {
  // scan-runs files use the ATS source as prefix (greenhouse/ashby/builtin/linkedin/newgrad/gmail).
  // For the launcher we accept the skill id as a synonym so a "linkedin-scan" run finds linkedin-* files.
  return id.replace(/-scan$/, '');
}

export function buildArgv({ skillId, runner, inputs }) {
  const skill = SKILL_BY_ID.get(skillId);
  if (!skill) throw new Error(`unknown skill: ${skillId}`);
  const allRunners = [...(skill.runners ?? []), ...(skill.advancedRunners ?? [])];
  if (!allRunners.includes(runner)) {
    throw new Error(`runner ${runner} not supported by ${skillId}`);
  }
  const argv = ['npm', 'run', skill.npmScript, '--'];

  switch (skillId) {
    case 'scan':
      if (inputs.evaluateLimit) argv.push('--evaluate-limit', String(inputs.evaluateLimit));
      if (inputs.builtinOnly) argv.push('--builtin-only');
      if (inputs.dryRun) argv.push('--dry-run');
      if (runner === 'discovery-only') argv.push('--no-evaluate');
      break;
    case 'builtin-scan':
    case 'indeed-scan':
      if (inputs.url) argv.push('--url', String(inputs.url));
      if (inputs.pages) argv.push('--pages', String(inputs.pages));
      if (inputs.limit) argv.push('--limit', String(inputs.limit));
      if (inputs.enrichLimit) argv.push('--enrich-limit', String(inputs.enrichLimit));
      if (inputs.evaluateLimit) argv.push('--evaluate-limit', String(inputs.evaluateLimit));
      if (inputs.scoreOnly || runner === 'discovery-only') argv.push('--score-only');
      if (runner === 'discovery-only') argv.push('--no-evaluate');
      break;
    case 'linkedin-scan':
      if (!inputs.url) throw new Error('linkedin-scan requires url');
      argv.push('--url', String(inputs.url));
      if (inputs.pages) argv.push('--pages', String(inputs.pages));
      if (inputs.limit) argv.push('--limit', String(inputs.limit));
      if (inputs.scoreOnly || runner === 'discovery-only') argv.push('--score-only');
      break;
    case 'newgrad-scan':
      if (inputs.enrichLimit) argv.push('--enrich-limit', String(inputs.enrichLimit));
      if (inputs.scoreOnly || runner === 'discovery-only') argv.push('--score-only');
      break;
    case 'gmail-scan':
      // No flags — gmail:update has its own internal config.
      break;
    default:
      throw new Error(`no argv mapping for ${skillId}`);
  }
  return argv;
}

export function runnerEnv(runner) {
  switch (runner) {
    case 'fake':            return { AUTO_JOB_BRIDGE_MODE: 'fake', AUTO_JOB_REAL_EXECUTOR: '' };
    case 'real-claude':     return { AUTO_JOB_BRIDGE_MODE: 'real', AUTO_JOB_REAL_EXECUTOR: 'claude' };
    case 'real-codex':      return { AUTO_JOB_BRIDGE_MODE: 'real', AUTO_JOB_REAL_EXECUTOR: 'codex' };
    case 'real-openrouter': return { AUTO_JOB_BRIDGE_MODE: 'real', AUTO_JOB_REAL_EXECUTOR: 'openrouter' };
    case 'discovery-only':  return {};
    default: throw new Error(`unknown runner: ${runner}`);
  }
}
