import type { NewGradRow } from "@career-ops/shared";

type AdapterJob = Record<string, unknown>;

export function normalizeBuiltInAdapterRows(jobs: readonly AdapterJob[]): NewGradRow[] {
  return jobs
    .map((job, index) => normalizeJob(job, index, "builtin.com"))
    .filter(isCompleteRow);
}

export function normalizeIndeedAdapterRows(jobs: readonly AdapterJob[]): NewGradRow[] {
  return jobs
    .map((job, index) => normalizeJob(job, index, "indeed.com"))
    .filter(isCompleteRow);
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
  const rawLocation = text(job.location);
  const location = isWorkModelLabel(rawLocation) ? "" : rawLocation;
  const url = canonicalJobUrl(text(job.url), source);
  const attributes = arrayText(job.attributes);
  const summary = [text(job.summary), text(job.snippet), attributes.join(" ")]
    .filter(Boolean)
    .join(" ");

  return {
    source,
    position: numberValue(job.position) ?? index + 1,
    title,
    company,
    location,
    workModel: text(job.workModel) || (isWorkModelLabel(rawLocation) ? rawLocation : inferWorkModel([rawLocation, ...attributes].join(" "))),
    salary: text(job.salary) || null,
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

function isWorkModelLabel(value: string): boolean {
  return /^(remote|hybrid|on-?site|in-?office)(?:\s+or\s+(?:remote|hybrid|on-?site|in-?office))*$/i.test(value);
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
