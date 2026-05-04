import { describe, expect, it } from "vitest";

import {
  AdapterParseError,
  ChromeNotFoundError,
  NotAuthenticatedError,
  ProfileLockedError,
  TabClosedError,
} from "../src/errors.js";

describe("errors", () => {
  it("ChromeNotFoundError carries default install hint", () => {
    const e = new ChromeNotFoundError();
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("ChromeNotFoundError");
    expect(e.message).toMatch(/install/i);
  });

  it("ProfileLockedError carries profile path and optional pid", () => {
    const e = new ProfileLockedError("/tmp/profile", 4321);
    expect(e.name).toBe("ProfileLockedError");
    expect(e.profileDir).toBe("/tmp/profile");
    expect(e.conflictPid).toBe(4321);
    expect(e.message).toContain("/tmp/profile");
    expect(e.message).toContain("4321");
  });

  it("ProfileLockedError without pid still informs the user", () => {
    const e = new ProfileLockedError("/tmp/profile");
    expect(e.conflictPid).toBeUndefined();
    expect(e.message).toContain("/tmp/profile");
  });

  it("NotAuthenticatedError exposes site for branchable handling", () => {
    const e = new NotAuthenticatedError("linkedin", "https://www.linkedin.com/login");
    expect(e.name).toBe("NotAuthenticatedError");
    expect(e.site).toBe("linkedin");
    expect(e.loginUrl).toBe("https://www.linkedin.com/login");
    expect(e.message).toContain("linkedin");
    expect(e.message).toContain("login");
  });

  it("TabClosedError is a distinct class consumers can catch", () => {
    const e = new TabClosedError();
    expect(e.name).toBe("TabClosedError");
    expect(e).toBeInstanceOf(Error);
  });

  it("AdapterParseError truncates raw payload to 200 chars", () => {
    const huge = "x".repeat(5000);
    const e = new AdapterParseError("schema mismatch", huge);
    expect(e.name).toBe("AdapterParseError");
    expect(e.rawSnippet).toBe(huge);
    expect(e.message).toContain("schema mismatch");
    expect(e.message.length).toBeLessThan(huge.length);
    expect(e.message).toMatch(/raw\[0\.\.200\]/);
  });
});
