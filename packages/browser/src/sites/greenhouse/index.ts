/**
 * Greenhouse public boards adapter — reference implementation showing
 * how to add a new site to the framework.
 *
 * Greenhouse hosts per-company job boards at boards.greenhouse.io and
 * exposes a public JSON API at boards-api.greenhouse.io. No auth
 * required; CORS-enabled. Used by Stripe, Airbnb, Vercel, Discord,
 * Plaid, Lyft, and ~10k+ other companies.
 *
 * Adapter shape: per-company (not query-based). Pass `company` slug;
 * optionally filter by `department` substring.
 */

import { AdapterParseError } from "../../errors.js";
import type { Tab } from "../../tab.js";
import type { SearchAdapter, SiteAdapterMeta } from "../types.js";

export interface GreenhouseSearchOptions {
  /** Greenhouse board slug, e.g. "stripe", "airbnb", "vercel". */
  company: string;
  /** Optional case-insensitive substring filter on department names. */
  department?: string;
  /** Optional case-insensitive substring filter on location strings. */
  location?: string;
  /** Cap the number of returned jobs (default: all). */
  limit?: number;
}

export interface GreenhouseJob {
  id: string;
  title: string;
  /** Resolved from the board metadata. */
  company: string;
  location: string;
  departments: string[];
  offices: string[];
  /** Public job posting URL. */
  url: string;
  /** ISO timestamp of last update. */
  updatedAt: string;
}

export interface GreenhouseSearchResult {
  source: "greenhouse";
  url: string;
  company: string;
  count: number;
  totalAvailable: number;
  jobs: GreenhouseJob[];
}

interface GreenhouseApiJob {
  id: number;
  title: string;
  location?: { name?: string };
  departments?: Array<{ name?: string }>;
  offices?: Array<{ name?: string }>;
  absolute_url?: string;
  updated_at?: string;
}

export async function searchGreenhouse(
  tab: Tab,
  opts: GreenhouseSearchOptions,
): Promise<GreenhouseSearchResult> {
  if (!opts.company) {
    throw new AdapterParseError("greenhouse: company slug is required", "");
  }
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(opts.company)}/jobs`;
  // Tab.fetch runs in page context — for Greenhouse's open CORS-enabled
  // API the origin doesn't matter, so about:blank is fine.
  if (!tab.url || tab.url === "about:blank") {
    // already on a blank page
  } else if (!/(^|\.)greenhouse\.io$/.test(safeHostname(tab.url))) {
    await tab.navigate("about:blank");
  }
  const r = await tab.fetch(apiUrl, { json: true, headers: { accept: "application/json" } });
  if (!r.ok) {
    throw new AdapterParseError(`greenhouse HTTP ${r.status} for ${opts.company}`, r.body);
  }

  const data = r.json as { jobs?: GreenhouseApiJob[] } | undefined;
  if (!data || !Array.isArray(data.jobs)) {
    throw new AdapterParseError("greenhouse: response did not contain a jobs array", r.body);
  }

  const total = data.jobs.length;
  const filtered = data.jobs.filter((j) => matchesFilters(j, opts));
  const jobs = (opts.limit ? filtered.slice(0, opts.limit) : filtered).map((j) =>
    normalizeJob(j, opts.company),
  );

  return {
    source: "greenhouse",
    url: apiUrl,
    company: opts.company,
    count: jobs.length,
    totalAvailable: total,
    jobs,
  };
}

function matchesFilters(j: GreenhouseApiJob, opts: GreenhouseSearchOptions): boolean {
  if (opts.department) {
    const needle = opts.department.toLowerCase();
    const haystack = (j.departments ?? []).map((d) => (d.name ?? "").toLowerCase()).join(" | ");
    if (!haystack.includes(needle)) return false;
  }
  if (opts.location) {
    const needle = opts.location.toLowerCase();
    const haystack = (j.location?.name ?? "").toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function normalizeJob(j: GreenhouseApiJob, company: string): GreenhouseJob {
  return {
    id: String(j.id),
    title: j.title ?? "",
    company,
    location: j.location?.name ?? "",
    departments: (j.departments ?? []).map((d) => d.name ?? "").filter(Boolean),
    offices: (j.offices ?? []).map((o) => o.name ?? "").filter(Boolean),
    url: j.absolute_url ?? "",
    updatedAt: j.updated_at ?? "",
  };
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

const META: SiteAdapterMeta = {
  id: "greenhouse",
  name: "Greenhouse",
  domain: "boards.greenhouse.io",
  requiresAuth: false,
  description: "Per-company public boards; pass `company` slug. ~10k+ companies (Stripe, Airbnb, Vercel, …).",
};

export const GREENHOUSE_ADAPTER: SearchAdapter<GreenhouseSearchOptions, GreenhouseSearchResult> = {
  meta: META,
  search: searchGreenhouse,
};
