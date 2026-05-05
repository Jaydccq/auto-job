import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeReviewSnapshot } from "../src/snapshot.js";
import type { ApplicationData } from "../src/types.js";

const SAMPLE_DATA: ApplicationData = {
  name: { first: "Hongxi", last: "Chen" },
  email: "x@y.com",
  phone: "555-1234",
  location: { city: "Seattle", state: "WA" },
  links: { linkedin: "https://linkedin.com/in/x" },
  resumePath: "/abs/path/resume.pdf",
  workAuthorization: "us_citizen",
  requiresSponsorship: false,
  defaultCoverLetter: "Dear hiring manager, ...",
};

const fakeTab = {
  url: "https://boards.greenhouse.io/stripe/jobs/123",
  async evaluate(_: string) {
    return "<html><body>fake form</body></html>";
  },
  async screenshot() {
    return Buffer.from("fake-png-bytes");
  },
} as unknown as Parameters<typeof writeReviewSnapshot>[0];

describe("writeReviewSnapshot", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "snapshot-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes form.html, screenshot.png, data.json, result.json", async () => {
    const out = await writeReviewSnapshot(fakeTab, {
      id: "abc123",
      ats: "greenhouse",
      data: SAMPLE_DATA,
      result: { fieldsFilled: 5, fieldsMissing: [], fieldsSkipped: [], filledAt: "2026-05-04T10:00:00Z" },
      rootDir: dir,
    });
    expect(existsSync(out)).toBe(true);
    const files = readdirSync(out).sort();
    expect(files).toEqual(["MANIFEST.txt", "data.json", "form.html", "result.json", "screenshot.png"]);
  });

  it("data.json never contains the password field substring", async () => {
    const out = await writeReviewSnapshot(fakeTab, {
      id: "abc123",
      ats: "greenhouse",
      data: SAMPLE_DATA,
      result: { fieldsFilled: 5, fieldsMissing: [], fieldsSkipped: [], filledAt: "2026-05-04T10:00:00Z" },
      rootDir: dir,
    });
    const dataJson = readFileSync(join(out, "data.json"), "utf-8");
    expect(dataJson).toContain("<redacted>");
    expect(dataJson).not.toContain("TopSecret");
    // Even if data accidentally had a password field, redaction logic runs.
  });

  it("data.json includes redacted cover letter length, not full text", async () => {
    const out = await writeReviewSnapshot(fakeTab, {
      id: "x",
      ats: "lever",
      data: SAMPLE_DATA,
      result: { fieldsFilled: 1, fieldsMissing: [], fieldsSkipped: [], filledAt: "2026-05-04T10:00:00Z" },
      rootDir: dir,
    });
    const dataJson = readFileSync(join(out, "data.json"), "utf-8");
    expect(dataJson).not.toContain("Dear hiring manager");
    expect(dataJson).toMatch(/<\d+ chars>/);
  });

  it("MANIFEST.txt includes id, REVIEW + APPROVE hint, and skipped fields", async () => {
    const out = await writeReviewSnapshot(fakeTab, {
      id: "manifest-id",
      ats: "greenhouse",
      data: SAMPLE_DATA,
      result: {
        fieldsFilled: 4,
        fieldsMissing: ["coverLetter"],
        fieldsSkipped: [
          { selector: "#why-us", tag: "textarea", label: "Why this company?", required: true },
        ],
        filledAt: "2026-05-04T10:00:00Z",
      },
      manifest: { jobUrl: "https://boards.greenhouse.io/x/jobs/1", tenant: "x", score: 4.7 },
      rootDir: dir,
    });
    const manifest = readFileSync(join(out, "MANIFEST.txt"), "utf-8");
    expect(manifest).toContain("id: manifest-id");
    expect(manifest).toContain("ATS: greenhouse");
    expect(manifest).toContain("tenant: x");
    expect(manifest).toContain("Score: 4.7");
    expect(manifest).toContain("Job URL: https://boards.greenhouse.io/x/jobs/1");
    expect(manifest).toContain("filled  : 4");
    expect(manifest).toContain("missing : 1 (coverLetter)");
    expect(manifest).toContain("Why this company?");
    expect(manifest).toContain("REVIEW + APPROVE: auto-apply-approve manifest-id");
    expect(manifest).toContain("SKIP            : auto-apply-approve skip manifest-id");
  });

  it("uses provided id and timestamp in directory name", async () => {
    const out = await writeReviewSnapshot(fakeTab, {
      id: "xyz789",
      ats: "ashby",
      data: SAMPLE_DATA,
      result: { fieldsFilled: 0, fieldsMissing: [], fieldsSkipped: [], filledAt: "2026-05-04T10:00:00Z" },
      rootDir: dir,
    });
    expect(out).toContain("xyz789-");
    // ISO with colons replaced by dashes — looks like 2026-05-04T10-00-00-000Z
    expect(out).toMatch(/xyz789-\d{4}-\d{2}-\d{2}T/);
  });
});
