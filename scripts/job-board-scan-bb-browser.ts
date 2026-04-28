import { execFile as execFileCallback, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, open, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type {
  EnrichedRow,
  FilteredRow,
  NewGradDetail,
  NewGradEnrichResult,
  NewGradRow,
  NewGradScoreResult,
  PipelineEntry,
  ScoredRow,
} from "../apps/server/src/contracts/newgrad.ts";
import type {
  EvaluationInput,
  EvaluationMode,
  EvaluationResult,
  JobSnapshot,
  StructuredJobSignals,
} from "../apps/server/src/contracts/jobs.ts";
import {
  buildBuiltInPageUrl,
  buildIndeedPageUrl,
  normalizeBuiltInAdapterRows,
  normalizeIndeedAdapterRows,
} from "../apps/server/src/adapters/job-board-scan-normalizer.ts";
import {
  htmlToReadableText,
  normalizeJobBoardSalary,
  sanitizeJobBoardDetailText,
} from "../apps/server/src/adapters/job-board-detail-text.ts";
import {
  loadNegativeKeywords,
  loadNewGradScanConfig,
  loadTrackedCompanyRoles,
} from "../apps/server/src/adapters/newgrad-config.ts";
import {
  isRecentNewGradRow,
  loadNewGradSeenKeys,
  newGradCompanyRoleKey,
  wasNewGradRowSeen,
} from "../apps/server/src/adapters/newgrad-scan-history.ts";
import { scoreAndFilter } from "../apps/server/src/adapters/newgrad-scorer.ts";
import {
  filterKnownEvaluationCandidates,
  loadEvaluationDedupeKeys,
} from "./evaluation-dedupe.ts";

const PROTOCOL_VERSION = "1.0.0";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 47319;
const DEFAULT_EVALUATION_QUEUE_DELAY_MS = 2100;
const DEFAULT_EVALUATION_WAIT_TIMEOUT_MS = 20 * 60_000;
const SCORE_CHUNK_SIZE = 50;
const ENRICH_CHUNK_SIZE = 3;

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
  includeOlder: boolean;
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

type BridgeResponse<T> =
  | { ok: true; result: T; requestId: string }
  | { ok: false; error: { code: string; message: string; detail?: unknown }; requestId: string };

type BbEnvelope<T> =
  | { id?: string; success: true; data: T }
  | { id?: string; success: false; error: string; hint?: string; action?: string; reportHint?: string };

type AdapterResult = {
  source: string;
  url: string;
  query?: string;
  location?: string;
  page?: number;
  count: number;
  totalParsed?: number;
  jobs: Array<Record<string, unknown>>;
};

type EvaluationCreateResult = {
  jobId: string;
  streamUrl: string;
  snapshotUrl: string;
};

type QueuedEvaluation = {
  jobId: string;
  company: string;
  role: string;
};

type FailedEvaluationQueue = {
  company: string;
  role: string;
  error: string;
};

const execFile = promisify(execFileCallback);
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

function usage(): string {
  return `auto-job browser-backed job-board scan

Usage:
  bun run builtin-scan -- [options]
  bun run indeed-scan -- [options]

Options:
  --source <builtin|indeed>       Source, normally supplied by package script.
  --url <url>                     Full search URL.
  --query <text>                  Search query when --url is omitted.
  --location <text>               Indeed location when --url is omitted.
  --path <path-or-url>            Built In path or URL when --url is omitted.
  --dry-run                       Compatibility alias for --score-only.
  --score-only                    Extract and score rows without bridge write endpoints.
  --include-older                 Include rows outside the normal 24h freshness gate. Useful for bounded live E2E validation.
  --evaluate-only                 Evaluate already saved Built In pending rows through the legacy path.
  --pending-limit <n>             Pending rows to read for --evaluate-only. Default: 100.
  --no-evaluate                   Stop after enrich/pipeline write.
  --evaluate                      Compatibility flag; direct evaluation is on by default.
  --limit <n>                     Limit unique list rows before scoring.
  --pages <n>                     Number of result pages to scan. Default: 1.
  --enrich-limit <n>              Limit promoted rows before detail capture.
  --evaluate-limit <n>            Limit direct evaluations.
  --evaluation-mode <mode>        newgrad_quick or default. Default: newgrad_quick.
  --no-wait-evaluations           Queue evaluation jobs and exit.
  --evaluation-queue-delay-ms <n> Delay between /v1/evaluate calls. Default: ${DEFAULT_EVALUATION_QUEUE_DELAY_MS}
  --evaluation-wait-timeout-ms <n>
                                 Max time to wait for queued jobs. Default: ${DEFAULT_EVALUATION_WAIT_TIMEOUT_MS}
  --bridge-host <host>            Bridge host. Default: ${DEFAULT_HOST}
  --bridge-port <port>            Bridge port. Default: ${DEFAULT_PORT}
  --help                          Show this help.

Safety:
  This scanner reads list/detail pages only. It never clicks Apply, Easy Apply, Save, alerts, login, or resume upload controls.
`;
}

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
    includeOlder: false,
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
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      i += 1;
      return value;
    };

    switch (arg) {
      case "--source": {
        const source = next();
        if (source !== "builtin" && source !== "indeed") {
          throw new Error("--source must be builtin or indeed");
        }
        options.source = source;
        break;
      }
      case "--url":
        options.url = next();
        break;
      case "--query":
        options.query = next();
        break;
      case "--location":
        options.location = next();
        break;
      case "--path":
        options.path = next();
        break;
      case "--limit":
        options.limit = positiveInt(next(), arg);
        break;
      case "--pages":
        options.pages = positiveInt(next(), arg);
        break;
      case "--dry-run":
        options.dryRun = true;
        options.scoreOnly = true;
        break;
      case "--score-only":
        options.scoreOnly = true;
        break;
      case "--include-older":
        options.includeOlder = true;
        break;
      case "--evaluate-only":
        options.evaluateOnly = true;
        break;
      case "--pending-limit":
        options.pendingLimit = positiveInt(next(), arg);
        break;
      case "--no-evaluate":
        options.evaluate = false;
        break;
      case "--evaluate":
        options.evaluate = true;
        break;
      case "--enrich-limit":
        options.enrichLimit = positiveInt(next(), arg);
        break;
      case "--evaluate-limit":
        options.evaluateLimit = positiveInt(next(), arg);
        break;
      case "--evaluation-mode": {
        const mode = next();
        if (mode !== "newgrad_quick" && mode !== "default") {
          throw new Error("--evaluation-mode must be newgrad_quick or default");
        }
        options.evaluationMode = mode;
        break;
      }
      case "--no-wait-evaluations":
        options.waitEvaluations = false;
        break;
      case "--evaluation-queue-delay-ms":
        options.evaluationQueueDelayMs = nonNegativeInt(next(), arg);
        break;
      case "--evaluation-wait-timeout-ms":
        options.evaluationWaitTimeoutMs = positiveInt(next(), arg);
        break;
      case "--bridge-host":
        options.bridgeHost = next();
        break;
      case "--bridge-port":
        options.bridgePort = positiveInt(next(), arg);
        break;
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
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function nonNegativeInt(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
}

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

  const collected = await collectRows(options);
  let rows = dedupeRows(collected.rows);
  if (options.limit !== null) rows = rows.slice(0, options.limit);
  console.log(`Extracted ${collected.rawCount} raw ${options.source} rows; ${rows.length} unique after dedupe`);

  if (rows.length === 0) {
    console.log(`No rows extracted; check the ${options.source} search filters or site verification state.`);
    return;
  }

  const bridgeBase = `http://${options.bridgeHost}:${options.bridgePort}`;
  const token = options.scoreOnly ? null : await readBridgeToken();
  if (token) await assertBridgeHealthy(bridgeBase, token);

  const score = options.scoreOnly || options.includeOlder
    ? scoreRowsLocally(rows, { includeOlder: options.includeOlder })
    : await scoreRows(bridgeBase, token!, rows);
  console.log(`Scored rows: promoted=${score.promoted.length}, filtered=${score.filtered.length}`);
  printPromotedRows(score.promoted);

  if (options.scoreOnly || score.promoted.length === 0) {
    if (options.dryRun) {
      console.log("--dry-run used as --score-only: no bridge write endpoints were called.");
    } else if (options.scoreOnly) {
      console.log("--score-only used: no bridge write endpoints were called.");
    }
    return;
  }

  const promoted = score.promoted.slice(0, options.enrichLimit ?? undefined);
  console.log(`Enriching ${promoted.length} promoted ${options.source} rows`);
  const enrichedRows = await enrichRows(options.source, promoted);
  console.log(`Detail enrichment: enriched=${enrichedRows.length}`);
  if (enrichedRows.length === 0) return;

  const enrich = await writeEnrichedRows(bridgeBase, token!, enrichedRows);
  console.log(`Bridge enrich result: added=${enrich.added}, skipped=${enrich.skipped}, candidates=${enrich.candidates?.length ?? 0}`);
  if (enrich.skipBreakdown && Object.keys(enrich.skipBreakdown).length > 0) {
    console.log(`Skip breakdown: ${JSON.stringify(enrich.skipBreakdown)}`);
  }
  printPipelineEntries(enrich.entries);

  if (!options.evaluate) {
    console.log("Direct evaluation disabled by --no-evaluate.");
    return;
  }

  const dedupedCandidates = dedupePipelineEntries([...(enrich.candidates ?? enrich.entries)]);
  const filteredCandidates = filterKnownEvaluationCandidates(
    dedupedCandidates,
    loadEvaluationDedupeKeys(repoRoot),
  );
  if (filteredCandidates.skipped > 0) {
    console.log(`Skipped ${filteredCandidates.skipped} already evaluated/tracked direct-evaluation candidates.`);
  }
  const candidates = filteredCandidates.candidates.slice(0, options.evaluateLimit ?? undefined);
  if (candidates.length === 0) {
    console.log("No enrich survivors eligible for direct evaluation.");
    return;
  }

  const queued = await queueDirectEvaluations(bridgeBase, token!, candidates, enrichedRows, options);
  console.log(`Direct evaluation queue: queued=${queued.jobs.length}, failed=${queued.failed.length}, skipped=${queued.skipped}`);
  for (const failedJob of queued.failed) {
    console.warn(`- failed to queue ${failedJob.company} - ${failedJob.role}: ${failedJob.error}`);
  }

  if (options.waitEvaluations && queued.jobs.length > 0) {
    const result = await waitForEvaluations(bridgeBase, token!, queued.jobs, options);
    console.log(`Direct evaluation result: completed=${result.completed.length}, failed=${result.failed.length}, timedOut=${result.timedOut.length}`);
    for (const item of result.completed) {
      console.log(`- ${item.result.company} - ${item.result.role}: ${item.result.score}/5 report=${item.result.reportPath} trackerMerged=${item.result.trackerMerged}`);
    }
  } else if (queued.jobs.length > 0) {
    console.log("Evaluation jobs queued; not waiting because --no-wait-evaluations was set.");
  }
}

