import { describe, expect, test } from "vitest";

import {
  buildLinkedInSearchPageUrls,
  canonicalLinkedInJobViewUrl,
  detectLinkedInAuthBlock,
  extractLinkedInJobId,
  isLinkedInJobsUrl,
  normalizeLinkedInPostedAgo,
  parseLinkedInVisibleJobCardText,
  parseLinkedInWorkModel,
} from "./linkedin-scan-normalizer.js";

describe("linkedin-scan-normalizer", () => {
  test("extracts job ids from LinkedIn job view and search-result URLs", () => {
    expect(extractLinkedInJobId("https://www.linkedin.com/jobs/view/4347121472/")).toBe("4347121472");
    expect(extractLinkedInJobId("https://www.linkedin.com/jobs/search-results/?currentJobId=4404203123&f_TPR=r86400")).toBe("4404203123");
    expect(extractLinkedInJobId("/jobs/view/111222333/?refId=abc")).toBe("111222333");
  });

  test("canonicalizes LinkedIn job URLs to job-view pages", () => {
    expect(
      canonicalLinkedInJobViewUrl("https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&f_TPR=r86400"),
    ).toBe("https://www.linkedin.com/jobs/view/4347121472/");
    expect(canonicalLinkedInJobViewUrl("https://www.linkedin.com/company/openai/")).toBeNull();
  });

  test("identifies only LinkedIn job URLs", () => {
    expect(isLinkedInJobsUrl("https://www.linkedin.com/jobs/view/4347121472/")).toBe(true);
    expect(isLinkedInJobsUrl("https://linkedin.com/jobs/search-results/?currentJobId=4347121472")).toBe(true);
    expect(isLinkedInJobsUrl("https://www.linkedin.com/in/williamhgates")).toBe(false);
  });

  test("builds safe LinkedIn search page URLs with start offsets", () => {
    expect(
      buildLinkedInSearchPageUrls(
        "https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&keywords=software&f_TPR=r86400",
        3,
        25,
      ),
    ).toEqual([
      "https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&keywords=software&f_TPR=r86400",
      "https://www.linkedin.com/jobs/search-results/?keywords=software&f_TPR=r86400&start=25",
      "https://www.linkedin.com/jobs/search-results/?keywords=software&f_TPR=r86400&start=50",
    ]);
  });

  test("normalizes reposted LinkedIn age strings", () => {
    expect(normalizeLinkedInPostedAgo("Reposted 2 hours ago")).toBe("2 hours ago");
    expect(normalizeLinkedInPostedAgo("Posted an hour ago")).toBe("1 hour ago");
    expect(normalizeLinkedInPostedAgo("Just now")).toBe("today");
    expect(normalizeLinkedInPostedAgo("Actively recruiting")).toBe("unknown");
  });

  test("parses LinkedIn work model text", () => {
    expect(parseLinkedInWorkModel("United States (Remote)")).toBe("Remote");
    expect(parseLinkedInWorkModel("San Francisco, CA (Hybrid)")).toBe("Hybrid");
    expect(parseLinkedInWorkModel("Austin, TX (On-site)")).toBe("On-site");
    expect(parseLinkedInWorkModel("New York, NY")).toBe("");
  });

  test("parses visible LinkedIn result button text", () => {
    expect(parseLinkedInVisibleJobCardText(`AI Technical Internship

Amida Technology Solutions

Richmond, VA

Be an early applicant

\u00b7

Posted 17 hours ago
17 hours ago`)).toEqual({
      title: "AI Technical Internship",
      company: "Amida Technology Solutions",
      location: "Richmond, VA",
      postedAgo: "17 hours ago",
      workModel: "",
      text: [
        "AI Technical Internship",
        "Amida Technology Solutions",
        "Richmond, VA",
        "Be an early applicant",
        "\u00b7",
        "Posted 17 hours ago",
        "17 hours ago",
      ].join("\n"),
    });

    expect(parseLinkedInVisibleJobCardText(`Senior Data Engineer

EAB

Richmond, VA (Hybrid)

Medical, Vision, 401(k), +1 benefit

48 school alumni work here

Be an early applicant

Posted 16 hours ago`)).toMatchObject({
      title: "Senior Data Engineer",
      company: "EAB",
      location: "Richmond, VA (Hybrid)",
      postedAgo: "16 hours ago",
      workModel: "Hybrid",
    });

    expect(parseLinkedInVisibleJobCardText(`Software Engineer

Software Engineer with verification

Folia Health: The Home-Reported Outcomes Company

Boston, MA (On-site)

Viewed

Promoted

27 minutes ago`)).toMatchObject({
      title: "Software Engineer",
      company: "Folia Health: The Home-Reported Outcomes Company",
      location: "Boston, MA (On-site)",
      postedAgo: "27 minutes ago",
      workModel: "On-site",
    });
  });

  test("rejects non-job LinkedIn buttons", () => {
    expect(parseLinkedInVisibleJobCardText("Past 24 hours")).toBeNull();
    expect(parseLinkedInVisibleJobCardText("Remote")).toBeNull();
    expect(parseLinkedInVisibleJobCardText("Try Premium for $0")).toBeNull();
    expect(parseLinkedInVisibleJobCardText(`Skip to main content

0 notifications

United States

Posted 9 hours ago`)).toBeNull();
  });

  test("detects LinkedIn login and checkpoint states", () => {
    expect(detectLinkedInAuthBlock({
      url: "https://www.linkedin.com/login",
      title: "LinkedIn Login, Sign in",
      text: "Sign in to view jobs",
    })).toBe("login");
    expect(detectLinkedInAuthBlock({
      url: "https://www.linkedin.com/checkpoint/challenge",
      title: "Security Verification",
      text: "Let's do a quick security check",
    })).toBe("checkpoint");
    expect(detectLinkedInAuthBlock({
      url: "https://www.linkedin.com/jobs/search-results/?currentJobId=1",
      title: "LinkedIn Jobs",
      text: "Software Engineer jobs",
    })).toBeNull();
  });
});
