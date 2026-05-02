// JS mirror of apps/server/src/adapters/job-identity.ts. Used by .mjs
// scripts (scan.mjs, merge-tracker.mjs, hourly-job-scan.mjs) so the
// dedup policy stays identical across the TypeScript and JavaScript
// halves of the runtime. apps/server/src/adapters/job-identity.test.ts
// pins parity against this file with a fixture set — keep it in sync.

import { createHash } from "node:crypto";

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

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "utm_id",
  "utm_name",
  "ref",
  "source",
  "gh_src",
  "lever-source",
]);

export function canonicalizeJobUrl(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = normalizeCanonicalPath(url);
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeCanonicalPath(url) {
  const pathname = url.pathname.replace(/\/{2,}/g, "/");

  const oracleJobId = pathname.match(
    /\/CandidateExperience\/(?:[^/]+\/)?(?:sites\/[^/]+\/)?job\/([^/?#]+)/i,
  )?.[1];
  if (oracleJobId) {
    return `/hcmUI/CandidateExperience/job/${oracleJobId}`;
  }

  const genericJobIdMatch = pathname.match(
    /^(.*?\/job\/)(?=[A-Za-z0-9_-]*\d)([A-Za-z0-9_-]{5,})(?:\/.*)?$/i,
  );
  if (genericJobIdMatch) {
    return trimTrailingSlash(`${genericJobIdMatch[1]}${genericJobIdMatch[2]}`);
  }

  return trimTrailingSlash(pathname);
}

function trimTrailingSlash(value) {
  if (value === "/") return value;
  return value.replace(/\/+$/, "");
}

export function normalizeJobUrl(value) {
  return canonicalizeJobUrl(value) ?? (value == null ? "" : String(value).trim());
}

function normalizeIdentityText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeJobCompany(value) {
  const tokens = normalizeIdentityText(value).split(" ").filter(Boolean);
  while (tokens.length > 0 && COMPANY_LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

export function normalizeJobRole(value) {
  return normalizeIdentityText(value);
}

export function jobCompanyRoleKey(company, role) {
  const normalizedCompany = normalizeJobCompany(company ?? "");
  const normalizedRole = normalizeJobRole(role ?? "");
  if (!normalizedCompany || !normalizedRole) return "";
  return `${normalizedCompany}|${normalizedRole}`;
}

export function hashJobContent(value) {
  const normalized = normalizeIdentityText(value);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

export function extractSourceJobId(url) {
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

function normalizeSource(value) {
  return normalizeIdentityText(value).replace(/\s+/g, "-");
}

export function createJobIdentity(input) {
  const safe = input ?? {};
  const canonicalUrl = normalizeJobUrl(safe.url);
  const normalizedCompany = normalizeJobCompany(safe.company ?? "");
  const normalizedRole = normalizeJobRole(safe.role ?? "");
  const companyRoleKey = jobCompanyRoleKey(safe.company ?? "", safe.role ?? "");
  const trimmedSourceId = safe.sourceJobId == null ? "" : String(safe.sourceJobId).trim();
  const sourceJobId = trimmedSourceId || extractSourceJobId(canonicalUrl);
  const contentHash = safe.content ? hashJobContent(safe.content) : null;
  const source = normalizeSource(safe.source);
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
