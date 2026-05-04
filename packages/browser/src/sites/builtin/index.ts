/**
 * BuiltIn site adapter.
 *
 * Strategy: embed the bb-browser builtin/jobs source as a string and
 * evaluate it in the tab. This preserves 100% behavioral parity with
 * the bb-browser path (same DOMParser, same fetch credentials) while
 * removing the PATH-binary dependency.
 *
 * Source is ported verbatim from bb-browser/sites/builtin/jobs.js.
 */

import { AdapterParseError } from "../../errors.js";
import type { Tab } from "../../tab.js";
import type { SearchAdapter, SiteAdapterMeta } from "../types.js";

export interface BuiltInSearchOptions {
  /** Search keyword. Defaults to "Software Engineer" inside the adapter when omitted. */
  query?: string;
  /** Max rows to return (1..100, default 20). */
  limit?: number;
  /** Page number (default 1). */
  page?: number;
  /** Built In path or full URL (default /jobs/hybrid/national/dev-engineering). */
  path?: string;
}

export interface BuiltInJob {
  position: number;
  id: string;
  title: string;
  company: string;
  postedAgo: string;
  workModel: string;
  location: string;
  salary: string;
  seniority: string;
  easyApply: boolean;
  summary: string;
  url: string;
}

export interface BuiltInSearchResult {
  source: "builtin.com";
  url: string;
  query: string;
  page: number;
  count: number;
  totalParsed: number;
  jobs: BuiltInJob[];
}

interface BuiltInErrorPayload {
  error: string;
  hint?: string;
  action?: string;
}

