/**
 * iCIMS site adapter — generic across all `<tenant>.icims.com` boards.
 *
 * iCIMS is split between two generations:
 *   - v3 JSON API (newer ~60% of tenants): GET https://careers-<tenant>.icims.com/api/v3/jobs
 *   - HTML rendered (older ~40%): GET https://careers-<tenant>.icims.com/jobs/search
 *
 * Strategy: try v3 first (faster, structured), fall back to HTML scrape on
 * any v3 failure (404, non-JSON, parse error). Result includes
 * `resolvedVia` for telemetry.
 *
 * Three-state error semantics (per architecture spec):
 *   1. Empty board (success): explicit zero-jobs response → return count:0
 *   2. Parser found nothing in non-empty response (throw): likely schema drift
 *   3. Both v3 and HTML failed (throw)
 *
 * No auth required for any tested tenant as of 2026-05-04.
 */

import { AdapterParseError } from "../../errors.js";
import type { Tab } from "../../tab.js";
import type { SearchAdapter, SiteAdapterMeta } from "../types.js";

export interface ICIMSSearchOptions {
  /** Tenant slug (e.g. "disney", "comcast"). Required unless `url` is given. */
  tenant?: string;
  /** Or a full board URL — adapter parses tenant from it. */
  url?: string;
  /** Free-text search. */
  query?: string;
  /** Page size (default 20). */
  limit?: number;
}

export interface ICIMSJob {
  id: string;
  title: string;
  /** = tenant. */
  company: string;
  location: string;
  /** Raw posted-at string from source. */
  postedAt: string;
  url: string;
  category?: string;
}

export type ICIMSResolvedVia = "v3-api" | "html-scrape";

export interface ICIMSSearchResult {
  source: "icims";
  url: string;
  tenant: string;
  count: number;
  totalAvailable: number;
  jobs: ICIMSJob[];
  /** Which mechanism produced the result — useful for telemetry / debugging. */
  resolvedVia: ICIMSResolvedVia;
}

const DEFAULT_LIMIT = 20;

/** Internal: parse `tenant` from a full iCIMS URL. */
export function parseICIMSUrl(url: string): { tenant: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AdapterParseError(`icims: invalid URL ${url}`, url);
  }
  // careers-disney.icims.com → tenant "disney"
  // disney.icims.com → tenant "disney"
  // also: careers.disney.com.icims-careers.com (rare, ignore)
  const m = parsed.hostname.match(/^(?:careers-)?([a-z0-9-]+)\.icims\.com$/i);
  if (!m) {
    throw new AdapterParseError(
      `icims: hostname ${parsed.hostname} does not match <tenant>.icims.com`,
      url,
    );
  }
  return { tenant: m[1]!.toLowerCase() };
}

interface ICIMSv3Response {
  totalCount?: number;
  jobs?: Array<{
    id?: number | string;
    title?: string;
    locations?: Array<{ name?: string }> | string;
    location?: string;
    postedDate?: string;
    postedAt?: string;
    url?: string;
    category?: string;
  }>;
  /** Some tenants nest under `searchResults` or similar. */
  searchResults?: { jobs?: ICIMSv3Response["jobs"]; totalCount?: number };
}

interface ParsedAttempt {
  jobs: ICIMSJob[];
  totalAvailable: number;
  empty: boolean;
}

async function tryICIMSv3(
  tab: Tab,
  tenant: string,
  opts: ICIMSSearchOptions,
): Promise<ParsedAttempt | null> {
  const apiUrl = buildV3Url(tenant, opts);
  const r = await tab.fetch(apiUrl, {
    headers: { accept: "application/json" },
    json: true,
  });
  if (!r.ok) return null;
  const data = (r.json ?? null) as ICIMSv3Response | null;
  if (!data || typeof data !== "object") return null;

  // Distinguish:
  //   - explicit empty board (totalCount === 0)         → return empty success
  //   - unknown shape (no jobs array AND no totalCount) → return null (fall back to HTML)
  //   - has jobs                                         → return normalized
  const explicitTotal: number | null =
    typeof data.totalCount === "number"
      ? data.totalCount
      : typeof data.searchResults?.totalCount === "number"
        ? data.searchResults.totalCount
        : null;
  const rawJobs: NonNullable<ICIMSv3Response["jobs"]> | null = Array.isArray(data.jobs)
    ? data.jobs
    : Array.isArray(data.searchResults?.jobs)
      ? data.searchResults!.jobs!
      : null;

  // Unknown shape — neither marker present.
  if (rawJobs === null && explicitTotal === null) return null;

  // Explicit empty board.
  if (explicitTotal === 0 && (rawJobs === null || rawJobs.length === 0)) {
    return { jobs: [], totalAvailable: 0, empty: true };
  }

  // Has jobs.
  if (rawJobs && rawJobs.length > 0) {
    const jobs = rawJobs.map((j, i) => normalizeV3Job(j, tenant, i));
    return { jobs, totalAvailable: explicitTotal ?? jobs.length, empty: false };
  }

  // Has totalCount > 0 but no jobs array, OR has empty jobs array without explicit total — ambiguous, fall back.
  return null;
}

