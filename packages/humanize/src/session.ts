/**
 * Per-session "personality" derived from a single seed.
 *
 * Real users don't have constant typing/reading speed across all sessions
 * (sleepy on Monday, focused on Wednesday). But within ONE session, their
 * pace is coherent. Personality captures that: derived once from the seed,
 * applied as biases across all subsequent actions in the session.
 */

import { makeRng, type Rng } from "./random.js";

export interface Personality {
  rng: Rng;
  /** Multiplicative factor on baseline typing speed. 0.7 = slow typer, 1.3 = fast. */
  typingSpeedBias: number;
  /** Multiplicative factor on baseline reading speed. */
  readingSpeedBias: number;
  /** Multiplicative jitter intensity for mouse paths. 0.7 = smooth, 1.3 = jittery. */
  mouseJitterIntensity: number;
  /** Per-character typo probability. 0.005-0.02 range. */
  typoProbability: number;
}

export function buildPersonality(seed: number): Personality {
  const rng = makeRng(seed);
  return {
    rng,
    typingSpeedBias: rng.range(0.75, 1.35),
    readingSpeedBias: rng.range(0.7, 1.4),
    mouseJitterIntensity: rng.range(0.6, 1.4),
    typoProbability: rng.range(0.003, 0.02),
  };
}
