import type {
  EnrichedRow,
  NewGradScanConfig,
  SponsorshipStatus,
} from "@career-ops/shared";
import { findSkillKeywordMatches } from "./newgrad-skill-match.js";

export interface EnrichedValueScore {
  score: number;
  maxScore: 10;
  threshold: number;
  passed: boolean;
  reasons: string[];
  penalties: string[];
  breakdown: {
    listScore: number;
    siteMatch: number;
    structuredSkills: number;
    seniority: number;
    compensation: number;
    sponsorship: number;
    postingQuality: number;
  };
}

interface SalaryRangeUsd {
  low: number;
  high: number;
}

const SENIORITY_HIGH_TERMS = [
  "senior",
  "staff",
  "principal",
  "lead",
  "manager",
  "director",
  "architect",
  "5+ years",
  "7+ years",
  "10+ years",
];

const SENIORITY_EARLY_TERMS = [
  "entry",
  "entry level",
  "associate",
  "junior",
  "new grad",
  "new graduate",
  "early career",
  "university",
  "graduate",
  "software engineer i",
];

export function scoreEnrichedRowValue(
  row: EnrichedRow,
  config: NewGradScanConfig,
): EnrichedValueScore {
  const reasons: string[] = [];
  const penalties: string[] = [];

  const listScore = scoreListSignal(row);
  const siteMatch = scoreSiteMatch(row, reasons, penalties);
  const structuredSkills = scoreStructuredSkills(row, config, reasons);
  const seniority = scoreSeniority(row, reasons, penalties);
  const compensation = scoreCompensation(row, config, reasons, penalties);
  const sponsorship = scoreSponsorship(row, reasons, penalties);
  const postingQuality = scorePostingQuality(row);

  const rawScore =
    listScore +
    siteMatch +
    structuredSkills +
    seniority +
    compensation +
    sponsorship +
    postingQuality;
  const score = roundScore(clamp(rawScore, 0, 10));
  const threshold = config.detail_value_threshold;

  return {
    score,
    maxScore: 10,
    threshold,
    passed: score >= threshold,
    reasons,
    penalties,
    breakdown: {
      listScore: roundScore(listScore),
      siteMatch: roundScore(siteMatch),
      structuredSkills: roundScore(structuredSkills),
      seniority: roundScore(seniority),
      compensation: roundScore(compensation),
      sponsorship: roundScore(sponsorship),
      postingQuality: roundScore(postingQuality),
    },
  };
}

function scoreListSignal(row: EnrichedRow): number {
  const maxScore = row.row.maxScore > 0 ? row.row.maxScore : 1;
  return clamp((row.row.score / maxScore) * 1.6, 0, 1.6);
}

function scoreSiteMatch(row: EnrichedRow, reasons: string[], penalties: string[]): number {
  const { detail } = row;
  const weightedAverage = weightedSiteAverage(detail);
  if (weightedAverage === null) return 0;

  let score = baseSiteAlignmentScore(weightedAverage);

  if ((detail.matchScore ?? 0) >= 85) reasons.push("strong_match_score");
  if ((detail.expLevelMatch ?? 0) >= 85) reasons.push("strong_experience_match");
  if ((detail.skillMatch ?? 0) >= 85) reasons.push("strong_skill_match");
  if (weightedAverage >= 85) {
    reasons.push("strong_site_alignment");
  }

  const weakOverall = detail.matchScore !== null && detail.matchScore < 75;
  const weakSkill = detail.skillMatch !== null && detail.skillMatch < 75;
  if (weakOverall && weakSkill) {
    penalties.push("site_match_below_bar");
    score -= 1.6;
  } else if (weakOverall || weakSkill) {
    penalties.push("site_signal_mixed");
    score -= 0.8;
  }

  return clamp(score, -1.2, 2.8);
}

function scoreStructuredSkills(
  row: EnrichedRow,
  config: NewGradScanConfig,
  reasons: string[],
): number {
  const matchedSkills = findConfiguredSkillMatches(row, config);
  const count = matchedSkills.length;

  if (count >= 4) {
    reasons.push("strong_structured_skill_match");
    return 2.3;
  }
  if (count >= 2) return 1.4;
  if (count === 1) return 0.7;
  return 0;
}

function scoreSeniority(
  row: EnrichedRow,
  reasons: string[],
  penalties: string[],
): number {
  const seniorityText = normalizeText([
    row.detail.seniorityLevel ?? "",
    row.detail.title,
    row.row.row.title,
    row.detail.recommendationTags.join(" "),
    row.detail.taxonomy.join(" "),
  ].join(" "));

  if (containsAny(seniorityText, SENIORITY_HIGH_TERMS)) {
    penalties.push("seniority_too_high");
    return -3;
  }

  if (containsAny(seniorityText, SENIORITY_EARLY_TERMS) || row.row.row.isNewGrad) {
    reasons.push("early_career_level");
    return 1.4;
  }

  return 0.4;
}