async function collectRows(options: Options): Promise<{ rows: NewGradRow[]; rawCount: number }> {
  const rows: NewGradRow[] = [];
  let rawCount = 0;

  for (let page = 1; page <= options.pages; page += 1) {
    const result = await runSiteAdapter(options, page);
    if (!Array.isArray(result.jobs)) {
      throw new Error(`${options.source} adapter response did not contain a jobs array`);
    }

    rawCount += result.jobs.length;
    const normalized = options.source === "builtin"
      ? normalizeBuiltInAdapterRows(result.jobs)
      : normalizeIndeedAdapterRows(result.jobs);
    rows.push(...normalized);
    console.log(`Page ${page}/${options.pages}: parsed=${result.totalParsed ?? result.jobs.length}, rows=${normalized.length}, url=${result.url}`);

    if (result.jobs.length === 0) break;
    if (options.limit !== null && dedupeRows(rows).length >= options.limit) break;
  }

  return { rows, rawCount };
}

async function runSiteAdapter(options: Options, page: number): Promise<AdapterResult> {
  const args = options.source === "builtin"
    ? builtInAdapterArgs(options, page)
    : indeedAdapterArgs(options, page);
  const { stdout } = await runProcess("bb-browser", args, { allowJsonError: true });
  const envelope = JSON.parse(stdout.trim()) as BbEnvelope<AdapterResult>;
  if (envelope.success === false) {
    const failed = envelope as Extract<BbEnvelope<AdapterResult>, { success: false }>;
    throw new Error([failed.error, failed.hint, failed.action].filter(Boolean).join(" | "));
  }
  return envelope.data;
}

