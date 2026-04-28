import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext, type Page } from "playwright";
import {
  createScanRunId,
  createScanRunRecorder,
  type ScanRunRecorder,
} from "../apps/server/src/adapters/newgrad-scan-run-log.ts";
import {
  extractNewGradDetail,
  extractNewGradList,
} from "../apps/extension/src/content/extract-newgrad.ts";
import type {
  EnrichedRow,
  FilteredRow,
  NewGradEnrichResult,
  NewGradRow,
  NewGradScoreResult,
  PipelineEntry,
  ScoredRow,
} from "../apps/server/src/contracts/newgrad.ts";
import type {
  EvaluationInput,
  EvaluationResult,
  JobSnapshot,
  StructuredJobSignals,
} from "../apps/server/src/contracts/jobs.ts";
import {
  filterKnownEvaluationCandidates,
  loadEvaluationDedupeKeys,
} from "./evaluation-dedupe.ts";

const PROTOCOL_VERSION = "1.0.0";
const DEFAULT_URL = "https://www.newgrad-jobs.com/";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 47319;
const DEFAULT_CONCURRENT = 3;
const DEFAULT_DELAY_MIN_MS = 2000;
const DEFAULT_DELAY_MAX_MS = 5000;
const DEFAULT_EVALUATION_QUEUE_DELAY_MS = 2100;
const DEFAULT_EVALUATION_WAIT_TIMEOUT_MS = 20 * 60_000;
const SCORE_CHUNK_SIZE = 50;
const ENRICH_CHUNK_SIZE = 3;

type Options = {
  url: string;
  bridgeHost: string;
  bridgePort: number;
  userDataDir: string;
  headless: boolean;
  useChrome: boolean;
  limit: number | null;
  enrichLimit: number | null;
  concurrent: number;
  delayMinMs: number;
  delayMaxMs: number;
  listSource: "auto" | "api" | "dom" | "initial-jobs";
  scoreOnly: boolean;
  evaluate: boolean;
  evaluateLimit: number | null;
  evaluationMode: "newgrad_quick" | "default";
  waitEvaluations: boolean;
  evaluationQueueDelayMs: number;
  evaluationWaitTimeoutMs: number;
  help: boolean;
};

type BridgeResponse<T> =
  | { ok: true; result: T; requestId: string }
  | { ok: false; error: { code: string; message: string; detail?: unknown }; requestId: string };

