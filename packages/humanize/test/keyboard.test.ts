import { describe, expect, it } from "vitest";

import { humanizedKeystrokes } from "../src/keyboard.js";
import { buildPersonality } from "../src/session.js";

describe("humanizedKeystrokes", () => {
  it("emits one step per char (modulo typo corrections)", () => {
    const p = buildPersonality(1);
    p.typoProbability = 0; // disable typos to simplify count
    const steps = humanizedKeystrokes("hello world", p);
    expect(steps.length).toBe("hello world".length);
  });

  it("dwell delays are mostly in [50ms, 1500ms] (clamped)", () => {
    const p = buildPersonality(99);
    p.typoProbability = 0;
    const steps = humanizedKeystrokes("the quick brown fox jumps over the lazy dog", p);
    let inBand = 0;
    for (const s of steps) {
      if (s.delayMs >= 50 && s.delayMs <= 1500) inBand++;
    }
    expect(inBand / steps.length).toBeGreaterThanOrEqual(0.95);
  });

  it("typo correction inserts wrong + Backspace + right when triggered", () => {
    const p = buildPersonality(1);
    p.typoProbability = 1.0; // force typo on every char
    const steps = humanizedKeystrokes("ab", p);
    // Each char becomes 3 steps: wrong, Backspace, right
    expect(steps.length).toBe(6);
    expect(steps[0]?.correction).toBe("wrong");
    expect(steps[1]?.char).toBe("Backspace");
    expect(steps[1]?.correction).toBe("backspace");
    expect(steps[2]?.correction).toBe("right");
  });

  it("typoProbability=0 produces no corrections", () => {
    const p = buildPersonality(1);
    p.typoProbability = 0;
    const steps = humanizedKeystrokes("hello", p);
    for (const s of steps) {
      expect(s.correction).toBeUndefined();
    }
  });

  it("median dwell roughly tracks typing-speed bias", () => {
    const fast = buildPersonality(7);
    fast.typingSpeedBias = 1.4;
    fast.typoProbability = 0;
    const slow = buildPersonality(7);
    slow.typingSpeedBias = 0.7;
    slow.typoProbability = 0;
    const fastSteps = humanizedKeystrokes("the quick brown fox jumps over the lazy dog", fast);
    const slowSteps = humanizedKeystrokes("the quick brown fox jumps over the lazy dog", slow);
    const fastMedian = median(fastSteps.map((s) => s.delayMs));
    const slowMedian = median(slowSteps.map((s) => s.delayMs));
    expect(slowMedian).toBeGreaterThan(fastMedian);
  });
});

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
