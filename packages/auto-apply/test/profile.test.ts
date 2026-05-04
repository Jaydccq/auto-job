import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadApplicationData, MissingProfileFieldError, MissingResumeError } from "../src/index.js";

describe("loadApplicationData", () => {
  let dir: string;
  let resumePath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "profile-test-"));
    resumePath = join(dir, "resume.pdf");
    writeFileSync(resumePath, "%PDF-fake\n");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeProfile(content: string): string {
    const path = join(dir, "profile.yml");
    writeFileSync(path, content);
    return path;
  }

  it("loads a complete profile", () => {
    const path = writeProfile(`
name:
  first: Hongxi
  last: Chen
email: x@y.com
phone: "555-1234"
location:
  city: Seattle
  state: WA
links:
  linkedin: https://linkedin.com/in/x
resume_path: ${resumePath}
work_authorization: us_citizen
requires_sponsorship: false
`);
    const data = loadApplicationData({ profilePath: path });
    expect(data.name).toEqual({ first: "Hongxi", last: "Chen" });
    expect(data.email).toBe("x@y.com");
    expect(data.location.city).toBe("Seattle");
    expect(data.location.state).toBe("WA");
    expect(data.links.linkedin).toBe("https://linkedin.com/in/x");
    expect(data.resumePath).toContain("resume.pdf");
    expect(data.requiresSponsorship).toBe(false);
  });

  it("throws MissingProfileFieldError when email missing", () => {
    const path = writeProfile(`
name: { first: A, last: B }
phone: "555"
location: { city: Seattle }
resume_path: ${resumePath}
work_authorization: us_citizen
requires_sponsorship: false
`);
    expect(() => loadApplicationData({ profilePath: path })).toThrow(MissingProfileFieldError);
  });

  it("throws MissingResumeError when resume_path doesn't exist", () => {
    const path = writeProfile(`
name: { first: A, last: B }
email: x@y.com
phone: "555"
location: { city: Seattle }
resume_path: /nonexistent/missing.pdf
work_authorization: us_citizen
requires_sponsorship: false
`);
    expect(() => loadApplicationData({ profilePath: path })).toThrow(MissingResumeError);
  });

  it("throws MissingProfileFieldError when profile file missing", () => {
    expect(() => loadApplicationData({ profilePath: "/nonexistent/profile.yml" })).toThrow(
      MissingProfileFieldError,
    );
  });

  it("throws when work_authorization is invalid value", () => {
    const path = writeProfile(`
name: { first: A, last: B }
email: x@y.com
phone: "555"
location: { city: Seattle }
resume_path: ${resumePath}
work_authorization: alien
requires_sponsorship: false
`);
    expect(() => loadApplicationData({ profilePath: path })).toThrow(MissingProfileFieldError);
  });

  it("optional links omitted produce empty links object", () => {
    const path = writeProfile(`
name: { first: A, last: B }
email: x@y.com
phone: "555"
location: { city: Seattle }
resume_path: ${resumePath}
work_authorization: us_citizen
requires_sponsorship: false
`);
    const data = loadApplicationData({ profilePath: path });
    expect(data.links).toEqual({});
  });
});