type ScanSource = "newgrad" | "jobright";
type JobrightApiListOptions = {
  limit: number | null;
  maxAgeMinutes: number;
  pageSize: number;
  maxRows: number;
};
type ApplyFlowProbe = {
  originalPostUrl: string;
  applyNowUrl: string;
  applyFlowUrls: string[];
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_USER_DATA_DIR = join(repoRoot, "data", "browser-profiles", "newgrad-scan");

function usage(): string {
  return `career-ops autonomous newgrad scan

Usage:
  bun run newgrad-scan -- [options]

Options:
  --url <url>             Source URL. Default: ${DEFAULT_URL}
  --headless              Run browser headless. Default.
  --headed                Run browser headed for debugging or manual observation.
  --chromium              Use bundled Playwright Chromium. Default.
  --chrome                Try Google Chrome, then fall back to bundled Chromium.
  --limit <n>             Limit extracted list rows before scoring.
  --enrich-limit <n>      Limit promoted rows before detail enrichment.
  --concurrent <n>        Detail pages open at once. Default: ${DEFAULT_CONCURRENT}
  --delay-min-ms <n>      Minimum delay between detail batches. Default: ${DEFAULT_DELAY_MIN_MS}
  --delay-max-ms <n>      Maximum delay between detail batches. Default: ${DEFAULT_DELAY_MAX_MS}
  --list-source <source>  List extraction source: auto, api, dom, or initial-jobs. Default: auto.
  --score-only            Stop after list extraction and scoring.
  --no-evaluate           Stop after enrich/pipeline write; do not queue tracker evaluations.
  --evaluate-limit <n>    Limit how many enrich survivors are sent to evaluation.
  --evaluation-mode <m>   Evaluation mode: newgrad_quick or default. Default: newgrad_quick.
  --no-wait-evaluations   Queue evaluation jobs and exit without waiting for tracker merge.
  --evaluation-queue-delay-ms <n>
                          Delay between /v1/evaluate calls. Default: ${DEFAULT_EVALUATION_QUEUE_DELAY_MS}
  --evaluation-wait-timeout-ms <n>
                          Max time to wait for queued jobs. Default: ${DEFAULT_EVALUATION_WAIT_TIMEOUT_MS}
  --user-data-dir <path>  Browser profile directory. Default: ${DEFAULT_USER_DATA_DIR}
  --bridge-host <host>    Bridge host. Default: ${DEFAULT_HOST}
  --bridge-port <port>    Bridge port. Default: ${DEFAULT_PORT}
  --help                  Show this help.
`;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    url: DEFAULT_URL,
    bridgeHost: DEFAULT_HOST,
    bridgePort: DEFAULT_PORT,
    userDataDir: DEFAULT_USER_DATA_DIR,
    headless: true,
    useChrome: false,
    limit: null,
    enrichLimit: null,
    concurrent: DEFAULT_CONCURRENT,
    delayMinMs: DEFAULT_DELAY_MIN_MS,
    delayMaxMs: DEFAULT_DELAY_MAX_MS,
    listSource: "auto",
    scoreOnly: false,
    evaluate: true,
    evaluateLimit: null,
    evaluationMode: "newgrad_quick",
    waitEvaluations: true,
    evaluationQueueDelayMs: DEFAULT_EVALUATION_QUEUE_DELAY_MS,
    evaluationWaitTimeoutMs: DEFAULT_EVALUATION_WAIT_TIMEOUT_MS,
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
      case "--url":
        options.url = next();
        break;
      case "--headless":
        options.headless = true;
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--chromium":
        options.useChrome = false;
        break;
      case "--chrome":
        options.useChrome = true;
        break;
      case "--limit":
        options.limit = positiveInt(next(), arg);
        break;
      case "--enrich-limit":
        options.enrichLimit = positiveInt(next(), arg);
        break;
      case "--concurrent":
        options.concurrent = positiveInt(next(), arg);
        break;
      case "--delay-min-ms":
        options.delayMinMs = nonNegativeInt(next(), arg);
        break;
      case "--delay-max-ms":
        options.delayMaxMs = nonNegativeInt(next(), arg);
        break;
      case "--list-source": {
        const source = next();
        if (source !== "auto" && source !== "api" && source !== "dom" && source !== "initial-jobs") {
          throw new Error("--list-source must be auto, api, dom, or initial-jobs");
        }
        options.listSource = source;
        break;
      }
      case "--score-only":
        options.scoreOnly = true;
        break;
      case "--no-evaluate":
        options.evaluate = false;
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
      case "--user-data-dir":
        options.userDataDir = resolve(next());
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

  if (options.delayMaxMs < options.delayMinMs) {
    throw new Error("--delay-max-ms must be >= --delay-min-ms");
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

  const bridgeBase = `http://${options.bridgeHost}:${options.bridgePort}`;
  const scanRun = createScanRunRecorder({
    repoRoot,
    scanRunId: createScanRunId("newgrad"),
    source: "newgrad-scan",
  });
  let context: BrowserContext | undefined;

  try {
    const token = (await readFile(join(repoRoot, "apps", "server", ".bridge-token"), "utf8")).trim();
    scanRun.record("bridge_health_check_started", { bridgeBase });
    await assertBridgeHealthy(bridgeBase, token);
    context = await launchContext(options);

    const listPage = await context.newPage();
    console.log(`Opening ${options.url}`);
    scanRun.record("source_open_started", { url: options.url });
    await gotoSettled(listPage, options.url);

    const source = await resolveScanSource(listPage, options.url);
    scanRun.record("source_resolved", source);
    if (source.url !== listPage.url()) {
      console.log(`Opening embedded source ${source.url}`);
      await gotoSettled(listPage, source.url);
    }

    let rows = await extractListRows(listPage, options);
    if (options.limit !== null) {
      rows = rows.slice(0, options.limit);
    }
    await listPage.close();
    console.log(`Extracted ${rows.length} ${source.kind} rows`);
    scanRun.increment("discovered", rows.length);
    scanRun.record("rows_extracted", { count: rows.length, sourceKind: source.kind });

    if (rows.length === 0) {
      console.log("No rows extracted; nothing to score.");
      const summary = scanRun.finalize("completed", { reason: "no_rows" });
      console.log(`Scan run summary: ${summary.summaryPath}`);
      return;
    }

    const score = await scoreRows(bridgeBase, token, dedupeRows(rows));
    console.log(`Scored rows: promoted=${score.promoted.length}, filtered=${score.filtered.length}`);
    scanRun.increment("listPromoted", score.promoted.length);
    scanRun.increment("listFiltered", score.filtered.length);
    recordListDecisions(scanRun, score);

    if (score.promoted.length > 0) {
      const top = score.promoted.slice(0, 10).map((row, index) =>
        `${index + 1}. ${row.row.company} — ${row.row.title} (${row.score}/${row.maxScore})`,
      );
      console.log(["Top promoted rows:", ...top].join("\n"));
    }

    if (options.scoreOnly || score.promoted.length === 0) {
      const summary = scanRun.finalize("completed", {
        reason: options.scoreOnly ? "score_only" : "no_promoted_rows",
      });
      console.log(`Scan run summary: ${summary.summaryPath}`);
      return;
    }

    const promoted = options.enrichLimit === null
      ? [...score.promoted]
      : [...score.promoted].slice(0, options.enrichLimit);
    console.log(`Enriching ${promoted.length} promoted rows`);

    const { enrichedRows, failed } = await enrichDetails(context, promoted, options);
    console.log(`Detail enrichment: enriched=${enrichedRows.length}, failed=${failed}`);
    scanRun.increment("enriched", enrichedRows.length);
    scanRun.increment("enrichmentFailed", failed);
    scanRun.record("detail_enrichment_completed", {
      enriched: enrichedRows.length,
      failed,
    });
    await context.close();
    context = undefined;
    console.log("Closed scan browser after detail enrichment.");

    if (enrichedRows.length === 0) {
      console.log("No enriched rows; nothing to write to pipeline.");
      const summary = scanRun.finalize("completed", { reason: "no_enriched_rows" });
      console.log(`Scan run summary: ${summary.summaryPath}`);
      return;
    }

    const enrich = await writeEnrichedRows(bridgeBase, token, enrichedRows);
    console.log(
      `Bridge enrich result: added=${enrich.added}, skipped=${enrich.skipped}, candidates=${enrich.candidates?.length ?? 0}`,
    );
    scanRun.increment("detailAdded", enrich.added);
    scanRun.increment("detailSkipped", enrich.skipped);
    scanRun.record("bridge_enrich_completed", {
      added: enrich.added,
      skipped: enrich.skipped,
      candidates: enrich.candidates?.length ?? 0,
      skipBreakdown: enrich.skipBreakdown,
    });
    recordDetailDecisions(scanRun, enrich);
    if (enrich.skipBreakdown && Object.keys(enrich.skipBreakdown).length > 0) {
      console.log(`Skip breakdown: ${JSON.stringify(enrich.skipBreakdown)}`);
    }
    if (enrich.entries.length > 0) {
      console.log("Pipeline entries:");
      for (const entry of enrich.entries) {
        console.log(`- ${entry.company} — ${entry.role} (${entry.score}) ${entry.url}`);
      }
    }

    if (!options.evaluate) {
      console.log("Direct evaluation disabled by --no-evaluate.");
      const summary = scanRun.finalize("completed", { reason: "evaluation_disabled" });
      console.log(`Scan run summary: ${summary.summaryPath}`);
      return;
    }

    const filteredEvaluationCandidates = filterKnownEvaluationCandidates(
      enrich.candidates ?? enrich.entries,
      loadEvaluationDedupeKeys(repoRoot),
    );
    if (filteredEvaluationCandidates.skipped > 0) {
      console.log(`Skipped ${filteredEvaluationCandidates.skipped} already evaluated/tracked direct-evaluation candidates.`);
      scanRun.increment("queueSkipped", filteredEvaluationCandidates.skipped);
      scanRun.record("direct_evaluation_known_duplicates_skipped", {
        skipped: filteredEvaluationCandidates.skipped,
      });
    }
    const evaluationCandidates = filteredEvaluationCandidates.candidates.slice(
      0,
      options.evaluateLimit ?? undefined,
    );
    if (evaluationCandidates.length === 0) {
      console.log("No enrich survivors eligible for direct evaluation.");
      const summary = scanRun.finalize("completed", { reason: "no_evaluation_candidates" });
      console.log(`Scan run summary: ${summary.summaryPath}`);
      return;
    }

    const queued = await queueDirectEvaluations(
      bridgeBase,
      token,
      evaluationCandidates,
      enrichedRows,
      options,
    );
    console.log(
      `Direct evaluation queue: queued=${queued.jobs.length}, failed=${queued.failed.length}, skipped=${queued.skipped}`,
    );
    scanRun.increment("queued", queued.jobs.length);
    scanRun.increment("queueFailed", queued.failed.length);
    scanRun.increment("queueSkipped", queued.skipped);
    scanRun.record("direct_evaluation_queue_completed", {
      queued: queued.jobs.length,
      failed: queued.failed.length,
      skipped: queued.skipped,
    });
    for (const failedJob of queued.failed) {
      console.warn(`- failed to queue ${failedJob.company} — ${failedJob.role}: ${failedJob.error}`);
    }

    if (options.waitEvaluations && queued.jobs.length > 0) {
      const result = await waitForEvaluations(bridgeBase, token, queued.jobs, options);
      console.log(
        `Direct evaluation result: completed=${result.completed.length}, failed=${result.failed.length}, timedOut=${result.timedOut.length}`,
      );
      scanRun.increment("completed", result.completed.length);
      scanRun.increment("failed", result.failed.length);
      scanRun.increment("timedOut", result.timedOut.length);
      scanRun.record("direct_evaluation_wait_completed", {
        completed: result.completed.length,
        failed: result.failed.length,
        timedOut: result.timedOut.length,
      });
      for (const item of result.completed) {
        scanRun.record("evaluation_completed", {
          company: item.result.company,
          role: item.result.role,
          score: item.result.score,
          reportPath: item.result.reportPath,
          trackerMerged: item.result.trackerMerged,
        });
        console.log(
          `- ${item.result.company} — ${item.result.role}: ${item.result.score}/5 report=${item.result.reportPath} trackerMerged=${item.result.trackerMerged}`,
        );
      }
      for (const item of result.failed) {
        scanRun.record("evaluation_failed", {
          company: item.job.company,
          role: item.job.role,
          error: item.error,
        });
        console.warn(`- failed ${item.job.company} — ${item.job.role}: ${item.error}`);
      }
      for (const item of result.timedOut) {
        scanRun.record("evaluation_timed_out", {
          company: item.company,
          role: item.role,
          jobId: item.jobId,
        });
        console.warn(`- timed out waiting for ${item.company} — ${item.role}: job=${item.jobId}`);
      }
    } else if (queued.jobs.length > 0) {
      console.log("Evaluation jobs queued; not waiting because --no-wait-evaluations was set.");
    }
    const summary = scanRun.finalize("completed");
    console.log(`Scan run summary: ${summary.summaryPath}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const summary = scanRun.finalize("failed", { error: message });
    console.error(`Scan run failed. Summary: ${summary.summaryPath}`);
    throw error;
  } finally {
    await context?.close();
  }
}

async function launchContext(options: Options): Promise<BrowserContext> {
  const baseOptions = {
    headless: options.headless,
    viewport: { width: 1440, height: 1000 },
  };

  if (!options.useChrome) {
    return chromium.launchPersistentContext(options.userDataDir, baseOptions);
  }

  try {
    return await chromium.launchPersistentContext(options.userDataDir, {
      ...baseOptions,
      channel: "chrome",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Google Chrome launch failed, falling back to bundled Chromium: ${message}`);
    return chromium.launchPersistentContext(options.userDataDir, baseOptions);
  }
}

async function assertBridgeHealthy(base: string, token: string): Promise<void> {
  const res = await fetch(`${base}/v1/health`, {
    headers: { "x-career-ops-token": token },
  });
  const body = await res.json() as BridgeResponse<unknown>;
  if (!body.ok) {
    const error = (body as Extract<BridgeResponse<unknown>, { ok: false }>).error;
    throw new Error(`bridge health failed: ${error.code} ${error.message}`);
  }
  console.log("Bridge health: ok");
}

async function resolveScanSource(page: Page, fallbackUrl: string): Promise<{ kind: ScanSource; url: string }> {
  const url = page.url();
  if (url.includes("jobright.ai/minisites-jobs")) {
    return { kind: "jobright", url };
  }

  const sourceUrl = await evaluateBrowserFunction<string>(page, resolveEmbeddedJobrightSource);

  return {
    kind: "newgrad",
    url: sourceUrl || fallbackUrl,
  };
}

async function gotoSettled(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(1_000);
}

async function extractListRows(page: Page, options: Options): Promise<NewGradRow[]> {
  const canUseJobrightStructured =
    options.listSource !== "dom" && isJobrightMinisiteUrl(page.url());
  let initialRows: NewGradRow[] = [];

  if (canUseJobrightStructured && options.listSource !== "initial-jobs") {
    try {
      const apiRows = await evaluateBrowserFunction<NewGradRow[], JobrightApiListOptions>(
        page,
        extractJobrightApiRows,
        {
          limit: options.limit,
          maxAgeMinutes: 24 * 60,
          pageSize: 50,
          maxRows: Math.max(options.limit ?? 0, 2500),
        },
      );
      if (apiRows.length > 0) {
        console.log(`Using JobRight API list source: ${apiRows.length} rows within 24h.`);
        return apiRows;
      }
      if (options.listSource === "api") {
        console.log("JobRight API list source returned no rows.");
        return [];
      }
      console.warn("JobRight API list source returned no rows; falling back to initialJobs/DOM.");
    } catch (error) {
      if (options.listSource === "api") throw error;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`JobRight API extraction failed; falling back to initialJobs/DOM: ${message}`);
    }
  }

  if (canUseJobrightStructured) {
    try {
      initialRows = await evaluateBrowserFunction<NewGradRow[]>(page, extractJobrightInitialJobs);
      if (initialRows.length > 0) {
        console.log(`JobRight initialJobs rows: ${initialRows.length}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`JobRight initialJobs extraction failed; falling back to DOM: ${message}`);
    }
  }

  if (options.listSource === "initial-jobs") {
    return initialRows;
  }

  if (initialRows.length > 0) {
    const satisfiesLimit = options.limit !== null && initialRows.length >= options.limit;
    const coversFreshWindow = initialRowsCoverFreshWindow(initialRows);
    if (satisfiesLimit || coversFreshWindow) {
      const reason = satisfiesLimit
        ? `limit ${options.limit}`
        : "24h freshness window";
      console.log(`Using JobRight initialJobs list source (${reason} satisfied).`);
      return initialRows;
    }

    console.log("JobRight initialJobs does not prove full 24h coverage; continuing with DOM scroller.");
  }

  const domRows = await evaluateBrowserFunction<NewGradRow[]>(page, extractNewGradList);
  if (initialRows.length === 0) return domRows;

  const merged = mergeNewGradRows([...initialRows, ...domRows]);
  console.log(`Merged list rows: initialJobs=${initialRows.length}, dom=${domRows.length}, unique=${merged.length}`);
  return merged;
}

function isJobrightMinisiteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.hostname === "jobright.ai" || parsed.hostname.endsWith(".jobright.ai")) &&
      parsed.pathname.startsWith("/minisites-jobs/newgrad")
    );
  } catch {
    return false;
  }
}

function initialRowsCoverFreshWindow(rows: readonly NewGradRow[]): boolean {
  const last = rows.at(-1);
  if (!last) return false;
  const minutesAgo = parseRelativePostedAgoMinutes(last.postedAgo);
  return Number.isFinite(minutesAgo) && minutesAgo >= 24 * 60;
}

function parseRelativePostedAgoMinutes(text: string): number {
  const normalized = text.trim().toLowerCase();
  if (
    normalized === "just now" ||
    normalized === "today" ||
    normalized === "moments ago" ||
    normalized === "a moment ago"
  ) {
    return 0;
  }

  const longMatch = /^(\d+)\s+([a-z]+)\s+ago$/.exec(normalized);
  if (longMatch) {
    const value = Number(longMatch[1]);
    const unit = longMatch[2] ?? "";
    if (unit.startsWith("minute") || unit.startsWith("min")) return value;
    if (unit.startsWith("hour") || unit === "hr" || unit === "hrs") return value * 60;
    if (unit.startsWith("day")) return value * 1440;
    if (unit.startsWith("week")) return value * 10080;
  }

  const shortMatch = /^(\d+)([mhdw])\s+ago$/.exec(normalized);
  if (shortMatch) {
    const value = Number(shortMatch[1]);
    const unit = shortMatch[2];
    if (unit === "m") return value;
    if (unit === "h") return value * 60;
    if (unit === "d") return value * 1440;
    if (unit === "w") return value * 10080;
  }

  return Number.POSITIVE_INFINITY;
}

function mergeNewGradRows(rows: readonly NewGradRow[]): NewGradRow[] {
  const seen = new Set<string>();
  const merged: NewGradRow[] = [];

  for (const row of rows) {
    const key =
      normalizeUrl(row.detailUrl) ??
      normalizeUrl(row.applyUrl) ??
      `${normalizeText(row.company)}|${normalizeText(row.title)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...row,
      position: merged.length + 1,
    });
  }

  return merged;
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
    const res = await postEnvelope<NewGradScoreResult>(
      bridgeBase,
      token,
      "/v1/newgrad-scan/score",
      { rows: chunk },
    );
    promoted.push(...res.promoted);
    filtered.push(...res.filtered);
  }

  return {
    promoted: promoted.sort((a, b) => b.score - a.score),
    filtered,
  };
}

async function enrichDetails(
  context: BrowserContext,
  promotedRows: ScoredRow[],
  options: Options,
): Promise<{ enrichedRows: EnrichedRow[]; failed: number }> {
  const enrichedRows: EnrichedRow[] = [];
  let failed = 0;
  const queue = [...promotedRows];

  while (queue.length > 0) {
    const batch = queue.splice(0, options.concurrent);
    const results = await Promise.all(batch.map((scored) => enrichOneDetail(context, scored)));
    for (const result of results) {
      if (result) enrichedRows.push(result);
      else failed += 1;
    }

    if (queue.length > 0 && options.delayMaxMs > 0) {
      await sleep(randomDelay(options.delayMinMs, options.delayMaxMs));
    }
  }

  return { enrichedRows, failed };
}

async function enrichOneDetail(context: BrowserContext, scored: ScoredRow): Promise<EnrichedRow | null> {
  const page = await context.newPage();
  try {
    await gotoSettled(page, scored.row.detailUrl);
    const detail = await evaluateBrowserFunction(page, extractNewGradDetail);
    const probe = await evaluateBrowserFunction<ApplyFlowProbe>(page, probeApplyFlow).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Apply-flow probe failed for ${scored.row.company} — ${scored.row.title}: ${message}`);
      return null;
    });
    return {
      row: scored,
      detail: {
        ...detail,
        position: scored.row.position,
        originalPostUrl: probe?.originalPostUrl || detail.originalPostUrl,
        applyNowUrl: probe?.applyNowUrl || detail.applyNowUrl,
        applyFlowUrls: Array.from(new Set([
          ...(detail.applyFlowUrls ?? []),
          ...(probe?.applyFlowUrls ?? []),
        ])),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Detail enrichment failed for ${scored.row.company} — ${scored.row.title}: ${message}`);
    return null;
  } finally {
    await page.close().catch(() => undefined);
  }
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
    merged.skips = [
      ...(merged.skips ?? []),
      ...(result.skips ?? []),
    ];
    merged.candidates = [
      ...(merged.candidates ?? []),
      ...(result.candidates ?? result.entries),
    ];
    mergeCounts(merged.skipBreakdown, result.skipBreakdown);
  }

  return merged;
}

