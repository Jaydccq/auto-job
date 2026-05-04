/**
 * Workday site adapter — generic across all `<tenant>.<wdCenter>.myworkdayjobs.com` boards.
 *
 * Workday hosts per-tenant job boards with a uniform API shape but variable
 * sub-paths. The adapter accepts either parsed components or a full board
 * URL; it auto-probes common `sitePath` values when omitted.
 *
 * API contract:
 *   POST https://<tenant>.<wdCenter>.myworkdayjobs.com/wday/cxs/<tenant>/<sitePath>/jobs
 *   Body: { appliedFacets: {}, limit, offset, searchText }
 *   Response: { total, jobPostings: [{title, externalPath, locationsText, postedOn, bulletFields}] }
 *
 * No auth required for any tested tenant as of 2026-05-04.
 */

import { AdapterParseError } from "../../errors.js";
import type { Tab } from "../../tab.js";
import type { SearchAdapter, SiteAdapterMeta } from "../types.js";

export type WorkdayCenter = "wd1" | "wd3" | "wd5";

export interface WorkdaySearchOptions {
  /** Tenant slug (e.g. "amazon", "salesforce", "adobe"). Required unless `url` is provided. */
  tenant?: string;
  /** Workday data-center prefix. Default: "wd5". */
  wdCenter?: WorkdayCenter;
  /** Board sub-path (e.g. "External_Career_Site"). Auto-probed when omitted. */
  sitePath?: string;
  /** Full board URL — adapter parses tenant/wdCenter/sitePath out of it. Mutually exclusive with the parsed-components fields above. */
  url?: string;
  /** Free-text search. Empty string → list all jobs. */
  query?: string;
  /** Page size (default 20). */
  limit?: number;
  /** Pagination offset (default 0). */
  offset?: number;
}

export interface WorkdayJob {
  /** From `bulletFields[0]` when present, else generated from `externalPath`. */
  id: string;
  title: string;
  /** = tenant. */
  company: string;
  location: string;
  /** Raw "Posted N Days Ago" string. */
  postedAgo: string;
  /** Path segment from API response. */
  externalPath: string;
  /** Resolved full URL including tenant subdomain. */
  url: string;
  /** Raw `bulletFields` array (job IDs, requisition numbers, etc.). */
  bulletFields: string[];
}

export interface WorkdaySearchResult {
  source: "workday";
  url: string;
  tenant: string;
  /** Detected/given sitePath for telemetry. */
  sitePath: string;
  /** Detected/given wdCenter. */
  wdCenter: WorkdayCenter;
  count: number;
  totalAvailable: number;
  jobs: WorkdayJob[];
}

const DEFAULT_WD_CENTER: WorkdayCenter = "wd5";
const SITE_PATH_PROBES = ["External_Career_Site", "Careers", "External"] as const;
const DEFAULT_LIMIT = 20;

interface ParsedUrl {
  tenant: string;
  wdCenter: WorkdayCenter;
  sitePath: string | null;
}

/** Internal: parse a Workday board URL into its components. Exported for tests. */
export function parseWorkdayUrl(url: string): ParsedUrl {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AdapterParseError(`workday: invalid URL ${url}`, url);
  }
  const hostMatch = parsed.hostname.match(/^([a-z0-9-]+)\.(wd[1-9])\.myworkdayjobs\.com$/i);
  if (!hostMatch) {
    throw new AdapterParseError(
      `workday: hostname ${parsed.hostname} does not match <tenant>.<wd*>.myworkdayjobs.com`,
      url,
    );
  }
  const tenant = hostMatch[1]!.toLowerCase();
  const wdCenter = hostMatch[2]!.toLowerCase() as WorkdayCenter;
  // First non-empty path segment is the sitePath.
  const segments = parsed.pathname.split("/").filter(Boolean);
  const sitePath = segments.length > 0 ? segments[0]! : null;
  return { tenant, wdCenter, sitePath };
}

interface WorkdayApiResponse {
  total?: number;
  jobPostings?: Array<{
    title?: string;
    externalPath?: string;
    locationsText?: string;
    postedOn?: string;
    bulletFields?: string[];
  }>;
}

