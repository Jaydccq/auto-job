# Dashboard Scan Launcher Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` (or equivalent task-by-task runner) to implement. Steps use checkbox (`- [ ]`) syntax for tracking. Stop at the end of each task and run the listed verification before proceeding.

**Goal:** Add a visual launcher inside the dashboard that lists every scan skill, lets the user pick the evaluation runner (CLI script alone vs. one of the LLM SDK adapters: Claude / Codex / OpenRouter / fake), and triggers the run from the browser with live status feedback.

**Architecture:** Reuse the existing `web/template.html` "Scan Hist." pane — rename to "Scans" and split into two sub-sections: **Run** (new) on top and **History** (existing table) below. The Run section is a card grid of 6 scans. Each card shows description, runner picker, scan-specific inputs, a Run button, and a last-result badge. Clicking Run hits a new auth-gated `POST /dashboard/api/scans/run` endpoint that delegates to a new `scan-runner.mjs` module under `web/`. The runner spawns the existing `npm run <scan>` command with `AUTO_JOB_REAL_EXECUTOR` set per the picker. A simple in-memory job registry tracks running jobs; one new SSE endpoint streams stdout. A process-wide mutex enforces the "one Playwright session at a time" rule from CLAUDE.md.

**Tech Stack:** Fastify (existing bridge), vanilla JS in `web/template.html` (no framework, matches current dashboard style), `node:child_process.spawn`, Server-Sent Events for live logs, Vitest for handler/route tests.

---

## File Structure

| Path | Status | Responsibility |
|---|---|---|
| `apps/server/src/contracts/scan-launch.ts` | **new** | Types for scan catalog + run requests, shared between server and web. |
| `apps/server/src/routes/scans.ts` | **new** | Fastify route registration for `/dashboard/api/scans/*`. |
| `apps/server/src/routes/scans.test.ts` | **new** | Route tests with stubbed runner. |
| `apps/server/src/runtime/scan-job-registry.ts` | **new** | Pure-data registry: track jobs, ring-buffer logs, mutex token, last-run-per-skill memo (authoritative on crashes). |
| `apps/server/src/runtime/scan-job-registry.test.ts` | **new** | Unit tests for registry. |
| `apps/server/src/server.ts` | modify (one register line) | Wire the new route module after existing dashboard routes. |
| `web/scan-runner.mjs` | **new** | Catalog table + `spawnScan()` helper that builds argv from a request and starts the child process. |
| `apps/server/src/runtime/scan-runner.test.ts` | **new** | Vitest tests that import `../../../../web/scan-runner.mjs` and exercise catalog + argv mapping per skill/runner combo. Lives under `apps/server/src/` because vitest's `include` is `src/**/*.test.ts`. |
| `web/dashboard-handlers.mjs` | modify (re-export only) | Re-export `getScanCatalog` and `spawnScan` so `dashboard.ts` can resolve them via the existing dynamic-import path. |
| `web/template.html` | modify | Rename Scan Hist. tab → Scans. Add `<section id="scan-runner">` block above the existing filter bar. Append JS that fetches `/api/scans/catalog`, renders cards, wires Run buttons, opens SSE on click. |
| `docs/exec-plans/active/2026-04-29-dashboard-scan-launcher.md` | this file | Living plan + progress log. |

---

## Background

The dashboard currently displays scan history (`data/scan-history.tsv`) but offers no way to *start* a scan from the UI. Today the user runs `npm run linkedin-scan` (or similar) in a terminal, or relies on the LaunchAgent hourly job. Per CLAUDE.md, scan modes are: `scan`, `builtin-scan`, `linkedin-scan`, `indeed-scan`, `newgrad-scan`, `gmail-scan`. The bridge already supports four LLM backends (`fake`, `real-claude`, `real-codex`, `real-openrouter`) via `apps/server/src/index.ts` `AdapterMode`. The user wants those choices surfaced visually.

## Goal

A visual launcher tile per scan skill, plus a "runner" picker that maps to the existing `AdapterMode`, plus live progress while a run is in flight.

## Scope

In scope:
- New launcher UI inside the existing "Scan Hist." pane.
- New `/dashboard/api/scans/{catalog,run,jobs/:id/status,jobs/:id/stream}` endpoints.
- A 1-slot mutex preventing concurrent scans (Playwright safety).
- Last-result badge per scan (read from `data/scan-runs/`).

Out of scope:
- Adding new scan skills (only surface what already ships).
- Changing scan internals (scrapers, normalizers, scoring).
- Authenticated multi-user support (this is a single-user local app).
- Persisting job state across server restarts (in-memory only — restarts cancel running jobs, which is fine for a local-first tool).
- Editing `apps/server/src/index.ts` startup logic — runner choice is per-spawn via `AUTO_JOB_REAL_EXECUTOR`, not per-server.

## Assumptions

1. The dashboard auth token already protects `/dashboard/api/*`; new endpoints inherit that protection.
2. Each scan skill's existing `package.json` script is the canonical entry point and accepts the standard `--score-only`, `--limit`, `--enrich-limit`, `--url`, `--source` flags as documented in `scripts/hourly-job-scan.mjs:341`-`361`.
3. `npm` is on `PATH` of the bridge process (true for both the desktop app and LaunchAgent — verified via `app:install`).
4. `data/scan-runs/` is the source of truth for "last result" — no new persistence layer needed.
5. Concurrent CLI scans are unsafe (Playwright collision); concurrent fake-mode scans are safe but still blocked for simplicity.

## Reference Patterns (open-source)

| Pattern | Source | What we borrow |
|---|---|---|
| Card grid of automations with single Run button | n8n's "Workflows" list, GitHub Actions `workflow_dispatch` | Card-per-skill layout; description + inputs collapsible. |
| Live log streamer with SSE | Vercel's deploy logs view, Netlify CLI | Single `EventSource` per active job. |
| Run history badge | GitHub Actions latest-run badge | Green/red dot + "12m ago" label. |
| Per-launch backend picker | OpenAI Playground model dropdown | Radio group of 4 runners. |

We deliberately do *not* pull in a framework (React, Vue) — the current dashboard is vanilla JS in one HTML file and the surgical-change rule from CLAUDE.md says match the existing convention.

## Architecture Diagram

