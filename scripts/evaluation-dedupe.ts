import type { PipelineEntry } from "../apps/server/src/contracts/newgrad.ts";
import { loadEvaluatedJobIdentities } from "../apps/server/src/adapters/evaluated-report-urls.ts";
import { loadTrackedCompanyRoles } from "../apps/server/src/adapters/newgrad-config.ts";
import { jobCompanyRoleKey, normalizeJobUrl } from "../apps/server/src/adapters/job-identity.ts";

export interface EvaluationDedupeKeys {
  urls: ReadonlySet<string>;
  companyRoles: ReadonlySet<string>;
}

export function loadEvaluationDedupeKeys(repoRoot: string): EvaluationDedupeKeys {
  const evaluated = loadEvaluatedJobIdentities(repoRoot);
  return {
    urls: evaluated.urls,
    companyRoles: new Set([
      ...evaluated.companyRoles,
      ...loadTrackedCompanyRoles(repoRoot),
    ]),
  };
}

export function isKnownEvaluationCandidate(
  candidate: Pick<PipelineEntry, "url" | "company" | "role">,
  keys: EvaluationDedupeKeys,
): boolean {
  const canonicalUrl = normalizeJobUrl(candidate.url);
  if (canonicalUrl && keys.urls.has(canonicalUrl)) return true;

  const companyRole = jobCompanyRoleKey(candidate.company, candidate.role);
  return companyRole !== "" && keys.companyRoles.has(companyRole);
}

export function filterKnownEvaluationCandidates<T extends Pick<PipelineEntry, "url" | "company" | "role">>(
  candidates: readonly T[],
  keys: EvaluationDedupeKeys,
): { candidates: T[]; skipped: number } {
  const filtered: T[] = [];
  let skipped = 0;

  for (const candidate of candidates) {
    if (isKnownEvaluationCandidate(candidate, keys)) {
      skipped += 1;
      continue;
    }
    filtered.push(candidate);
  }

  return { candidates: filtered, skipped };
}
