import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, type BrowserContext } from "playwright";

import {
  extractNewGradDetail,
  type NewGradDetail,
  type NewGradRow,
} from "../apps/extension/src/content/extract-newgrad.ts";
import { loadNewGradScanConfig } from "../apps/server/src/adapters/newgrad-config.ts";
import { scoreRow } from "../apps/server/src/adapters/newgrad-scorer.ts";
import { scoreEnrichedRowValue } from "../apps/server/src/adapters/newgrad-value-scorer.ts";
import { canonicalizeJobUrl } from "../apps/server/src/lib/canonical-job-url.ts";
import type { ScoreBreakdown, ScoredRow } from "../apps/server/src/contracts/newgrad.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const DEFAULT_LIMIT = 200;
const DEFAULT_CONCURRENT = 3;
const DEFAULT_URL_SETTLE_MS = 2500;
const DEFAULT_USER_DATA_DIR = join(repoRoot, "data", "browser-profiles", "newgrad-scan");
const HISTORY_PORTAL = "newgrad-scan";
const JOBRIGHT_INFO_PREFIX = "https://jobright.ai/jobs/info/";

type Options = {
  limit: number;
  concurrent: number;
  userDataDir: string;
  headless: boolean;
  help: boolean;
};

type PipelineScoreRef = {
  url: string;
  canonicalUrl: string;
  company: string;
  role: string;
  storedScore: number;
  storedMaxScore: number;
  lineNumber: number;
  checked: boolean;
};

type Target = {
  kind: "scan-history";
  url: string;
  canonicalUrl: string;
  company: string;
  role: string;
  seenDate: string;
  historicalStatus: string;
  pipelineScore?: PipelineScoreRef;
};

type Result = {
  target: Target;
  scoreSource: "pipeline" | "synthetic";
  listScore: number;
  listMaxScore: number;
  valueScore: number;
  passed: boolean;
  reasons: string[];
  penalties: string[];
  detail: Pick<NewGradDetail, "matchScore" | "expLevelMatch" | "skillMatch" | "industryExpMatch">;
  error?: string;
};

function usage(): string {
  return `career-ops rerun historical newgrad enrich

Usage:
  bun run newgrad-rerun-history -- [options]

Options:
  --limit <n>             Number of historical candidates to rerun. Default: ${DEFAULT_LIMIT}
  --concurrent <n>        Detail pages open at once. Default: ${DEFAULT_CONCURRENT}
  --user-data-dir <path>  Browser profile directory. Default: ${DEFAULT_USER_DATA_DIR}
  --headless              Run browser headless. Default.
  --headed                Run browser headed.
  --help                  Show this help.
`;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    limit: DEFAULT_LIMIT,
    concurrent: DEFAULT_CONCURRENT,
    userDataDir: DEFAULT_USER_DATA_DIR,
    headless: true,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`missing value for ${arg}`);
      }
      index += 1;
      return value;
    };

    switch (arg) {
      case "--limit":
        options.limit = positiveInt(next(), arg);
        break;
      case "--concurrent":
        options.concurrent = positiveInt(next(), arg);
        break;
      case "--user-data-dir":
        options.userDataDir = resolve(next());
        break;
      case "--headless":
        options.headless = true;
        break;
      case "--headed":
        options.headless = false;
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const targets = await loadTargets(options.limit);
  console.log(
    JSON.stringify(
      {
        phase: "target-set",
        requested: options.limit,
        actual: targets.length,
        composition: summarizeTargetSet(targets),
      },
      null,
      2,
    ),
  );

  const config = loadNewGradScanConfig(repoRoot);
  const context = await launchContext(options);

  try {
    const results = await mapConcurrent(targets, options.concurrent, async (target) =>
      rerunTarget(context, config, target),
    );

    const summary = summarizeResults(results);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await context.close();
  }
}

async function loadTargets(limit: number): Promise<Target[]> {
  const pipeline = await readPipelineScoreRefs();
  const history = await readHistoryTargets();

  const targets: Target[] = [];
  const seen = new Set<string>();

  for (const row of history) {
    if (targets.length >= limit) break;
    if (seen.has(row.canonicalUrl)) continue;
    seen.add(row.canonicalUrl);

    const pipelineScore =
      pipeline.byUrl.get(row.canonicalUrl) ??
      pipeline.byCompanyRole.get(companyRoleKey(row.company, row.role));

    targets.push({
      kind: "scan-history",
      ...row,
      pipelineScore,
    });
  }

  return targets;
}