function builtInAdapterArgs(options: Options, page: number): string[] {
  const path = options.url
    ? buildBuiltInPageUrl(options.url, page)
    : options.path ?? "/jobs/hybrid/national/dev-engineering";
  const query = options.query ?? queryParam(options.url, "search") ?? "Software Engineering";
  return [
    "site",
    "builtin/jobs",
    query,
    String(adapterLimit(options)),
    path,
    String(page),
    "--json",
  ];
}

function indeedAdapterArgs(options: Options, page: number): string[] {
  const searchUrl = options.url ? buildIndeedPageUrl(options.url, page) : "";
  const query = options.query ?? queryParam(options.url, "q") ?? "Software Engineer";
  const location = options.location ?? queryParam(options.url, "l") ?? "Remote";
  return [
    "site",
    "indeed/jobs",
    query,
    location,
    String(adapterLimit(options)),
    String(page),
    "",
    "",
    searchUrl,
    "--json",
  ];
}

function adapterLimit(options: Options): number {
  return Math.min(options.limit ?? 100, 100);
}

function queryParam(url: string | null, key: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).searchParams.get(key);
  } catch {
    return null;
  }
}

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
  try {
    await execFile("bb-browser", ["--version"], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`bb-browser is not available on PATH: ${message}`);
  }
}

