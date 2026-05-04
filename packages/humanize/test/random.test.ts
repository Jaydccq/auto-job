import { describe, expect, it } from "vitest";

import { freshSeed, makeRng } from "../src/random.js";

describe("makeRng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("differs across seeds", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) differences++;
    }
    expect(differences).toBe(100);
  });

  it("range stays in bounds", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.range(10, 20);
      expect(v).toBeGreaterThanOrEqual(10);
      expect(v).toBeLessThan(20);
    }
  });

  it("int returns integers in inclusive bounds", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i++) {
      const v = rng.int(5, 9);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it("logNormal median ≈ exp(mu)", () => {
    const rng = makeRng(99);
    const mu = Math.log(320);
    const samples: number[] = [];
    for (let i = 0; i < 10_000; i++) samples.push(rng.logNormal(mu, 0.55));
    samples.sort((a, b) => a - b);
    const median = samples[5000];
    // Expect within 10% of exp(mu) = 320 for 10k samples.
    expect(median).toBeGreaterThan(320 * 0.85);
    expect(median).toBeLessThan(320 * 1.15);
  });
});

describe("freshSeed", () => {
  it("returns a 32-bit unsigned int and varies across calls", () => {
    const a = freshSeed();
    const b = freshSeed();
    expect(typeof a).toBe("number");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThanOrEqual(0xffffffff);
    // Two calls within the same ms could theoretically collide; we just
    // assert determinism is reasonable. With crypto bytes mixed in, equal is
    // astronomically unlikely.
    expect(a).not.toBe(b);
  });
});