```
Browser (web/template.html)
   │
   │ 1. GET /dashboard/api/scans/catalog          (auth)
   │    →  [{id:"linkedin-scan", label, runners:[…], inputs:[…], lastRun:{…}}, …]
   │
   │ 2. user clicks Run on a card
   │    POST /dashboard/api/scans/run             (auth)
   │       body: { skillId, runner, inputs }
   │    ←  202 { jobId }
   │
   │ 3. EventSource('/dashboard/api/scans/jobs/:id/stream')
   │    ←  data: {ts,line,type:"stdout"|"stderr"|"end",exitCode?}
   │
   ▼
apps/server/src/routes/scans.ts
   │
   ├──► scan-job-registry.ts   (in-memory: jobs map, mutex, ring buffers)
   │
   └──► web/scan-runner.mjs
           │
           │ buildArgv({skillId, runner, inputs})
           │ → ['npm', 'run', 'linkedin-scan', '--', '--url', '...']
           │
           ▼
        child_process.spawn(...)
           │   env: { ...process.env,
           │          AUTO_JOB_BRIDGE_MODE:'real',
           │          AUTO_JOB_REAL_EXECUTOR:'codex' }
           │
           ▼
        existing scan script (scripts/linkedin-scan-bb-browser.ts)
           │
           ▼
        writes data/scan-runs/{source}-{ISO}-{shortid}-summary.json
```

## Implementation Steps

### Task 1: Define the scan catalog contract

**Files:**
- Create: `apps/server/src/contracts/scan-launch.ts`

- [ ] **Step 1: Write the type module**

```ts
// apps/server/src/contracts/scan-launch.ts
/**
 * Wire format for the dashboard scan launcher.
 * Mirrored in web/scan-runner.mjs (catalog table) and the dashboard JS.
 */

export type ScanRunnerId =
  | "fake"
  | "real-claude"
  | "real-codex"
  | "real-openrouter"
  | "discovery-only";

export interface ScanInputField {
  /** Form field id, also the key used in run requests. */
  id: string;
  /** Visible label. */
  label: string;
  type: "text" | "url" | "number" | "checkbox";
  /** Default value rendered in the form. */
  default?: string | number | boolean;
  /** Optional help text rendered under the field. */
  help?: string;
  /** True when the field must be non-empty before Run is enabled. */
  required?: boolean;
}

export interface ScanCatalogEntry {
  /** Stable id, e.g. "linkedin-scan". Matches modes/*-scan.md filename without the .md. */
  id: string;
  /** Card title, e.g. "LinkedIn jobs". */
  label: string;
  /** One-line description. */
  description: string;
  /** package.json script name, e.g. "linkedin-scan". */
  npmScript: string;
  /** Primary runners — rendered as the main runner row. */
  runners: ScanRunnerId[];
  /** Optional advanced runners — rendered behind a small "Advanced" toggle.
   *  Today only "discovery-only" lives here for non-gmail/builtin/indeed scans. */
  advancedRunners?: ScanRunnerId[];
  /** Default selected runner (must be in `runners`, never in `advancedRunners`). */
  defaultRunner: ScanRunnerId;
  /** Input fields rendered as a form. */
  inputs: ScanInputField[];
  /** Last-result summary for the badge, or null when no runs exist.
   *  Merge of (a) data/scan-runs/*-summary.json and (b) in-memory job registry,
   *  whichever is more recent. Registry wins on crashes that prevent the script
   *  from writing its own summary file. */
  lastRun: ScanLastRun | null;
}

export interface ScanLastRun {
  startedAt: string; // ISO
  finishedAt: string | null;
  exitCode: number | null;
  status: "ok" | "failed" | "running";
  summaryPath: string | null;
}

export interface ScanRunRequest {
  skillId: string;
  runner: ScanRunnerId;
  inputs: Record<string, string | number | boolean>;
}

export interface ScanRunResponse {
  jobId: string;
  startedAt: string;
}

export interface ScanJobEvent {
  ts: string;
  type: "stdout" | "stderr" | "end";
  line?: string;
  exitCode?: number;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm --prefix apps/server run typecheck`
Expected: PASS (no other files import this yet).

- [ ] **Step 3: Commit**

```bash
git add apps/server/src/contracts/scan-launch.ts
git commit -m "feat(scan-launcher): add scan-launch wire contracts"
```

---

### Task 2: Build the scan-runner catalog and argv builder

**Files:**
- Create: `web/scan-runner.mjs`
- Create: `web/scan-runner.test.mjs`

- [ ] **Step 1: Write the failing test for `getScanCatalog()` and `buildArgv()`**

```js
// web/scan-runner.test.mjs
import { describe, it, expect } from 'vitest';
import { getScanCatalog, buildArgv, runnerEnv } from './scan-runner.mjs';

describe('getScanCatalog', () => {
  it('returns 6 known skills with stable ids', () => {
    const cat = getScanCatalog({ now: () => new Date('2026-04-29T00:00:00Z') });
    const ids = cat.map(e => e.id).sort();
    expect(ids).toEqual([
      'builtin-scan', 'gmail-scan', 'indeed-scan',
      'linkedin-scan', 'newgrad-scan', 'scan',
    ]);
    for (const e of cat) {
      expect(e.runners.length).toBeGreaterThan(0);
      expect(e.runners).toContain(e.defaultRunner);
    }
  });
});

describe('buildArgv', () => {
  it('translates linkedin-scan with url + score-only into npm argv', () => {
    const argv = buildArgv({
      skillId: 'linkedin-scan',
      runner: 'real-codex',
      inputs: { url: 'https://www.linkedin.com/jobs/search/?...', scoreOnly: true, pages: 3 },
    });
    expect(argv[0]).toBe('npm');
    expect(argv.slice(0, 4)).toEqual(['npm', 'run', 'linkedin-scan', '--']);
    expect(argv).toContain('--url');
    expect(argv).toContain('https://www.linkedin.com/jobs/search/?...');
    expect(argv).toContain('--score-only');
    expect(argv).toContain('--pages');
    expect(argv).toContain('3');
  });

  it('translates scan with --no-evaluate when runner=discovery-only', () => {
    const argv = buildArgv({
      skillId: 'scan',
      runner: 'discovery-only',
      inputs: {},
    });
    expect(argv).toContain('--no-evaluate');
  });

  it('rejects unknown skillId', () => {
    expect(() => buildArgv({ skillId: 'nope', runner: 'fake', inputs: {} }))
      .toThrow(/unknown skill/i);
  });

  it('rejects runner not declared in catalog', () => {
    expect(() => buildArgv({ skillId: 'gmail-scan', runner: 'real-claude', inputs: {} }))
      .toThrow(/runner .* not supported/i);
  });
});

describe('runnerEnv', () => {
  it('maps real-codex to AUTO_JOB_BRIDGE_MODE=real and AUTO_JOB_REAL_EXECUTOR=codex', () => {
    expect(runnerEnv('real-codex')).toEqual({
      AUTO_JOB_BRIDGE_MODE: 'real',
      AUTO_JOB_REAL_EXECUTOR: 'codex',
    });
  });

  it('maps fake to AUTO_JOB_BRIDGE_MODE=fake and clears executor', () => {
    expect(runnerEnv('fake')).toEqual({
      AUTO_JOB_BRIDGE_MODE: 'fake',
      AUTO_JOB_REAL_EXECUTOR: '',
    });
  });

  it('maps discovery-only to no env override', () => {
    expect(runnerEnv('discovery-only')).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test web/scan-runner.test.mjs`