function recordListDecisions(
  scanRun: ScanRunRecorder,
  score: NewGradScoreResult,
): void {
  for (const item of score.promoted) {
    scanRun.record("list_filter_passed", {
      company: item.row.company,
      role: item.row.title,
      url: normalizeUrl(item.row.applyUrl) ?? item.row.applyUrl,
      score: item.score,
      maxScore: item.maxScore,
      breakdown: item.breakdown,
    });
  }

  for (const item of score.filtered) {
    scanRun.record("list_filter_skipped", {
      company: item.row.company,
      role: item.row.title,
      url: normalizeUrl(item.row.applyUrl) ?? item.row.applyUrl,
      reason: item.reason,
      detail: item.detail,
    });
  }
}

function recordDetailDecisions(
  scanRun: ScanRunRecorder,
  enrich: NewGradEnrichResult,
): void {
  for (const entry of enrich.entries) {
    scanRun.record("detail_gate_passed", {
      company: entry.company,
      role: entry.role,
      url: entry.url,
      score: entry.score,
      valueScore: entry.valueScore,
      valueReasons: entry.valueReasons,
      source: entry.source,
    });
  }

  for (const skip of enrich.skips ?? []) {
    scanRun.record("detail_gate_skipped", skip as unknown as Record<string, unknown>);
  }
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
    const input = buildEvaluationInput(candidate, matchedRow, options.evaluationMode);
    console.log(`Queueing direct evaluation ${index + 1}/${candidates.length}: ${candidate.company} — ${candidate.role}`);

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
  candidate: PipelineEntry,
  matchedRow: EnrichedRow | undefined,
  evaluationMode: Options["evaluationMode"],
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
      signals: [structuredSignals.source ?? "newgrad-scan"],
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

function signalStrings(values: readonly string[], maxItems: number, maxLength: number): string[] {
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((value) => value.length > maxLength ? value.slice(0, maxLength).trimEnd() : value);
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
    [
      "Jobright match panel:",
      `- Overall: ${formatMaybeNumber(detail.matchScore)}`,
      `- Experience level: ${formatMaybeNumber(detail.expLevelMatch)}`,
      `- Skill: ${formatMaybeNumber(detail.skillMatch)}`,
      `- Industry experience: ${formatMaybeNumber(detail.industryExpMatch)}`,
    ].join("\n"),
    detail.confirmedSponsorshipSupport !== "unknown"
      ? `Confirmed sponsorship: ${detail.confirmedSponsorshipSupport}`
      : null,
    detail.confirmedRequiresActiveSecurityClearance
      ? "Confirmed active security clearance requirement: yes"
      : null,
    detail.skillTags.length > 0
      ? `Skill tags: ${detail.skillTags.slice(0, 15).join(", ")}`
      : null,
    detail.recommendationTags.length > 0
      ? `Recommendation tags: ${detail.recommendationTags.slice(0, 8).join(", ")}`
      : null,
    detail.taxonomy.length > 0
      ? `Taxonomy: ${detail.taxonomy.slice(0, 8).join(", ")}`
      : null,
    detail.requiredQualifications.length > 0
      ? [
          "Requirements:",
          ...detail.requiredQualifications.slice(0, 10).map((item) => `- ${item}`),
        ].join("\n")
      : null,
    detail.responsibilities.length > 0
      ? [
          "Responsibilities:",
          ...detail.responsibilities.slice(0, 8).map((item) => `- ${item}`),
        ].join("\n")
      : null,
    detail.description ? `Description excerpt:\n${detail.description.slice(0, 1_800)}` : null,
  ]
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();

  return sections.length > 0 ? sections.slice(0, 4_000) : undefined;
}

