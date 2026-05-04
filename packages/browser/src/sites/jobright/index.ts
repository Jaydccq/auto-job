/**
 * JobRight site adapter — verbatim port of bb-browser/sites/jobright/newgrad.js
 * plus the inline popup-dismissal extractor used by scripts/extractors/jobright-dismiss-popups.js.
 *
 * Strategy mirror of ../builtin/index.ts: bb-browser source embedded as
 * a string and evaluated in the tab.
 */

import { AdapterParseError } from "../../errors.js";
import type { Tab } from "../../tab.js";
import type { SearchAdapter, SiteAdapterMeta } from "../types.js";

export interface JobrightRecommendOptions {
  /** Max rows to return (1..2500, default 200). */
  limit?: number;
  /** Path after /minisites-jobs/newgrad/ (e.g. "us/swe") or full URL. */
  path?: string;
  /** Only return jobs posted within this many hours. */
  maxAgeHours?: number;
  /** API page size (1..100, default 50). */
  pageSize?: number;
  /** Pagination start position (default 0). */
  offset?: number;
}

export interface JobrightJob {
  position: number;
  id: string;
  title: string;
  company: string;
  location: string;
  workModel: string;
  salary: string;
  postedAt: string | null;
  postedAgo: string;
  ageHours: number | null;
  companySize: string;
  industry: string[];
  qualifications: string;
  h1bSponsored: string;
  sponsorshipSupport: "yes" | "no" | "unknown";
  isNewGrad: boolean;
  detailUrl: string;
  applyUrl: string;
  url: string;
}

export interface JobrightRecommendResult {
  source: "jobright.ai";
  sourceMode: "api" | "initialJobs";
  url: string;
  count: number;
  totalAvailable: number;
  maxAgeHours: number | null;
  pageSize?: number;
  offset: number;
  jobs: JobrightJob[];
  warning?: string;
}

interface JobrightErrorPayload {
  error: string;
  hint?: string;
  action?: string;
  apiError?: string;
}

export async function recommendJobright(
  tab: Tab,
  opts: JobrightRecommendOptions = {},
): Promise<JobrightRecommendResult> {
  if (!/(^|\.)jobright\.ai$/.test(safeHostname(tab.url))) {
    await tab.navigate("https://jobright.ai/minisites-jobs/newgrad/us/swe");
  }
  const script = `(${JOBRIGHT_NEWGRAD_SOURCE})(${JSON.stringify(opts)})`;
  const result = await tab.evaluate<JobrightRecommendResult | JobrightErrorPayload>(script);
  if (isErrorPayload(result)) {
    throw new AdapterParseError(`jobright: ${result.error}`, JSON.stringify(result));
  }
  return result;
}

/**
 * Best-effort dismissal of popups/modals on the JobRight site. Idempotent:
 * always returns successfully, returns the count of dismissed elements.
 */
export async function jobrightDismissPopups(tab: Tab): Promise<{ dismissed: number }> {
  const dismissed = await tab.evaluate<number>(JOBRIGHT_DISMISS_SOURCE);
  return { dismissed };
}

/**
 * Fetch a single JobRight job detail by id. Returns the raw API payload —
 * downstream code (apps/server/src/adapters) does the normalization.
 */
