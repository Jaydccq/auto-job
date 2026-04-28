import { afterEach, describe, expect, test } from "vitest";

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadEvaluatedJobIdentities } from "./evaluated-report-urls.js";
import { createJobIdentity } from "./job-identity.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("scanner lifecycle identity contract", () => {
  test("normalizes candidate identity consistently across source providers", () => {
    const fixtures = [
      {
        source: "newgrad/jobright",
        url: "https://jobright.ai/jobs/info/69eafe537820c036924f09a6?utm_source=1100&utm_campaign=Software%20Engineering",
        company: "Vizient, Inc.",
        role: "Associate Software Engineer",
        canonicalUrl: "https://jobright.ai/jobs/info/69eafe537820c036924f09a6",
        companyRoleKey: "vizient|associate software engineer",
        sourceJobId: "69eafe537820c036924f09a6",
      },
      {
        source: "linkedin-scan",
        url: "https://www.linkedin.com/jobs/view/4347121472/",
        company: "F. Schumacher & Co.",
        role: "Software Engineer I / Full-Stack",
        canonicalUrl: "https://www.linkedin.com/jobs/view/4347121472",
        companyRoleKey: "f schumacher|software engineer i full stack",
        sourceJobId: "4347121472",
      },
      {
        source: "builtin-scan",
        url: "https://builtin.com/job/software-engineer/111?utm_source=scan",
        company: "Built In Test LLC",
        role: "Full Stack Engineer",
        canonicalUrl: "https://builtin.com/job/software-engineer/111",
        companyRoleKey: "built in test|full stack engineer",
        sourceJobId: "software-engineer",
      },
      {
        source: "indeed-scan",
        url: "https://www.indeed.com/viewjob?jk=abc123&utm_source=x",
        company: "Indeed Example Corp.",
        role: "Junior Backend Developer",
        canonicalUrl: "https://www.indeed.com/viewjob?jk=abc123",
        companyRoleKey: "indeed example|junior backend developer",
        sourceJobId: "abc123",
      },
    ];

    for (const fixture of fixtures) {
      const identity = createJobIdentity(fixture);
      expect(identity).toMatchObject({
        canonicalUrl: fixture.canonicalUrl,
        companyRoleKey: fixture.companyRoleKey,
        sourceJobId: fixture.sourceJobId,
        stableKey: fixture.canonicalUrl,
      });
    }
  });

  test("derives duplicate identities from existing reports before merge", () => {
    const repoRoot = makeRepoRoot();
    writeFileSync(
      join(repoRoot, "reports", "001-acme-2026-04-27.md"),
      [
        "# Evaluation: Acme, Inc. - Software Engineer I",
        "",
        "**Date:** 2026-04-27",
        "**Archetype:** Software Engineer",
        "**Score:** 4.1/5",
        "**URL:** https://jobs.example.com/role/123?utm_source=linkedin",
      ].join("\n"),
      "utf-8",
    );

    const identities = loadEvaluatedJobIdentities(repoRoot);

    expect(identities.urls.has("https://jobs.example.com/role/123")).toBe(true);
    expect(identities.companyRoles.has("acme|software engineer i")).toBe(true);
  });
});

function makeRepoRoot(): string {
  const repoRoot = mkdtempSync(join(tmpdir(), "auto-job-scanner-lifecycle-"));
  tempDirs.push(repoRoot);
  mkdirSync(join(repoRoot, "reports"), { recursive: true });
  return repoRoot;
}