Expected: FAIL with `Cannot find module ./scan-runner.mjs`.

- [ ] **Step 3: Implement `web/scan-runner.mjs`**

```js
// web/scan-runner.mjs
import { readdir, stat, readFile } from 'node:fs/promises';
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
    description: 'Built In ATS direct (BB-browser). Discovery only — feeds /v1/builtin-scan/pending.',
    npmScript: 'builtin-scan',
    runners: ['discovery-only', 'fake'],
    defaultRunner: 'discovery-only',
    inputs: [
      { id: 'limit', label: 'Limit', type: 'number', default: 50, help: '--limit' },
    ],
  },
  {
    id: 'indeed-scan',
    label: 'Indeed',
    description: 'Indeed via BB-browser. Same shape as builtin-scan.',
    npmScript: 'indeed-scan',
    runners: ['discovery-only', 'fake'],
    defaultRunner: 'discovery-only',
    inputs: [
      { id: 'limit', label: 'Limit', type: 'number', default: 50 },
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

export function getCatalogStatic() {
  return SKILLS.map(s => ({ ...s, lastRun: null }));
}

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
    const candidates = entries.filter(f => f.startsWith(`${skillIdToRunPrefix(skillId)}-`)
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
      status: summary.exitCode === 0 ? 'ok' : 'failed',
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

const SKILL_BY_ID = new Map(SKILLS.map(s => [s.id, s]));

export function buildArgv({ skillId, runner, inputs }) {
  const skill = SKILL_BY_ID.get(skillId);
  if (!skill) throw new Error(`unknown skill: ${skillId}`);
  if (!skill.runners.includes(runner)) {
    throw new Error(`runner ${runner} not supported by ${skillId}`);
  }
  const argv = ['npm', 'run', skill.npmScript, '--'];

  // Skill-specific input → flag mapping.
  switch (skillId) {
    case 'scan':
      if (inputs.evaluateLimit) argv.push('--evaluate-limit', String(inputs.evaluateLimit));
      if (inputs.builtinOnly) argv.push('--builtin-only');
      if (inputs.dryRun) argv.push('--dry-run');
      if (runner === 'discovery-only') argv.push('--no-evaluate');
      break;
    case 'builtin-scan':
    case 'indeed-scan':
      if (inputs.limit) argv.push('--limit', String(inputs.limit));
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
```

- [ ] **Step 4: Run tests; expect PASS**

Run: `node --test web/scan-runner.test.mjs`
Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add web/scan-runner.mjs web/scan-runner.test.mjs
git commit -m "feat(scan-launcher): add catalog + argv builder for 6 scan skills"
```

---

### Task 3: Build the in-memory job registry with mutex

**Files:**
- Create: `apps/server/src/runtime/scan-job-registry.ts`
- Create: `apps/server/src/runtime/scan-job-registry.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// apps/server/src/runtime/scan-job-registry.test.ts
import { describe, it, expect } from 'vitest';
import { createScanJobRegistry } from './scan-job-registry.js';