async function readBridgeToken(): Promise<string> {
  const tokenPath = join(repoRoot, "apps", "server", ".bridge-token");
  if (!existsSync(tokenPath)) {
    throw new Error("bridge token not found; start the bridge with bun run server");
  }
  return (await readFile(tokenPath, "utf8")).trim();
}

async function assertBridgeHealthy(base: string, token: string): Promise<void> {
  await getEnvelope<unknown>(base, token, "/v1/health");
  console.log("Bridge health: ok");
}

function scoreRowsLocally(
  rows: NewGradRow[],
  options: { includeOlder?: boolean } = {},
): NewGradScoreResult {
  const scanConfig = loadNewGradScanConfig(repoRoot);
  const negativeKeywords = loadNegativeKeywords(repoRoot);
  const trackedSet = loadTrackedCompanyRoles(repoRoot);
  const seenKeys = loadNewGradSeenKeys(repoRoot);
  const recentUnseenRows: NewGradRow[] = [];
  const preFiltered: FilteredRow[] = [];

  for (const row of rows) {
    if (!options.includeOlder && !isRecentNewGradRow(row)) {
      preFiltered.push({
        row,
        reason: "older_than_24h",
        detail: `Posted ${row.postedAgo || "outside the last 24h"}`,
      });
      continue;
    }

    const trackedKey = newGradCompanyRoleKey(row);
    if (trackedKey && trackedSet.has(trackedKey)) {
      preFiltered.push({
        row,
        reason: "already_tracked",
        detail: `Already tracked: ${row.company} | ${row.title}`,
      });
      continue;
    }

    if (wasNewGradRowSeen(row, seenKeys)) {
      preFiltered.push({
        row,
        reason: "already_scanned",
        detail: "Already seen in scan history or pipeline",
      });
      continue;
    }

    recentUnseenRows.push(row);
  }

  const { promoted, filtered } = scoreAndFilter(
    recentUnseenRows,
    scanConfig,
    negativeKeywords,
    trackedSet,
  );
  return { promoted, filtered: [...preFiltered, ...filtered] };
}

async function scoreRows(
  bridgeBase: string,
  token: string,
  rows: NewGradRow[],
): Promise<NewGradScoreResult> {
  const promoted: ScoredRow[] = [];
  const filtered: FilteredRow[] = [];

  for (let start = 0; start < rows.length; start += SCORE_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + SCORE_CHUNK_SIZE);
    const result = await postEnvelope<NewGradScoreResult>(
      bridgeBase,
      token,
      "/v1/newgrad-scan/score",
      { rows: chunk },
    );
    promoted.push(...result.promoted);
    filtered.push(...result.filtered);
  }

  return {
    promoted: promoted.sort((a, b) => b.score - a.score),
    filtered,
  };
}

