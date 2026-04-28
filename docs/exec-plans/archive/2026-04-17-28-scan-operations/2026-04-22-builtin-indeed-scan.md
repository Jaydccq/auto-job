# Built In and Indeed Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/career-ops builtin-scan` and add `/career-ops indeed-scan` as full LinkedIn-style closed-loop scanners using read-only `bb-browser site` adapters.

**Architecture:** Add one shared browser-backed job-board scan runner that calls `bb-browser site builtin/jobs` or `bb-browser site indeed/jobs`, normalizes adapter JSON into `NewGradRow`, and reuses existing bridge score, enrich, pipeline/history, and direct evaluation behavior. Keep site-specific behavior in small normalizer helpers and mode docs.

**Tech Stack:** Node.js, TypeScript via `tsx`, `bb-browser` CLI site adapters, Fastify bridge endpoints, existing newgrad scanner contracts, Vitest, Markdown mode files.

---

## Background

LinkedIn scanning already proves the desired shape: browser-backed collection,
source normalization, bridge scoring, detail enrichment, pipeline/history writes,
and capped direct evaluation. Built In has an older `scan.mjs --builtin-only`
path plus a pending endpoint. Indeed has a read-only `bb-browser site` adapter
but no Career-Ops mode.

2026-04-23 follow-up: after finding low-value `Description excerpt` pollution in
LinkedIn and JobRight/newgrad enrich paths, the user asked for the same logic to
be applied to Built In and Indeed and for a real `bb-browser` walkthrough of
both flows. Success means the shared Built In/Indeed runner rejects page shell,
search/list, login, and promotional text as JD excerpts, preserves useful job
description snippets, and a bounded read-only scan shows whether each source can
actually collect useful detail text. The flow must not click Apply or any
mutating control.

The user approved the complete path for both Built In and Indeed:

```text
collect -> dedupe -> score -> enrich/detail text -> persist -> direct evaluate -> tracker/report/Apply Next
```

## Goal

Implement a shared runner and source plumbing so:

1. `/career-ops builtin-scan` can run through `bb-browser site builtin/jobs`.
2. `/career-ops indeed-scan` can run through `bb-browser site indeed/jobs`.
3. Both commands support score-only previews, no-evaluate pipeline writes, and
   capped direct evaluations.
4. Indeed preserves the user-provided full URL filters, especially
   `fromage=7`, empty `l=`, and `sc=...ENTRY_LEVEL...`.
5. No scanner clicks Apply, Easy Apply, Save, job alerts, login, resume upload,
   or any mutating control.

## Scope

In scope:

- Shared `scripts/job-board-scan-bb-browser.ts`.
- Site normalizer helpers for Built In and Indeed adapter JSON.
- Full-URL support in `bb-browser/sites/indeed/jobs.js`.
- Source tag support for `indeed-scan`.
- `npm run indeed-scan`.
- Preserve `npm run builtin-scan` user-facing flags while moving it to the
  adapter-backed runner or documenting an explicit legacy fallback.
- Mode docs and routing docs.
- Focused tests and live read-only checks.

Out of scope:

- Bypassing CAPTCHA, bot checks, or login walls.
- Applying to jobs or changing job-board account state.
- Replacing the whole `scan.mjs` portal scanner.
- Changing profile scoring thresholds.
- Building a generic plugin framework beyond this shared runner.

## Assumptions

- `bb-browser site builtin/jobs` and `bb-browser site indeed/jobs` are installed
  and available.
- The bridge server is running for score/enrich/evaluate paths.
- Built In and Indeed rows can reuse `newgrad_scan` scoring for the first
  complete implementation.
- `score-only` must not call bridge write endpoints.
- Direct evaluation can use `newgrad_quick`, matching LinkedIn.

## Uncertainties

- Indeed may return verification errors intermittently. Treat that as a clear
  blocked state, not an automation bypass task.
- Some Indeed cards have weak snippets. If detail text is blocked and metadata
  is too thin, skip rather than queue low-context evaluations.
- Built In has an existing direct HTTP scanner. The implementation should avoid
  surprising users who rely on current `npm run builtin-scan` flags.

## Simplest Viable Path

Create one runner with a `--source builtin|indeed` option and expose two npm
aliases:

```text
npm run builtin-scan -> scripts/job-board-scan-bb-browser.ts --source builtin
npm run indeed-scan  -> scripts/job-board-scan-bb-browser.ts --source indeed
```

The runner handles shared orchestration. Normalizers handle source-specific row
mapping and URL rules.

## What Already Exists

- `scripts/linkedin-scan-bb-browser.ts`: orchestration pattern to reuse.
- `bb-browser/sites/builtin/jobs.js`: read-only Built In list adapter.
- `bb-browser/sites/indeed/jobs.js`: read-only Indeed list adapter.
- `bridge/src/adapters/newgrad-source.ts`: source-to-pipeline tag mapping.
- `bridge/src/adapters/newgrad-pending.ts`: rich scanner pending parser.
- `bridge/src/adapters/newgrad-scan-history.ts`: scan-history persistence.
- `bridge/src/adapters/newgrad-links.ts`: pipeline URL selection.
- `POST /v1/newgrad-scan/score`: scoring rows.
- `POST /v1/newgrad-scan/enrich`: pipeline/history writes and evaluation
  candidates.
- `POST /v1/evaluate`: direct evaluation.
- `POST /v1/builtin-scan/pending`: existing Built In pending read path.
- `modes/builtin-scan.md`: existing Built In command documentation.
- `modes/linkedin-scan.md`: complete browser-backed scanner documentation
  pattern.

## NOT In Scope

- Legacy portal API scanning changes outside Built In command preservation.
- New dashboard design work.
- New scoring dimensions for Indeed.
- Automated login or verification solving.
- Employer-contact or application-submission behavior.

## Implementation Steps

### Task 1: Add source tag and pending parser support for Indeed

**Files:**

- Modify: `bridge/src/adapters/newgrad-source.ts`
- Modify: `bridge/src/adapters/newgrad-source.test.ts`
- Modify: `bridge/src/adapters/newgrad-pending.ts`
- Modify: `bridge/src/adapters/newgrad-pending.test.ts`
- Modify: `bridge/src/adapters/newgrad-scan-history.test.ts`

- [ ] **Step 1: Write failing source mapping tests**

Add to `bridge/src/adapters/newgrad-source.test.ts`:

```ts
test("maps Indeed source to indeed-scan", () => {
  expect(pipelineTagForSource("https://www.indeed.com/viewjob?jk=abc")).toBe("indeed-scan");
  expect(pipelineTagForSource("indeed.com")).toBe("indeed-scan");
  expect(sourceFromPipelineTag("indeed-scan")).toBe("indeed.com");
});
```

- [ ] **Step 2: Write failing pending parser test**

Add to `bridge/src/adapters/newgrad-pending.test.ts`:

```ts
test("reads indeed-scan pipeline entries with Indeed source", () => {
  writeFileSync(
    join(repoRoot, "data/pipeline.md"),
    [
      "# Pipeline",
      "",
      "## Pendientes",
      "",
      "- [ ] https://www.indeed.com/viewjob?jk=abc123 -- Indeed Co | Software Engineer I (via indeed-scan, score: 8/9, value: 7.1/10) [value-reasons:entry_level|salary_present]",
      "",
    ].join("\n"),
  );

  const result = readNewGradPendingEntries(repoRoot, 10);

  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]).toMatchObject({
    url: "https://www.indeed.com/viewjob?jk=abc123",
    company: "Indeed Co",
    role: "Software Engineer I",
    source: "indeed.com",
    score: 8,
    valueScore: 7.1,
  });
  expect(result.entries[0]?.valueReasons).toEqual(["entry_level", "salary_present"]);
});
```

- [ ] **Step 3: Run tests and verify failure**

Run:

```bash
npm --prefix bridge run test -- src/adapters/newgrad-source.test.ts src/adapters/newgrad-pending.test.ts
```

Expected: source mapping and pending parser tests fail because `indeed-scan` is not supported.

- [ ] **Step 4: Implement source mapping with a minimal diff**

Update `bridge/src/adapters/newgrad-source.ts` without changing the existing
`scanSourceForRow` fallback behavior:

```ts
const BUILTIN_SCAN_SOURCE = "builtin.com";
const LINKEDIN_SCAN_SOURCE = "linkedin.com";
const INDEED_SCAN_SOURCE = "indeed.com";

export function pipelineTagForSource(source: string | null | undefined): string {
  const normalized = (source ?? "").toLowerCase();
  if (normalized.includes("linkedin")) return "linkedin-scan";
  if (normalized.includes("builtin")) return "builtin-scan";
  if (normalized.includes("indeed")) return "indeed-scan";
  return "newgrad-scan";
}

export function sourceFromPipelineTag(tag: string): string {
  if (tag === "linkedin-scan") return LINKEDIN_SCAN_SOURCE;
  if (tag === "builtin-scan") return BUILTIN_SCAN_SOURCE;
  if (tag === "indeed-scan") return INDEED_SCAN_SOURCE;
  return "newgrad-jobs.com";
}
```

- [ ] **Step 5: Implement pending parser support**

Update the source tag group in `bridge/src/adapters/newgrad-pending.ts`:

```ts
const RICH_PENDING_LINE_RE =
  /^-\s+\[\s\]\s+(?<url>https?:\/\/\S+)\s+(?:\u2014|--)\s+(?<company>.+?)\s+\|\s+(?<role>.+?)\s+\(via (?<sourceTag>newgrad-scan|builtin-scan|linkedin-scan|indeed-scan), score:\s*(?<score>[0-9.]+)\/[0-9.]+(?:,\s+value:\s*(?<valueScore>[0-9.]+)\/10)?\)(?:\s+\[value-reasons:(?<valueReasons>[^\]]+)\])?(?:\s+\[local:(?<localJdPath>[^\]]+)\])?/;
```

Keep the existing variable name if it differs; only expand the accepted source
tags and tolerate `--` because this repo prefers ASCII for new docs.

- [ ] **Step 6: Add scan-history coverage**

Add to `bridge/src/adapters/newgrad-scan-history.test.ts`:

```ts
test("appendNewGradScanHistory records Indeed rows under indeed-scan", () => {
  appendNewGradScanHistory(repoRoot, [
    {
      row: {
        source: "indeed.com",
        title: "Software Engineer I",
        company: "Indeed Co",
        location: "Remote",
        postedAgo: "New",
        detailUrl: "https://www.indeed.com/viewjob?jk=abc123",
        applyUrl: "https://www.indeed.com/viewjob?jk=abc123",
      },
      score: 8,
      reasons: ["entry_level"],
    },
  ], "promoted");

  const content = readFileSync(join(repoRoot, "data/scan-history.tsv"), "utf-8");
  expect(content).toContain("indeed-scan\tSoftware Engineer I\tIndeed Co\tpromoted");
});
```

- [ ] **Step 7: Run focused tests**

Run:

```bash
npm --prefix bridge run test -- src/adapters/newgrad-source.test.ts src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts
```

Expected: all tests pass.

### Task 2: Add adapter output normalizers

**Files:**

- Create: `bridge/src/adapters/job-board-scan-normalizer.ts`
- Create: `bridge/src/adapters/job-board-scan-normalizer.test.ts`

- [ ] **Step 1: Write normalizer tests**

Create `bridge/src/adapters/job-board-scan-normalizer.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  buildIndeedPageUrl,
  normalizeBuiltInAdapterRows,
  normalizeIndeedAdapterRows,
} from "./job-board-scan-normalizer.js";

describe("job-board-scan-normalizer", () => {
  test("normalizes Built In adapter rows into NewGradRow shape", () => {
    const rows = normalizeBuiltInAdapterRows([
      {
        position: 1,
        id: "9119371",
        title: "Software Developer",
        company: "BAE Systems, Inc.",
        location: "Mount Laurel, NJ, USA",
        workModel: "Hybrid",
        salary: "79K-135K Annually",
        seniority: "Junior",
        postedAgo: "49 Minutes Ago",
        summary: "Develop software solutions and data pipelines.",
        url: "https://builtin.com/job/software-developer/9119371",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        source: "builtin.com",
        position: 1,
        title: "Software Developer",
        company: "BAE Systems, Inc.",
        location: "Mount Laurel, NJ, USA",
        workModel: "Hybrid",
        salary: "79K-135K Annually",
        postedAgo: "49 Minutes Ago",
        detailUrl: "https://builtin.com/job/software-developer/9119371",
        applyUrl: "https://builtin.com/job/software-developer/9119371",
        qualifications: expect.stringContaining("Develop software solutions"),
      }),
    ]);
  });

  test("normalizes Indeed adapter rows into NewGradRow shape", () => {
    const rows = normalizeIndeedAdapterRows([
      {
        position: 1,
        id: "abc123",
        title: "Software Engineer I",
        company: "Uber",
        location: "Remote in San Francisco, CA",
        salary: "$150,000 - $166,000 a year",
        attributes: ["Full-time"],
        postedAgo: "New",
        snippet: "Build backend services.",
        url: "https://www.indeed.com/viewjob?jk=abc123",
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        source: "indeed.com",
        position: 1,
        title: "Software Engineer I",
        company: "Uber",
        location: "Remote in San Francisco, CA",
        workModel: "Remote",
        salary: "$150,000 - $166,000 a year",
        postedAgo: "New",
        detailUrl: "https://www.indeed.com/viewjob?jk=abc123",
        applyUrl: "https://www.indeed.com/viewjob?jk=abc123",
        qualifications: expect.stringContaining("Build backend services"),
      }),
    ]);
  });

  test("preserves full Indeed URL filters while paging", () => {
    const url = buildIndeedPageUrl(
      "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp",
      3,
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("software engineer, AI engineer");
    expect(parsed.searchParams.get("l")).toBe("");
    expect(parsed.searchParams.get("fromage")).toBe("7");
    expect(parsed.searchParams.get("sc")).toBe("0kf:attr(CF3CP)explvl(ENTRY_LEVEL);");
    expect(parsed.searchParams.get("from")).toBe("searchOnDesktopSerp");
    expect(parsed.searchParams.get("start")).toBe("20");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm --prefix bridge run test -- src/adapters/job-board-scan-normalizer.test.ts
```