interface ResolvedTarget {
  tenant: string;
  wdCenter: WorkdayCenter;
  sitePath: string;
}

/**
 * Probe sitePath by navigating to candidate URLs and checking if the page
 * stays on the tenant origin. We navigate (not POST) because:
 *   1. Workday API endpoints reject cross-origin POSTs (CORS).
 *   2. The bare tenant origin (`<host>/`) redirects to community.workday.com
 *      maintenance page on tenants that are down — but `/<sitePath>`
 *      navigates correctly on healthy tenants.
 *   3. After this function returns, the tab is already on the correct
 *      page, so subsequent same-origin fetches work.
 */
async function probeWorkdaySitePath(
  tab: Tab,
  tenant: string,
  wdCenter: WorkdayCenter,
): Promise<string> {
  const targetHost = `${tenant}.${wdCenter}.myworkdayjobs.com`;
  for (const candidate of SITE_PATH_PROBES) {
    const pageUrl = `https://${targetHost}/${candidate}`;
    await tab.navigate(pageUrl, { waitUntil: "load" }).catch(() => undefined);
    // Settle window — Workday SPAs may continue routing client-side.
    await new Promise((resolve) => setTimeout(resolve, 800));
    const landedHost = safeHostname(tab.url);
    if (landedHost === targetHost && tab.url.includes(`/${candidate}`)) {
      return candidate;
    }
  }
  // Detect maintenance redirect specifically — different remediation.
  if (safeHostname(tab.url) === "community.workday.com" && tab.url.includes("maintenance")) {
    throw new AdapterParseError(
      `workday: tenant "${tenant}" is currently in scheduled maintenance (redirected to ${tab.url}). Try again later or use a different tenant.`,
      "",
    );
  }
  throw new AdapterParseError(
    `workday: could not auto-detect sitePath for tenant "${tenant}" on ${wdCenter} (probed: ${SITE_PATH_PROBES.join(", ")}). Tab landed on ${tab.url}. Pass --site-path explicitly or check the tenant URL.`,
    "",
  );
}

/** Ensure the tab is on the canonical tenant page so subsequent fetches are same-origin. */
async function ensureOnTenantPage(
  tab: Tab,
  tenant: string,
  wdCenter: WorkdayCenter,
  sitePath: string,
): Promise<void> {
  const targetHost = `${tenant}.${wdCenter}.myworkdayjobs.com`;
  const pageUrl = `https://${targetHost}/${sitePath}`;
  if (safeHostname(tab.url) === targetHost && tab.url.includes(`/${sitePath}`)) {
    return;
  }
  await tab.navigate(pageUrl, { waitUntil: "load" }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 800));
  if (safeHostname(tab.url) !== targetHost) {
    throw new AdapterParseError(
      `workday: tenant "${tenant}" redirected away from origin (now at ${tab.url}). Likely in maintenance or sitePath "${sitePath}" does not exist.`,
      "",
    );
  }
}

function buildApiUrl(tenant: string, wdCenter: WorkdayCenter, sitePath: string): string {
  return `https://${tenant}.${wdCenter}.myworkdayjobs.com/wday/cxs/${encodeURIComponent(
    tenant,
  )}/${encodeURIComponent(sitePath)}/jobs`;
}

function buildExternalUrl(
  tenant: string,
  wdCenter: WorkdayCenter,
  sitePath: string,
  externalPath: string,
): string {
  const path = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  return `https://${tenant}.${wdCenter}.myworkdayjobs.com/en-US/${encodeURIComponent(sitePath)}${path}`;
}