async function enrichRows(source: Source, promotedRows: readonly ScoredRow[]): Promise<EnrichedRow[]> {
  const rows: EnrichedRow[] = [];

  for (const scored of promotedRows) {
    const description = await captureDetailText(source, scored.row.detailUrl, scored.row.qualifications ?? "").catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Detail text fetch failed for ${scored.row.company} - ${scored.row.title}: ${message}`);
      return sanitizeJobBoardDetailText(source, "", scored.row.qualifications ?? "");
    });
    console.log(`Detail text: ${scored.row.company} - ${scored.row.title}: ${description.length} chars`);
    rows.push({
      row: scored,
      detail: detailFromRow(source, scored.row, description),
    });
  }

  return rows;
}

async function captureDetailText(source: Source, url: string, fallbackText: string): Promise<string> {
  const stdout = await runProcessToStdoutFile("bb-browser", ["fetch", url]);
  return sanitizeJobBoardDetailText(source, htmlToReadableText(stdout), fallbackText);
}

function detailFromRow(source: Source, row: NewGradRow, description: string): NewGradDetail {
  const fallback = row.qualifications ?? "";
  const text = sanitizeJobBoardDetailText(source, description, fallback);
  const salaryRange = normalizeJobBoardSalary(row.salary);
  return {
    position: row.position,
    title: row.title,
    company: row.company,
    location: row.location,
    employmentType: null,
    workModel: row.workModel || null,
    seniorityLevel: null,
    salaryRange,
    matchScore: null,
    expLevelMatch: null,
    skillMatch: null,
    industryExpMatch: null,
    description: text,
    industries: row.industry ? [row.industry] : [],
    recommendationTags: [],
    responsibilities: [],
    requiredQualifications: fallback && fallback !== text ? [fallback] : [],
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

async function writeEnrichedRows(
  bridgeBase: string,
  token: string,
  rows: EnrichedRow[],
): Promise<NewGradEnrichResult> {
  const merged: NewGradEnrichResult = {
    added: 0,
    skipped: 0,
    skipBreakdown: {},
    entries: [],
    candidates: [],
  };

  for (let start = 0; start < rows.length; start += ENRICH_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + ENRICH_CHUNK_SIZE).map(truncateEnrichedRow);
    const result = await postEnvelope<NewGradEnrichResult>(
      bridgeBase,
      token,
      "/v1/newgrad-scan/enrich",
      { rows: chunk },
    );
    merged.added += result.added;
    merged.skipped += result.skipped;
    merged.entries = [...merged.entries, ...result.entries];
    merged.candidates = [
      ...(merged.candidates ?? []),
      ...(result.candidates ?? result.entries),
    ];
    mergeCounts(merged.skipBreakdown, result.skipBreakdown);
  }

  return merged;
}

async function queueDirectEvaluations(
  bridgeBase: string,
  token: string,
  candidates: readonly PipelineEntry[],
  enrichedRows: readonly EnrichedRow[],
  options: Options,
): Promise<{ jobs: QueuedEvaluation[]; failed: FailedEvaluationQueue[]; skipped: number }> {
  const jobs: QueuedEvaluation[] = [];
  const failed: FailedEvaluationQueue[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const key = candidateEvaluationKey(candidate);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);

    const matchedRow = findEnrichedRowForCandidate(candidate, enrichedRows);
    const input = buildEvaluationInput(options.source, candidate, matchedRow, options.evaluationMode);
    console.log(`Queueing direct evaluation ${index + 1}/${candidates.length}: ${candidate.company} - ${candidate.role}`);

    try {
      const created = await postEnvelope<EvaluationCreateResult>(
        bridgeBase,
        token,
        "/v1/evaluate",
        { input },
      );
      jobs.push({
        jobId: created.jobId,
        company: candidate.company,
        role: candidate.role,
      });
    } catch (error) {
      failed.push({
        company: candidate.company,
        role: candidate.role,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (index < candidates.length - 1 && options.evaluationQueueDelayMs > 0) {
      await sleep(options.evaluationQueueDelayMs);
    }
  }

  return { jobs, failed, skipped };
}

function candidateEvaluationKey(candidate: PipelineEntry): string {
  return normalizeUrl(candidate.url) ?? `${normalizeText(candidate.company)}|${normalizeText(candidate.role)}`;
}

function findEnrichedRowForCandidate(
  candidate: PipelineEntry,
  rows: readonly EnrichedRow[],
): EnrichedRow | undefined {
  const candidateUrl = normalizeUrl(candidate.url);
  if (candidateUrl) {
    const byUrl = rows.find((row) =>
      [
        row.row.row.detailUrl,
        row.row.row.applyUrl,
        row.detail.originalPostUrl,
        row.detail.applyNowUrl,
        ...row.detail.applyFlowUrls,
      ].some((url) => normalizeUrl(url) === candidateUrl),
    );
    if (byUrl) return byUrl;
  }

  const candidateKey = `${normalizeText(candidate.company)}|${normalizeText(candidate.role)}`;
  return rows.find((row) => {
    const company = row.detail.company || row.row.row.company;
    const role = row.detail.title || row.row.row.title;
    return `${normalizeText(company)}|${normalizeText(role)}` === candidateKey;
  });
}

function buildEvaluationInput(
  source: Source,
  candidate: PipelineEntry,
  matchedRow: EnrichedRow | undefined,
  evaluationMode: EvaluationMode,
): EvaluationInput {
  const structuredSignals = buildStructuredSignals(candidate, matchedRow);
  const pageText = buildEvaluationPageText(candidate, matchedRow);
  return {
    url: candidate.url,
    title: candidate.role,
    evaluationMode,
    structuredSignals,
    detection: {
      label: "job_posting",
      confidence: 1,
      signals: [sourceSignal(source)],
    },
    ...(pageText ? { pageText } : {}),
  };
}

function buildStructuredSignals(
  candidate: PipelineEntry,
  matchedRow: EnrichedRow | undefined,
): StructuredJobSignals {
  if (!matchedRow) {
    return {
      source: candidate.source,
      company: candidate.company,
      role: candidate.role,
      ...(candidate.valueScore !== undefined ? { localValueScore: candidate.valueScore } : {}),
      ...(candidate.valueReasons && candidate.valueReasons.length > 0
        ? { localValueReasons: signalStrings(candidate.valueReasons, 16, 120) }
        : {}),
    };
  }

  const { detail, row } = matchedRow;
  const salaryRange = detail.salaryRange || row.row.salary || undefined;
  const sponsorshipSupport =
    detail.confirmedSponsorshipSupport !== "unknown"
      ? detail.confirmedSponsorshipSupport
      : detail.sponsorshipSupport !== "unknown"
        ? detail.sponsorshipSupport
        : row.row.confirmedSponsorshipSupport !== "unknown"
          ? row.row.confirmedSponsorshipSupport
          : row.row.sponsorshipSupport;
  const yearsExperienceRequired = extractYearsExperienceRequired(
    [detail.requiredQualifications.join(" "), detail.description].join("\n"),
  );

  return {
    source: candidate.source,
    company: detail.company || candidate.company,
    role: detail.title || candidate.role,
    ...(detail.location || row.row.location
      ? { location: detail.location || row.row.location }
      : {}),
    ...(detail.workModel || row.row.workModel
      ? { workModel: detail.workModel || row.row.workModel }
      : {}),
    ...(detail.employmentType ? { employmentType: detail.employmentType } : {}),
    ...(detail.seniorityLevel ? { seniority: detail.seniorityLevel } : {}),
    ...(row.row.postedAgo ? { postedAgo: row.row.postedAgo } : {}),
    ...(salaryRange ? { salaryRange } : {}),
    sponsorshipSupport,
    requiresActiveSecurityClearance:
      detail.confirmedRequiresActiveSecurityClearance ||
      detail.requiresActiveSecurityClearance ||
      row.row.confirmedRequiresActiveSecurityClearance ||
      row.row.requiresActiveSecurityClearance,
    ...(yearsExperienceRequired !== null ? { yearsExperienceRequired } : {}),
    ...(detail.companySize || row.row.companySize
      ? { companySize: detail.companySize || row.row.companySize }
      : { companySize: null }),
    taxonomy: signalStrings(detail.taxonomy, 10, 120),
    recommendationTags: signalStrings(detail.recommendationTags, 10, 120),
    skillTags: signalStrings(detail.skillTags, 14, 120),
    requiredQualifications: signalStrings(detail.requiredQualifications, 10, 400),
    responsibilities: signalStrings(detail.responsibilities, 8, 400),
    ...(candidate.valueScore !== undefined ? { localValueScore: candidate.valueScore } : {}),
    ...(candidate.valueReasons && candidate.valueReasons.length > 0
      ? { localValueReasons: signalStrings(candidate.valueReasons, 16, 120) }
      : {}),
  };
}

function buildEvaluationPageText(
  candidate: PipelineEntry,
  matchedRow: EnrichedRow | undefined,
): string | undefined {
  if (!matchedRow) return undefined;

  const { detail, row } = matchedRow;
  const sections = [
    `URL: ${candidate.url}`,
    `Company: ${detail.company || candidate.company}`,
    `Role: ${detail.title || candidate.role}`,
    detail.location || row.row.location ? `Location: ${detail.location || row.row.location}` : null,
    detail.workModel || row.row.workModel ? `Work model: ${detail.workModel || row.row.workModel}` : null,
    detail.employmentType ? `Employment type: ${detail.employmentType}` : null,
    detail.seniorityLevel ? `Seniority: ${detail.seniorityLevel}` : null,
    detail.salaryRange || row.row.salary ? `Salary: ${detail.salaryRange || row.row.salary}` : null,
    `Local newgrad score: ${candidate.score}`,
    candidate.valueScore !== undefined ? `Local enrich value score: ${candidate.valueScore}/10` : null,
    candidate.valueReasons && candidate.valueReasons.length > 0
      ? `Local enrich reasons: ${candidate.valueReasons.join(", ")}`
      : null,
    detail.skillTags.length > 0 ? `Skill tags: ${detail.skillTags.slice(0, 15).join(", ")}` : null,
    detail.requiredQualifications.length > 0
      ? ["Requirements:", ...detail.requiredQualifications.slice(0, 10).map((item) => `- ${item}`)].join("\n")
      : null,
    detail.responsibilities.length > 0
      ? ["Responsibilities:", ...detail.responsibilities.slice(0, 8).map((item) => `- ${item}`)].join("\n")
      : null,
    detail.description ? `Description excerpt:\n${detail.description.slice(0, 2200)}` : null,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();

  return sections.length > 0 ? sections.slice(0, 4_000) : undefined;
}

async function waitForEvaluations(
  bridgeBase: string,
  token: string,
  jobs: readonly QueuedEvaluation[],
  options: Options,
): Promise<{
  completed: Array<{ job: QueuedEvaluation; result: EvaluationResult }>;
  failed: Array<{ job: QueuedEvaluation; error: string }>;
  timedOut: QueuedEvaluation[];
}> {
  const pending = new Map(jobs.map((job) => [job.jobId, job]));
  const completed: Array<{ job: QueuedEvaluation; result: EvaluationResult }> = [];
  const failed: Array<{ job: QueuedEvaluation; error: string }> = [];
  const deadline = Date.now() + options.evaluationWaitTimeoutMs;

  while (pending.size > 0 && Date.now() < deadline) {
    for (const [jobId, job] of Array.from(pending.entries())) {
      const snapshot = await getEnvelope<JobSnapshot>(bridgeBase, token, `/v1/jobs/${jobId}`);
      if (snapshot.phase === "completed" && snapshot.result) {
        completed.push({ job, result: snapshot.result });
        pending.delete(jobId);
      } else if (snapshot.phase === "failed" && snapshot.error) {
        failed.push({ job, error: `${snapshot.error.code} ${snapshot.error.message}` });
        pending.delete(jobId);
      }
    }

    if (pending.size > 0) {
      console.log(`Waiting for evaluations: completed=${completed.length}, failed=${failed.length}, pending=${pending.size}`);
      await sleep(5_000);
    }
  }

  return {
    completed,
    failed,
    timedOut: Array.from(pending.values()),
  };
}

async function postEnvelope<T>(
  bridgeBase: string,
  token: string,
  path: string,
  payload: unknown,
): Promise<T> {
  const requestId = `job-board-scan-${randomUUID()}`;
  const res = await fetch(`${bridgeBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-auto-job-token": token,
    },
    body: JSON.stringify({
      protocol: PROTOCOL_VERSION,
      requestId,
      clientTimestamp: new Date().toISOString(),
      payload,
    }),
  });
  const body = await res.json() as BridgeResponse<T>;
  if (!body.ok) {
    const error = (body as Extract<BridgeResponse<T>, { ok: false }>).error;
    throw new Error(`${path} failed: ${error.code} ${error.message}`);
  }
  return body.result;
}

