import { describe, expect, test } from "vitest";

import {
  createJobIdentity,
  extractSourceJobId,
  hashJobContent,
  jobCompanyRoleKey,
  normalizeJobCompany,
  normalizeJobRole,
  normalizeJobUrl,
} from "./job-identity.js";

describe("job identity", () => {
  test("normalizes job URLs without dropping stable ATS identifiers", () => {
    expect(
      normalizeJobUrl(
        "https://boards.greenhouse.io/embed/job_app?token=7786397&utm_source=jobright#apply",
      ),
    ).toBe("https://boards.greenhouse.io/embed/job_app?token=7786397");
  });

  test("normalizes company and role keys across punctuation and legal suffixes", () => {
    expect(normalizeJobCompany("Vizient, Inc.")).toBe("vizient");
    expect(normalizeJobCompany("F. Schumacher & Co.")).toBe("f schumacher");
    expect(normalizeJobRole("Software Engineer I / Full-Stack")).toBe(
      "software engineer i full stack",
    );
    expect(jobCompanyRoleKey("Acme, Inc.", "Software Engineer")).toBe(
      "acme|software engineer",
    );
  });

  test("extracts source job ids for common sources", () => {
    expect(extractSourceJobId("https://www.linkedin.com/jobs/view/4347121472/")).toBe(
      "4347121472",
    );
    expect(extractSourceJobId("https://jobright.ai/jobs/info/69eafe537820c036924f09a6")).toBe(
      "69eafe537820c036924f09a6",
    );
    expect(extractSourceJobId("https://www.indeed.com/viewjob?jk=abc123&utm_source=x")).toBe(
      "abc123",
    );
  });

  test("hashes normalized JD content consistently", () => {
    expect(hashJobContent("Build APIs with Python.\n\n")).toBe(
      hashJobContent("build APIs with Python"),
    );
  });

  test("creates a stable identity with URL priority and fallbacks", () => {
    expect(
      createJobIdentity({
        url: "https://jobs.example.com/role/123?utm_source=scan",
        company: "Example Inc.",
        role: "Software Engineer",
      }),
    ).toMatchObject({
      canonicalUrl: "https://jobs.example.com/role/123",
      companyRoleKey: "example|software engineer",
      stableKey: "https://jobs.example.com/role/123",
    });

    expect(
      createJobIdentity({
        source: "linkedin-scan",
        sourceJobId: "4347121472",
      }).stableKey,
    ).toBe("linkedin-scan:4347121472");

    expect(
      createJobIdentity({
        company: "Example Inc.",
        role: "Software Engineer",
      }).stableKey,
    ).toBe("example|software engineer");
  });
});