async function resolveTarget(tab: Tab, opts: WorkdaySearchOptions): Promise<ResolvedTarget> {
  // Resolve tenant + wdCenter + sitePath. Probing leaves the tab on the
  // right page; ensureOnTenantPage handles the case where sitePath was
  // supplied (no probe needed but still must navigate for same-origin).
  if (opts.url) {
    const parsed = parseWorkdayUrl(opts.url);
    if (parsed.sitePath) {
      const target = {
        tenant: parsed.tenant,
        wdCenter: parsed.wdCenter,
        sitePath: parsed.sitePath,
      };
      await ensureOnTenantPage(tab, target.tenant, target.wdCenter, target.sitePath);
      return target;
    }
    const probed = await probeWorkdaySitePath(tab, parsed.tenant, parsed.wdCenter);
    return { tenant: parsed.tenant, wdCenter: parsed.wdCenter, sitePath: probed };
  }
  if (!opts.tenant) {
    throw new AdapterParseError("workday: tenant or url is required", "");
  }
  const tenant = opts.tenant.toLowerCase();
  const wdCenter = opts.wdCenter ?? DEFAULT_WD_CENTER;
  if (opts.sitePath) {
    await ensureOnTenantPage(tab, tenant, wdCenter, opts.sitePath);
    return { tenant, wdCenter, sitePath: opts.sitePath };
  }
  const probed = await probeWorkdaySitePath(tab, tenant, wdCenter);
  return { tenant, wdCenter, sitePath: probed };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export async function searchWorkday(
  tab: Tab,
  opts: WorkdaySearchOptions = {},
): Promise<WorkdaySearchResult> {
  // resolveTarget navigates the tab to the canonical tenant page so
  // subsequent fetches are same-origin (Workday API endpoints reject
  // cross-origin POSTs). It also detects scheduled-maintenance
  // redirects to community.workday.com.
  const target = await resolveTarget(tab, opts);
  const apiUrl = buildApiUrl(target.tenant, target.wdCenter, target.sitePath);
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const offset = opts.offset ?? 0;

  const r = await tab.fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ appliedFacets: {}, limit, offset, searchText: opts.query ?? "" }),
    json: true,
  });

  if (!r.ok) {
    if (r.status === 403 || r.status === 429) {
      throw new AdapterParseError(
        `workday: access denied (HTTP ${r.status}) — tenant ${target.tenant} may have rate-limited or anti-bot-blocked us`,
        r.body,
      );
    }
    throw new AdapterParseError(`workday HTTP ${r.status} for ${target.tenant}`, r.body);
  }

  const data = r.json as WorkdayApiResponse | undefined;
  if (!data || !Array.isArray(data.jobPostings)) {
    throw new AdapterParseError(
      `workday: schema mismatch for ${target.tenant} (expected jobPostings array)`,
      r.body,
    );
  }

  const jobs: WorkdayJob[] = data.jobPostings.map((j) => normalizeJob(j, target));

  return {
    source: "workday",
    url: apiUrl,
    tenant: target.tenant,
    sitePath: target.sitePath,
    wdCenter: target.wdCenter,
    count: jobs.length,
    totalAvailable: typeof data.total === "number" ? data.total : jobs.length,
    jobs,
  };
}

function normalizeJob(
  raw: NonNullable<WorkdayApiResponse["jobPostings"]>[number],
  target: ResolvedTarget,
): WorkdayJob {
  const externalPath = raw.externalPath ?? "";
  const bulletFields = Array.isArray(raw.bulletFields) ? raw.bulletFields.filter(Boolean) : [];
  const id =
    bulletFields[0] ?? externalPath.split("/").filter(Boolean).pop() ?? "";
  return {
    id,
    title: raw.title ?? "",
    company: target.tenant,
    location: raw.locationsText ?? "",
    postedAgo: raw.postedOn ?? "",
    externalPath,
    url: externalPath
      ? buildExternalUrl(target.tenant, target.wdCenter, target.sitePath, externalPath)
      : "",
    bulletFields,
  };
}

const META: SiteAdapterMeta = {
  id: "workday",
  name: "Workday",
  domain: "myworkdayjobs.com",
  requiresAuth: false,
  description:
    "Per-tenant enterprise ATS (Amazon, Salesforce, Adobe, Cisco, …). Pass `tenant` or `url`; auto-probes sitePath.",
};

export const WORKDAY_ADAPTER: SearchAdapter<WorkdaySearchOptions, WorkdaySearchResult> = {
  meta: META,
  search: searchWorkday,
};
