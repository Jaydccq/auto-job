import type { NewGradDetail, NewGradRow } from "@career-ops/shared";
import {
  canonicalLinkedInJobViewUrl,
  isLinkedInJobsUrl,
} from "./linkedin-scan-normalizer.js";

const JOBRIGHT_HOST = "jobright.ai";
const ATS_HOST_PATTERNS = [
  "greenhouse.io",
  "greenhouse",
  "ashbyhq.com",
  "lever.co",
  "workdayjobs.com",
  "myworkdayjobs.com",
  "smartrecruiters.com",
  "jobvite.com",
  "icims.com",
];
const NOISE_HOST_PATTERNS = [
  "accounts.google.com",
  "linkedin.com",
  "crunchbase.com",
  "glassdoor.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "youtube.com",
  "tiktok.com",
  "marketbeat.com",
  "media.licdn.com",
];
const JOB_PATH_HINTS = [
  "/apply",
  "/job",
  "/jobs",
  "/career",
  "/careers",
  "/position",
  "/positions",
  "/opportunit",
];
const APPLY_QUERY_HINTS = [
  "gh_jid",
  "gh_src",
  "jobid",
  "job_id",
  "jobreq",
  "job_req",
  "req_id",
  "requisition",
  "lever-source",
  "ashby_jid",
  "token=",
];
const JOBRIGHT_NON_JOB_PATHS = [
  "/jobs/recommend",
];
const MIN_ACCEPTABLE_SCORE = -99;

function normalizeUrlCandidate(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function hasPattern(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => value.includes(pattern));
}

export function isJobrightUrl(url: string | null | undefined): boolean {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return false;

  try {
    const parsed = new URL(normalized);
    return parsed.hostname === JOBRIGHT_HOST || parsed.hostname.endsWith(`.${JOBRIGHT_HOST}`);
  } catch {
    return false;
  }
}

function scoreUrlCandidate(url: string | null | undefined): number {
  const normalized = normalizeUrlCandidate(url);
  if (!normalized) return Number.NEGATIVE_INFINITY;

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const full = `${host}${path}${parsed.search.toLowerCase()}`;

    if (isLinkedInJobsUrl(normalized)) return 70;

    if (hasPattern(host, NOISE_HOST_PATTERNS)) return -100;

    let score = 0;

    const hasAtsHost = hasPattern(host, ATS_HOST_PATTERNS);
    const hasApplyQuery = hasPattern(full, APPLY_QUERY_HINTS);
    const hasJobPath = hasPattern(path, JOB_PATH_HINTS);
    const hasJobText = /\b(apply|job|jobs|career|careers|position|opening|opportunit)\b/.test(full);

    if (isJobrightUrl(normalized) && JOBRIGHT_NON_JOB_PATHS.includes(path)) {
      return -120;
    }

    if (hasAtsHost) score += 100;
    if (hasApplyQuery) score += 24;
    if (hasJobPath) score += 18;
    if (hasJobText) {
      score += 12;
    }

    if (isJobrightUrl(normalized)) {
      score -= 80;
      if (path.startsWith("/jobs/info/")) score -= 30;
    } else if (hasAtsHost || hasApplyQuery || hasJobPath || hasJobText) {
      score += 40;
    } else {
      score -= 80;
    }

    const pathSegments = path.split("/").filter(Boolean);
    const lastSegment = pathSegments.at(-1) ?? "";
    if (
      pathSegments.length === 0 ||
      ["home", "about", "company"].includes(lastSegment)
    ) {
      score -= 200;
    }

    return score;
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
}

export function pickBestNewGradUrl(
  ...candidates: Array<string | null | undefined>
): string | null {
  let bestUrl: string | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = normalizeUrlCandidate(candidate);
    if (!normalized) continue;

    const score = scoreUrlCandidate(normalized);
    if (score > bestScore && score > MIN_ACCEPTABLE_SCORE) {
      bestScore = score;
      bestUrl = canonicalLinkedInJobViewUrl(normalized) ?? normalized;
    }
  }

  return bestUrl;
}

export function hasExternalNewGradUrl(
  ...candidates: Array<string | null | undefined>
): boolean {
  const best = pickBestNewGradUrl(...candidates);
  return Boolean(best && !isJobrightUrl(best));
}

export function pickPipelineEntryUrl(
  detail: Pick<NewGradDetail, "originalPostUrl" | "applyNowUrl" | "applyFlowUrls">,
  row: Pick<NewGradRow, "applyUrl" | "detailUrl">
): string {
  const externalApplyFlowUrl = pickBestNewGradUrl(
    ...[
      detail.applyNowUrl,
      ...(detail.applyFlowUrls ?? []),
    ].filter((url) => {
      const normalized = normalizeUrlCandidate(url);
      return normalized && !isLinkedInJobsUrl(normalized);
    }),
  );
  if (externalApplyFlowUrl && !isLinkedInJobsUrl(externalApplyFlowUrl)) {
    return externalApplyFlowUrl;
  }

  const applyFlowUrl = pickBestNewGradUrl(
    detail.applyNowUrl,
    ...(detail.applyFlowUrls ?? []),
  );
  if (applyFlowUrl && !isLinkedInJobsUrl(applyFlowUrl)) {
    return applyFlowUrl;
  }

  return (
    pickBestNewGradUrl(
      detail.originalPostUrl,
      applyFlowUrl,
      detail.applyNowUrl,
      ...(detail.applyFlowUrls ?? []),
      row.applyUrl,
      row.detailUrl,
    ) ??
    normalizeUrlCandidate(row.detailUrl) ??
    row.detailUrl
  );
}

export function pipelineEntryUrlCandidates(
  detail: Pick<NewGradDetail, "originalPostUrl" | "applyNowUrl" | "applyFlowUrls">,
  row: Pick<NewGradRow, "applyUrl" | "detailUrl">
): string[] {
  const picked = pickPipelineEntryUrl(detail, row);
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const candidate of [
    picked,
    detail.originalPostUrl,
    detail.applyNowUrl,
    ...(detail.applyFlowUrls ?? []),
    row.applyUrl,
    row.detailUrl,
  ]) {
    const normalized = normalizeUrlCandidate(candidate);
    if (!normalized) continue;

    const canonical = canonicalLinkedInJobViewUrl(normalized) ?? normalized;
    if (canonical !== picked && scoreUrlCandidate(normalized) <= MIN_ACCEPTABLE_SCORE) {
      continue;
    }
    if (seen.has(canonical)) continue;

    seen.add(canonical);
    candidates.push(canonical);
  }

  return candidates;
}