Expected: module not found.

- [ ] **Step 3: Implement normalizer module**

Create `bridge/src/adapters/job-board-scan-normalizer.ts`:

```ts
import type { NewGradRow } from "../contracts/newgrad.js";

type AdapterJob = Record<string, unknown>;

export function normalizeBuiltInAdapterRows(jobs: readonly AdapterJob[]): NewGradRow[] {
  return jobs.map((job, index) => normalizeJob(job, index, "builtin.com")).filter(isCompleteRow);
}

export function normalizeIndeedAdapterRows(jobs: readonly AdapterJob[]): NewGradRow[] {
  return jobs.map((job, index) => normalizeJob(job, index, "indeed.com")).filter(isCompleteRow);
}

export function buildIndeedPageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl);
  if (page <= 1) {
    url.searchParams.delete("start");
  } else {
    url.searchParams.set("start", String((page - 1) * 10));
  }
  return url.toString();
}

export function buildBuiltInPageUrl(baseUrl: string, page: number): string {
  const url = new URL(baseUrl);
  if (page <= 1) {
    url.searchParams.delete("page");
  } else {
    url.searchParams.set("page", String(page));
  }
  return url.toString();
}

function normalizeJob(job: AdapterJob, index: number, source: "builtin.com" | "indeed.com"): NewGradRow {
  const title = text(job.title);
  const company = text(job.company);
  const location = text(job.location);
  const url = canonicalJobUrl(text(job.url), source);
  const attributes = arrayText(job.attributes);
  const summary = [text(job.summary), text(job.snippet), attributes.join(" ")].filter(Boolean).join(" ");
  return {
    source,
    position: numberValue(job.position) ?? index + 1,
    title,
    company,
    location,
    workModel: text(job.workModel) || inferWorkModel([location, ...attributes].join(" ")),
    salary: text(job.salary),
    postedAgo: text(job.postedAgo),
    detailUrl: url,
    applyUrl: url,
    companySize: null,
    industry: null,
    qualifications: summary || null,
    h1bSponsored: false,
    sponsorshipSupport: "unknown",
    confirmedSponsorshipSupport: "unknown",
    requiresActiveSecurityClearance: /\b(?:active\s+)?(?:secret|top secret|ts\/sci|security clearance)\b/i.test(summary),
    confirmedRequiresActiveSecurityClearance: false,
    isNewGrad: isEarlyCareer([title, text(job.seniority), summary].join(" ")),
  };
}

function isCompleteRow(row: NewGradRow): boolean {
  return Boolean(row.title && row.company && row.detailUrl);
}

function canonicalJobUrl(value: string, source: string): string {
  if (!value) return "";
  const url = new URL(value, source === "builtin.com" ? "https://builtin.com" : "https://www.indeed.com");
  url.hash = "";
  return url.toString();
}

function inferWorkModel(value: string): string {
  if (/\bremote\b/i.test(value)) return "Remote";
  if (/\bhybrid\b/i.test(value)) return "Hybrid";
  if (/\bon-?site|in-?office\b/i.test(value)) return "On-site";
  return "";
}

function isEarlyCareer(value: string): boolean {
  return /\b(new grad|graduate|entry[- ]level|junior|intern|co-?op|software engineer i|engineer i|ic1)\b/i.test(value);
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function arrayText(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function numberValue(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
```

- [ ] **Step 4: Run normalizer tests**

Run:

```bash
npm --prefix bridge run test -- src/adapters/job-board-scan-normalizer.test.ts
```

Expected: all tests pass.

### Task 3: Add full URL support to the Indeed site adapter

**Files:**

- Modify: `bb-browser/sites/indeed/jobs.js`

- [ ] **Step 1: Update adapter metadata**

Add a `url` argument in the `@meta` block:

```json
"url": {"required": false, "description": "Full Indeed search URL; preserves q, l, fromage, sc, and other filters"}
```

- [ ] **Step 2: Modify URL construction**

Change `buildSearchUrl` in `bb-browser/sites/indeed/jobs.js` so a full URL wins:

```js
function buildSearchUrl(searchQuery, searchLocation, pageNumber, values) {
  const explicitUrl = stringValue(values.url);
  const target = explicitUrl
    ? parseIndeedUrl(explicitUrl)
    : new URL("/jobs", "https://www.indeed.com");

  if (!explicitUrl) {
    target.searchParams.set("q", searchQuery);
    target.searchParams.set("l", searchLocation);
    if (stringValue(values.radius)) target.searchParams.set("radius", stringValue(values.radius));
    if (stringValue(values.fromage)) target.searchParams.set("fromage", stringValue(values.fromage));
  }

  if (pageNumber > 1) {
    target.searchParams.set("start", String((pageNumber - 1) * 10));
  } else {
    target.searchParams.delete("start");
  }
  return target.toString();
}

function parseIndeedUrl(value) {
  const parsed = new URL(value, "https://www.indeed.com");
  if (parsed.hostname !== "www.indeed.com" && parsed.hostname !== "indeed.com") {
    return new URL("/jobs", "https://www.indeed.com");
  }
  if (parsed.hostname === "indeed.com") parsed.hostname = "www.indeed.com";
  return parsed;
}
```

- [ ] **Step 3: Check adapter syntax**

Run:

```bash
node --check bb-browser/sites/indeed/jobs.js
```

Expected: no syntax errors.

- [ ] **Step 4: Run live read-only adapter check**

Run:

```bash
bb-browser site indeed/jobs --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --limit 20 --json
```

Expected: success with `data.url` preserving `fromage=7` and `sc=0kf...ENTRY_LEVEL...`, or a clear verification error with `hint` and `action`.

### Task 4: Add shared job-board scan runner

**Files:**

- Create: `scripts/job-board-scan-bb-browser.ts`
- Modify: `package.json`

- [ ] **Step 1: Create runner skeleton with help output**

Create `scripts/job-board-scan-bb-browser.ts` with:

```ts
import { randomUUID } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type {
  EvaluationInput,
  EvaluationMode,
  EvaluationResult,
  JobSnapshot,
} from "../bridge/src/contracts/jobs.ts";
import type {
  EnrichedRow,
  FilteredRow,
  NewGradDetail,
  NewGradEnrichResult,
  NewGradRow,
  NewGradScoreResult,
  PipelineEntry,
  ScoredRow,
} from "../bridge/src/contracts/newgrad.ts";
import {
  buildBuiltInPageUrl,
  buildIndeedPageUrl,
  normalizeBuiltInAdapterRows,
  normalizeIndeedAdapterRows,
} from "../bridge/src/adapters/job-board-scan-normalizer.ts";
import {
  loadNegativeKeywords,
  loadNewGradScanConfig,
  loadTrackedCompanyRoles,
} from "../bridge/src/adapters/newgrad-config.ts";
import {
  isRecentNewGradRow,
  loadNewGradSeenKeys,
  newGradCompanyRoleKey,
  wasNewGradRowSeen,
} from "../bridge/src/adapters/newgrad-scan-history.ts";
import { scoreAndFilter } from "../bridge/src/adapters/newgrad-scorer.ts";

const PROTOCOL_VERSION = "1.0.0";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 47319;
const DEFAULT_EVALUATION_QUEUE_DELAY_MS = 2100;
const DEFAULT_EVALUATION_WAIT_TIMEOUT_MS = 20 * 60_000;

type Source = "builtin" | "indeed";

type Options = {
  source: Source;
  url: string | null;
  query: string | null;
  location: string | null;
  path: string | null;
  limit: number | null;
  pages: number;
  dryRun: boolean;
  scoreOnly: boolean;
  evaluateOnly: boolean;
  pendingLimit: number;
  evaluate: boolean;
  enrichLimit: number | null;
  evaluateLimit: number | null;
  evaluationMode: EvaluationMode;
  waitEvaluations: boolean;
  evaluationQueueDelayMs: number;
  evaluationWaitTimeoutMs: number;
  bridgeHost: string;
  bridgePort: number;
  help: boolean;
};

const execFile = promisify(execFileCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function usage(): string {
  return `career-ops browser-backed job-board scan

Usage:
  npm run builtin-scan -- [options]
  npm run indeed-scan -- [options]

Options:
  --source <builtin|indeed>       Source, normally supplied by npm script.
  --url <url>                     Full search URL.
  --query <text>                  Search query when --url is omitted.
  --location <text>               Indeed location when --url is omitted.
  --path <path-or-url>            Built In path or URL when --url is omitted.
  --dry-run                       Compatibility alias for --score-only.
  --score-only                    Extract and score rows without write endpoints.
  --evaluate-only                 Evaluate already saved Built In pending rows through the legacy path.
  --pending-limit <n>             Pending rows to read for --evaluate-only. Default: 100.
  --no-evaluate                   Stop after enrich/pipeline write.
  --limit <n>                     Limit unique list rows before scoring.
  --pages <n>                     Number of result pages to scan. Default: 1.
  --enrich-limit <n>              Limit promoted rows before detail capture.
  --evaluate-limit <n>            Limit direct evaluations.
  --evaluation-mode <mode>        newgrad_quick or default. Default: newgrad_quick.
  --no-wait-evaluations           Queue evaluation jobs and exit.
  --bridge-host <host>            Bridge host. Default: ${DEFAULT_HOST}
  --bridge-port <port>            Bridge port. Default: ${DEFAULT_PORT}
  --help                          Show this help.

Safety:
  This scanner reads list/detail pages only. It never clicks Apply, Easy Apply, Save, alerts, login, or resume upload controls.
`;
}
```

- [ ] **Step 2: Add argument parsing**

Implement parser functions in the same file:

```ts
function parseArgs(argv: string[]): Options {
  const options: Options = {
    source: "builtin",
    url: null,
    query: null,
    location: null,
    path: null,
    limit: null,
    pages: 1,
    dryRun: false,
    scoreOnly: false,
    evaluateOnly: false,
    pendingLimit: 100,
    evaluate: true,
    enrichLimit: null,
    evaluateLimit: null,
    evaluationMode: "newgrad_quick",
    waitEvaluations: true,
    evaluationQueueDelayMs: DEFAULT_EVALUATION_QUEUE_DELAY_MS,
    evaluationWaitTimeoutMs: DEFAULT_EVALUATION_WAIT_TIMEOUT_MS,
    bridgeHost: DEFAULT_HOST,
    bridgePort: DEFAULT_PORT,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
      i += 1;
      return value;
    };

    switch (arg) {
      case "--source": {
        const source = next();
        if (source !== "builtin" && source !== "indeed") throw new Error("--source must be builtin or indeed");
        options.source = source;
        break;
      }
      case "--url": options.url = next(); break;
      case "--query": options.query = next(); break;
      case "--location": options.location = next(); break;
      case "--path": options.path = next(); break;
      case "--limit": options.limit = positiveInt(next(), arg); break;
      case "--pages": options.pages = positiveInt(next(), arg); break;
      case "--dry-run":
        options.dryRun = true;
        options.scoreOnly = true;
        break;
      case "--score-only": options.scoreOnly = true; break;
      case "--evaluate-only": options.evaluateOnly = true; break;
      case "--pending-limit": options.pendingLimit = positiveInt(next(), arg); break;
      case "--no-evaluate": options.evaluate = false; break;
      case "--enrich-limit": options.enrichLimit = positiveInt(next(), arg); break;
      case "--evaluate-limit": options.evaluateLimit = positiveInt(next(), arg); break;
      case "--evaluation-mode": {
        const mode = next();
        if (mode !== "newgrad_quick" && mode !== "default") throw new Error("--evaluation-mode must be newgrad_quick or default");
        options.evaluationMode = mode;
        break;
      }
      case "--no-wait-evaluations": options.waitEvaluations = false; break;
      case "--evaluation-queue-delay-ms": options.evaluationQueueDelayMs = nonNegativeInt(next(), arg); break;
      case "--evaluation-wait-timeout-ms": options.evaluationWaitTimeoutMs = positiveInt(next(), arg); break;
      case "--bridge-host": options.bridgeHost = next(); break;
      case "--bridge-port": options.bridgePort = positiveInt(next(), arg); break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  return options;
}

function positiveInt(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
  return value;
}

function nonNegativeInt(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}
```

- [ ] **Step 3: Implement `bb-browser site` collection**

Add:

```ts
type BbEnvelope<T> = { success: true; data: T } | { success: false; error: string; hint?: string; action?: string };
type AdapterResult = { source: string; url: string; count: number; totalParsed?: number; jobs: Array<Record<string, unknown>> };

async function collectRows(options: Options): Promise<{ rows: NewGradRow[]; rawCount: number }> {
  const rows: NewGradRow[] = [];
  let rawCount = 0;

  for (let page = 1; page <= options.pages; page += 1) {
    const result = await runSiteAdapter(options, page);
    rawCount += result.jobs.length;
    const normalized = options.source === "builtin"
      ? normalizeBuiltInAdapterRows(result.jobs)
      : normalizeIndeedAdapterRows(result.jobs);
    rows.push(...normalized);
    console.log(`Page ${page}/${options.pages}: parsed=${result.totalParsed ?? result.jobs.length}, rows=${normalized.length}`);
    if (result.jobs.length === 0) break;
  }

  return { rows, rawCount };
}

async function runSiteAdapter(options: Options, page: number): Promise<AdapterResult> {
  const args = options.source === "builtin"
    ? builtInAdapterArgs(options, page)
    : indeedAdapterArgs(options, page);
  const { stdout } = await execFile("bb-browser", args, { maxBuffer: 25 * 1024 * 1024, timeout: 120_000 });
  const envelope = JSON.parse(stdout) as BbEnvelope<AdapterResult>;
  if (!envelope.success) {
    throw new Error([envelope.error, envelope.hint, envelope.action].filter(Boolean).join(" | "));
  }
  return envelope.data;
}

function builtInAdapterArgs(options: Options, page: number): string[] {
  const args = ["site", "builtin/jobs", "--json", "--page", String(page)];
  if (options.url) args.push("--path", buildBuiltInPageUrl(options.url, page));
  if (options.path) args.push("--path", options.path);
  if (options.query) args.push("--query", options.query);
  args.push("--limit", String(options.limit ?? 100));
  return args;
}

function indeedAdapterArgs(options: Options, page: number): string[] {
  const args = ["site", "indeed/jobs", "--json", "--page", String(page)];
  if (options.url) args.push("--url", buildIndeedPageUrl(options.url, page));
  if (options.query) args.push("--query", options.query);
  if (options.location !== null) args.push("--location", options.location);
  args.push("--limit", String(options.limit ?? 100));
  return args;
}
```