function scoreCompensation(
  row: EnrichedRow,
  config: NewGradScanConfig,
  reasons: string[],
  penalties: string[],
): number {
  const minimum = config.compensation_min_usd;
  const range = parseSalaryRangeUsd(row.detail.salaryRange ?? row.row.row.salary);
  if (minimum <= 0 || !range) return 0.5;

  if (range.high < minimum) {
    penalties.push("salary_below_minimum");
    return -2.5;
  }

  reasons.push("salary_meets_minimum");
  return 1.1;
}

function scoreSponsorship(
  row: EnrichedRow,
  reasons: string[],
  penalties: string[],
): number {
  const support = bestSponsorshipSignal(row);
  if (support === "no") {
    penalties.push("no_sponsorship");
    return -3;
  }
  if (support === "yes") {
    reasons.push("sponsorship_supported");
    return 0.8;
  }
  if (
    row.detail.h1bSponsorLikely ||
    row.row.row.h1bSponsored ||
    row.detail.h1bSponsorshipHistory.some((item) => item.count > 0)
  ) {
    reasons.push("h1b_history_signal");
    return 0.6;
  }
  return 0.2;
}

function scorePostingQuality(row: EnrichedRow): number {
  let score = 0;
  const detailText = normalizeText([
    row.detail.description,
    row.detail.requiredQualifications.join(" "),
    row.detail.responsibilities.join(" "),
  ].join(" "));

  if (detailText.length >= 150) score += 0.4;
  if (row.detail.requiredQualifications.length > 0) score += 0.25;
  if (row.detail.responsibilities.length > 0) score += 0.2;
  if (row.detail.originalPostUrl || row.detail.applyNowUrl) score += 0.15;
  if (row.detail.companyWebsite || row.detail.companyDescription) score += 0.1;

  return clamp(score, 0, 1.1);
}

function findConfiguredSkillMatches(row: EnrichedRow, config: NewGradScanConfig): string[] {
  const text = normalizeText([
    row.row.row.qualifications ?? "",
    row.detail.skillTags.join(" "),
    row.detail.recommendationTags.join(" "),
    row.detail.requiredQualifications.join(" "),
    row.detail.responsibilities.join(" "),
    row.detail.description,
    row.detail.taxonomy.join(" "),
    row.detail.companyCategories.join(" "),
  ].join(" "));

  return findSkillKeywordMatches(text, config.skill_keywords.terms);
}

function bestSponsorshipSignal(row: EnrichedRow): SponsorshipStatus {
  const signals = [
    row.detail.confirmedSponsorshipSupport,
    row.detail.sponsorshipSupport,
    row.row.row.confirmedSponsorshipSupport,
    row.row.row.sponsorshipSupport,
  ];

  if (signals.includes("no")) return "no";
  if (signals.includes("yes")) return "yes";
  return "unknown";
}

function weightedSiteAverage(detail: EnrichedRow["detail"]): number | null {
  const weightedSignals: Array<[number | null, number]> = [
    [detail.matchScore, 0.4],
    [detail.expLevelMatch, 0.25],
    [detail.skillMatch, 0.25],
    [detail.industryExpMatch, 0.1],
  ];

  let weightedSum = 0;
  let totalWeight = 0;
  for (const [value, weight] of weightedSignals) {
    if (value === null || !Number.isFinite(value)) continue;
    weightedSum += value * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

function baseSiteAlignmentScore(weightedAverage: number): number {
  if (weightedAverage >= 90) return 2.8;
  if (weightedAverage >= 85) return 2.4;
  if (weightedAverage >= 80) return 1.9;
  if (weightedAverage >= 75) return 1.3;
  if (weightedAverage >= 70) return 0.5;
  if (weightedAverage >= 65) return -0.3;
  return -1.1;
}

function parseSalaryRangeUsd(value: string | null): SalaryRangeUsd | null {
  if (!value) return null;

  const hourly = /\b(?:\/\s*h(?:ou)?r|per\s+hour|hourly)\b/i.test(value);
  const matches = [
    ...value.matchAll(
      /\$?\s*(\d+(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)\s*([kK])?/g,
    ),
  ];
  const amounts = matches
    .map((match) => {
      const numeric = Number(match[1]!.replace(/,/g, ""));
      if (!Number.isFinite(numeric)) return null;
      const multiplier =
        hourly && numeric < 1_000
          ? 2_080
          : match[2] !== undefined || numeric < 1_000
            ? 1_000
            : 1;
      return Math.round(numeric * multiplier);
    })
    .filter((amount): amount is number => amount !== null && amount > 0);

  if (amounts.length === 0) return null;
  return { low: Math.min(...amounts), high: Math.max(...amounts) };
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => {
    const normalizedTerm = normalizeText(term);
    return normalizedTerm.length > 0 && text.includes(normalizedTerm);
  });
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}