export async function searchBuiltIn(
  tab: Tab,
  opts: BuiltInSearchOptions = {},
): Promise<BuiltInSearchResult> {
  if (!/(^|\.)builtin\.com$/.test(safeHostname(tab.url))) {
    await tab.navigate("https://builtin.com/jobs");
  }
  const script = `(${BUILTIN_ADAPTER_SOURCE})(${JSON.stringify(opts)})`;
  const result = await tab.evaluate<BuiltInSearchResult | BuiltInErrorPayload>(script);
  if (isErrorPayload(result)) {
    throw new AdapterParseError(`builtin: ${result.error}`, JSON.stringify(result));
  }
  return result;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function isErrorPayload(value: unknown): value is BuiltInErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

const META: SiteAdapterMeta = {
  id: "builtin",
  name: "BuiltIn",
  domain: "builtin.com",
  requiresAuth: false,
  description: "US tech-jobs aggregator; query keyword + path/page.",
};

export const BUILTIN_ADAPTER: SearchAdapter<BuiltInSearchOptions, BuiltInSearchResult> = {
  meta: META,
  search: searchBuiltIn,
};

/* eslint-disable */
/**
 * Verbatim port of bb-browser/sites/builtin/jobs.js — runs inside the
 * tab via tab.evaluate(). Do NOT modify without re-running parity tests.
 */
export const BUILTIN_ADAPTER_SOURCE = `async function builtinJobs(args) {
  const limit = clampInt(args.limit, 20, 1, 100);
  const url = buildSearchUrl(args);

  let response;
  try {
    response = await fetch(url, { credentials: "include" });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), hint: "Cannot reach Built In; ensure browser can open builtin.com.", action: "open https://builtin.com/jobs" };
  }
  if (!response.ok) {
    return { error: "HTTP " + response.status, hint: "Built In returned non-OK; may need login or verification.", action: "open https://builtin.com/jobs" };
  }

  const html = await response.text();
  const parsed = parseJobs(html, url, limit);
  if (parsed.error) return parsed;

  return { source: "builtin.com", url, query: new URL(url).searchParams.get("search") || "", page: Number(new URL(url).searchParams.get("page") || 1), count: parsed.jobs.length, totalParsed: parsed.totalParsed, jobs: parsed.jobs };

  function buildSearchUrl(values) {
    const current = new URL(location.href);
    const rawPath = stringValue(values.path);
    const base = rawPath ? parseBuiltInUrl(rawPath) : defaultBuiltInUrl(current);
    const query = stringValue(values.query) || base.searchParams.get("search") || current.searchParams.get("search") || "Software Engineer";
    const page = clampInt(values.page || base.searchParams.get("page") || current.searchParams.get("page"), 1, 1, 1000);
    base.searchParams.set("search", query);
    base.searchParams.delete("page");
    if (page > 1) base.searchParams.set("page", String(page));
    return base.toString();
  }
  function defaultBuiltInUrl(current) {
    if (current.hostname === "builtin.com" && current.pathname.startsWith("/jobs")) return new URL(current.href);
    return new URL("/jobs/hybrid/national/dev-engineering", "https://builtin.com");
  }
  function parseBuiltInUrl(value) {
    const url = new URL(value, "https://builtin.com");
    if (url.hostname !== "builtin.com" && !url.hostname.endsWith(".builtin.com")) return new URL("/jobs/hybrid/national/dev-engineering", "https://builtin.com");
    return url;
  }
  function parseJobs(htmlText, pageUrl, maxRows) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const cards = Array.from(doc.querySelectorAll('[data-id="job-card"], [id^="job-card-"]'));
    const seen = new Set();
    const jobs = [];
    for (const card of cards) {
      const titleLink = card.querySelector('a[data-id="job-card-title"], a[href^="/job/"]');
      const title = cleanText(titleLink?.textContent || titleLink?.getAttribute("title"));
      const jobUrl = normalizeUrl(titleLink?.getAttribute("href"));
      if (!title || !jobUrl || seen.has(jobUrl)) continue;
      seen.add(jobUrl);
      const attrs = unique(Array.from(card.querySelectorAll(".font-barlow.text-gray-04")).map((node) => cleanText(node.textContent)).filter(Boolean));
      const text = visibleText(card);
      const id = cleanText(card.getAttribute("data-job-id") || card.id.replace(/^job-card-/, ""));
      jobs.push({
        position: jobs.length + 1, id, title,
        company: cleanText(card.querySelector('a[data-id="company-title"]')?.textContent) || companyFromLogo(card),
        postedAgo: firstMatch(text, /\\b(?:Reposted\\s+)?(?:An|\\d+)\\s+\\w+\\s+Ago\\b|\\bYesterday\\b/i),
        workModel: attrs.find(looksLikeWorkModel) || "",
        location: attrs.find((value) => !looksLikeWorkModel(value) && !looksLikeSalary(value) && !looksLikeLevel(value)) || "",
        salary: attrs.find(looksLikeSalary) || "",
        seniority: attrs.find(looksLikeLevel) || "",
        easyApply: /\\bEasy Apply\\b/i.test(text),
        summary: extractSummary(card),
        url: jobUrl,
      });
      if (jobs.length >= maxRows) break;
    }
    if (cards.length > 0 && jobs.length === 0) return { error: "No Built In jobs parsed", hint: "Built In page structure may have changed.", action: "open " + pageUrl };
    if (cards.length === 0) {
      const pageText = cleanText(doc.body?.textContent || "");
      if (/captcha|verify|robot|blocked|access denied/i.test(pageText)) return { error: "Built In verification required", hint: "Verify in browser then retry.", action: "open " + pageUrl };
    }
    return { totalParsed: cards.length, jobs };
  }
  function companyFromLogo(card) { const alt = card.querySelector('img[alt$=" Logo"]')?.getAttribute("alt") || ""; return cleanText(alt.replace(/\\s+Logo$/, "")); }
  function extractSummary(card) { const summary = cleanText(card.querySelector(".fs-sm.fw-regular.mb-md.text-gray-04")?.textContent); return summary ? summary.slice(0, 500) : ""; }
  function normalizeUrl(value) { if (!value) return ""; try { const parsed = new URL(value, "https://builtin.com"); if (!/^https?:$/.test(parsed.protocol)) return ""; parsed.hash = ""; return parsed.toString(); } catch { return ""; } }
  function looksLikeSalary(value) { return /\\$|\\b\\d+\\s*K\\b|\\bAnnually\\b|\\bHourly\\b|\\bper\\s+(?:year|hour|month)\\b/i.test(value); }
  function looksLikeWorkModel(value) { return /^(remote|hybrid|on-?site|in-?office)(?:\\s+or\\s+(?:remote|hybrid|on-?site|in-?office))*$/i.test(value); }
  function looksLikeLevel(value) { return /\\b(?:intern|entry|junior|mid|senior|lead|staff|principal|director|manager|level)\\b/i.test(value); }
  function firstMatch(value, pattern) { const match = String(value || "").match(pattern); return match ? cleanText(match[0].replace(/^Reposted\\s+/i, "")) : ""; }
  function unique(values) { const s = new Set(); const r = []; for (const v of values) { const k = v.toLowerCase(); if (!k || s.has(k)) continue; s.add(k); r.push(v); } return r; }
  function clampInt(value, fb, mn, mx) { const p = Number.parseInt(String(value ?? ""), 10); if (!Number.isFinite(p)) return fb; return Math.min(Math.max(p, mn), mx); }
  function stringValue(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function visibleText(node) { const c = node.cloneNode(true); for (const h of c.querySelectorAll("script, style, noscript, svg")) h.remove(); const parts = []; const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const v = cleanText(w.currentNode.nodeValue); if (v) parts.push(v); } return parts.join(" "); }
  function cleanText(value) { return stringValue(value).replace(/\\s+/g, " ").trim(); }
}`;
/* eslint-enable */