- [ ] **Step 4: Implement the main flow and required helper boundaries**

Add the main flow first so each helper has a concrete caller:

```ts
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (options.evaluateOnly) {
    await runLegacyEvaluateOnly(options);
    return;
  }

  await assertBbBrowserAvailable();
  const token = await readBridgeToken();
  const bridgeBase = `http://${options.bridgeHost}:${options.bridgePort}`;
  await assertBridgeHealthy(bridgeBase, token);

  const collected = await collectRows(options);
  const rows = dedupeRows(collected.rows).slice(0, options.limit ?? undefined);
  console.log(`Extracted ${collected.rawCount} raw ${options.source} rows; ${rows.length} unique after dedupe`);
  if (rows.length === 0) return;

  const score = options.scoreOnly
    ? scoreRowsLocally(rows)
    : await scoreRows(bridgeBase, token, rows);
  console.log(`Scored rows: promoted=${score.promoted.length}, filtered=${score.filtered.length}`);
  printPromotedRows(score.promoted);
  if (options.scoreOnly || score.promoted.length === 0) {
    if (options.scoreOnly) console.log("--score-only used: no bridge write endpoints were called.");
    return;
  }

  const promoted = score.promoted.slice(0, options.enrichLimit ?? undefined);
  const enrichedRows = await enrichRows(promoted, options);
  const enrich = await writeEnrichedRows(bridgeBase, token, enrichedRows);
  console.log(`Bridge enrich result: added=${enrich.added}, skipped=${enrich.skipped}, candidates=${enrich.candidates?.length ?? 0}`);
  if (!options.evaluate) return;

  const candidates = dedupePipelineEntries([...(enrich.candidates ?? enrich.entries)])
    .slice(0, options.evaluateLimit ?? undefined);
  const queued = await queueDirectEvaluations(bridgeBase, token, candidates, enrichedRows, options);
  console.log(`Direct evaluation queue: queued=${queued.jobs.length}, failed=${queued.failed.length}, skipped=${queued.skipped}`);
  if (options.waitEvaluations && queued.jobs.length > 0) {
    const result = await waitForEvaluations(bridgeBase, token, queued.jobs, options);
    console.log(`Direct evaluation result: completed=${result.completed.length}, failed=${result.failed.length}, timedOut=${result.timedOut.length}`);
  }
}
```

Then add these helper groups in the same file. Keep them source-agnostic except
for `sourceSignal`.

Bridge setup:

```ts
async function runLegacyEvaluateOnly(options: Options): Promise<void> {
  if (options.source !== "builtin") {
    throw new Error("--evaluate-only is only supported for Built In pending rows");
  }
  const args = [
    "scan.mjs",
    "--builtin-only",
    "--evaluate-only",
    "--pending-limit",
    String(options.pendingLimit),
    "--bridge-host",
    options.bridgeHost,
    "--bridge-port",
    String(options.bridgePort),
    "--evaluation-mode",
    options.evaluationMode,
  ];
  if (options.evaluateLimit !== null) args.push("--evaluate-limit", String(options.evaluateLimit));
  if (!options.waitEvaluations) args.push("--no-wait-evaluations");
  const { stdout, stderr } = await execFile("node", args, {
    cwd: repoRoot,
    maxBuffer: 25 * 1024 * 1024,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function assertBbBrowserAvailable(): Promise<void> {
  await execFile("bb-browser", ["--version"], { maxBuffer: 1024 * 1024 });
}

async function readBridgeToken(): Promise<string> {
  const tokenPath = join(repoRoot, "bridge", ".bridge-token");
  if (!existsSync(tokenPath)) throw new Error("bridge token not found; start the bridge with npm run ext:bridge");
  return (await readFile(tokenPath, "utf8")).trim();
}

async function assertBridgeHealthy(base: string, token: string): Promise<void> {
  await getEnvelope<unknown>(base, token, "/v1/health");
  console.log("Bridge health: ok");
}
```

Local scoring for `--score-only`:

```ts
function scoreRowsLocally(rows: NewGradRow[]): NewGradScoreResult {
  const scanConfig = loadNewGradScanConfig(repoRoot);
  const negativeKeywords = loadNegativeKeywords(repoRoot);
  const trackedSet = loadTrackedCompanyRoles(repoRoot);
  const seenKeys = loadNewGradSeenKeys(repoRoot);
  const recentUnseenRows: NewGradRow[] = [];
  const preFiltered: FilteredRow[] = [];

  for (const row of rows) {
    if (!isRecentNewGradRow(row)) {
      preFiltered.push({ row, reason: "older_than_24h", detail: `Posted ${row.postedAgo || "outside the last 24h"}` });
      continue;
    }
    const trackedKey = newGradCompanyRoleKey(row);
    if (trackedKey && trackedSet.has(trackedKey)) {
      preFiltered.push({ row, reason: "already_tracked", detail: `Already tracked: ${row.company} | ${row.title}` });
      continue;
    }
    if (wasNewGradRowSeen(row, seenKeys)) {
      preFiltered.push({ row, reason: "already_scanned", detail: "Already seen in scan history or pipeline" });
      continue;
    }
    recentUnseenRows.push(row);
  }

  const { promoted, filtered } = scoreAndFilter(recentUnseenRows, scanConfig, negativeKeywords, trackedSet);
  return { promoted, filtered: [...preFiltered, ...filtered] };
}
```

Detail enrichment from list rows:

```ts
async function enrichRows(promotedRows: readonly ScoredRow[], options: Options): Promise<EnrichedRow[]> {
  const rows: EnrichedRow[] = [];
  for (const scored of promotedRows) {
    const description = await captureDetailText(scored.row.detailUrl).catch(() => scored.row.qualifications ?? "");
    rows.push({ row: scored, detail: detailFromRow(scored.row, description) });
  }
  return rows;
}

async function captureDetailText(url: string): Promise<string> {
  const { stdout } = await execFile("bb-browser", ["fetch", url], {
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });
  return htmlToText(stdout).slice(0, 20_000);
}

function htmlToText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function detailFromRow(row: NewGradRow, description: string): NewGradDetail {
  return {
    position: row.position,
    title: row.title,
    company: row.company,
    location: row.location,
    employmentType: null,
    workModel: row.workModel || null,
    seniorityLevel: null,
    salaryRange: row.salary,
    matchScore: null,
    expLevelMatch: null,
    skillMatch: null,
    industryExpMatch: null,
    description,
    industries: row.industry ? [row.industry] : [],
    recommendationTags: [],
    responsibilities: [],
    requiredQualifications: row.qualifications ? [row.qualifications] : [],
    skillTags: [],
    taxonomy: [],
    companyWebsite: null,
    companyDescription: null,
    companySize: row.companySize,
    companyLocation: null,
    companyFoundedYear: null,
    companyCategories: [],
    h1bSponsorLikely: null,
    sponsorshipSupport: row.sponsorshipSupport,
    h1bSponsorshipHistory: [],
    requiresActiveSecurityClearance: row.requiresActiveSecurityClearance,
    confirmedSponsorshipSupport: row.confirmedSponsorshipSupport,
    confirmedRequiresActiveSecurityClearance: row.confirmedRequiresActiveSecurityClearance,
    insiderConnections: null,
    originalPostUrl: row.detailUrl,
    applyNowUrl: row.applyUrl,
    applyFlowUrls: [row.detailUrl],
  };
}
```

Evaluation input:

```ts
function sourceSignal(source: Source): string {
  return source === "builtin" ? "builtin-scan" : "indeed-scan";
}

function buildEvaluationInput(
  source: Source,
  candidate: PipelineEntry,
  matchedRow: EnrichedRow | undefined,
  evaluationMode: EvaluationMode,
): EvaluationInput {
  const pageText = matchedRow?.detail.description
    ? buildEvaluationPageText(candidate, matchedRow)
    : undefined;
  return {
    url: candidate.url,
    title: candidate.role,
    evaluationMode,
    structuredSignals: {
      source: candidate.source,
      company: candidate.company,
      role: candidate.role,
      ...(candidate.valueScore !== undefined ? { localValueScore: candidate.valueScore } : {}),
      ...(candidate.valueReasons?.length ? { localValueReasons: candidate.valueReasons.slice(0, 16) } : {}),
    },
    detection: {
      label: "job_posting",
      confidence: 1,
      signals: [sourceSignal(source)],
    },
    ...(pageText ? { pageText } : {}),
  };
}
```

For `scoreRows`, `writeEnrichedRows`, `queueDirectEvaluations`,
`waitForEvaluations`, `postEnvelope`, `getEnvelope`, `dedupeRows`, and
`dedupePipelineEntries`, move the proven function bodies from
`scripts/linkedin-scan-bb-browser.ts` and change only the request id prefix and
the detection signal. This is intentional reuse of a proven local helper set;
do not alter bridge endpoint semantics.

- [ ] **Step 5: Add npm aliases**

Update `package.json`:

```json
"builtin-scan": "npm --prefix bridge exec -- tsx scripts/job-board-scan-bb-browser.ts --source builtin",
"indeed-scan": "npm --prefix bridge exec -- tsx scripts/job-board-scan-bb-browser.ts --source indeed"
```

If preserving legacy Built In direct HTTP access is needed, add:

```json
"builtin-scan:legacy": "node scan.mjs --builtin-only"
```

- [ ] **Step 6: Run script help checks**

Run:

```bash
npm run builtin-scan -- --help
npm run indeed-scan -- --help
```

Expected: both print usage and exit 0.

### Task 5: Add mode docs and routing

**Files:**

- Modify: `modes/builtin-scan.md`
- Create: `modes/indeed-scan.md`
- Modify: `CLAUDE.md`
- Modify: `docs/CODEX.md`

- [ ] **Step 1: Update Built In mode**

Revise `modes/builtin-scan.md` to make the adapter-backed path primary:

- The recommended preview command is:
  `npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --score-only --limit 20`
- The recommended save-without-evaluation command is:
  `npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --pages 2 --no-evaluate`
- The recommended capped evaluation command is:
  `npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --pages 2 --evaluate-limit 3`
- State that the scanner uses the read-only `bb-browser site builtin/jobs`
  adapter for collection and never clicks Apply or Save.

Keep the existing warning that Built In `allLocations=true` broadens location
semantics.

- [ ] **Step 2: Add Indeed mode**

Create `modes/indeed-scan.md` with these sections:

- `# Mode: indeed-scan -- Indeed Scanner`
- What it does: uses the read-only `bb-browser site indeed/jobs` adapter, scores
  visible jobs with the existing newgrad scanner, enriches detail text when
  available, and can queue capped direct evaluations.
- Recommended preview command:
  `npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --score-only --limit 20`
- Recommended save-without-evaluation command:
  `npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --no-evaluate --enrich-limit 5`
- Recommended capped evaluation command:
  `npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --evaluate-limit 3`
- Safety: the scanner reads list and detail pages only; it never clicks Apply,
  Easy Apply, Save, job alerts, login, or resume upload controls; Indeed
  verification, CAPTCHA, or login requirements are manual user recovery states.

- [ ] **Step 3: Update routing docs**

In `CLAUDE.md`, add `/career-ops-indeed-scan` next to the existing scan command
table and add `indeed-scan` to the skill mode map.

In `docs/CODEX.md`, add:

```markdown
| Indeed scan | `modes/_shared.md` + `modes/indeed-scan.md` |
```

- [ ] **Step 4: Verify discoverability**

Run:

```bash
rg -n "indeed-scan|builtin-scan" CLAUDE.md docs/CODEX.md modes package.json
```

Expected: Built In and Indeed are both discoverable.

### Task 6: Live read-only and capped full-loop verification

**Files:**

- Modify: `docs/exec-plans/active/2026-04-22-builtin-indeed-scan.md`

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm --prefix bridge run test -- src/adapters/newgrad-source.test.ts src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts src/adapters/job-board-scan-normalizer.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run bridge typecheck**

Run:

```bash
npm --prefix bridge run typecheck
```

Expected: typecheck passes.

- [ ] **Step 3: Run Built In score-only live check**

Run:

```bash
npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --score-only --limit 20
```

Expected: command reports raw and unique Built In rows, scoring summary, and no
bridge write endpoints.

- [ ] **Step 4: Run Indeed score-only live check**

Run:

```bash
npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --score-only --limit 20
```

Expected: command reports raw and unique Indeed rows, scoring summary, and no
bridge write endpoints. If Indeed blocks access, output includes verification
hint and no writes.

- [ ] **Step 5: Run capped no-evaluate checks**

Run:

```bash
npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --no-evaluate --enrich-limit 2
npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --no-evaluate --enrich-limit 2
```

Expected: each command either writes scanner-managed pipeline/history rows or
reports exact filter/verification blockers. No direct evaluations are queued.

- [ ] **Step 6: Run capped direct evaluation checks**

Run:

```bash
npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --evaluate-limit 1
npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --evaluate-limit 1
```

Expected: each command queues at most one evaluation when candidates survive
filters. Tracker/report output decides whether a row enters Apply Next.

- [ ] **Step 7: Run repository verification**

Run:

```bash
npm run verify
```

Expected: 0 errors. Record any pre-existing warnings without broad cleanup.

- [ ] **Step 8: Update progress log and final outcome**

Append verification results to this plan's progress log and record the final
outcome section.

## Test Coverage Diagram

```text
CODE PATH COVERAGE
==================
[+] newgrad-source.ts
    |
    +-- [GAP] indeed.com -> indeed-scan
    +-- [GAP] existing newgrad/builtin/linkedin mappings unchanged

[+] newgrad-pending.ts
    |
    +-- [GAP] rich indeed-scan rows parse into pending entries
    +-- [GAP] sourceFromPipelineTag returns indeed.com

[+] job-board-scan-normalizer.ts
    |
    +-- [GAP] Built In adapter row -> NewGradRow
    +-- [GAP] Indeed adapter row -> NewGradRow
    +-- [GAP] Indeed full URL paging preserves sc/fromage/l filters

[+] indeed/jobs adapter
    |
    +-- [GAP] --url preserves full Indeed search filters
    +-- [GAP] verification wall returns clear error/hint

[+] job-board-scan-bb-browser.ts
    |
    +-- [GAP] --score-only calls no write endpoints
    +-- [GAP] --no-evaluate writes/enriches but queues no evaluation
    +-- [GAP] --evaluate-limit caps direct evaluations
    +-- [GAP] duplicate URL and company/role rows are skipped
```

```text
USER FLOW COVERAGE
==================
/career-ops builtin-scan
    |
    +-- [GAP] score-only preview
    +-- [GAP] no-evaluate save/enrich
    +-- [GAP] capped direct evaluation

/career-ops indeed-scan
    |
    +-- [GAP] full URL with entry-level sc filter preserved
    +-- [GAP] score-only preview
    +-- [GAP] no-evaluate save/enrich or clear verification stop
    +-- [GAP] capped direct evaluation or clear verification stop
```

Current verified coverage: source mapping, pending parsing, scan-history tags,
normalizer mapping, Indeed URL paging, runner help, Built In score-only, Indeed
score-only, Built In no-evaluate detail enrichment, Indeed no-evaluate detail
enrichment, and capped default-evaluate no-candidate smokes are tested. Detail
fetch now has live coverage for both Built In and Indeed promoted rows.

## Verification Approach

- Write tests before implementation for source mapping, pending parsing, and
  normalizer behavior.
- Use `--score-only` before any write path.
- Use `--no-evaluate --enrich-limit 2` before direct evaluation.
- Cap live evaluation with `--evaluate-limit 1`.
- Run focused tests before broad verification.
- Record all live results in this plan.

## Key Decisions

- Use a shared runner instead of two separate scripts.
- Preserve the existing Built In legacy scanner through either command
  compatibility or a `builtin-scan:legacy` alias.
- Add Indeed as a first-class scanner source with `indeed-scan` tag.
- Preserve full Indeed URL filters by adding adapter `--url` support.
- Treat verification walls as manual user recovery states.
- Capture `bb-browser fetch` detail responses through a temporary stdout file
  instead of an `execFile` pipe. Indeed detail HTML was truncated to the first
  8KB through the pipe, before the job body, while file-backed stdout returned
  the full page.

## Risks And Blockers

- Indeed can block live reads. This blocks live verification but not unit
  coverage.
- Built In command behavior may surprise existing users if `npm run
  builtin-scan` changes too abruptly. Keep help text and legacy alias explicit.
- The current worktree contains unrelated uncommitted changes. Do not revert
  user-owned edits.
- `scan.mjs` is already large. Avoid adding more unrelated behavior to it.

## Failure Modes

| Codepath | Production failure | Test/error handling requirement | User-visible result |
|----------|--------------------|---------------------------------|---------------------|
| `bb-browser site` | CLI missing or adapter not installed | Runner checks command failure and prints adapter name | Clear setup error |
| Built In adapter | DOM changes and no rows parse | Live score-only check and adapter hint | URL and parse counts shown |
| Indeed adapter | Verification or fetch failure | Adapter returns error/hint/action | Manual verification instruction |
| Indeed URL handling | Entry-level `sc` filter dropped | Unit test for full URL preservation | Prevented by tests |
| Source mapping | Indeed rows saved as newgrad-scan | Source tests | Prevented by tests |
| Pending parsing | `indeed-scan` rows ignored | Pending parser test | Prevented by tests |
| Evaluation queue | Duplicate company/role consumes cap | Runner dedupe before evaluate | Counted skipped duplicate |
| Apply safety | Scanner clicks mutating control | Code review and live command inspection | Must never happen |

## Progress Log

- 2026-04-22: Read project instructions, LinkedIn scan design/plan, existing
  Built In mode/plan, `scan.mjs`, bridge pending/source adapters, bb-browser
  site system docs, and the new Built In/Indeed adapters.
- 2026-04-22: Ran read-only adapter checks. Built In returned 20 jobs from 25
  parsed cards for `Software Engineer`. Indeed returned 16 jobs for `Software
  Engineer` + `Remote`.
- 2026-04-22: Tested the supplied Built In URL shape through
  `bb-browser site builtin/jobs --path ...`; it returned 20 jobs from 25 parsed
  cards.
- 2026-04-22: Tested Indeed with query/location/fromage arguments. Empty
  location plus query arguments produced `Failed to fetch`, and adapter code
  showed full URL filters like `sc=...ENTRY_LEVEL...` are not yet preserved.
- 2026-04-22: User approved shared-runner approach A and approved writing the
  plan before implementation.
- 2026-04-22: Wrote design spec and this implementation plan.
- 2026-04-22: Created branch `codex/builtin-indeed-scan` before
  implementation.
- 2026-04-22: Worker Nash implemented Task 1 source/pending/history support
  for `indeed-scan`; focused worker verification passed, 3 files / 31 tests.
- 2026-04-22: Worker Rawls implemented Task 3 Indeed adapter full URL support.
  `node --check bb-browser/sites/indeed/jobs.js` passed. Live read was
  initially blocked by Indeed verification in the worker run.
- 2026-04-22: Added `bridge/src/adapters/job-board-scan-normalizer.ts` and
  tests for Built In rows, Indeed rows, and full Indeed URL paging. Also
  updated `parsePostedAgo` to treat `new`, `An Hour Ago`, and `Yesterday` as
  fresh/stale correctly for adapter rows.
- 2026-04-22: Added `scripts/job-board-scan-bb-browser.ts`, switched
  `npm run builtin-scan` to the shared runner, added `npm run indeed-scan`, and
  preserved `npm run builtin-scan:legacy`.
- 2026-04-22: Found that `bb-browser` global CLI parsing drops unknown named
  flags before `siteRun`, so the runner must pass adapter args positionally.
  Updated the runner to call `builtin/jobs` and `indeed/jobs` with positional
  args. This fixed a false Built In HTTP 404 caused by mis-mapped `--path`.
- 2026-04-22: Synced the updated Indeed adapter into
  `/Users/hongxichen/.bb-browser/sites/indeed/jobs.js`; `bb-browser site info
  indeed/jobs --json` now exposes the `url` arg.
- 2026-04-22: Updated durable routing/docs: `modes/builtin-scan.md`,
  `modes/indeed-scan.md`, `CLAUDE.md`, `docs/CODEX.md`,
  `.claude/skills/career-ops/SKILL.md`, and
  `.opencode/commands/career-ops-indeed-scan.md`.
- 2026-04-22: Verification results:
  - `npm --prefix bridge run test -- src/adapters/job-board-scan-normalizer.test.ts src/adapters/newgrad-scorer.test.ts src/adapters/newgrad-source.test.ts src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts`: passed, 5 files / 92 tests.
  - `node --check bb-browser/sites/indeed/jobs.js`: passed.
  - `node --check /Users/hongxichen/.bb-browser/sites/indeed/jobs.js`: passed.
  - `npm --prefix bridge run typecheck`: passed.
  - `npm run builtin-scan -- --help`: passed.
  - `npm run indeed-scan -- --help`: passed.
  - `npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --score-only --limit 5`: passed; parsed 25, normalized 5, promoted 0, filtered 5, no bridge write endpoints.
  - `npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --score-only --limit 5`: passed; parsed 16, normalized 5, preserved `l=`, `fromage=7`, `sc=...ENTRY_LEVEL...`, promoted 0, filtered 5, no bridge write endpoints.
  - `npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --no-evaluate --limit 5 --enrich-limit 1`: passed; bridge health ok, promoted 0, filtered 5, no pipeline writes or evaluations.
  - `npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --evaluate-limit 1 --limit 5`: passed; bridge health ok, promoted 0, filtered 5, no evaluation queued because no candidates survived.
  - `npm run verify`: passed with 0 errors and 2 pre-existing duplicate warnings
    (`#271/#272 RemoteHunter - Software Engineer`, `#3/#8/#9 Anduril Industries - Software Engineer`).
- 2026-04-22: Live smoke needed manual bb-browser daemon recovery. Automatic
  daemon startup left an orphan process on `127.0.0.1:19824` without
  `daemon.json`; clearing it and starting `dist/daemon.js` directly made site
  adapters work. Both bridge and bb-browser daemon processes were stopped after
  verification.
- 2026-04-23: Audited the Built In/Indeed enrich path after the LinkedIn and
  JobRight `Description excerpt` fixes. The shared runner converted the whole
  `bb-browser fetch` response into `detail.description`, so page shell, search
  chrome, verification text, or truncated HTML could still pollute model input.
- 2026-04-23: Added shared job-board detail sanitization for Built In and
  Indeed. It preserves real JD sections, falls back to useful adapter snippets
  when a verification shell is fetched, rejects board chrome, and normalizes
  salary only when it looks like pay.
- 2026-04-23: Added quick-evaluation prompt guards for job-board verification
  shell, and tightened Built In extension detail extraction so shell-heavy page
  text prefers structured requirements/responsibilities.
- 2026-04-23: Live `bb-browser` walkthrough found a second root cause:
  `execFile("bb-browser", ["fetch", url])` captured only the first 8KB of an
  Indeed detail response, which ended before `Full job description`; the scanner
  therefore logged `Detail text ... 0 chars`. Redirecting `bb-browser fetch` to
  a file returned the full 533KB page and the sanitizer extracted 5048 useful
  characters. The runner now captures detail fetch stdout via a temporary file.
- 2026-04-23: Live read-only smoke results:
  - `bb-browser site builtin/jobs "Software Engineer" 3 "/jobs/hybrid/national/dev-engineering" 1 --json`: passed; returned 3 rows from 25 parsed cards with useful summaries and detail URLs.
  - `bb-browser site indeed/jobs "Software Engineer" "Remote" 3 1 "" "3" "" --json`: passed; returned 3 rows from 17 parsed cards; snippets were empty in the sampled Remote results, so detail fetch is required for useful JD text.
  - `npm run builtin-scan -- --score-only --limit 8 --pages 1 --query "Software Engineer" --path "/jobs/hybrid/national/dev-engineering"`: passed; promoted 7, filtered 1, no bridge write endpoints.
  - `npm run indeed-scan -- --score-only --limit 8 --pages 1 --query "Software Engineer" --location "Remote"`: passed; promoted 1, filtered 7, no bridge write endpoints.
  - `npm run builtin-scan -- --no-evaluate --enrich-limit 1 --limit 8 --pages 1 --query "Software Engineer" --path "/jobs/hybrid/national/dev-engineering"`: passed; Built In detail text for Grainger was 8149 chars after sanitization; bridge enrich skipped it as `experience_too_high`; no direct evaluation queued.
  - `npm run indeed-scan -- --no-evaluate --enrich-limit 1 --limit 8 --pages 1 --query "Software Engineer" --location "Remote"`: passed after the stdout-file fix; Indeed detail text for 24 DATA was 5048 chars after sanitization; bridge enrich skipped it as `salary_below_minimum`; no direct evaluation queued.
- 2026-04-23: Verification results:
  - `npm --prefix bridge run test -- src/adapters/job-board-detail-text.test.ts src/adapters/claude-pipeline.test.ts`: passed, 2 files / 23 tests.
  - `npm --prefix bridge run typecheck`: passed.
  - `npm --prefix extension run typecheck`: passed.
  - `npm --prefix bridge exec -- tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --types node --skipLibCheck --allowImportingTsExtensions scripts/job-board-scan-bb-browser.ts`: passed.
  - `npm run builtin-scan -- --help`: passed.
  - `npm run indeed-scan -- --help`: passed.
  - `npm run ext:build`: passed.
  - `git diff --check`: passed.
  - `npm run verify`: passed with 0 errors and 2 pre-existing duplicate warnings
    (`#271/#272 RemoteHunter - Software Engineer`, `#3/#8/#9 Anduril Industries - Software Engineer`).

## Final Outcome

Implemented. `/career-ops builtin-scan` now uses the shared bb-browser-backed
runner with a legacy alias, `/career-ops indeed-scan` is routed and documented,
Indeed full URL filters are preserved, and adapter rows flow through the
existing newgrad scoring/source/pending/history contracts. Verification passed
for focused tests, bridge typecheck, command help, live score-only smokes,
bridge-backed no-evaluate/default smokes with no surviving candidates, and
repository verify.

2026-04-23 follow-up outcome: Built In and Indeed now share the same
low-quality JD guard as the LinkedIn/JobRight fixes. The scanner no longer
trusts raw page text as a JD excerpt; it extracts useful JD sections, falls back
only to useful card snippets, rejects verification/search/page shell, filters
fake salary text, and avoids the `bb-browser fetch` pipe truncation that caused
Indeed detail text to be empty. Live no-evaluate smokes confirmed useful detail
text for both sources.

Remaining risk: direct evaluation queue behavior for Built In/Indeed candidates
was not exercised with a surviving live row because the sampled enriched rows
were skipped by existing policy (`experience_too_high` for Built In and
`salary_below_minimum` for Indeed). The implemented path reuses the existing
`/v1/newgrad-scan/enrich` and `/v1/evaluate` contracts; run with broader pages
or adjusted filters when a survivor is available.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 3 plan issues found and fixed, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | - |

- **UNRESOLVED:** 0
- **VERDICT:** ENG CLEARED - ready to implement.
