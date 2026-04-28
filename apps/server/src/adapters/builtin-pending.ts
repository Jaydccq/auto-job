import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type {
  BuiltInPendingEntry,
  BuiltInPendingResult,
  NewGradScanConfig,
} from "@career-ops/shared";
import { detectActiveSecurityClearanceRequirement } from "../lib/security-clearance.js";
import { loadEvaluatedJobIdentities } from "./evaluated-report-urls.js";
import { jobCompanyRoleKey, normalizeJobUrl } from "./job-identity.js";
import { parsePendingValueReasons } from "./newgrad-pipeline-metadata.js";
import {
  loadNegativeKeywords,
  loadNewGradScanConfig,
  loadTrackedCompanyRoles,
} from "./newgrad-config.js";

const LEGACY_BUILTIN_LINE_RE =
  /^-\s+\[\s\]\s+(?<url>https?:\/\/(?:www\.)?builtin\.com\/job\/[^|\s]+)\s+\|\s+(?<company>[^|]+?)\s+\|\s+(?<role>.+?)\s*$/;

const RICH_BUILTIN_LINE_RE =
  /^-\s+\[\s\]\s+(?<url>https?:\/\/(?:www\.)?builtin\.com\/job\/\S+)\s+—\s+(?<company>.+?)\s+\|\s+(?<role>.+?)\s+\(via builtin-scan, score:\s*(?<score>[0-9.]+)\/[0-9.]+(?:,\s+value:\s*(?<valueScore>[0-9.]+)\/10)?\)(?:\s+\[value-reasons:(?<valueReasons>[^\]]+)\])?/;

interface ParsedBuiltInPendingLine {
  url: string;
  company: string;
  role: string;
  score?: number;
  valueScore?: number;
  valueReasons?: readonly string[];
}

export function readBuiltInPendingEntries(
  repoRoot: string,
  limit: number,
): BuiltInPendingResult {
  const pipelinePath = join(repoRoot, "data/pipeline.md");
  if (!existsSync(pipelinePath)) {
    return { entries: [], total: 0 };
  }

  const tracked = loadTrackedCompanyRoles(repoRoot);
  const negativeKeywords = loadNegativeKeywords(repoRoot);
  const scanConfig = loadNewGradScanConfig(repoRoot);
  const evaluatedReportIdentities = loadEvaluatedJobIdentities(repoRoot);
  const seenUrls = new Set<string>();
  const seenCompanyRoles = new Set<string>();
  const entries: BuiltInPendingEntry[] = [];
  const lines = readFileSync(pipelinePath, "utf-8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const parsed = parseBuiltInPendingLine(lines[index] ?? "");
    if (!parsed) continue;

    const { url, company, role } = parsed;
    const companyRoleKey = pendingCompanyRoleKey(company, role);
    if (tracked.has(companyRoleKey)) continue;
    if (matchesNegativeKeyword(role, negativeKeywords)) continue;
    if (isBlockedCompany(company, scanConfig)) continue;
    if (matchesHardFilterPhrase(role, scanConfig)) continue;

    if (seenCompanyRoles.has(companyRoleKey)) continue;

    const canonicalUrl = normalizeJobUrl(url);
    if (
      seenUrls.has(canonicalUrl) ||
      evaluatedReportIdentities.urls.has(canonicalUrl) ||
      evaluatedReportIdentities.companyRoles.has(companyRoleKey)
    ) {
      continue;
    }

    seenUrls.add(canonicalUrl);
    seenCompanyRoles.add(companyRoleKey);

    entries.push({
      url,
      company,
      role,
      source: "builtin.com",
      lineNumber: index + 1,
      ...(parsed.score === undefined ? {} : { score: parsed.score }),
      ...(parsed.valueScore === undefined ? {} : { valueScore: parsed.valueScore }),
      ...(parsed.valueReasons ? { valueReasons: parsed.valueReasons } : {}),
    });
  }

  return {
    entries: entries.slice(0, Math.max(0, limit)),
    total: entries.length,
  };
}

function parseBuiltInPendingLine(line: string): ParsedBuiltInPendingLine | null {
  const rich = RICH_BUILTIN_LINE_RE.exec(line);
  if (rich?.groups) {
    const url = rich.groups.url?.trim();
    const company = rich.groups.company?.trim();
    const role = rich.groups.role?.trim();
    const score = Number(rich.groups.score ?? "");
    if (!url || !company || !role || !Number.isFinite(score)) return null;

    const valueReasons = parsePendingValueReasons(rich.groups.valueReasons);
    return {
      url,
      company,
      role,
      score,
      ...(rich.groups.valueScore ? { valueScore: Number(rich.groups.valueScore) } : {}),
      ...(valueReasons ? { valueReasons } : {}),
    };
  }

  const legacy = LEGACY_BUILTIN_LINE_RE.exec(line);
  if (!legacy?.groups) return null;

  const url = legacy.groups.url?.trim();
  const company = legacy.groups.company?.trim();
  const role = legacy.groups.role?.trim();
  if (!url || !company || !role) return null;

  return {
    url,
    company,
    role,
  };
}

function pendingCompanyRoleKey(company: string, role: string): string {
  return jobCompanyRoleKey(company, role);
}

function isBlockedCompany(company: string, config: NewGradScanConfig): boolean {
  const normalizedCompany = normalizeSearchText(company);
  if (!normalizedCompany) return false;

  if (
    config.hard_filters.blocked_companies.some(
      (blockedCompany) => normalizeSearchText(blockedCompany) === normalizedCompany,
    )
  ) {
    return true;
  }

  if (
    config.hard_filters.exclude_no_sponsorship &&
    config.hard_filters.no_sponsorship_companies.some(
      (blockedCompany) => normalizeSearchText(blockedCompany) === normalizedCompany,
    )
  ) {
    return true;
  }

  return (
    config.hard_filters.exclude_active_security_clearance &&
    config.hard_filters.active_security_clearance_companies.some(
      (blockedCompany) => normalizeSearchText(blockedCompany) === normalizedCompany,
    )
  );
}

function matchesHardFilterPhrase(role: string, config: NewGradScanConfig): boolean {
  if (
    config.hard_filters.exclude_no_sponsorship &&
    textContainsPhrase(role, config.hard_filters.no_sponsorship_keywords)
  ) {
    return true;
  }

  return (
    config.hard_filters.exclude_active_security_clearance &&
    detectActiveSecurityClearanceRequirement(
      role,
      config.hard_filters.clearance_keywords,
    )
  );
}

function textContainsPhrase(text: string, phrases: readonly string[]): boolean {
  const normalizedText = normalizeSearchText(text);
  return phrases.some((phrase) => {
    const normalizedPhrase = normalizeSearchText(phrase);
    return normalizedPhrase.length > 0 && normalizedText.includes(normalizedPhrase);
  });
}

function matchesNegativeKeyword(role: string, negativeKeywords: readonly string[]): boolean {
  const normalizedRole = normalizeSearchText(role);
  return negativeKeywords.some((keyword) => {
    const normalizedKeyword = normalizeSearchText(keyword);
    return normalizedKeyword.length > 0 && normalizedRole.includes(normalizedKeyword);
  });
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
