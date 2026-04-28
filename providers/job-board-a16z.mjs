/**
 * A16Z public portfolio jobs provider.
 */

const A16Z_API_BASE_URL = 'https://jobs.a16z.com/api-boards';
const A16Z_FETCH_TIMEOUT_MS = 10_000;
const A16Z_DEFAULT_SIZE = 15;

const A16Z_BOARD = Object.freeze({
  id: 'andreessen-horowitz',
  isParent: true,
});

const A16Z_FILTER_GROUPS = Object.freeze([
  'jobTypes',
  'jobSeniority',
  'skills',
  'locations',
  'companies',
  'stages',
  'markets',
  'departments',
  'currencies',
  'salaryPeriods',
]);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeBoolean(value) {
  return typeof value === 'boolean' ? value : false;
}

function safeNumber(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeSize(value) {
  return Number.isInteger(value) && value > 0 ? value : A16Z_DEFAULT_SIZE;
}

function normalizeFilterValue(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return safeString(value.value) || safeString(value.id) || safeString(value.label);
}

function normalizeFacetOption(value, fallback = '') {
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? { label: text, value: text } : null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const label = safeString(value.label) || safeString(value.name) || safeString(value.value) || fallback;
  const optionValue = safeString(value.value) || safeString(value.id) || fallback || label;
  if (!label && !optionValue) return null;
  return { label: label || optionValue, value: optionValue || label };
}

function normalizeFacetOptions(values) {
  return asArray(values).map((value) => normalizeFacetOption(value)).filter(Boolean);
}

function normalizeTextOptions(values) {
  return asArray(values).map((value) => safeString(value)).filter(Boolean);
}

function normalizeAutocompleteNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
  const source = node.self && typeof node.self === 'object' ? node.self : node;
  const option = normalizeFacetOption(source);
  if (!option) return null;

  return {
    ...option,
    score: safeNumber(source.score ?? node.score),
    count: safeNumber(source.count),
    children: asArray(node.children).map(normalizeAutocompleteNode).filter(Boolean),
  };
}

function normalizeSalary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const minValue = Number.isFinite(value.minValue) ? value.minValue : null;
  const maxValue = Number.isFinite(value.maxValue) ? value.maxValue : null;
  const currency = normalizeFacetOption(value.currency);
  const period = normalizeFacetOption(value.period);
  if (minValue === null && maxValue === null && !currency && !period) return null;

  return {
    minValue,
    maxValue,
    currency,
    period,
    isOriginal: safeBoolean(value.isOriginal),
  };
}

