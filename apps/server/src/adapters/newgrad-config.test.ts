import { afterEach, describe, expect, test } from "vitest";

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadNegativeKeywords,
  loadNewGradScanConfig,
  loadTrackedCompanyRoles,
  persistBlockedCompanies,
} from "./newgrad-config.js";

import type { FilteredRow, NewGradRow } from "@career-ops/shared";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("newgrad-config", () => {
  test("loadNewGradScanConfig merges manual and remembered company blocklists", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "newgrad_scan:",
        "  hard_filters:",
        "    blocked_companies:",
        '      - "TikTok"',
        "    no_sponsorship_companies:",
        '      - "Momentic"',
        "    active_security_clearance_companies:",
        '      - "Booz Allen Hamilton"',
        "",
      ].join("\n"),
      "utf-8",
    );
    writeFileSync(
      join(repoRoot, "data/newgrad-company-memory.yml"),
      [
        "no_sponsorship_companies:",
        '  - "RemoteHunter"',
        "",
        "active_security_clearance_companies:",
        '  - "Shield AI"',
        "",
      ].join("\n"),
      "utf-8",
    );

    const config = loadNewGradScanConfig(repoRoot);

    expect(config.hard_filters.blocked_companies).toEqual(["TikTok"]);
    expect(config.hard_filters.no_sponsorship_companies).toEqual([
      "Momentic",
      "RemoteHunter",
    ]);
    expect(config.hard_filters.active_security_clearance_companies).toEqual([
      "Booz Allen Hamilton",
      "Shield AI",
    ]);
  });

  test("loadNewGradScanConfig reads max_years_experience from profile", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "newgrad_scan:",
        "  hard_filters:",
        "    max_years_experience: 2",
        "",
      ].join("\n"),
      "utf-8",
    );

    const config = loadNewGradScanConfig(repoRoot);

    expect(config.hard_filters.max_years_experience).toBe(2);
  });

  test("loadNewGradScanConfig merges sponsorship keyword file into hard filters", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "config/sponsorship-keywords.yml"),
      [
        "positive_keywords:",
        '  - "open to sponsoring"',
        "negative_keywords:",
        '  - "not eligible for sponsorship"',
        "government_blockers:",
        '  - "public trust clearance"',
        "authorization_blockers:",
        '  - "green card holder"',
        "",
      ].join("\n"),
      "utf-8",
    );

    const config = loadNewGradScanConfig(repoRoot);

    expect(config.hard_filters.sponsorship_positive_keywords).toEqual(
      expect.arrayContaining(["open to sponsoring"]),
    );
    expect(config.hard_filters.no_sponsorship_keywords).toEqual(
      expect.arrayContaining([
        "not eligible for sponsorship",
        "green card holder",
      ]),
    );
    expect(config.hard_filters.clearance_keywords).toEqual(
      expect.arrayContaining(["public trust clearance"]),
    );
  });

  test("loadNewGradScanConfig reads detail value and compensation thresholds", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "config/profile.yml"),
      [
        "compensation:",
        '  minimum: "$125K"',
        "",
        "newgrad_scan:",
        "  detail_value_threshold: 7.5",
        "",
      ].join("\n"),
      "utf-8",
    );

    const config = loadNewGradScanConfig(repoRoot);

    expect(config.detail_value_threshold).toBe(7.5);
    expect(config.compensation_min_usd).toBe(125_000);
  });

  test("loadNegativeKeywords reads commented title filter arrays", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "portals.yml"),
      [
        "title_filter:",
        "  positive:",
        '    - "Software Engineer"',
        "  negative:",
        "    # Exclude poor-fit roles before LLM evaluation.",
        '    - "PhD"',
        '    - "Top Secret"',
        "",
      ].join("\n"),
      "utf-8",
    );

    expect(loadNegativeKeywords(repoRoot)).toEqual(["PhD", "Top Secret"]);
  });

  test("loadTrackedCompanyRoles uses normalized job identity keys", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "data/applications.md"),
      [
        "# Applications Tracker",
        "",
        "| # | Date | Company | Role | Score | Status | PDF | Report | Notes |",
        "|---|------|---------|------|-------|--------|-----|--------|-------|",
        "| 1 | 2026-04-24 | Acme, Inc. | Software Engineer I / Full-Stack | 4.0/5 | Evaluated | ❌ | [001](reports/001.md) | done |",
      ].join("\n"),
      "utf-8",
    );

    const tracked = loadTrackedCompanyRoles(repoRoot);

    expect(tracked.has("acme|software engineer i full stack")).toBe(true);
  });

  test("persistBlockedCompanies writes deduped company memory", () => {
    const repoRoot = makeRepoRoot();

    persistBlockedCompanies(repoRoot, [
      makeFilteredRow("no_sponsorship", "Momentic", {
        confirmedSponsorshipSupport: "no",
      }),
      makeFilteredRow("no_sponsorship", "momentic"),
      makeFilteredRow("active_clearance_required", "Booz Allen Hamilton", {
        confirmedRequiresActiveSecurityClearance: true,
      }),
    ]);

    const content = readFileSync(
      join(repoRoot, "data/newgrad-company-memory.yml"),
      "utf-8",
    );

    expect(content).toContain('"Momentic"');
    expect(content).toContain('"Booz Allen Hamilton"');
    expect(content.match(/Momentic/g)).toHaveLength(1);
  });
});

function makeRepoRoot(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "career-ops-newgrad-config-"));
  tempDirs.push(repoRoot);
  mkdirSync(join(repoRoot, "config"), { recursive: true });
  mkdirSync(join(repoRoot, "data"), { recursive: true });
  return repoRoot;
}

function makeFilteredRow(
  reason: FilteredRow["reason"],
  company: string,
  overrides?: Partial<NewGradRow>,
): FilteredRow {
  return {
    row: makeRow({ company, ...overrides }),
    reason,
  };
}

function makeRow(overrides?: Partial<NewGradRow>): NewGradRow {
  const base: NewGradRow = {
    position: 1,
    title: "Software Engineer",
    postedAgo: "2 hours ago",
    applyUrl: "https://example.com/apply",
    detailUrl: "https://newgrad-jobs.com/detail/1",
    workModel: "Remote",
    location: "San Francisco, CA",
    company: "Acme Corp",
    salary: "$120k - $150k",
    companySize: "51-200",
    industry: "Software Development",
    qualifications: "Experience with TypeScript, React, and Node.js",
    h1bSponsored: false,
    sponsorshipSupport: "unknown",
    confirmedSponsorshipSupport: "unknown",
    requiresActiveSecurityClearance: false,
    confirmedRequiresActiveSecurityClearance: false,
    isNewGrad: true,
  };
  return { ...base, ...overrides };
}