function buildV3Url(tenant: string, opts: ICIMSSearchOptions): string {
  const base = new URL(`https://careers-${tenant}.icims.com/api/v3/jobs`);
  if (opts.query) base.searchParams.set("searchKeyword", opts.query);
  base.searchParams.set("maxResults", String(opts.limit ?? DEFAULT_LIMIT));
  return base.toString();
}

function normalizeV3Job(
  raw: NonNullable<ICIMSv3Response["jobs"]>[number],
  tenant: string,
  position: number,
): ICIMSJob {
  const id = raw.id !== undefined && raw.id !== null ? String(raw.id) : String(position);
  const location = Array.isArray(raw.locations)
    ? raw.locations.map((l) => l.name ?? "").filter(Boolean).join(" / ")
    : (raw.location ?? "");
  const url = raw.url ?? `https://careers-${tenant}.icims.com/jobs/${encodeURIComponent(id)}/job`;
  return {
    id,
    title: raw.title ?? "",
    company: tenant,
    location,
    postedAt: raw.postedDate ?? raw.postedAt ?? "",
    url,
    ...(raw.category ? { category: raw.category } : {}),
  };
}

/**
 * Source code shipped to the page via `tab.evaluate()` to parse iCIMS
 * HTML in the browser context (uses DOMParser; matches our other
 * HTML-parsing adapters).
 */
const ICIMS_HTML_PARSER_SOURCE = `(function(htmlText, tenant) {
  const doc = new DOMParser().parseFromString(htmlText, 'text/html');
  // Detect explicit "no jobs" message.
  const noJobsText = (doc.body && doc.body.textContent) ? doc.body.textContent : '';
  if (/no jobs (?:were )?(?:found|matching)/i.test(noJobsText) && !/jobs found/i.test(noJobsText.replace(/no jobs[^.]*/i, ''))) {
    return { jobs: [], totalAvailable: 0, empty: true };
  }
  // iCIMS rendered table — common selectors across versions.
  const rowSelectors = [
    'tr.iCIMS_JobsTableRow',
    '.iCIMS_JobLine',
    'tr[data-rowindex]',
    '.iCIMS_Table tr',
  ];
  let rows = [];
  for (const sel of rowSelectors) {
    const found = Array.from(doc.querySelectorAll(sel));
    if (found.length > 0) { rows = found; break; }
  }
  if (rows.length === 0) {
    return { jobs: [], totalAvailable: 0, empty: false }; // unrecognized schema
  }
  const jobs = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const titleAnchor = row.querySelector('a.iCIMS_Anchor, a[href*="/job/"], a[href*="/jobs/"]');
    if (!titleAnchor) continue;
    const href = titleAnchor.getAttribute('href') || '';
    const fullUrl = href.startsWith('http') ? href : 'https://careers-' + tenant + '.icims.com' + (href.startsWith('/') ? href : '/' + href);
    const title = (titleAnchor.textContent || '').trim();
    if (!title) continue;
    const idMatch = href.match(/\\/jobs?\\/(?:[a-z0-9-]+\\/)?([0-9]+)/i);
    const id = idMatch ? idMatch[1] : String(i);
    // Location commonly in nearby cell with class iCIMS_JobHeaderRowLocation or generic td.
    const locEl = row.querySelector('.iCIMS_JobHeaderRowLocation, .iCIMS_Location, [data-column="location"]')
                  || row.querySelectorAll('td')[2];
    const location = locEl ? (locEl.textContent || '').trim() : '';
    const postedEl = row.querySelector('.iCIMS_JobHeaderRowPosted, [data-column="posted"]')
                  || row.querySelectorAll('td')[3];
    const postedAt = postedEl ? (postedEl.textContent || '').trim() : '';
    jobs.push({
      id, title, company: tenant, location, postedAt, url: fullUrl,
    });
  }
  // Total count: many iCIMS pages include a "Showing N of M results" string.
  const totalMatch = (doc.body.textContent || '').match(/of\\s+(\\d+)\\s+(?:results|jobs)/i);
  const totalAvailable = totalMatch ? Number(totalMatch[1]) : jobs.length;
  return { jobs, totalAvailable, empty: false };
})`;