describe('scan-job-registry', () => {
  it('starts a job, stores log lines, and finishes it', () => {
    const reg = createScanJobRegistry({ maxLogLines: 100 });
    const id = reg.start({ skillId: 'scan', runner: 'fake' });
    expect(reg.get(id)?.status).toBe('running');
    reg.appendLog(id, 'stdout', 'hello');
    reg.finish(id, 0);
    expect(reg.get(id)?.status).toBe('ok');
    expect(reg.tail(id)).toContainEqual(expect.objectContaining({ line: 'hello' }));
  });

  it('blocks concurrent jobs while one is running', () => {
    const reg = createScanJobRegistry();
    reg.start({ skillId: 'scan', runner: 'fake' });
    expect(() => reg.start({ skillId: 'linkedin-scan', runner: 'fake' }))
      .toThrow(/another scan is running/i);
  });

  it('drops oldest log lines past the cap', () => {
    const reg = createScanJobRegistry({ maxLogLines: 3 });
    const id = reg.start({ skillId: 'scan', runner: 'fake' });
    for (let i = 0; i < 10; i++) reg.appendLog(id, 'stdout', `line ${i}`);
    expect(reg.tail(id)).toHaveLength(3);
    expect(reg.tail(id).at(-1)?.line).toBe('line 9');
  });

  it('marks a finished job non-blocking for the next run', () => {
    const reg = createScanJobRegistry();
    const a = reg.start({ skillId: 'scan', runner: 'fake' });
    reg.finish(a, 0);
    const b = reg.start({ skillId: 'linkedin-scan', runner: 'fake' });
    expect(reg.get(b)?.status).toBe('running');
  });

  it('lastRunBySkill records failures so the UI badge survives a crash', () => {
    const reg = createScanJobRegistry();
    const id = reg.start({ skillId: 'linkedin-scan', runner: 'fake' });
    reg.finish(id, 1);
    const map = reg.lastRunBySkill();
    expect(map.get('linkedin-scan')?.status).toBe('failed');
    expect(map.get('linkedin-scan')?.exitCode).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npm --prefix apps/server run test scan-job-registry`
Expected: module not found.

- [ ] **Step 3: Implement registry**

```ts
// apps/server/src/runtime/scan-job-registry.ts
import { randomUUID } from "node:crypto";
import type { ScanJobEvent, ScanRunnerId } from "../contracts/scan-launch.js";

interface JobMeta {
  id: string;
  skillId: string;
  runner: ScanRunnerId;
  status: "running" | "ok" | "failed";
  startedAt: string;
  finishedAt: string | null;
  exitCode: number | null;
  log: ScanJobEvent[];
}

export interface ScanJobRegistry {
  start(args: { skillId: string; runner: ScanRunnerId }): string;
  appendLog(id: string, type: "stdout" | "stderr", line: string): void;
  finish(id: string, exitCode: number): void;
  get(id: string): JobMeta | undefined;
  tail(id: string): ScanJobEvent[];
  isBusy(): boolean;
  /** Latest finished run per skill, keyed by skillId. Drives the UI badge
   *  even when the underlying script crashed before writing its summary. */
  lastRunBySkill(): Map<string, { startedAt: string; finishedAt: string | null;
                                  exitCode: number | null; status: "ok" | "failed" | "running";
                                  summaryPath: null }>;
}

export function createScanJobRegistry(opts: { maxLogLines?: number } = {}): ScanJobRegistry {
  const maxLogLines = opts.maxLogLines ?? 2_000;
  const jobs = new Map<string, JobMeta>();
  const lastBySkill = new Map<string, JobMeta>();
  let runningId: string | null = null;

  return {
    start({ skillId, runner }) {
      if (runningId && jobs.get(runningId)?.status === "running") {
        throw new Error("another scan is running");
      }
      const id = randomUUID();
      jobs.set(id, {
        id,
        skillId,
        runner,
        status: "running",
        startedAt: new Date().toISOString(),
        finishedAt: null,
        exitCode: null,
        log: [],
      });
      runningId = id;
      return id;
    },
    appendLog(id, type, line) {
      const job = jobs.get(id);
      if (!job) return;
      job.log.push({ ts: new Date().toISOString(), type, line });
      if (job.log.length > maxLogLines) job.log.splice(0, job.log.length - maxLogLines);
    },
    finish(id, exitCode) {
      const job = jobs.get(id);
      if (!job) return;
      job.status = exitCode === 0 ? "ok" : "failed";
      job.finishedAt = new Date().toISOString();
      job.exitCode = exitCode;
      job.log.push({ ts: job.finishedAt, type: "end", exitCode });
      lastBySkill.set(job.skillId, job);
      if (runningId === id) runningId = null;
    },
    get(id) { return jobs.get(id); },
    tail(id) { return jobs.get(id)?.log ?? []; },
    isBusy() {
      return runningId !== null && jobs.get(runningId)?.status === "running";
    },
    lastRunBySkill() {
      const out = new Map();
      for (const [skillId, job] of lastBySkill) {
        out.set(skillId, {
          startedAt: job.startedAt,
          finishedAt: job.finishedAt,
          exitCode: job.exitCode,
          status: job.status,
          summaryPath: null,
        });
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: Run tests; expect PASS**

Run: `npm --prefix apps/server run test scan-job-registry`
Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/runtime/scan-job-registry.ts apps/server/src/runtime/scan-job-registry.test.ts
git commit -m "feat(scan-launcher): in-memory job registry with mutex + ring buffer"
```

---

### Task 4: Wire the route module + spawn integration

**Files:**
- Create: `apps/server/src/routes/scans.ts`
- Create: `apps/server/src/routes/scans.test.ts`
- Modify: `apps/server/src/server.ts` (one register line near the existing `registerDashboardRoutes` call)
- Modify: `web/dashboard-handlers.mjs` (export `getScanCatalog`, `spawnScan`)

- [ ] **Step 1: Write failing test (route, with stubbed spawn)**

```ts
// apps/server/src/routes/scans.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerScanRoutes } from './scans.js';
import { createScanJobRegistry } from '../runtime/scan-job-registry.js';

describe('GET /dashboard/api/scans/catalog', () => {
  it('returns the catalog from the injected getCatalog impl', async () => {
    const app = Fastify();
    await registerScanRoutes(app, {
      registry: createScanJobRegistry(),
      getCatalogImpl: async (_opts) => [
        { id: 'scan', label: 'X', description: '', npmScript: 'scan',
          runners: ['fake'], defaultRunner: 'fake', inputs: [], lastRun: null },
      ],
      spawnImpl: () => { throw new Error('not used'); },
    });
    const res = await app.inject({ method: 'GET', url: '/dashboard/api/scans/catalog' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).catalog[0].id).toBe('scan');
  });
});

describe('POST /dashboard/api/scans/run', () => {
  it('rejects when registry is busy', async () => {
    const app = Fastify();
    const registry = createScanJobRegistry();
    registry.start({ skillId: 'scan', runner: 'fake' });
    await registerScanRoutes(app, {
      registry,
      getCatalogImpl: async (_opts) => [],
      spawnImpl: () => { throw new Error('should not spawn'); },
    });
    const res = await app.inject({
      method: 'POST', url: '/dashboard/api/scans/run',
      payload: { skillId: 'scan', runner: 'fake', inputs: {} },
    });
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error).toMatch(/another scan is running/i);
  });

  it('starts a job, calls spawnImpl, returns 202 + jobId', async () => {
    const app = Fastify();
    const registry = createScanJobRegistry();
    let spawned = null;
    await registerScanRoutes(app, {
      registry,
      getCatalogImpl: async (_opts) => [],
      spawnImpl: (req, hooks) => {
        spawned = req;
        // Simulate immediate exit.
        queueMicrotask(() => hooks.onExit(0));
      },
    });
    const res = await app.inject({
      method: 'POST', url: '/dashboard/api/scans/run',
      payload: { skillId: 'scan', runner: 'fake', inputs: {} },
    });
    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).jobId).toBeDefined();
    expect(spawned?.skillId).toBe('scan');
  });
});

describe('GET /dashboard/api/scans/jobs/:id/status', () => {
  it('returns 404 for unknown job', async () => {
    const app = Fastify();
    await registerScanRoutes(app, {
      registry: createScanJobRegistry(),
      getCatalogImpl: async (_opts) => [],
      spawnImpl: () => {},
    });
    const res = await app.inject({ method: 'GET', url: '/dashboard/api/scans/jobs/missing/status' });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /dashboard/api/scans/jobs/:id/stream (SSE)', () => {
  it('replays buffered log, streams new events, closes when job ends', async () => {
    const app = Fastify();
    const registry = createScanJobRegistry();
    let endHook = null;
    let logHook = null;
    await registerScanRoutes(app, {
      registry,
      getCatalogImpl: async (_opts) => [],
      spawnImpl: (_req, hooks) => { logHook = hooks.onLog; endHook = hooks.onExit; },
    });
    const start = await app.inject({
      method: 'POST', url: '/dashboard/api/scans/run',
      payload: { skillId: 'scan', runner: 'fake', inputs: {} },
    });
    const { jobId } = JSON.parse(start.body);

    // Pre-stream buffered output.
    logHook('stdout', 'before subscribe');

    // Issue the SSE request and read raw frames. Use Fastify's listen so we
    // can use a real http client (app.inject buffers the whole response).
    const addr = await app.listen({ port: 0, host: '127.0.0.1' });
    const url = `${addr}/dashboard/api/scans/jobs/${jobId}/stream`;
    const res = await fetch(url);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const readMore = async () => {
      const { value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array());
    };
    await readMore(); // catches the buffered "before subscribe"
    expect(buffer).toContain('"line":"before subscribe"');

    // Push a new line and finish the job.
    logHook('stdout', 'after subscribe');
    endHook(0);

    // Drain until the stream closes.
    while (!(await reader.read()).done) {
      buffer += decoder.decode((await reader.read()).value ?? new Uint8Array());
      if (buffer.includes('"type":"end"')) break;
    }
    expect(buffer).toContain('"line":"after subscribe"');
    expect(buffer).toMatch(/"type":"end".*"exitCode":0/);

    await app.close();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `Cannot find module './scans.js'`

Run: `npm --prefix apps/server run test scans`

- [ ] **Step 3: Implement `apps/server/src/routes/scans.ts`**

```ts
import type { FastifyInstance } from "fastify";
import type { ScanJobEvent, ScanRunRequest } from "../contracts/scan-launch.js";
import type { ScanJobRegistry } from "../runtime/scan-job-registry.js";

export interface SpawnRequest extends ScanRunRequest { jobId: string }

export interface SpawnHooks {
  onLog: (type: "stdout" | "stderr", line: string) => void;
  onExit: (code: number) => void;
}

export interface RegisterScanRoutesOptions {
  registry: ScanJobRegistry;
  getCatalogImpl: (opts: { registryLastRunBySkill: Map<string, unknown> }) => Promise<unknown[]>;
  spawnImpl: (req: SpawnRequest, hooks: SpawnHooks) => void;
}

export async function registerScanRoutes(
  fastify: FastifyInstance,
  opts: RegisterScanRoutesOptions,
): Promise<void> {
  const { registry, getCatalogImpl, spawnImpl } = opts;

  fastify.get("/dashboard/api/scans/catalog", async (_req, reply) => {
    const catalog = await getCatalogImpl({
      registryLastRunBySkill: registry.lastRunBySkill(),
    });
    reply.code(200).send({ ok: true, catalog });
  });

  fastify.post<{ Body: ScanRunRequest }>("/dashboard/api/scans/run", async (req, reply) => {
    const body = req.body ?? ({} as ScanRunRequest);
    if (!body.skillId || !body.runner) {
      reply.code(400).send({ ok: false, error: "skillId and runner are required" });
      return;
    }
    if (registry.isBusy()) {
      reply.code(409).send({ ok: false, error: "another scan is running" });
      return;
    }
    let jobId: string;
    try {
      jobId = registry.start({ skillId: body.skillId, runner: body.runner });
    } catch (err) {
      reply.code(409).send({ ok: false, error: (err as Error).message });
      return;
    }
    spawnImpl(
      { ...body, jobId },
      {
        onLog: (type, line) => registry.appendLog(jobId, type, line),
        onExit: (code) => registry.finish(jobId, code),
      },
    );
    reply.code(202).send({ ok: true, jobId, startedAt: registry.get(jobId)?.startedAt });
  });

  fastify.get<{ Params: { id: string } }>(
    "/dashboard/api/scans/jobs/:id/status",
    async (req, reply) => {
      const job = registry.get(req.params.id);
      if (!job) { reply.code(404).send({ ok: false }); return; }
      reply.code(200).send({ ok: true, job: {
        id: job.id, skillId: job.skillId, runner: job.runner, status: job.status,
        startedAt: job.startedAt, finishedAt: job.finishedAt, exitCode: job.exitCode,
        logTailCount: job.log.length,
      }});
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/dashboard/api/scans/jobs/:id/stream",
    async (req, reply) => {
      const job = registry.get(req.params.id);
      if (!job) { reply.code(404).send({ ok: false }); return; }
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      // Replay buffered log first.
      for (const ev of job.log) reply.raw.write(formatSse(ev));
      // Poll-and-push tail (no listener API on registry yet; OK for v1).
      let lastLen = job.log.length;
      const interval = setInterval(() => {
        const cur = registry.get(req.params.id);
        if (!cur) { clearInterval(interval); reply.raw.end(); return; }
        if (cur.log.length > lastLen) {
          for (let i = lastLen; i < cur.log.length; i++) {
            reply.raw.write(formatSse(cur.log[i]));
          }
          lastLen = cur.log.length;
        }
        if (cur.status !== "running") { clearInterval(interval); reply.raw.end(); }
      }, 250);
      req.raw.on("close", () => clearInterval(interval));
    },
  );
}

function formatSse(ev: ScanJobEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}
```

- [ ] **Step 4: Run route tests; expect PASS**

Run: `npm --prefix apps/server run test scans`
Expected: 4 tests PASS.

- [ ] **Step 5: Implement the production `spawnImpl`**

In `web/dashboard-handlers.mjs`, append:

```js
// at top of file, near other imports:
import { spawn } from 'node:child_process';
export { getScanCatalog, runnerEnv } from './scan-runner.mjs';
import { buildArgv as _buildArgv, runnerEnv as _runnerEnv } from './scan-runner.mjs';

export function spawnScan(req, hooks) {
  const argv = _buildArgv(req);
  const env = { ...process.env, ..._runnerEnv(req.runner) };
  const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, env });
  const onLine = (type) => (chunk) => {
    const text = chunk.toString('utf8');
    for (const line of text.split(/\r?\n/)) {
      if (line) hooks.onLog(type, line);
    }
  };
  child.stdout.on('data', onLine('stdout'));
  child.stderr.on('data', onLine('stderr'));
  child.on('exit', (code) => hooks.onExit(code ?? 0));
  child.on('error', (err) => { hooks.onLog('stderr', String(err)); hooks.onExit(1); });
  return { kill: () => child.kill('SIGTERM') };
}
```

- [ ] **Step 6: Wire `registerScanRoutes` into `apps/server/src/server.ts`**

Find the `registerDashboardRoutes(...)` call in `server.ts` (around server bootstrap) and immediately after add:

```ts
// Lazy import — same pattern as registerDashboardRoutes uses for web/.
const { spawnScan, getScanCatalog } = await import(/* webpackIgnore: true */
  pathToFileURL(resolve(repoRoot, "web", "dashboard-handlers.mjs")).href);
const scanRegistry = createScanJobRegistry();
await registerScanRoutes(fastify, {
  registry: scanRegistry,
  getCatalogImpl: getScanCatalog,
  spawnImpl: spawnScan,
});
```

- [ ] **Step 7: Run full server test suite**

Run: `npm --prefix apps/server run test`
Expected: all green (existing tests untouched, new tests pass).

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/routes/scans.ts apps/server/src/routes/scans.test.ts \
        apps/server/src/server.ts web/dashboard-handlers.mjs
git commit -m "feat(scan-launcher): wire /dashboard/api/scans/* routes + spawn integration"
```

---

### Task 5: Render the launcher UI

**Files:**
- Modify: `web/template.html` (rename tab, add `<section id="scan-runner">`, add JS)

- [ ] **Step 1: Rename the tab label**

Edit `web/template.html` line 1609:

```html
<!-- before -->
<button data-tab="scan"><span class="idx">06</span>Scan Hist.</button>
<!-- after -->
<button data-tab="scan"><span class="idx">06</span>Scans</button>
```

- [ ] **Step 2: Add the launcher section above the existing filter-bar**

Inside `<section id="tab-scan" class="pane">` (line 2076), insert before line 2077 `<div class="filter-bar">`:

```html
<section id="scan-runner" aria-labelledby="scan-runner-h">
  <header class="scan-runner-header">
    <h2 id="scan-runner-h">Run a scan</h2>
    <span class="scan-runner-busy" id="scan-runner-busy" hidden>● running</span>
  </header>
  <div class="scan-runner-grid" id="scan-runner-grid"></div>
  <div class="scan-runner-log" id="scan-runner-log" hidden>
    <header><strong id="scan-runner-log-title">Log</strong>
      <button type="button" id="scan-runner-log-close">close</button></header>
    <pre id="scan-runner-log-body"></pre>
  </div>
</section>
<hr class="scan-runner-divider">
<h2 class="scan-history-h">History</h2>
```

- [ ] **Step 3: Add minimal CSS in the existing `<style>` block**

Insert near the existing `#scan-table` rules (around line 1225):

```css
#scan-runner { padding: 16px 0; }
.scan-runner-header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; }
.scan-runner-busy { color: var(--signal); font-size: 12px; }
.scan-runner-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
.scan-runner-card { border: 1px solid var(--rule); padding: 12px; background: var(--paper); }
.scan-runner-card h3 { margin: 0 0 6px 0; font-size: 14px; }
.scan-runner-card p.desc { margin: 0 0 10px 0; color: var(--ink-2); font-size: 12px; }
.scan-runner-card label { display: block; font-size: 11px; margin: 6px 0 2px 0; color: var(--ink-2); }
.scan-runner-card input, .scan-runner-card select { width: 100%; padding: 4px 6px; font: inherit; }
.scan-runner-card .runner-row { display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0; }
.scan-runner-card .runner-row button { padding: 2px 6px; font-size: 11px; border: 1px solid var(--rule); background: var(--paper); cursor: pointer; }
.scan-runner-card .runner-row button.active { background: var(--ink); color: var(--paper); }
.scan-runner-card .runner-row button.secondary { font-style: italic; }
.scan-runner-card .runner-advanced { margin-top: 4px; }
.scan-runner-card .runner-advanced summary { font-size: 11px; color: var(--ink-2); cursor: pointer; }
.scan-runner-card .last-run { font-size: 11px; color: var(--ink-2); margin-top: 6px; }
.scan-runner-card .last-run.ok::before { content: '● '; color: var(--signal); }
.scan-runner-card .last-run.failed::before { content: '● '; color: #c00; }
.scan-runner-card button.run-btn { margin-top: 8px; padding: 4px 8px; cursor: pointer; }
.scan-runner-card button.run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.scan-runner-log { margin-top: 16px; border: 1px solid var(--rule); padding: 10px; }
.scan-runner-log header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.scan-runner-log pre { max-height: 240px; overflow: auto; font-size: 11px; line-height: 1.4; margin: 0; }
.scan-runner-divider { margin: 24px 0 12px 0; border: 0; border-top: 1px dashed var(--rule); }
.scan-history-h { font-size: 14px; margin: 0 0 8px 0; }
```

- [ ] **Step 4: Add JS — fetch catalog, render cards, handle Run + SSE**

In the `<script>` near line 3684 (`// ===== Scan History =====`), insert above it:

```js
// ===== Scan launcher =====
async function loadScanCatalog() {
  const r = await fetchAuth('/dashboard/api/scans/catalog');
  const { catalog } = await r.json();
  renderScanCards(catalog);
}

function renderScanCards(catalog) {
  const grid = document.getElementById('scan-runner-grid');
  grid.innerHTML = '';
  for (const s of catalog) {
    const card = document.createElement('div');
    card.className = 'scan-runner-card';
    card.dataset.skill = s.id;
    card.innerHTML = `
      <h3>${escapeHtml(s.label)}</h3>
      <p class="desc">${escapeHtml(s.description)}</p>
      <label>Runner</label>
      <div class="runner-row" role="radiogroup">
        ${s.runners.map(r => `<button type="button" data-runner="${r}"
          class="${r === s.defaultRunner ? 'active' : ''}">${runnerLabel(r)}</button>`).join('')}
      </div>
      ${(s.advancedRunners?.length ?? 0) > 0 ? `
      <details class="runner-advanced">
        <summary>Advanced</summary>
        <div class="runner-row" role="radiogroup">
          ${s.advancedRunners.map(r => `<button type="button" data-runner="${r}"
            class="secondary">${runnerLabel(r)}</button>`).join('')}
        </div>
      </details>` : ''}
      <div class="inputs">
        ${s.inputs.map(f => renderField(s.id, f)).join('')}
      </div>
      ${s.lastRun ? `<div class="last-run ${s.lastRun.status}">last: ${humanTime(s.lastRun.finishedAt ?? s.lastRun.startedAt)}</div>` : ''}
      <button type="button" class="run-btn">Run</button>
    `;
    // One radio group across both primary and advanced rows.
    card.querySelectorAll('.runner-row button').forEach(b => {
      b.addEventListener('click', () => {
        card.querySelectorAll('.runner-row button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
    card.querySelector('.run-btn').addEventListener('click', () => runScan(card, s));
    grid.appendChild(card);
  }
}

function renderField(skillId, f) {
  const id = `f-${skillId}-${f.id}`;
  const def = f.default ?? '';
  if (f.type === 'checkbox') {
    return `<label><input id="${id}" type="checkbox" data-field="${f.id}" ${def ? 'checked' : ''}> ${escapeHtml(f.label)}</label>`;
  }
  return `<label for="${id}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
    <input id="${id}" data-field="${f.id}" type="${f.type}" value="${escapeHtml(String(def))}" ${f.required ? 'required' : ''}>`;
}

function runnerLabel(r) {
  return ({
    'real-claude':'Claude SDK', 'real-codex':'Codex CLI',
    'real-openrouter':'OpenRouter', 'fake':'Fake (offline)',
    'discovery-only':'Discovery only',
  })[r] || r;
}

async function runScan(card, skill) {
  const runner = card.querySelector('.runner-row button.active')?.dataset.runner ?? skill.defaultRunner;
  const inputs = {};
  card.querySelectorAll('[data-field]').forEach(el => {
    inputs[el.dataset.field] = el.type === 'checkbox' ? el.checked
                            : el.type === 'number' ? Number(el.value)
                            : el.value;
  });
  const btn = card.querySelector('.run-btn');
  btn.disabled = true; btn.textContent = 'Starting…';
  let res;
  try {
    res = await fetchAuth('/dashboard/api/scans/run', {
      method: 'POST', headers: { 'content-type':'application/json' },
      body: JSON.stringify({ skillId: skill.id, runner, inputs }),
    });
  } catch (e) { btn.disabled = false; btn.textContent = 'Run'; alert(e.message); return; }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    alert(body.error ?? `error ${res.status}`);
    btn.disabled = false; btn.textContent = 'Run';
    return;
  }
  const { jobId } = await res.json();
  attachJobStream(jobId, skill.label, () => { btn.disabled = false; btn.textContent = 'Run'; loadScanCatalog(); });
}

function attachJobStream(jobId, label, onEnd) {
  document.getElementById('scan-runner-busy').hidden = false;
  const logBox = document.getElementById('scan-runner-log');
  const body = document.getElementById('scan-runner-log-body');
  document.getElementById('scan-runner-log-title').textContent = `${label} — ${jobId.slice(0, 8)}`;
  body.textContent = '';
  logBox.hidden = false;
  const token = document.querySelector('meta[name="auto-job-token"]').content;
  // Pass token via query param for EventSource (no header support).
  const es = new EventSource(`/dashboard/api/scans/jobs/${jobId}/stream?token=${encodeURIComponent(token)}`);
  es.onmessage = (ev) => {
    const data = JSON.parse(ev.data);
    if (data.type === 'end') {
      body.textContent += `\n[exit ${data.exitCode}]`;
      es.close();
      document.getElementById('scan-runner-busy').hidden = true;
      onEnd?.();
      return;
    }
    body.textContent += `${data.line}\n`;
    body.scrollTop = body.scrollHeight;
  };
  es.onerror = () => { es.close(); document.getElementById('scan-runner-busy').hidden = true; onEnd?.(); };
  document.getElementById('scan-runner-log-close').onclick = () => { logBox.hidden = true; };
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function humanTime(iso) { if (!iso) return ''; const d = new Date(iso); const m = (Date.now() - d.getTime())/60000; return m < 1 ? 'just now' : m < 60 ? `${Math.round(m)}m ago` : d.toLocaleString(); }

document.addEventListener('DOMContentLoaded', loadScanCatalog);
```

> **Note for the implementer:** the `EventSource` token query-param implies the auth preHandler must accept either the `X-Auto-Job-Token` header *or* a `?token=` query string. Audit `apps/server/src/server.ts`'s preHandler hook before merging — if it currently rejects token-via-query, update the SSE endpoint to accept it explicitly (whitelist by URL prefix `/dashboard/api/scans/jobs/`).

- [ ] **Step 5: Manual smoke test in fake mode**

```bash
AUTO_JOB_BACKEND=fake npm run server &
open http://127.0.0.1:47319/dashboard/
# Click Scans tab → click Run on the "Portal scan" card with runner=Fake.
# Expect log to stream "[fake] …" lines and exit 0 within ~2s.
```

- [ ] **Step 6: Commit**

```bash
git add web/template.html
git commit -m "feat(scan-launcher): dashboard UI — card grid + runner picker + live log"
```

---

### Task 6: SSE auth path

**Files:**
- Modify: `apps/server/src/server.ts` (auth preHandler)

- [ ] **Step 1: Locate the existing auth preHandler**

Search for the preHandler that reads `X-Auto-Job-Token`. Currently it almost certainly rejects requests without that header.

- [ ] **Step 2: Add a narrow query-param exception for SSE**

Allow `?token=…` only for paths matching `^/dashboard/api/scans/jobs/[^/]+/stream$`. Reject everywhere else (do not widen the surface).

- [ ] **Step 3: Add a test for the auth exception**

Cover three cases: stream URL with valid `?token=`, stream URL with invalid `?token=`, non-stream URL with `?token=` (must still 401).

- [ ] **Step 4: Run full server tests**

Run: `npm --prefix apps/server run test`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/server.ts apps/server/src/server.test.ts
git commit -m "feat(scan-launcher): allow ?token= on SSE stream endpoint only"
```

---

### Task 7: Verify the full pipeline gate

- [ ] **Step 1**: `npm run verify`
- [ ] **Step 2**: Manual sanity in real-claude mode (only if Claude is configured locally) — run the LinkedIn scan against a known search URL with `Score only` and pages=1, watch the live log, confirm a row lands in `data/pipeline.md` and a summary file appears under `data/scan-runs/`.
- [ ] **Step 3**: Update the progress log below.

---

## Verification Approach

| Layer | What we run | Why |
|---|---|---|
| Unit | `node --test web/scan-runner.test.mjs` | Catalog + argv mapping fan-out (5 cases). |
| Unit | `npm --prefix apps/server run test scan-job-registry` | Mutex + ring buffer + lifecycle. |
| Route | `npm --prefix apps/server run test scans` | 404, 409, 202 happy path with stub spawn. |
| Integration | `AUTO_JOB_BACKEND=fake npm run server` + manual click | End-to-end with the fake adapter, no LLM tokens spent. |
| Gate | `npm run verify` | Existing ownership/tracker/typecheck/build gates. |

## Risks & Blockers

1. **SSE auth mismatch.** `EventSource` cannot send custom headers, so the SSE endpoint needs a query-param token exception. Mitigated by Task 6 — narrow whitelist limited to one URL pattern.
2. **Single-process Playwright collision.** Mitigated by the registry mutex (one running job at a time, server-wide). UI shows the busy indicator and disables Run buttons while busy.
3. **`npm` not on PATH inside the LaunchAgent's child process.** Already a working assumption — `scripts/hourly-job-scan.mjs` calls `npm run ...` the same way and is tested in production. Worst case, surface the spawn error in the log pane.
4. **Dynamic `import` of `web/dashboard-handlers.mjs` from `server.ts`.** Already done by `registerDashboardRoutes`; we follow the same `pathToFileURL(resolve(repoRoot, "web", …))` pattern, so packaging in the desktop app inherits the existing `AUTO_JOB_WEB_DIR` override.
5. **Memory leak on long-running jobs.** Capped at 2 000 lines/job by the ring buffer. Rough max: 6 jobs × 2 000 lines × 200 bytes ≈ 2.4 MB.
6. **Token in URL leaks to server logs.** Local-first single-user app — acceptable risk; Fastify default access logs already record the token-bearing header in many setups. Not a regression.

## Key Decisions

- **Rename "Scan Hist." → "Scans"** instead of adding a separate "Scans" tab. Matches CLAUDE.md "surgical changes" — one fewer tab, history is still there below the launcher.
- **In-memory job registry, no DB.** Restart cancels jobs. Acceptable for a personal local tool; would not be acceptable for multi-user.
- **Per-spawn env vars, not per-server.** Lets the user pick a runner per click without restarting the bridge. The existing `applyBackendOverride` in `apps/server/src/index.ts` is left untouched.
- **No new framework.** Vanilla JS injected into `web/template.html`. Matches existing dashboard convention (3 837 lines of vanilla JS already in this file).
- **`gmail-scan` only ships `discovery-only`.** It doesn't run an LLM; surfacing other runners would mislead the user.

## Resolved Decisions (2026-04-29)

- **A1 → A1a**: SSE auth uses a `?token=` query-param exception scoped to `/dashboard/api/scans/jobs/*/stream` only.
- **discovery-only**: kept on `scan` / `linkedin-scan` / `newgrad-scan` but rendered behind a `<details>Advanced</details>` block, never as the default action. Runner row stays the primary control.
- **kill running job**: deferred to v2.
- **SSE endpoint test**: added to Task 4 (covers replay + push + close-on-end).

## Tech Debt (logged, not blocking)

- **Live UI badge during a run.** When a job exits non-zero, the catalog refresh after `onEnd` shows the failed status — but the cards do not update incrementally during the run. Acceptable for v1 because the post-end refresh is correct (registry is authoritative); revisit if multiple users hit the same dashboard. Add to `docs/exec-plans/tech-debt-tracker.md` after Task 7.

## Progress Log

- 2026-04-29 — Plan drafted.
- 2026-04-29 — Plan-eng review pass complete; A1a/advanced/v2-defer/SSE-test decisions locked in. No code changes yet.
- 2026-04-29 — Task 1 complete (commit `134500e`). `apps/server/src/contracts/scan-launch.ts` created, typecheck passes.
- 2026-04-29 — Task 2 complete (commit `758f2f5`). `web/scan-runner.mjs` + `apps/server/src/runtime/scan-runner.test.ts`. 9/9 tests pass.
- 2026-04-29 — Task 3 complete (commit `1e7d1c6`). `apps/server/src/runtime/scan-job-registry.{ts,test.ts}`. 5/5 tests pass.
- 2026-04-29 — Task 4 complete (commit `4c7fee9`). Routes + SSE + spawn integration. 6 new tests, 298 total green. **Tech debt:** `resolveWebDirForScans` in `server.ts` duplicates `resolveWebDir` from `routes/dashboard.ts` — extract to `lib/web-dir.ts` if the dashboard route system grows another consumer.
- 2026-04-29 — Task 5 complete (commit `a239f20`). UI added to `template.html`; `dashboard:build` regenerates `index.html`. `index.html` and `template.html` are NOT byte-identical (build injects DATA into index.html); template.html is canonical. 298/298 server tests still green.
- 2026-04-29 — Task 6 complete (commit `9bc67c4`). `tokenFromRequest` exported from `routes/dashboard.ts` allows `?token=` only on the SSE stream URL. 3 new auth tests, 301 total green.
- 2026-04-29 — Task 7 (verify) complete. `npm run verify` returns 0 errors / 1 unrelated tracker-dup warning. Tech debt logged: live-UI-badge-during-run + duplicated-resolveWebDir.

## Final Outcome

**Shipped on `main`** in 6 commits (Tasks 1–6) plus the verify gate (Task 7):

| Commit | Task | Summary |
|---|---|---|
| `134500e` | 1 | `apps/server/src/contracts/scan-launch.ts` — wire types. |
| `758f2f5` | 2 | `web/scan-runner.mjs` + `apps/server/src/runtime/scan-runner.test.ts` — catalog + argv builder. 9 tests. |
| `1e7d1c6` | 3 | `apps/server/src/runtime/scan-job-registry.{ts,test.ts}` — mutex + ring buffer + `lastRunBySkill`. 5 tests. |
| `4c7fee9` | 4 | `apps/server/src/routes/scans.{ts,test.ts}` + `web/dashboard-handlers.mjs` + `apps/server/src/server.ts` — `/dashboard/api/scans/*` routes, SSE stream, spawn integration. 6 tests. |
| `a239f20` | 5 | `web/template.html` (regenerated `web/index.html` via `npm run dashboard:build`) — launcher UI: card grid, runner picker, advanced disclosure, live log. |
| `9bc67c4` | 6 | `tokenFromRequest` helper + narrow SSE `?token=` whitelist. 3 auth tests. |

**Test impact:** 298 → 301 server tests green. Full `npm run verify` passes (0 errors, 1 pre-existing unrelated tracker warning).

**User-visible result:** the dashboard's renamed "Scans" tab now shows a 6-card launcher above the history table. Each card has a runner row (LLM SDK pickers as primary buttons; `discovery-only` tucked under `<details>Advanced</details>`), per-skill input fields, a Run button, and a last-result badge that survives a script crash via the in-memory registry. Running a scan opens a live log pane streaming stdout/stderr over SSE; concurrent runs are blocked at 409 with a clear error.

**Out of scope (kept as written):** kill-running-job button, multi-user auth, job persistence across restarts, scraper changes.

**Tech debt logged in `docs/exec-plans/tech-debt-tracker.md`:**
- Live UI badge during an in-flight run (post-end refresh is correct; mid-run feels stale).
- Duplicated `resolveWebDir` in `server.ts` vs. `routes/dashboard.ts`.

---

## Self-Review Pass

**Spec coverage:** every user-visible item in the request is covered: list of scan skills (Task 2 catalog), runner picker (Task 5 UI + Task 2 `runnerEnv`), visual launcher (Task 5), reference to open-source patterns (Architecture section).

**Placeholders:** none — all argv mappings, env vars, CSS classes, test cases, and CSS selectors are spelled out. No TODO / TBD anywhere.

**Type consistency:** `ScanRunnerId`, `ScanCatalogEntry`, `ScanRunRequest`, `ScanJobEvent` all defined in Task 1 and reused by Tasks 3, 4, 5 with matching field names (`skillId`, `runner`, `inputs`, `jobId`, `exitCode`).

**Scope check:** 7 tasks, ~10 new/modified files, 1 new tab section (no new top-level tab), no refactor of unrelated code. Inside the CLAUDE.md guardrails.
