import { describe, expect, it } from "vitest";

import { readingDelay } from "../src/reading.js";
import { buildPersonality } from "../src/session.js";

describe("readingDelay", () => {
  it("clamps below 200ms for empty/short text", () => {
    expect(readingDelay("")).toBe(200);
    expect(readingDelay("x")).toBe(200);
  });

  it("scales with text length at 60ms/char", () => {
    expect(readingDelay("a".repeat(20))).toBe(20 * 60);
  });

  it("clamps above 3000ms for very long text", () => {
    expect(readingDelay("a".repeat(1000))).toBe(3000);
  });

  it("respects personality.readingSpeedBias", () => {
    const fast = buildPersonality(1);
    fast.readingSpeedBias = 2.0;
    const slow = buildPersonality(1);
    slow.readingSpeedBias = 0.5;
    const text = "a".repeat(20);
    expect(readingDelay(text, fast)).toBeLessThan(readingDelay(text, slow));
  });

  it("handles null/undefined as empty", () => {
    expect(readingDelay(null)).toBe(200);
    expect(readingDelay(undefined)).toBe(200);
  });
});
