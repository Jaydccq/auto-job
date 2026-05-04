/**
 * Seeded RNG (Mulberry32). Tiny, fast, good distribution for our use.
 * Per-session "personality" is derived from a single seed so the same
 * session feels coherent (same typing speed bias, same reading speed)
 * across many actions, while different sessions vary.
 */

export interface Rng {
  next(): number;          // [0, 1)
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  /** log-normal random; median = exp(mu); spread controlled by sigma */
  logNormal(mu: number, sigma: number): number;
  /** Standard normal via Box-Muller. */
  gaussian(): number;
}

export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  let bufferedGaussian: number | null = null;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
  const gaussian = () => {
    if (bufferedGaussian !== null) {
      const z = bufferedGaussian;
      bufferedGaussian = null;
      return z;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    bufferedGaussian = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, max) => Math.floor(min + next() * (max - min + 1)),
    logNormal: (mu, sigma) => Math.exp(mu + sigma * gaussian()),
    gaussian,
  };
}

/** Generate a fresh per-session seed mixing crypto-random bytes with time. */
export function freshSeed(): number {
  // Lazy-import node:crypto to keep this file zero-deps for browser-context use.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
  const buf = randomBytes(4);
  // `^` returns a signed 32-bit; coerce to unsigned with `>>> 0`.
  return (buf.readUInt32BE(0) ^ ((Date.now() & 0xffffffff) >>> 0)) >>> 0;
}