async function getEnvelope<T>(
  bridgeBase: string,
  token: string,
  path: string,
): Promise<T> {
  const res = await fetch(`${bridgeBase}${path}`, {
    headers: { "x-auto-job-token": token },
  });
  const body = await res.json() as BridgeResponse<T>;
  if (!body.ok) {
    const error = (body as Extract<BridgeResponse<T>, { ok: false }>).error;
    throw new Error(`${path} failed: ${error.code} ${error.message}`);
  }
  return body.result;
}

function truncateEnrichedRow(row: EnrichedRow): EnrichedRow {
  return {
    row: {
      ...row.row,
      row: {
        ...row.row.row,
        qualifications: row.row.row.qualifications?.slice(0, 4000) ?? null,
      },
    },
    detail: {
      ...row.detail,
      description: row.detail.description.slice(0, 20_000),
      responsibilities: row.detail.responsibilities.slice(0, 20),
      requiredQualifications: row.detail.requiredQualifications.slice(0, 20),
      skillTags: row.detail.skillTags.slice(0, 30),
      recommendationTags: row.detail.recommendationTags.slice(0, 30),
      taxonomy: row.detail.taxonomy.slice(0, 30),
      applyFlowUrls: row.detail.applyFlowUrls.slice(0, 10),
    },
  };
}

