/**
 * Indeed site adapter — verbatim port of bb-browser/sites/indeed/jobs.js.
 * See ../builtin/index.ts for strategy notes.
 */

import { AdapterParseError } from "../../errors.js";
import type { Tab } from "../../tab.js";
import type { SearchAdapter, SiteAdapterMeta } from "../types.js";

export interface IndeedSearchOptions {
  query?: string;
  location?: string;
  limit?: number;
  page?: number;
  radius?: string;
  fromage?: string;
  url?: string;
}

export interface IndeedJob {
  position: number;
  id: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  attributes: string[];
  postedAgo: string;
  urgentlyHiring: boolean;
  sponsored: boolean;
  snippet: string;
  url: string;
}

export interface IndeedSearchResult {
  source: "indeed.com";
  url: string;
  query: string;
  location: string;
  page: number;
  count: number;
  totalParsed: number;
  jobs: IndeedJob[];
}

interface IndeedErrorPayload {
  error: string;
  hint?: string;
  action?: string;
}

export async function searchIndeed(
  tab: Tab,
  opts: IndeedSearchOptions = {},
): Promise<IndeedSearchResult> {
  if (!/(^|\.)indeed\.com$/.test(safeHostname(tab.url))) {
    await tab.navigate("https://www.indeed.com/jobs?q=Software+Engineer&l=Remote");
  }
  const script = `(${INDEED_ADAPTER_SOURCE})(${JSON.stringify(opts)})`;
  const result = await tab.evaluate<IndeedSearchResult | IndeedErrorPayload>(script);
  if (isErrorPayload(result)) {
    throw new AdapterParseError(`indeed: ${result.error}`, JSON.stringify(result));
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

function isErrorPayload(value: unknown): value is IndeedErrorPayload {
  return typeof value === "object" && value !== null && "error" in value;
}

const META: SiteAdapterMeta = {
  id: "indeed",
  name: "Indeed",
  domain: "www.indeed.com",
  requiresAuth: false,
  description: "Global job search; query + location filters.",
};

export const INDEED_ADAPTER: SearchAdapter<IndeedSearchOptions, IndeedSearchResult> = {
  meta: META,
  search: searchIndeed,
};

/* eslint-disable */
export const INDEED_ADAPTER_SOURCE = `async function indeedJobs(args) {
  const query = stringValue(args.query) || "Software Engineer";
  const locationName = stringValue(args.location) || "Remote";
  const limit = clampInt(args.limit, 20, 1, 100);
  const page = clampInt(args.page, 1, 1, 1000);
  const url = buildSearchUrl(query, locationName, page, args);

  let response;
  try {
    response = await fetch(url, { credentials: "include" });
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), hint: "Cannot reach Indeed.", action: "open https://www.indeed.com" };
  }
  if (!response.ok) return { error: "HTTP " + response.status, hint: "Indeed page fetch failed.", action: "open " + url };

  const html = await response.text();
  const parsed = parseJobs(html, url, limit);
  if (parsed.error) return parsed;

  return { source: "indeed.com", url, query, location: locationName, page, count: parsed.jobs.length, totalParsed: parsed.totalParsed, jobs: parsed.jobs };

  function buildSearchUrl(searchQuery, searchLocation, pageNumber, values) {
    const explicitUrl = stringValue(values.url);
    const target = explicitUrl ? parseIndeedUrl(explicitUrl) : new URL("/jobs", "https://www.indeed.com");
    if (!explicitUrl) {
      target.searchParams.set("q", searchQuery);
      target.searchParams.set("l", searchLocation);
      if (stringValue(values.radius)) target.searchParams.set("radius", stringValue(values.radius));
      if (stringValue(values.fromage)) target.searchParams.set("fromage", stringValue(values.fromage));
    }
    if (pageNumber > 1) target.searchParams.set("start", String((pageNumber - 1) * 10));
    else target.searchParams.delete("start");
    return target.toString();
  }
  function parseIndeedUrl(value) {
    const parsed = new URL(value, "https://www.indeed.com");
    if (parsed.hostname !== "www.indeed.com" && parsed.hostname !== "indeed.com") return new URL("/jobs", "https://www.indeed.com");
    if (parsed.hostname === "indeed.com") parsed.hostname = "www.indeed.com";
    return parsed;
  }
  function parseJobs(htmlText, pageUrl, maxRows) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const cards = Array.from(doc.querySelectorAll(".job_seen_beacon"));
    const seen = new Set();
    const jobs = [];
    for (const card of cards) {
      const link = card.querySelector("a[data-jk]");
      const jk = cleanText(link?.getAttribute("data-jk"));
      const title = extractTitle(link);
      if (!jk || !title || seen.has(jk)) continue;
      seen.add(jk);
      const lines = visibleTextLines(card);
      const company = cleanText(card.querySelector("[data-testid='company-name']")?.textContent) || lineAfterTitle(lines, title);
      const locationText = cleanText(card.querySelector("[data-testid='text-location']")?.textContent) || "";
      const attributes = unique(Array.from(card.querySelectorAll("[data-testid='attribute_snippet_testid']")).map((n) => cleanText(n.textContent)).filter(Boolean));
      jobs.push({
        position: jobs.length + 1, id: jk, title, company, location: locationText,
        salary: findSalary(lines), attributes, postedAgo: findPostedAgo(lines),
        urgentlyHiring: lines.some((line) => /^Urgently hiring$/i.test(line)),
        sponsored: String(link?.getAttribute("href") || "").includes("/pagead/"),
        snippet: extractSnippet(card, lines, title, company, locationText),
        url: "https://www.indeed.com/viewjob?jk=" + encodeURIComponent(jk),
      });
      if (jobs.length >= maxRows) break;
    }
    if (jobs.length === 0) {
      const pageText = cleanText(doc.body?.textContent || "");
      if (/captcha|verify|robot|security check|additional verification|access denied/i.test(pageText))
        return { error: "Indeed verification required", hint: "Verify in browser then retry.", action: "open " + pageUrl };
      return { error: "No Indeed jobs parsed", hint: "Indeed structure may have changed or no results.", action: "open " + pageUrl };
    }
    return { totalParsed: cards.length, jobs };
  }
  function extractTitle(link) { const t = link?.querySelector("span[title]"); return cleanText(t?.getAttribute("title") || t?.textContent || link?.textContent); }
  function lineAfterTitle(lines, title) { const i = lines.findIndex((l) => l.toLowerCase() === title.toLowerCase()); if (i === -1) return ""; return lines.slice(i + 1).find((l) => !/^(new|urgently hiring)$/i.test(l)) || ""; }
  function findSalary(lines) { return lines.find((l) => /(?:\\$|USD)\\s*\\d|(?:up to|from)\\s+\\$?\\d/i.test(l)) || ""; }
  function findPostedAgo(lines) { return lines.find((l) => /\\b(?:just posted|today|new|\\d+\\s+(?:day|days|hour|hours)\\s+ago|posted\\s+\\d+\\s+(?:day|days|hour|hours)\\s+ago)\\b/i.test(l)) || ""; }
  function extractSnippet(card, lines, title, company, locationText) {
    const explicit = cleanText(card.querySelector("[data-testid='job-snippet'], .job-snippet")?.textContent);
    if (explicit) return explicit.slice(0, 500);
    const ignored = new Set([title, company, locationText].map((v) => v.toLowerCase()).filter(Boolean));
    const candidate = lines.find((l) => l.length > 60 && !ignored.has(l.toLowerCase()) && !/similar jobs|upload your resume/i.test(l));
    return (candidate || "").slice(0, 500);
  }
  function unique(values) { const s = new Set(); const r = []; for (const v of values) { const k = v.toLowerCase(); if (!k || s.has(k)) continue; s.add(k); r.push(v); } return r; }
  function clampInt(value, fb, mn, mx) { const p = Number.parseInt(String(value ?? ""), 10); if (!Number.isFinite(p)) return fb; return Math.min(Math.max(p, mn), mx); }
  function stringValue(value) { return value === undefined || value === null ? "" : String(value).trim(); }
  function visibleTextLines(node) { const c = node.cloneNode(true); for (const h of c.querySelectorAll("script, style, noscript, svg")) h.remove(); const lines = []; const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const v = cleanText(w.currentNode.nodeValue); if (v) lines.push(v); } return lines; }
  function cleanText(value) { return stringValue(value).replace(/\\s+/g, " ").trim(); }
}`;
/* eslint-enable */