async function readPipelineScoreRefs(): Promise<{
  byUrl: Map<string, PipelineScoreRef>;
  byCompanyRole: Map<string, PipelineScoreRef>;
}> {
  const path = join(repoRoot, "data", "pipeline.md");
  const text = await readFile(path, "utf8");
  const byUrl = new Map<string, PipelineScoreRef>();
  const byCompanyRole = new Map<string, PipelineScoreRef>();

  const re =
    /^-\s+\[(?<checked>[ x])\]\s+(?<url>https?:\/\/\S+)\s+—\s+(?<company>.+?)\s+\|\s+(?<role>.+?)\s+\(via newgrad-scan, score:\s*(?<score>[0-9.]+)\/(?<max>[0-9.]+)(?:,\s+value:\s*(?<value>[0-9.]+)\/10)?\)/;

  const lines = text.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] ?? "";
    const match = re.exec(line);
    if (!match?.groups) continue;

    const url = match.groups.url;
    const canonicalUrl = canonicalizeJobUrl(url) ?? url;
    const ref: PipelineScoreRef = {
      url,
      canonicalUrl,
      company: match.groups.company.trim(),
      role: match.groups.role.trim(),
      storedScore: Number(match.groups.score),
      storedMaxScore: Number(match.groups.max),
      lineNumber: index + 1,
      checked: match.groups.checked === "x",
    };

    if (!byUrl.has(canonicalUrl)) {
      byUrl.set(canonicalUrl, ref);
    }

    const key = companyRoleKey(ref.company, ref.role);
    if (key !== "" && !byCompanyRole.has(key)) {
      byCompanyRole.set(key, ref);
    }
  }

  return { byUrl, byCompanyRole };
}

async function readHistoryTargets(): Promise<
  Array<{
    url: string;
    canonicalUrl: string;
    company: string;
    role: string;
    seenDate: string;
    historicalStatus: string;
  }>
> {
  const path = join(repoRoot, "data", "scan-history.tsv");
  const text = await readFile(path, "utf8");
  const rows: Array<{
    url: string;
    canonicalUrl: string;
    company: string;
    role: string;
    seenDate: string;
    historicalStatus: string;
  }> = [];
  const lines = text.split(/\r?\n/);

  for (let index = lines.length - 1; index >= 1; index -= 1) {
    const line = lines[index] ?? "";
    if (!line.trim()) continue;
    const cells = line.split("\t");
    if (cells.length < 6) continue;

    const [url, seenDate, portal, role, company, status] = cells;
    if (portal !== HISTORY_PORTAL) continue;
    if (!url.startsWith(JOBRIGHT_INFO_PREFIX)) continue;

    rows.push({
      url,
      canonicalUrl: canonicalizeJobUrl(url) ?? url,
      company: company.trim(),
      role: role.trim(),
      seenDate: seenDate.trim(),
      historicalStatus: status.trim(),
    });
  }

  return rows;
}