function dedupeRows(rows: readonly NewGradRow[]): NewGradRow[] {
  const seen = new Set<string>();
  const unique: NewGradRow[] = [];

  for (const row of rows) {
    const key =
      normalizeUrl(row.detailUrl) ??
      normalizeUrl(row.applyUrl) ??
      `${normalizeText(row.company)}|${normalizeText(row.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({
      ...row,
      position: unique.length + 1,
    });
  }

  return unique;
}

function dedupePipelineEntries(entries: readonly PipelineEntry[]): PipelineEntry[] {
  const seen = new Set<string>();
  const unique: PipelineEntry[] = [];

  for (const entry of entries) {
    const key = candidateEvaluationKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(entry);
  }

  return unique;
}

function printPromotedRows(rows: readonly ScoredRow[]): void {
  if (rows.length === 0) return;
  console.log("Top promoted rows:");
  for (const [index, row] of rows.slice(0, 10).entries()) {
    console.log(`${index + 1}. ${row.row.company} - ${row.row.title} (${row.score}/${row.maxScore}) ${row.row.detailUrl}`);
  }
}

function printPipelineEntries(entries: readonly PipelineEntry[]): void {
  if (entries.length === 0) return;
  console.log("Pipeline entries:");
  for (const entry of entries) {
    console.log(`- ${entry.company} - ${entry.role} (${entry.score}) ${entry.url}`);
  }
}

function mergeCounts(
  target: Record<string, number> | undefined,
  source: Readonly<Record<string, number>> | undefined,
): void {
  if (!target || !source) return;
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function signalStrings(values: readonly string[], maxItems: number, maxLength: number): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((value) => value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value);
}

function extractYearsExperienceRequired(text: string): number | null {
  const normalized = text.toLowerCase();
  const matches = Array.from(
    normalized.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)(?:\s+of\s+experience)?\b/g),
  );
  if (matches.length === 0) return null;

  let maxYears = 0;
  for (const match of matches) {
    maxYears = Math.max(maxYears, Number(match[1]));
  }
  return maxYears > 0 ? maxYears : null;
}

function sourceSignal(source: Source): string {
  return source === "builtin" ? "builtin-scan" : "indeed-scan";
}

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    parsed.searchParams.sort();
    return parsed.toString().toLowerCase();
  } catch {
    return null;
  }
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function runProcess(
  command: string,
  args: readonly string[],
  options: { allowJsonError: boolean },
): Promise<{ stdout: string; stderr: string }> {
  const tempDir = await mkdtemp(join(tmpdir(), "auto-job-bb-site-"));
  const stdoutPath = join(tempDir, "stdout");
  const stdoutFile = await open(stdoutPath, "w");
  let fileClosed = false;
  let stderr = "";

  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(command, [...args], {
        stdio: ["ignore", stdoutFile.fd, "pipe"],
      });
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, 180_000);

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new Error(`${command} timed out after 180000ms`));
          return;
        }
        if (code === 0) {
          resolvePromise();
          return;
        }
        reject(new Error(`${command} exited with ${signal ?? code ?? "unknown status"}`));
      });
    });

    await stdoutFile.close();
    fileClosed = true;
    return { stdout: await readFile(stdoutPath, "utf8"), stderr };
  } catch (error) {
    if (!fileClosed) {
      await stdoutFile.close().catch(() => undefined);
      fileClosed = true;
    }
    const stdout = existsSync(stdoutPath) ? await readFile(stdoutPath, "utf8") : "";
    if (options.allowJsonError && stdout.trim().startsWith("{")) {
      return { stdout, stderr };
    }
    const detail = [
      error instanceof Error ? error.message : String(error),
      stderr.trim(),
      stdout,
    ].filter(Boolean).join("\n");
    throw new Error(detail);
  } finally {
    if (!fileClosed) {
      await stdoutFile.close().catch(() => undefined);
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function runProcessToStdoutFile(command: string, args: readonly string[]): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "auto-job-bb-fetch-"));
  const stdoutPath = join(tempDir, "stdout");
  const stdoutFile = await open(stdoutPath, "w");
  let fileClosed = false;

  try {
    await new Promise<void>((resolvePromise, reject) => {
      const child = spawn(command, [...args], {
        stdio: ["ignore", stdoutFile.fd, "pipe"],
      });
      let stderr = "";
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, 180_000);

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timeout);
        if (timedOut) {
          reject(new Error(`${command} timed out after 180000ms`));
          return;
        }
        if (code === 0) {
          resolvePromise();
          return;
        }
        reject(new Error([
          `${command} exited with ${signal ?? code ?? "unknown status"}`,
          stderr.trim(),
        ].filter(Boolean).join("\n")));
      });
    });

    await stdoutFile.close();
    fileClosed = true;
    return await readFile(stdoutPath, "utf8");
  } finally {
    if (!fileClosed) {
      await stdoutFile.close().catch(() => undefined);
    }
    await rm(tempDir, { recursive: true, force: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
