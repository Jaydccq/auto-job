import { describe, expect, it } from "vitest";

import { STEALTH_INIT_SCRIPT } from "../src/stealth.js";

describe("stealth init script", () => {
  it("is a syntactically valid IIFE", () => {
    expect(() => new Function(STEALTH_INIT_SCRIPT)).not.toThrow();
  });

  it("targets navigator.webdriver", () => {
    // The patch must reference webdriver — a regression that drops this
    // patch silently would re-expose the #1 bot signal.
    expect(STEALTH_INIT_SCRIPT).toContain("webdriver");
  });

  it("does NOT fake chrome.runtime (faking can backfire)", () => {
    // Documented decision in stealth.ts — guard against future drift.
    expect(STEALTH_INIT_SCRIPT).not.toContain("chrome.runtime");
  });

  it("does NOT fake navigator.plugins or languages (already realistic)", () => {
    expect(STEALTH_INIT_SCRIPT).not.toMatch(/navigator\.plugins\s*=/);
    expect(STEALTH_INIT_SCRIPT).not.toMatch(/navigator\.languages\s*=/);
  });
});
