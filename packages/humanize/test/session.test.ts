import { describe, expect, it } from "vitest";

import { buildPersonality } from "../src/session.js";

describe("buildPersonality", () => {
  it("is deterministic for a given seed", () => {
    const a = buildPersonality(42);
    const b = buildPersonality(42);
    expect(a.typingSpeedBias).toBe(b.typingSpeedBias);
    expect(a.readingSpeedBias).toBe(b.readingSpeedBias);
    expect(a.mouseJitterIntensity).toBe(b.mouseJitterIntensity);
    expect(a.typoProbability).toBe(b.typoProbability);
  });

  it("typingSpeedBias is in [0.75, 1.35]", () => {
    for (let s = 0; s < 50; s++) {
      const p = buildPersonality(s);
      expect(p.typingSpeedBias).toBeGreaterThanOrEqual(0.75);
      expect(p.typingSpeedBias).toBeLessThan(1.35);
    }
  });

  it("typoProbability is in [0.003, 0.02]", () => {
    for (let s = 0; s < 50; s++) {
      const p = buildPersonality(s);
      expect(p.typoProbability).toBeGreaterThanOrEqual(0.003);
      expect(p.typoProbability).toBeLessThan(0.02);
    }
  });
});