async function tryICIMSHtml(
  tab: Tab,
  tenant: string,
  opts: ICIMSSearchOptions,
): Promise<ParsedAttempt | null> {
  const pageUrl = buildHtmlUrl(tenant, opts);
  const r = await tab.fetch(pageUrl);
  if (!r.ok) return null;
  const html = r.body ?? "";
  if (!html || html.length < 200) return null;
  const parsed = (await tab
    .evaluate<{ jobs: ICIMSJob[]; totalAvailable: number; empty: boolean }>(
      `${ICIMS_HTML_PARSER_SOURCE}(${JSON.stringify(html)}, ${JSON.stringify(tenant)})`,
    )
    .catch(() => null));
  if (!parsed) return null;
  return parsed;
}

function buildHtmlUrl(tenant: string, opts: ICIMSSearchOptions): string {
  const base = new URL(`https://careers-${tenant}.icims.com/jobs/search`);
  if (opts.query) base.searchParams.set("searchKeyword", opts.query);
  base.searchParams.set("ss", "1");
  return base.toString();
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export async function searchICIMS(
  tab: Tab,
  opts: ICIMSSearchOptions = {},
): Promise<ICIMSSearchResult> {
  const tenant = opts.tenant ?? (opts.url ? parseICIMSUrl(opts.url).tenant : null);
  if (!tenant) {
    throw new AdapterParseError("icims: tenant or url is required", "");
  }

  // iCIMS API endpoints don't have CORS for arbitrary origins. Navigate
  // to the tenant hostname so subsequent tab.fetch is same-origin.
  // `commit` waitUntil tolerates 4xx/5xx responses (we only need to land
  // on the right origin for cookies, not load the whole page).
  const expectedHost = `careers-${tenant}.icims.com`;
  if (safeHostname(tab.url) !== expectedHost && safeHostname(tab.url) !== `${tenant}.icims.com`) {
    await tab
      .navigate(`https://${expectedHost}/jobs/search`, { waitUntil: "load" })
      .catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 800));
  }

  // Attempt 1 — v3 API
  const v3 = await tryICIMSv3(tab, tenant, opts).catch(() => null);
  if (v3) {
    return {
      source: "icims",
      url: buildV3Url(tenant, opts),
      tenant,
      count: v3.jobs.length,
      totalAvailable: v3.totalAvailable,
      jobs: v3.jobs,
      resolvedVia: "v3-api",
    };
  }

  // Attempt 2 — HTML scrape
  const html = await tryICIMSHtml(tab, tenant, opts).catch(() => null);
  if (html) {
    if (html.empty) {
      return {
        source: "icims",
        url: buildHtmlUrl(tenant, opts),
        tenant,
        count: 0,
        totalAvailable: 0,
        jobs: [],
        resolvedVia: "html-scrape",
      };
    }
    if (html.jobs.length === 0) {
      // Schema drift case 2: response present, parser found nothing.
      throw new AdapterParseError(
        `icims: response present but parser found no jobs — likely schema drift on tenant ${tenant}`,
        "",
      );
    }
    return {
      source: "icims",
      url: buildHtmlUrl(tenant, opts),
      tenant,
      count: html.jobs.length,
      totalAvailable: html.totalAvailable,
      jobs: html.jobs,
      resolvedVia: "html-scrape",
    };
  }

  // Both mechanisms failed.
  throw new AdapterParseError(
    `icims: tried v3 API and HTML scrape, both failed for tenant ${tenant}`,
    "",
  );
}

const META: SiteAdapterMeta = {
  id: "icims",
  name: "iCIMS",
  domain: "icims.com",
  requiresAuth: false,
  description:
    "Per-tenant enterprise ATS (Disney, Comcast, …). Tries v3 JSON API first, falls back to HTML scrape on older tenants.",
};

export const ICIMS_ADAPTER: SearchAdapter<ICIMSSearchOptions, ICIMSSearchResult> = {
  meta: META,
  search: searchICIMS,
};