async function postJson(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), A16Z_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${A16Z_API_BASE_URL}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    const json = text.trim() ? JSON.parse(text) : {};
    if (!response.ok) {
      const errors = asArray(json.errors).map(safeString).filter(Boolean);
      const detail = errors.length > 0 ? ` (${errors.join('; ')})` : '';
      throw new Error(`A16Z ${path} failed with HTTP ${response.status}${detail}`);
    }
    return json && typeof json === 'object' && !Array.isArray(json) ? json : {};
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`A16Z ${path} timed out after ${A16Z_FETCH_TIMEOUT_MS}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function autocomplete(path, query) {
  const q = safeString(query);
  if (!q) return [];
  const response = await postJson(`autocomplete/${path}`, {
    q,
    board: { ...A16Z_BOARD },
    skipCompanyExcludes: false,
  });
  return asArray(response.results).map(normalizeAutocompleteNode).filter(Boolean);
}

async function resolveFilterValue(path, value, cache) {
  const input = normalizeFacetOption(value);
  if (!input) return null;

  const lookup = input.label || input.value;
  const cacheKey = `${path}:${lookup.toLowerCase()}`;
  if (!cache.has(cacheKey)) {
    cache.set(cacheKey, autocomplete(path, lookup).catch(() => []));
  }

  const options = await cache.get(cacheKey);
  const lowerLookup = lookup.toLowerCase();
  const match = options.find((option) =>
    option.label.toLowerCase() === lowerLookup || option.value.toLowerCase() === lowerLookup
  ) || options[0];

  return match ? { label: match.label, value: match.value } : input;
}

async function resolveSearchFilters(filters = {}) {
  const resolved = { ...filters };
  const cache = new Map();

  for (const group of ['skills', 'locations', 'markets']) {
    const values = asArray(filters[group]);
    if (values.length === 0) continue;
    resolved[group] = (await Promise.all(
      values.map((value) => resolveFilterValue(group, value, cache))
    )).filter(Boolean);
  }

  return resolved;
}

export function buildA16zSearchPayload(filters = {}) {
  const meta = { size: normalizeSize(filters.size) };
  if (safeString(filters.sequence)) meta.sequence = filters.sequence.trim();

  const query = {
    promoteFeatured: filters.promoteFeatured !== false,
  };

  for (const group of A16Z_FILTER_GROUPS) {
    const values = asArray(filters[group]).map(normalizeFilterValue).filter(Boolean);
    if (values.length > 0) query[group] = values;
  }
  if (filters.remoteOnly === true) query.remoteOnly = true;
  if (filters.internshipsOnly === true) query.internshipsOnly = true;
  if (filters.query && typeof filters.query === 'object' && !Array.isArray(filters.query)) {
    Object.assign(query, filters.query);
  }

  return { meta, board: { ...A16Z_BOARD }, query };
}

export function normalizeA16zJob(job) {
  if (!job || typeof job !== 'object' || Array.isArray(job)) return null;

  const title = safeString(job.title);
  const url = safeString(job.url) || safeString(job.applyUrl);
  const company = safeString(job.companyName) || safeString(job.company);
  if (!title || !url || !company) return null;

  const normalizedLocations = normalizeFacetOptions(job.normalizedLocations);
  const locations = normalizeTextOptions(job.locations);

  return {
    id: safeString(job.jobId) || safeString(job.id),
    title,
    url,
    applyUrl: safeString(job.applyUrl) || url,
    company,
    location: normalizedLocations[0]?.label || locations[0] || '',
    locations,
    normalizedLocations,
    departments: normalizeTextOptions(job.departments),
    jobTypes: normalizeFacetOptions(job.jobTypes),
    jobFunctions: normalizeFacetOptions(job.jobFunctions),
    jobSeniorities: normalizeFacetOptions(job.jobSeniorities),
    markets: normalizeFacetOptions(job.markets),
    stages: normalizeFacetOptions(job.stages),
    skills: normalizeFacetOptions(job.skills),
    requiredSkills: normalizeFacetOptions(job.requiredSkills),
    preferredSkills: normalizeFacetOptions(job.preferredSkills),
    salary: normalizeSalary(job.salary),
    remote: safeBoolean(job.remote),
    hybrid: safeBoolean(job.hybrid),
    featured: safeBoolean(job.isFeatured),
    postedAt: safeString(job.timeStamp),
    source: 'a16z-api',
  };
}

export function mapA16zJobToScanOffer(job) {
  const normalized = normalizeA16zJob(job);
  if (!normalized) return null;
  return {
    title: normalized.title,
    url: normalized.url,
    company: normalized.company,
    location: normalized.location,
  };
}

export async function searchA16zJobs(filters = {}) {
  const payload = buildA16zSearchPayload(await resolveSearchFilters(filters));
  const response = await postJson('search-jobs', payload);
  const jobs = asArray(response.jobs).map(normalizeA16zJob).filter(Boolean);
  return {
    jobs,
    total: safeNumber(response.total, jobs.length),
    errors: asArray(response.errors).map(safeString).filter(Boolean),
  };
}

export const a16zProvider = Object.freeze({
  id: 'a16z',
  searchJobs: searchA16zJobs,
  mapToScanOffer: mapA16zJobToScanOffer,
});