export async function jobrightDetail(tab: Tab, jobId: string): Promise<unknown> {
  if (!/(^|\.)jobright\.ai$/.test(safeHostname(tab.url))) {
    await tab.navigate("https://jobright.ai/minisites-jobs/newgrad/us/swe");
  }
  const r = await tab.fetch(
    `https://jobright.ai/swan/jobs/${encodeURIComponent(jobId)}/detail`,
    { json: true, headers: { accept: "application/json" } },
  );
  if (!r.ok) {
    throw new AdapterParseError(`jobright detail HTTP ${r.status}`, r.body);
  }
  return r.json ?? r.body;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isErrorPayload(value: unknown): value is JobrightErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

const META: SiteAdapterMeta = {
  id: "jobright",
  name: "JobRight",
  domain: "jobright.ai",
  requiresAuth: true,
  description: "Personalized newgrad recommendations; uses minisite category path.",
};

export const JOBRIGHT_ADAPTER: SearchAdapter<JobrightRecommendOptions, JobrightRecommendResult> = {
  meta: META,
  search: recommendJobright,
};

/* eslint-disable */
export const JOBRIGHT_NEWGRAD_SOURCE = `async function jobrightNewgrad(args) {
  const limit = clampInt(args.limit, 200, 1, 2500);
  const maxAgeHours = optionalPositiveNumber(args.maxAgeHours);
  const pageSize = clampInt(args.pageSize, 50, 1, 100);
  const offset = nonNegativeInt(args.offset, 0);
  const url = buildUrl(args.path || "us/swe");

  try {
    const api = await fetchApiJobs(url, { limit, maxAgeHours, pageSize, offset });
    if (api.jobs.length > 0 || maxAgeHours !== null || offset > 0) {
      return { source: "jobright.ai", sourceMode: "api", url, count: api.jobs.length, totalAvailable: api.totalAvailable, maxAgeHours, pageSize, offset, jobs: api.jobs };
    }
  } catch (error) {
    if (offset > 0) return { error: "JobRight API failed for paginated offset " + offset, hint: "initialJobs fallback cannot honor offset.", apiError: error instanceof Error ? error.message : String(error) };
    const fallback = await fetchInitialJobs(url, limit, maxAgeHours);
    if (fallback.error) return { ...fallback, apiError: error instanceof Error ? error.message : String(error) };
    return { ...fallback, sourceMode: "initialJobs", warning: "JobRight API failed; returned initialJobs fallback. API error: " + (error instanceof Error ? error.message : String(error)) };
  }
  return fetchInitialJobs(url, limit, maxAgeHours);

  async function fetchApiJobs(sourceUrl, options) {
    const category = categoryFromUrl(sourceUrl);
    if (!category) throw new Error("Could not derive JobRight category from minisite URL");
    const now = Date.now();
    const jobs = [];
    const seen = new Set();
    let position = options.offset;
    let total = Number.POSITIVE_INFINITY;
    while (position < total && jobs.length < options.limit) {
      const apiUrl = new URL("/swan/mini-sites/list", sourceUrl);
      apiUrl.searchParams.set("position", String(position));
      apiUrl.searchParams.set("count", String(options.pageSize));
      const response = await fetch(apiUrl.toString(), { method: "POST", credentials: "include", headers: { accept: "application/json, text/plain, */*", "content-type": "application/json" }, body: JSON.stringify({ category }) });
      if (!response.ok) throw new Error("JobRight list API returned HTTP " + response.status);
      const data = await response.json();
      if (data?.success === false) throw new Error("JobRight list API failed: " + (stringify(data.errorMessage) || stringify(data.errorCode) || "unknown error"));
      const result = record(data?.result);
      const rawJobs = Array.isArray(result.jobList) ? result.jobList : [];
      const apiTotal = Number(result.total);
      if (Number.isFinite(apiTotal) && apiTotal >= 0) total = apiTotal;
      if (rawJobs.length === 0) break;
      let reachedStale = false;
      for (const [index, rawJob] of rawJobs.entries()) {
        const ageHours = ageHoursFromPostedDate(rawJob?.postedAt, now);
        if (options.maxAgeHours !== null && ageHours !== null && ageHours > options.maxAgeHours) { reachedStale = true; break; }
        const job = normalizeApiJob(rawJob, position + index + 1, now, sourceUrl);
        if (!job) continue;
        const key = job.detailUrl || (job.company + "|" + job.title + "|" + job.location).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push(job);
        if (jobs.length >= options.limit) break;
      }
      if (reachedStale || rawJobs.length < options.pageSize || jobs.length >= options.limit) break;
      position += rawJobs.length;
    }
    return { jobs, totalAvailable: Number.isFinite(total) ? total : jobs.length };
  }

  async function fetchInitialJobs(sourceUrl, rowLimit, ageLimitHours) {
    let response;
    try { response = await fetch(sourceUrl, { credentials: "include" }); }
    catch (error) { return { error: error instanceof Error ? error.message : String(error), hint: "Cannot reach JobRight.", action: "open https://jobright.ai/minisites-jobs/newgrad/us/swe" }; }
    if (!response.ok) return { error: "HTTP " + response.status, hint: "JobRight page fetch failed; may need login.", action: "open https://jobright.ai/" };
    const html = await response.text();
    const parsed = parseInitialJobs(html);
    if (parsed.error) return parsed;
    const now = Date.now();
    const jobs = parsed.jobs.map((job, index) => normalizeInitialJob(job, index + 1, now)).filter((j) => ageLimitHours === null || j.ageHours === null || j.ageHours <= ageLimitHours).slice(0, rowLimit);
    return { source: "jobright.ai", sourceMode: "initialJobs", url: sourceUrl, count: jobs.length, totalAvailable: parsed.jobs.length, maxAgeHours: ageLimitHours, offset: 0, jobs };
  }

  function categoryFromUrl(sourceUrl) { const parsed = new URL(sourceUrl); const m = "/minisites-jobs/"; const i = parsed.pathname.indexOf(m); if (i < 0) return ""; const raw = parsed.pathname.slice(i + m.length); const parts = raw.split("/").map((p) => p.trim()).filter(Boolean).map((p) => decodeURIComponent(p)); return parts.length > 0 ? parts.join(":") : ""; }
  function normalizeApiJob(job, position, nowMs, sourceUrl) { const props = record(job?.properties); const id = stringify(job?.jobId) || stringify(job?.id); const title = stringify(props.title); const company = stringify(props.company); if (!title && !company) return null; const postedAt = Number(job?.postedAt); const postedDate = Number.isFinite(postedAt) && postedAt > 0 ? postedAt : null; const detailUrl = id ? jobDetailUrl(id, sourceUrl) : ""; return { position, id, title, company, location: stringify(props.location), workModel: stringify(props.workModel), salary: stringify(props.salary), postedAt: postedDate === null ? null : new Date(postedDate).toISOString(), postedAgo: formatPostedAgo(postedDate, nowMs), ageHours: ageHoursFromPostedDate(postedDate, nowMs), companySize: stringify(props.companySize), industry: listStrings(props.industry), qualifications: stringify(props.qualifications).slice(0, 600), h1bSponsored: stringify(props.h1bSponsored), sponsorshipSupport: parseSponsorshipStatus(stringify(props.h1bSponsored)), isNewGrad: parseBoolean(props.isNewGrad), detailUrl, applyUrl: detailUrl, url: detailUrl }; }
  function buildUrl(p) { const raw = String(p || "").trim(); try { const parsed = new URL(raw); if (parsed.hostname !== "jobright.ai" && !parsed.hostname.endsWith(".jobright.ai")) return "https://jobright.ai/minisites-jobs/newgrad/us/swe"; return parsed.toString(); } catch { const cp = raw.replace(/^\\/+/, "").replace(/^minisites-jobs\\/newgrad\\/?/, "") || "us/swe"; return "https://jobright.ai/minisites-jobs/newgrad/" + cp; } }
  function parseInitialJobs(htmlText) { const doc = new DOMParser().parseFromString(htmlText, "text/html"); const script = doc.querySelector("script#__NEXT_DATA__"); const raw = script?.textContent?.trim(); if (!raw) return { error: "NEXT_DATA not found", hint: "JobRight page structure may have changed.", action: "open https://jobright.ai/minisites-jobs/newgrad/us/swe" }; let data; try { data = JSON.parse(raw); } catch (e) { return { error: "NEXT_DATA parse failed", hint: e instanceof Error ? e.message : String(e), action: "open https://jobright.ai/minisites-jobs/newgrad/us/swe" }; } const jobs = data?.props?.pageProps?.initialJobs; if (!Array.isArray(jobs)) return { error: "initialJobs not found", hint: "JobRight page does not expose props.pageProps.initialJobs.", action: "open https://jobright.ai/minisites-jobs/newgrad/us/swe" }; return { jobs }; }
  function normalizeInitialJob(job, position, nowMs) { const postedDate = typeof job.postedDate === "number" ? job.postedDate : null; const detailUrl = normalizeUrl(job.applyUrl) || (job.id ? "https://jobright.ai/jobs/info/" + encodeURIComponent(job.id) : ""); return { position, id: stringify(job.id), title: stringify(job.title), company: stringify(job.company), location: stringify(job.location), workModel: stringify(job.workModel), salary: stringify(job.salary), postedAt: postedDate === null ? null : new Date(postedDate).toISOString(), postedAgo: formatPostedAgo(postedDate, nowMs), ageHours: ageHoursFromPostedDate(postedDate, nowMs), companySize: stringify(job.companySize), industry: listStrings(job.industry), qualifications: stringify(job.qualifications).slice(0, 600), h1bSponsored: stringify(job.h1bSponsored), sponsorshipSupport: parseSponsorshipStatus(stringify(job.h1bSponsored)), isNewGrad: Boolean(job.isNewGrad), detailUrl, applyUrl: detailUrl, url: detailUrl }; }
  function clampInt(value, fb, mn, mx) { const p = Number.parseInt(String(value ?? ""), 10); if (!Number.isFinite(p)) return fb; return Math.min(Math.max(p, mn), mx); }
  function optionalPositiveNumber(value) { if (value === undefined || value === null || value === "") return null; const p = Number(value); return Number.isFinite(p) && p > 0 ? p : null; }
  function nonNegativeInt(value, fb) { const p = Number.parseInt(String(value ?? ""), 10); if (!Number.isFinite(p) || p < 0) return fb; return p; }
  function normalizeUrl(value) { if (!value) return ""; try { const p = new URL(String(value), "https://jobright.ai"); if (!/^https?:$/.test(p.protocol)) return ""; return p.toString(); } catch { return ""; } }
  function stringify(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function record(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function listStrings(value) { if (Array.isArray(value)) return value.map(stringify).filter(Boolean); const t = stringify(value); return t ? [t] : []; }
  function parseBoolean(value) { if (typeof value === "boolean") return value; const n = stringify(value).toLowerCase(); return n === "true" || n === "yes" || n === "1"; }
  function parseSponsorshipStatus(text) { const n = text.trim().toLowerCase(); if (!n) return "unknown"; if (/\\b(not sure|unknown|n\\/a|unclear)\\b/.test(n)) return "unknown"; if (/\\b(no|false)\\b/.test(n) || n.includes("no sponsorship") || n.includes("without sponsorship") || n.includes("unable to sponsor") || n.includes("cannot sponsor") || n.includes("can't sponsor")) return "no"; if (/\\b(yes|true)\\b/.test(n) || n.includes("sponsor") || n.includes("visa support") || n.includes("work authorization support")) return "yes"; return "unknown"; }
  function jobDetailUrl(jobId, sourceUrl) { const id = String(jobId).replace(/"/g, "").trim(); if (!id) return ""; const source = new URL(sourceUrl); const params = source.searchParams; const detail = new URL("/jobs/info/" + encodeURIComponent(id), source.origin); detail.searchParams.set("utm_source", params.get("utm_source") || "1100"); detail.searchParams.set("utm_campaign", params.get("utm_campaign") || "Software Engineering"); return detail.toString(); }
  function ageHoursFromPostedDate(postedDate, nowMs) { const t = Number(postedDate); if (!Number.isFinite(t) || t <= 0) return null; return round((nowMs - t) / 3600000, 2); }
  function formatPostedAgo(postedDate, nowMs) { const t = Number(postedDate); if (!Number.isFinite(t) || t <= 0) return ""; const m = Math.max(0, Math.floor((nowMs - t) / 60000)); if (m <= 0) return "just now"; if (m < 60) return m + " " + (m === 1 ? "minute" : "minutes") + " ago"; const h = Math.floor(m / 60); if (h < 24) return h + " " + (h === 1 ? "hour" : "hours") + " ago"; const d = Math.floor(h / 24); if (d < 7) return d + " " + (d === 1 ? "day" : "days") + " ago"; const w = Math.floor(d / 7); return w + " " + (w === 1 ? "week" : "weeks") + " ago"; }
  function round(value, digits) { const f = 10 ** digits; return Math.round(value * f) / f; }
}`;

export const JOBRIGHT_DISMISS_SOURCE = `(function () {
  const selectors = [
    'button[aria-label*="close" i]',
    'button[aria-label*="dismiss" i]',
    '[role="dialog"] button[class*="close" i]',
    '.ant-modal-close',
    '.ant-notification-notice-close',
  ];
  let count = 0;
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      try { el.click(); count++; } catch {}
    });
  }
  return count;
})()`;
/* eslint-enable */
