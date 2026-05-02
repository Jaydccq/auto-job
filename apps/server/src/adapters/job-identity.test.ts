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
// eslint-disable-next-line import/no-relative-packages
import * as runtime from "../../../../lib/job-identity-runtime/index.mjs";

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

  // Parity guard against lib/job-identity-runtime/index.mjs.
  // The .mjs mirror is consumed by scan.mjs, merge-tracker.mjs, and
  // hourly-job-scan.mjs because they cannot import .ts directly. Any
  // drift between the two implementations breaks dedup invariants
  // across the scanner / merge / dashboard surfaces.
  test("runtime mirror produces identical identities to the canonical TS", () => {
    const fixtures = [
      {
        url: "https://boards.greenhouse.io/embed/job_app?token=7786397&utm_source=jobright#apply",
        company: "Vizient, Inc.",
        role: "Software Engineer I",
      },
      {
        url: "https://www.linkedin.com/jobs/view/4347121472/?utm_source=foo",
        company: "F. Schumacher & Co.",
        role: "Senior Engineer",
      },
      {
        url: "https://jobright.ai/jobs/info/69eafe537820c036924f09a6",
        company: "Café Inc.",
        role: "Sénior Engineer",
      },
      {
        company: "Acme Corporation",
        role: "Backend Engineer",
        source: "linkedin-scan",
        sourceJobId: "4347121472",
      },
      {
        company: "Plain Co",
        role: "Software Engineer",
      },
      {
        url: "",
        company: "",
        role: "",
        content: "Build APIs with Python.\n\n",
      },
      {
        url: "https://example.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/REQ12345/?keyword=engineer",
        company: "Oracle",
        role: "Cloud Engineer",
      },
    ];

    for (const fixture of fixtures) {
      const ts = createJobIdentity(fixture);
      const js = runtime.createJobIdentity(fixture);
      expect(js).toEqual(ts);
    }

    expect(runtime.normalizeJobUrl("https://example.com/jobs/abc?utm_source=x")).toBe(
      normalizeJobUrl("https://example.com/jobs/abc?utm_source=x"),
    );
    expect(runtime.jobCompanyRoleKey("Acme, Inc.", "Software Engineer")).toBe(
      jobCompanyRoleKey("Acme, Inc.", "Software Engineer"),
    );
    expect(runtime.extractSourceJobId("https://www.indeed.com/viewjob?jk=abc123")).toBe(
      extractSourceJobId("https://www.indeed.com/viewjob?jk=abc123"),
    );
    expect(runtime.hashJobContent("Build APIs.\n\n")).toBe(hashJobContent("Build APIs."));
  });
});
