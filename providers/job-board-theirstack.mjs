/**
 * TheirStack job search provider.
 *
 * Requires THEIRSTACK_API_KEY or THEIRSTACK_TOKEN when executed.
 */

const THEIRSTACK_API_URL = 'https://api.theirstack.com/v1/jobs/search';
const THEIRSTACK_FETCH_TIMEOUT_MS = 10_000;
const THEIRSTACK_DEFAULT_LIMIT = 25;

const REQUIRED_FILTERS = Object.freeze([
  'posted_at_max_age_days',
  'posted_at_gte',
  'posted_at_lte',
  'company_domain_or',
  'company_linkedin_url_or',
  'company_name_or',
  'company_name_case_insensitive_or',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeLimit(value) {
  return Number.isInteger(value) && value > 0 ? value : THEIRSTACK_DEFAULT_LIMIT;
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== '';
}

export function buildTheirStackSearchPayload(filters = {}) {
  const payload = {
    ...filters,
    limit: normalizeLimit(filters.limit ?? filters.size),
  };
  delete payload.size;
  delete payload.token;
  return payload;
}

export function hasRequiredTheirStackFilter(payload = {}) {
  return REQUIRED_FILTERS.some((key) => hasValue(payload[key]));
}

function theirStackToken(filters = {}) {
  return safeString(filters.token) || safeString(process.env.THEIRSTACK_API_KEY) || safeString(process.env.THEIRSTACK_TOKEN);
}

async function postTheirStackJson(payload, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), THEIRSTACK_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(THEIRSTACK_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text.trim() ? JSON.parse(text) : {};
    if (!response.ok) {
      const apiError = json?.error;
      const detail = apiError?.description || apiError?.title || response.statusText;
      throw new Error(`TheirStack search failed with HTTP ${response.status}${detail ? ` (${detail})` : ''}`);
    }
    return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`TheirStack search timed out after ${THEIRSTACK_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizeTheirStackJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return null;

  const title = safeString(job.job_title) || safeString(job.title);
  const url = safeString(job.final_url) || safeString(job.url) || safeString(job.source_url);
  const company = safeString(job.company) || safeString(job.company_object?.name);
  if (!title || !url || !company) return null;

  return {
    id: job.id ?? null,
    title,
    url,
    company,
    location: safeString(job.short_location) || safeString(job.location) || safeString(job.long_location),
    remote: job.remote === true,
    hybrid: job.hybrid === true,
    postedAt: safeString(job.date_posted),
    salary: safeString(job.salary_string),
    minAnnualSalaryUsd: safeNumber(job.min_annual_salary_usd, null),
    maxAnnualSalaryUsd: safeNumber(job.max_annual_salary_usd, null),
    source: 'theirstack-api',
  };
}

export function mapTheirStackJobToScanOffer(job) {
  const normalized = normalizeTheirStackJob(job);
  if (!normalized) return null;
  return {
    title: normalized.title,
    url: normalized.url,
    company: normalized.company,
    location: normalized.location,
  };
}

export async function searchTheirStackJobs(filters = {}) {
  const token = theirStackToken(filters);
  if (!token) {
    throw new Error('TheirStack provider requires THEIRSTACK_API_KEY or THEIRSTACK_TOKEN');
  }

  const payload = buildTheirStackSearchPayload(filters);
  if (!hasRequiredTheirStackFilter(payload)) {
    throw new Error(`TheirStack provider requires at least one filter: ${REQUIRED_FILTERS.join(', ')}`);
  }

  const response = await postTheirStackJson(payload, token);
  const jobs = asArray(response.data).map(normalizeTheirStackJob).filter(Boolean);
  return {
    jobs,
    total: safeNumber(response.metadata?.total_results, jobs.length),
    errors: [],
  };
}

export const theirStackProvider = Object.freeze({
  id: 'theirstack',
  searchJobs: searchTheirStackJobs,
  mapToScanOffer: mapTheirStackJobToScanOffer,
});
