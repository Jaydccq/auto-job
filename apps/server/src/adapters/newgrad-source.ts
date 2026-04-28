import type { NewGradRow } from "@career-ops/shared";

const DEFAULT_SCAN_SOURCE = "newgrad-jobs.com";
const BUILTIN_SCAN_SOURCE = "builtin.com";
const LINKEDIN_SCAN_SOURCE = "linkedin.com";
const INDEED_SCAN_SOURCE = "indeed.com";

export function scanSourceForRow(row: Pick<NewGradRow, "source">): string {
  const source = row.source?.trim();
  return source && source.length > 0 ? source : DEFAULT_SCAN_SOURCE;
}

export function pipelineTagForSource(source: string | null | undefined): string {
  const normalized = (source ?? "").toLowerCase();
  if (normalized.includes("linkedin")) return "linkedin-scan";
  if (normalized.includes("builtin")) return "builtin-scan";
  if (normalized.includes("indeed")) return "indeed-scan";
  return "newgrad-scan";
}

export function sourceFromPipelineTag(tag: string | null | undefined): string {
  if (tag === "linkedin-scan") return LINKEDIN_SCAN_SOURCE;
  if (tag === "builtin-scan") return BUILTIN_SCAN_SOURCE;
  if (tag === "indeed-scan") return INDEED_SCAN_SOURCE;
  return DEFAULT_SCAN_SOURCE;
}
