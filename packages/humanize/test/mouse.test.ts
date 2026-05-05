import { describe, expect, it } from "vitest";

import { bezierPath } from "../src/mouse.js";
import { buildPersonality } from "../src/session.js";

describe("bezierPath", () => {
  it("returns 30-60 micro-steps for a typical move", () => {
    const p = buildPersonality(123);
    const steps = bezierPath({ x: 0, y: 0 }, { x: 500, y: 300 }, p);
    expect(steps.length).toBeGreaterThanOrEqual(30);
    expect(steps.length).toBeLessThanOrEqual(60);
  });

  it("delays per step are in 8-16ms", () => {
    const p = buildPersonality(123);
    const steps = bezierPath({ x: 0, y: 0 }, { x: 500, y: 300 }, p);
    for (const s of steps) {
      expect(s.delayMs).toBeGreaterThanOrEqual(8);
      expect(s.delayMs).toBeLessThanOrEqual(16);
    }
  });

  it("ends exactly at target", () => {
    const p = buildPersonality(123);
    const steps = bezierPath({ x: 10, y: 20 }, { x: 511, y: 322 }, p);
    const last = steps[steps.length - 1]!;
    expect(last.x).toBe(511);
    expect(last.y).toBe(322);
  });

  it("path is curved, not straight (no three collinear consecutive points)", () => {
    const p = buildPersonality(7);
    const steps = bezierPath({ x: 0, y: 0 }, { x: 400, y: 200 }, p);
    // Sample 3 consecutive points and check they're NOT collinear (cross product > epsilon).
    let curvedCount = 0;
    for (let i = 0; i < steps.length - 2; i++) {
      const a = steps[i]!;
      const b = steps[i + 1]!;
      const c = steps[i + 2]!;
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (Math.abs(cross) > 0.01) curvedCount++;
    }
    expect(curvedCount).toBeGreaterThan(steps.length / 2);
  });

  it("deterministic with same seed", () => {
    const a = bezierPath({ x: 0, y: 0 }, { x: 500, y: 300 }, buildPersonality(42));
    const b = bezierPath({ x: 0, y: 0 }, { x: 500, y: 300 }, buildPersonality(42));
    expect(a).toEqual(b);
  });
});