async function launchContext(options: Options): Promise<BrowserContext> {
  const baseOptions = {
    headless: options.headless,
    viewport: { width: 1440, height: 1000 },
  };

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

async function rerunTarget(
  context: BrowserContext,
  config: ReturnType<typeof loadNewGradScanConfig>,
  target: Target,
): Promise<Result> {
  const scoreSource: Result["scoreSource"] = target.pipelineScore ? "pipeline" : "synthetic";
  const page = await context.newPage();
  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(DEFAULT_URL_SETTLE_MS);

    const detail = await page.evaluate(wrapBrowserFunction(extractNewGradDetail));
    const baseRow = buildBaseRow(target, detail);

    let scored: ScoredRow;

    if (target.pipelineScore) {
      const synthetic = scoreRow(baseRow, config);
      const emptyBreakdown: ScoreBreakdown = {
        roleMatch: synthetic.breakdown.roleMatch,
        skillHits: synthetic.breakdown.skillHits,
        skillKeywordsMatched: synthetic.breakdown.skillKeywordsMatched,
        freshness: 0,
      };
      scored = {
        row: baseRow,
        score: target.pipelineScore.storedScore,
        maxScore: target.pipelineScore.storedMaxScore,
        breakdown: emptyBreakdown,
      };
    } else {
      const synthetic = scoreRow({ ...baseRow, postedAgo: "1 hour ago" }, config);
      scored = {
        ...synthetic,
        row: { ...synthetic.row, postedAgo: "" },
      };
    }

    const value = scoreEnrichedRowValue({ row: scored, detail }, config);

    return {
      target,
      scoreSource,
      listScore: scored.score,
      listMaxScore: scored.maxScore,
      valueScore: value.score,
      passed: value.passed,
      reasons: value.reasons,
      penalties: value.penalties,
      detail: {
        matchScore: detail.matchScore,
        expLevelMatch: detail.expLevelMatch,
        skillMatch: detail.skillMatch,
        industryExpMatch: detail.industryExpMatch,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      target,
      scoreSource,
      listScore: target.pipelineScore?.storedScore ?? 0,
      listMaxScore: target.pipelineScore?.storedMaxScore ?? 9,
      valueScore: 0,
      passed: false,
      reasons: [],
      penalties: ["rerun_error"],
      detail: {
        matchScore: null,
        expLevelMatch: null,
        skillMatch: null,
        industryExpMatch: null,
      },
      error: message,
    };
  } finally {
    await page.close();
  }
}

function buildBaseRow(target: Target, detail: NewGradDetail): NewGradRow {
  const title = target.role || detail.title || "";
  const company = target.company || detail.company || "";
  const qualifications = [
    detail.requiredQualifications.join(" "),
    detail.skillTags.join(" "),
    detail.description,
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const newGradSignal = [title, detail.seniorityLevel ?? "", detail.recommendationTags.join(" ")]
    .join(" ")
    .toLowerCase();

  return {
    source: HISTORY_PORTAL,
    position: 0,
    title,
    postedAgo: "",
    applyUrl: detail.applyNowUrl || detail.originalPostUrl || target.url,
    detailUrl: target.url,
    workModel: detail.workModel ?? "",
    location: detail.location,
    company,
    salary: detail.salaryRange,
    companySize: detail.companySize,
    industry: detail.industries[0] ?? null,
    qualifications,
    h1bSponsored:
      Boolean(detail.h1bSponsorLikely) ||
      detail.h1bSponsorshipHistory.some((item) => item.count > 0),
    sponsorshipSupport: detail.sponsorshipSupport,
    confirmedSponsorshipSupport: detail.confirmedSponsorshipSupport,
    requiresActiveSecurityClearance: detail.requiresActiveSecurityClearance,
    confirmedRequiresActiveSecurityClearance: detail.confirmedRequiresActiveSecurityClearance,
    isNewGrad:
      /\b(new grad|new graduate|graduate|entry level|associate|junior|engineer i|engineer 1|early career)\b/.test(
        newGradSignal,
      ),
  };
}

function wrapBrowserFunction<T>(fn: () => T): string {
  return `(() => { const __name = (target) => target; return (${fn.toString()})(); })()`;
}

function summarizeTargetSet(targets: readonly Target[]) {
  const historicalStatuses: Record<string, number> = {};
  let pipelineMapped = 0;

  for (const target of targets) {
    if (target.pipelineScore) {
      pipelineMapped += 1;
    }
    historicalStatuses[target.historicalStatus] =
      (historicalStatuses[target.historicalStatus] ?? 0) + 1;
  }

  return {
    pipelineMapped,
    syntheticOnly: targets.length - pipelineMapped,
    historicalStatusCounts: sortCounts(historicalStatuses),
  };
}

function summarizeResults(results: readonly Result[]) {
  const total = results.length;
  const passed = results.filter((result) => result.passed).length;
  const failed = total - passed;
  const bySource: Record<string, number> = {};
  const penalties: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  const historicalStatuses: Record<string, number> = {};
  const statusOutcomes = new Map<string, { total: number; passed: number; failed: number }>();
  const errors = results.filter((result) => result.error);

  for (const result of results) {
    bySource[result.scoreSource] = (bySource[result.scoreSource] ?? 0) + 1;
    historicalStatuses[result.target.historicalStatus] =
      (historicalStatuses[result.target.historicalStatus] ?? 0) + 1;

    const outcome = statusOutcomes.get(result.target.historicalStatus) ?? {
      total: 0,
      passed: 0,
      failed: 0,
    };
    outcome.total += 1;
    if (result.passed) {
      outcome.passed += 1;
    } else {
      outcome.failed += 1;
    }
    statusOutcomes.set(result.target.historicalStatus, outcome);

    for (const penalty of result.penalties) {
      penalties[penalty] = (penalties[penalty] ?? 0) + 1;
    }
    for (const reason of result.reasons) {
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }

  return {
    phase: "rerun-summary",
    total,
    passed,
    failed,
    errorCount: errors.length,
    scoreSources: bySource,
    historicalStatusCounts: sortCounts(historicalStatuses),
    historicalStatusOutcomes: Array.from(statusOutcomes.entries())
      .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
      .map(([status, counts]) => ({ status, ...counts })),
    penaltyCounts: sortCounts(penalties),
    reasonCounts: sortCounts(reasons),
    promotedNowFailed: results
      .filter((result) => !result.passed && result.target.historicalStatus === "promoted")
      .slice(0, 25)
      .map((result) => ({
        company: result.target.company,
        role: result.target.role,
        url: result.target.url,
        lineNumber: result.target.pipelineScore?.lineNumber ?? null,
        listScore: `${result.listScore}/${result.listMaxScore}`,
        valueScore: result.valueScore,
        detail: result.detail,
        penalties: result.penalties,
        error: result.error ?? null,
      })),
    newPassesFromPreviouslyFiltered: results
      .filter((result) => result.passed && result.target.historicalStatus !== "promoted")
      .slice(0, 25)
      .map((result) => ({
        historicalStatus: result.target.historicalStatus,
        company: result.target.company,
        role: result.target.role,
        url: result.target.url,
        listScore: `${result.listScore}/${result.listMaxScore}`,
        valueScore: result.valueScore,
        detail: result.detail,
        reasons: result.reasons,
      })),
  };
}

function companyRoleKey(company: string, role: string): string {
  const normalizedCompany = normalizeText(company);
  const normalizedRole = normalizeText(role);
  if (!normalizedCompany || !normalizedRole) return "";
  return `${normalizedCompany}|${normalizedRole}`;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function sortCounts(counts: Record<string, number>): Array<{ key: string; count: number }> {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );
  return results;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