function formatMaybeNumber(value: number | null): string {
  return value === null ? "unknown" : String(value);
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
  const requestId = `newgrad-scan-${randomUUID()}`;
  const res = await fetch(`${bridgeBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-career-ops-token": token,
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
    headers: { "x-career-ops-token": token },
  });
  const body = await res.json() as BridgeResponse<T>;
  if (!body.ok) {
    const error = (body as Extract<BridgeResponse<T>, { ok: false }>).error;
    throw new Error(`${path} failed: ${error.code} ${error.message}`);
  }
  return body.result;
}

function dedupeRows(rows: NewGradRow[]): NewGradRow[] {
  const seen = new Set<string>();
  const unique: NewGradRow[] = [];

  for (const row of rows) {
    const key =
      normalizeUrl(row.detailUrl) ??
      normalizeUrl(row.applyUrl) ??
      `${row.company.trim().toLowerCase()}|${row.title.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  return unique;
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

function resolveEmbeddedJobrightSource(): string {
  function withForwardedParams(baseUrl: string): string {
    const sourceParams = new URLSearchParams(window.location.search);
    const target = new URL(baseUrl);
    target.searchParams.set("embed", "true");

    for (const key of ["u", "utm_source", "utm_campaign"]) {
      const value = sourceParams.get(key);
      if (value) target.searchParams.set(key, value);
    }

    return target.toString();
  }

  function selectedJobrightUrl(): string | null {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("k");
    const selectedKey = params.get("selectedKey");
    const items = Array.from(
      document.querySelectorAll<HTMLElement>(".div-block-14, .airtable-trigger"),
    );

    const selectedItem = items.find((item) => {
      const shortLink = item.getAttribute("short-link");
      const text = item.innerText.trim();
      return (
        (key !== null && shortLink === decodeURIComponent(key)) ||
        (selectedKey !== null && text === decodeURIComponent(selectedKey))
      );
    }) ?? document.querySelector<HTMLElement>(
      ".w-tab-pane.w--tab-active .div-block-14.active, .w-tab-pane.w--tab-active .airtable-trigger.active",
    ) ?? document.querySelector<HTMLElement>(
      ".w-tab-pane.w--tab-active .div-block-14, .w-tab-pane.w--tab-active .airtable-trigger",
    );

    const jobPath = selectedItem?.getAttribute("data-job-path");
    if (!jobPath || jobPath.trim() === "") return null;

    const cleanPath = jobPath.startsWith("/") ? jobPath.slice(1) : jobPath;
    return withForwardedParams(`https://jobright.ai/minisites-jobs/newgrad/${cleanPath}`);
  }

  const selected = selectedJobrightUrl();
  if (selected) return selected;

  const fallback = Array.from(document.querySelectorAll("iframe[src]"))
    .map((iframe) => (iframe as HTMLIFrameElement).src)
    .find((src) => src.includes("jobright.ai/minisites-jobs/newgrad"));
  if (fallback) return fallback;

  return withForwardedParams("https://jobright.ai/minisites-jobs/newgrad/us/swe");
}

async function extractJobrightApiRows(options: JobrightApiListOptions): Promise<NewGradRow[]> {
  type ApiJob = {
    jobId?: unknown;
    id?: unknown;
    postedAt?: unknown;
    properties?: unknown;
  };
  type ApiResponse = {
    success?: unknown;
    errorCode?: unknown;
    errorMessage?: unknown;
    result?: {
      jobList?: unknown;
      total?: unknown;
    };
  };

  function stringify(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (Array.isArray(value)) {
      return value.map((item) => stringify(item)).filter(Boolean).join(", ");
    }
    if (typeof value === "object") return "";
    return String(value).trim();
  }

  function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  }

  function parseBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    const normalized = stringify(value).toLowerCase();
    if (!normalized) return false;
    if (/\b(no|false|not sure|unknown|n\/a)\b/.test(normalized)) return false;
    return /\b(yes|true|new[\s-]?grad|entry[\s-]?level)\b/.test(normalized);
  }

  function parseSponsorshipStatus(text: string): "yes" | "no" | "unknown" {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return "unknown";
    if (/\b(not sure|unknown|n\/a|unclear)\b/.test(normalized)) return "unknown";
    if (
      /\b(no|false)\b/.test(normalized) ||
      normalized.includes("no sponsorship") ||
      normalized.includes("without sponsorship") ||
      normalized.includes("unable to sponsor") ||
      normalized.includes("cannot sponsor") ||
      normalized.includes("can't sponsor")
    ) {
      return "no";
    }
    if (
      /\b(yes|true)\b/.test(normalized) ||
      normalized.includes("sponsor") ||
      normalized.includes("visa support") ||
      normalized.includes("work authorization support")
    ) {
      return "yes";
    }
    return "unknown";
  }

  function requiresActiveSecurityClearance(text: string): boolean {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return false;
    const segments = normalized
      .split(/[\n\r.;!?]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      if (
        /\b(preferred|preference|nice to have|plus|public trust)\b/.test(segment) ||
        /\b(ability|eligible|eligibility|able)\s+to\s+obtain\b/.test(segment) ||
        /\bobtain(?:ed|ing)?\b/.test(segment)
      ) {
        continue;
      }
      if (
        /\b(active|current)\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(active|current)\s+security\s+clearance\b/.test(segment) ||
        /\btop\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\b(?:secret|top\s+secret|ts\/sci)(?:\s+security)?\s+clearance\b/.test(
          segment,
        ) ||
        (segment.length <= 120 && /\b(top secret|ts\/sci)\b/.test(segment))
      ) {
        return true;
      }
    }

    return false;
  }

  function formatPostedAgo(postedDate: unknown): string {
    const timestamp = Number(postedDate);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
    if (minutes <= 0) return "just now";
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }

  function postedAgoMinutes(postedDate: unknown): number {
    const timestamp = Number(postedDate);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return Number.POSITIVE_INFINITY;
    return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  }

  function categoryFromPath(): string | null {
    const marker = "/minisites-jobs/";
    const markerIndex = window.location.pathname.indexOf(marker);
    if (markerIndex < 0) return null;
    const rawPath = window.location.pathname.slice(markerIndex + marker.length);
    const parts = rawPath
      .split("/")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    return parts.length > 0 ? parts.join(":") : null;
  }

  function detailUrl(jobId: string): string {
    const id = jobId.replace(/"/g, "");
    if (!id) return "";
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get("utm_source") || "1100";
    const utmCampaign = params.get("utm_campaign") || "Software Engineering";
    const url = new URL(`/jobs/info/${encodeURIComponent(id)}`, window.location.origin);
    url.searchParams.set("utm_source", utmSource);
    url.searchParams.set("utm_campaign", utmCampaign);
    return url.toString();
  }

  function mapJob(job: ApiJob, position: number): NewGradRow | null {
    const props = record(job.properties);
    const id = stringify(job.jobId) || stringify(job.id);
    const title = stringify(props.title);
    const company = stringify(props.company);
    if (!title && !company) return null;

    const qualifications = stringify(props.qualifications);
    const sponsorshipSupport = parseSponsorshipStatus(stringify(props.h1bSponsored));
    const clearanceText = [title, qualifications].join("\n");
    const url = detailUrl(id);

    return {
      source: "jobright.ai",
      position,
      title,
      postedAgo: formatPostedAgo(job.postedAt),
      applyUrl: url,
      detailUrl: url,
      workModel: stringify(props.workModel),
      location: stringify(props.location),
      company,
      salary: stringify(props.salary) || null,
      companySize: stringify(props.companySize) || null,
      industry: stringify(props.industry) || null,
      qualifications: qualifications || null,
      h1bSponsored: sponsorshipSupport === "yes",
      sponsorshipSupport,
      confirmedSponsorshipSupport: "unknown",
      requiresActiveSecurityClearance: requiresActiveSecurityClearance(clearanceText),
      confirmedRequiresActiveSecurityClearance: false,
      isNewGrad: parseBoolean(props.isNewGrad),
    };
  }

  const category = categoryFromPath();
  if (!category) return [];

  const pageSize = Math.max(1, options.pageSize);
  const rows: NewGradRow[] = [];
  const seen = new Set<string>();
  let position = 0;
  let total = Number.POSITIVE_INFINITY;

  while (position < total && position < options.maxRows) {
    const url = new URL("/swan/mini-sites/list", window.location.origin);
    url.searchParams.set("position", String(position));
    url.searchParams.set("count", String(pageSize));

    const response = await fetch(url.toString(), {
      method: "POST",
      credentials: "include",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
      },
      body: JSON.stringify({ category }),
    });
    if (!response.ok) {
      throw new Error(`JobRight list API returned HTTP ${response.status}`);
    }

    const data = await response.json() as ApiResponse;
    if (data.success === false) {
      throw new Error(`JobRight list API failed: ${stringify(data.errorMessage) || stringify(data.errorCode)}`);
    }

    const result = record(data.result);
    const jobs = result.jobList;
    const apiTotal = Number(result.total);
    if (Number.isFinite(apiTotal) && apiTotal >= 0) total = apiTotal;
    if (!Array.isArray(jobs) || jobs.length === 0) break;

    let reachedStale = false;
    for (const [index, rawJob] of (jobs as ApiJob[]).entries()) {
      const minutesAgo = postedAgoMinutes(rawJob.postedAt);
      if (minutesAgo > options.maxAgeMinutes) {
        reachedStale = true;
        break;
      }

      const row = mapJob(rawJob, position + index + 1);
      if (!row) continue;
      const key = row.detailUrl || `${row.company}|${row.title}|${row.location}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...row, position: rows.length + 1 });

      if (options.limit !== null && rows.length >= options.limit) {
        return rows;
      }
      if (rows.length >= options.maxRows) {
        return rows;
      }
    }

    if (reachedStale || jobs.length < pageSize) break;
    position += jobs.length;
  }

  return rows;
}

function extractJobrightInitialJobs(): NewGradRow[] {
  type InitialJob = {
    id?: unknown;
    title?: unknown;
    company?: unknown;
    location?: unknown;
    salary?: unknown;
    postedDate?: unknown;
    applyUrl?: unknown;
    workModel?: unknown;
    companySize?: unknown;
    industry?: unknown;
    qualifications?: unknown;
    h1bSponsored?: unknown;
    isNewGrad?: unknown;
  };

  function stringify(value: unknown): string {
    return value === undefined || value === null ? "" : String(value).trim();
  }

  function normalizeUrl(value: unknown): string {
    const raw = stringify(value);
    if (!raw) return "";
    try {
      const parsed = new URL(raw, window.location.href);
      if (!/^https?:$/.test(parsed.protocol)) return "";
      return parsed.toString();
    } catch {
      return "";
    }
  }

  function parseSponsorshipStatus(text: string): "yes" | "no" | "unknown" {
    const normalized = text.trim().toLowerCase();
    if (!normalized) return "unknown";
    if (/\b(not sure|unknown|n\/a|unclear)\b/.test(normalized)) return "unknown";
    if (
      /\b(no|false)\b/.test(normalized) ||
      normalized.includes("no sponsorship") ||
      normalized.includes("without sponsorship") ||
      normalized.includes("unable to sponsor") ||
      normalized.includes("cannot sponsor") ||
      normalized.includes("can't sponsor")
    ) {
      return "no";
    }
    if (
      /\b(yes|true)\b/.test(normalized) ||
      normalized.includes("sponsor") ||
      normalized.includes("visa support") ||
      normalized.includes("work authorization support")
    ) {
      return "yes";
    }
    return "unknown";
  }

  function requiresActiveSecurityClearance(text: string): boolean {
    const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) return false;
    const segments = normalized
      .split(/[\n\r.;!?]+/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (const segment of segments) {
      if (
        /\b(preferred|preference|nice to have|plus|public trust)\b/.test(segment) ||
        /\b(ability|eligible|eligibility|able)\s+to\s+obtain\b/.test(segment) ||
        /\bobtain(?:ed|ing)?\b/.test(segment)
      ) {
        continue;
      }
      if (
        /\b(active|current)\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(active|current)\s+security\s+clearance\b/.test(segment) ||
        /\btop\s+secret(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:current\s+)?ts\/sci(?:\s+security)?\s+clearance\b/.test(segment) ||
        /\b(?:must\s+(?:have|possess)|requires?|required|need(?:ed)?|mandatory)\b.{0,40}\b(?:secret|top\s+secret|ts\/sci)(?:\s+security)?\s+clearance\b/.test(
          segment,
        ) ||
        (segment.length <= 120 && /\b(top secret|ts\/sci)\b/.test(segment))
      ) {
        return true;
      }
    }

    return false;
  }

  function formatPostedAgo(postedDate: unknown): string {
    const timestamp = Number(postedDate);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
    if (minutes <= 0) return "just now";
    if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  }

  function industryText(value: unknown): string | null {
    if (Array.isArray(value)) {
      const values = value.map(stringify).filter(Boolean);
      return values.length > 0 ? values.join(", ") : null;
    }
    const text = stringify(value);
    return text || null;
  }

  const raw = document.querySelector("script#__NEXT_DATA__")?.textContent?.trim();
  if (!raw) return [];

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }

  const jobs = (data as {
    props?: { pageProps?: { initialJobs?: unknown } };
  }).props?.pageProps?.initialJobs;
  if (!Array.isArray(jobs)) return [];

  return (jobs as InitialJob[])
    .map((job, index): NewGradRow => {
      const id = stringify(job.id);
      const title = stringify(job.title);
      const company = stringify(job.company);
      const qualifications = stringify(job.qualifications);
      const detailUrl = normalizeUrl(job.applyUrl) ||
        (id ? `https://jobright.ai/jobs/info/${encodeURIComponent(id)}` : "");
      const sponsorshipSupport = parseSponsorshipStatus(stringify(job.h1bSponsored));
      const clearanceText = [title, qualifications].join("\n");

      return {
        source: "jobright.ai",
        position: index + 1,
        title,
        postedAgo: formatPostedAgo(job.postedDate),
        applyUrl: detailUrl,
        detailUrl,
        workModel: stringify(job.workModel),
        location: stringify(job.location),
        company,
        salary: stringify(job.salary) || null,
        companySize: stringify(job.companySize) || null,
        industry: industryText(job.industry),
        qualifications: qualifications || null,
        h1bSponsored: sponsorshipSupport === "yes",
        sponsorshipSupport,
        confirmedSponsorshipSupport: "unknown",
        requiresActiveSecurityClearance: requiresActiveSecurityClearance(clearanceText),
        confirmedRequiresActiveSecurityClearance: false,
        isNewGrad: Boolean(job.isNewGrad),
      };
    })
    .filter((row) => row.title || row.company);
}

async function probeApplyFlow(): Promise<ApplyFlowProbe> {
  function txt(el: Element | null | undefined): string {
    if (!el) return "";
    return (
      (el as HTMLElement).innerText ?? el.textContent ?? ""
    ).trim();
  }

  function normalizeUrl(value: string | URL | null | undefined): string | null {
    if (!value) return null;
    const raw = value instanceof URL ? value.toString() : value.trim();
    if (!raw) return null;
    try {
      const parsed = new URL(raw, window.location.href);
      if (!/^https?:$/.test(parsed.protocol)) return null;
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function addCandidate(set: Set<string>, value: string | URL | null | undefined): void {
    const normalized = normalizeUrl(value);
    if (normalized) set.add(normalized);
  }

  function collectUrlsFromText(raw: string): string[] {
    return raw.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  }

  function collectDomCandidates(): string[] {
    const urls = new Set<string>();
    for (const element of Array.from(
      document.querySelectorAll(
        "a[href], form[action], [data-url], [data-href], [data-apply-url], [data-link], button, [role='button']",
      ),
    )) {
      if (element instanceof HTMLAnchorElement) addCandidate(urls, element.href);
      if (element instanceof HTMLFormElement) addCandidate(urls, element.action);
      if (element instanceof HTMLElement) {
        addCandidate(urls, element.dataset.url);
        addCandidate(urls, element.dataset.href);
        addCandidate(urls, element.dataset.applyUrl);
        addCandidate(urls, element.dataset.link);
      }
    }
    return Array.from(urls);
  }

  function scoreCandidate(candidate: string): number {
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      const full = `${host}${path}${parsed.search.toLowerCase()}`;
      const atsHosts = [
        "greenhouse",
        "ashbyhq.com",
        "lever.co",
        "workdayjobs.com",
        "myworkdayjobs.com",
        "smartrecruiters.com",
        "jobvite.com",
        "icims.com",
      ];
      const noiseHosts = [
        "accounts.google.com",
        "linkedin.com",
        "crunchbase.com",
        "glassdoor.com",
        "facebook.com",
        "instagram.com",
        "x.com",
        "twitter.com",
        "youtube.com",
        "marketbeat.com",
        "media.licdn.com",
      ];
      const applyHints = [
        "/apply",
        "/job",
        "/jobs",
        "/career",
        "/careers",
        "/position",
        "/positions",
        "gh_jid",
        "jobid",
        "job_id",
        "requisition",
        "req_id",
        "token=",
        "lever-source",
        "ashby_jid",
      ];

      if (noiseHosts.some((pattern) => host.includes(pattern))) return -100;

      const hasAtsHost = atsHosts.some((pattern) => host.includes(pattern));
      const hasApplyHint = applyHints.some((pattern) => full.includes(pattern));
      const hasJobText = /\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full);

      let score = 0;
      if (hasAtsHost) score += 100;
      if (hasApplyHint) score += 24;
      if (hasJobText) {
        score += 12;
      }
      if (host === "jobright.ai" || host.endsWith(".jobright.ai")) {
        score -= 80;
        if (path.startsWith("/jobs/info/")) score -= 30;
      } else if (hasAtsHost || hasApplyHint || hasJobText) {
        score += 40;
      } else {
        score -= 80;
      }

      const pathSegments = path.split("/").filter(Boolean);
      const lastSegment = pathSegments.at(-1) ?? "";
      if (pathSegments.length === 0 || ["home", "about", "company"].includes(lastSegment)) {
        score -= 200;
      }

      return score;
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  }

  function pickBest(candidates: Iterable<string>): string {
    let best = "";
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const candidate of candidates) {
      const score = scoreCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  function findApplyTrigger(): HTMLElement | null {
    const interactive = Array.from(document.querySelectorAll("a, button, [role='button']"));
    let best: HTMLElement | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const candidate of interactive) {
      if (!(candidate instanceof HTMLElement)) continue;
      const text = txt(candidate).toLowerCase();
      if (!text) continue;

      let score = Number.NEGATIVE_INFINITY;
      if (text.includes("apply on employer site")) score = 100;
      else if (text.includes("apply now")) score = 90;
      else if (text.includes("join now")) score = 80;
      else if (text.includes("apply")) score = 70;

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  const captured = new Set<string>();
  const record = (value: string | URL | null | undefined) => addCandidate(captured, value);
  const clickListener = (event: Event) => {
    const target = event.target instanceof Element ? event.target : null;
    const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
    if (anchor) record(anchor.href);
  };
  document.addEventListener("click", clickListener, true);

  const originalOpen = window.open.bind(window);
  const originalFetch = window.fetch.bind(window);
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  try {
    window.open = ((url?: string | URL | undefined) => {
      record(url ?? null);
      return null;
    }) as typeof window.open;

    window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      record(requestUrl);
      const response = await originalFetch(input, init);
      try {
        const text = await response.clone().text();
        for (const candidate of collectUrlsFromText(text)) record(candidate);
      } catch {
        // Ignore unreadable fetch bodies.
      }
      return response;
    }) as typeof window.fetch;

    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      const resolvedUrl = typeof url === "string" ? url : url.toString();
      (this as XMLHttpRequest & { __careerOpsUrl?: string }).__careerOpsUrl = resolvedUrl;
      record(resolvedUrl);
      originalXhrOpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };

    XMLHttpRequest.prototype.send = function (
      body?: Document | XMLHttpRequestBodyInit | null,
    ): void {
      this.addEventListener("loadend", function () {
        const xhr = this as XMLHttpRequest & { __careerOpsUrl?: string };
        record(xhr.responseURL || xhr.__careerOpsUrl);
        if (typeof xhr.responseText === "string" && xhr.responseText) {
          for (const candidate of collectUrlsFromText(xhr.responseText)) record(candidate);
        }
      });
      originalXhrSend.call(this, body);
    };

    const trigger = findApplyTrigger();
    if (trigger) trigger.click();
    await new Promise((resolve) => setTimeout(resolve, 2500));

    for (const candidate of collectDomCandidates()) record(candidate);
  } finally {
    window.open = originalOpen;
    window.fetch = originalFetch;
    XMLHttpRequest.prototype.open = originalXhrOpen;
    XMLHttpRequest.prototype.send = originalXhrSend;
    document.removeEventListener("click", clickListener, true);
  }

  const resolved = pickBest(captured);
  return {
    originalPostUrl: resolved,
    applyNowUrl: resolved,
    applyFlowUrls: Array.from(captured),
  };
}

function truncateEnrichedRow(row: EnrichedRow): EnrichedRow {
  return {
    ...row,
    detail: {
      ...row.detail,
      description: row.detail.description.slice(0, 12_000),
      responsibilities: row.detail.responsibilities.slice(0, 20),
      requiredQualifications: row.detail.requiredQualifications.slice(0, 30),
      skillTags: row.detail.skillTags.slice(0, 40),
      recommendationTags: row.detail.recommendationTags.slice(0, 20),
      industries: row.detail.industries.slice(0, 20),
      taxonomy: row.detail.taxonomy.slice(0, 20),
      companyDescription: row.detail.companyDescription
        ? row.detail.companyDescription.slice(0, 2_000)
        : null,
      applyFlowUrls: row.detail.applyFlowUrls.slice(0, 20),
      h1bSponsorshipHistory: row.detail.h1bSponsorshipHistory.slice(0, 10),
      companyCategories: row.detail.companyCategories.slice(0, 20),
    },
  };
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

function randomDelay(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs + 1));
}

async function evaluateBrowserFunction<T>(
  page: Page,
  fn: () => T | Promise<T>,
): Promise<T>;
async function evaluateBrowserFunction<T, A>(
  page: Page,
  fn: (arg: A) => T | Promise<T>,
  arg: A,
): Promise<T>;
async function evaluateBrowserFunction<T, A>(
  page: Page,
  fn: (() => T | Promise<T>) | ((arg: A) => T | Promise<T>),
  arg?: A,
): Promise<T> {
  const source = String(fn);
  const hasArg = arguments.length >= 3;
  const call = hasArg ? `(${source})(${JSON.stringify(arg)})` : `(${source})()`;
  return page.evaluate(`(() => {
    const __name = (target) => target;
    return ${call};
  })()`) as Promise<T>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
