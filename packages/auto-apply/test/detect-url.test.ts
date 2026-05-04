import { describe, expect, it } from "vitest";

import {
  ashbyApplyFlow,
  greenhouseApplyFlow,
  leverApplyFlow,
  workdayApplyFlow,
} from "../src/index.js";

describe("ApplyFlow.detectsUrl per ATS", () => {
  describe("greenhouse", () => {
    it("matches boards.greenhouse.io with /jobs/<id>", () => {
      expect(
        greenhouseApplyFlow.detectsUrl("https://boards.greenhouse.io/stripe/jobs/4567890"),
      ).toBe(true);
    });
    it("rejects greenhouse.io homepage (no /jobs/<id>)", () => {
      expect(greenhouseApplyFlow.detectsUrl("https://greenhouse.io/")).toBe(false);
    });
    it("rejects unrelated hostnames", () => {
      expect(greenhouseApplyFlow.detectsUrl("https://www.linkedin.com/jobs/view/123")).toBe(false);
    });
    it("rejects malformed URLs", () => {
      expect(greenhouseApplyFlow.detectsUrl("not a url")).toBe(false);
    });
  });

  describe("lever", () => {
    it("matches jobs.lever.co", () => {
      expect(leverApplyFlow.detectsUrl("https://jobs.lever.co/netflix/abc-def/apply")).toBe(true);
    });
    it("rejects unrelated", () => {
      expect(leverApplyFlow.detectsUrl("https://greenhouse.io/")).toBe(false);
    });
  });

  describe("ashby", () => {
    it("matches jobs.ashbyhq.com", () => {
      expect(ashbyApplyFlow.detectsUrl("https://jobs.ashbyhq.com/anthropic/abc123")).toBe(true);
    });
    it("rejects ashby docs subdomain", () => {
      expect(ashbyApplyFlow.detectsUrl("https://www.ashbyhq.com/")).toBe(false);
    });
  });

  describe("workday", () => {
    it("matches Workday tenant URLs", () => {
      expect(
        workdayApplyFlow.detectsUrl(
          "https://amazon.wd5.myworkdayjobs.com/External_Career_Site/job/Seattle/SWE",
        ),
      ).toBe(true);
    });
    it("rejects non-Workday", () => {
      expect(workdayApplyFlow.detectsUrl("https://jobs.lever.co/x/y")).toBe(false);
    });
  });
});
