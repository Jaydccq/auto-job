import { createHash } from "node:crypto";

import { canonicalizeJobUrl } from "../lib/canonical-job-url.js";

const COMPANY_LEGAL_SUFFIXES = new Set([
  "co",
  "company",
  "and",
  "corp",
  "corporation",
  "inc",
  "incorporated",
  "llc",
  "ltd",
  "limited",
  "plc",
]);

export interface JobIdentityInput {
  url?: string | null;
  company?: string | null;
  role?: string | null;
  source?: string | null;
  sourceJobId?: string | null;
  content?: string | null;
}

export interface JobIdentity {
  canonicalUrl: string | null;
  normalizedCompany: string;
  normalizedRole: string;
  companyRoleKey: string;
  sourceJobId: string | null;
  contentHash: string | null;
  stableKey: string;
}

export function createJobIdentity(input: JobIdentityInput): JobIdentity {
  const canonicalUrl = normalizeJobUrl(input.url);
  const normalizedCompany = normalizeJobCompany(input.company ?? "");
  const normalizedRole = normalizeJobRole(input.role ?? "");
  const companyRoleKey = jobCompanyRoleKey(input.company ?? "", input.role ?? "");
  const sourceJobId = input.sourceJobId?.trim() || extractSourceJobId(canonicalUrl);
  const contentHash = input.content ? hashJobContent(input.content) : null;
  const source = normalizeSource(input.source);
  const stableKey =
    canonicalUrl ||
    (source && sourceJobId ? `${source}:${sourceJobId}` : "") ||
    companyRoleKey ||
    (contentHash ? `content:${contentHash}` : "");

  return {
    canonicalUrl,
    normalizedCompany,
    normalizedRole,
    companyRoleKey,
    sourceJobId,
    contentHash,
    stableKey,
  };
}

export function normalizeJobUrl(value: string | null | undefined): string {
  return canonicalizeJobUrl(value) ?? value?.trim() ?? "";
}

export function jobCompanyRoleKey(company: string, role: string): string {
  const normalizedCompany = normalizeJobCompany(company);
  const normalizedRole = normalizeJobRole(role);
  if (!normalizedCompany || !normalizedRole) return "";
  return `${normalizedCompany}|${normalizedRole}`;
}

export function normalizeJobCompany(value: string): string {
  const tokens = normalizeIdentityText(value).split(" ").filter(Boolean);
  while (tokens.length > 0 && COMPANY_LEGAL_SUFFIXES.has(tokens[tokens.length - 1]!)) {
    tokens.pop();
  }
  return tokens.join(" ");
}

export function normalizeJobRole(value: string): string {
  return normalizeIdentityText(value);
}

export function hashJobContent(value: string): string {
  const normalized = normalizeIdentityText(value);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function extractSourceJobId(url: string | null | undefined): string | null {
  const canonicalUrl = normalizeJobUrl(url);
  if (!canonicalUrl) return null;

  try {
    const parsed = new URL(canonicalUrl);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname;

    if (host.includes("linkedin.com")) {
      return path.match(/\/jobs\/view\/(\d+)/)?.[1] ?? null;
    }
    if (host === "jobright.ai" || host.endsWith(".jobright.ai")) {
      return path.match(/\/jobs\/info\/([^/]+)/)?.[1] ?? null;
    }
    if (host.includes("greenhouse.io")) {
      return parsed.searchParams.get("token");
    }
    if (host.includes("indeed.com")) {
      return parsed.searchParams.get("jk");
    }

    return (
      path.match(/\/job\/([^/?#]+)/i)?.[1] ??
      path.match(/\/jobs\/([^/?#]+)/i)?.[1] ??
      null
    );
  } catch {
    return null;
  }
}

function normalizeIdentityText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSource(value: string | null | undefined): string {
  return normalizeIdentityText(value ?? "").replace(/\s+/g, "-");
}
