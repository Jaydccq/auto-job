/**
 * Per-character keystroke timing.
 *
 * Real typing has log-normal dwell distribution: many fast keystrokes,
 * occasional pauses. We center on ~320ms with σ giving:
 *   - P5  ≈ 130ms
 *   - P50 ≈ 320ms (median)
 *   - P95 ≈ 750ms
 * Adjusted by personality.typingSpeedBias.
 *
 * ~1% probability of "typo": insert wrong char + dwell + backspace + dwell
 * + correct char. This matches real human behavior and makes the trace
 * look much less robotic.
 */

import type { Personality } from "./session.js";

const MEDIAN_DWELL_MS = 320;
const LOG_SIGMA = 0.55; // gives roughly P5=130, P95=750
const MU = Math.log(MEDIAN_DWELL_MS); // log(median) = mu for log-normal

export interface KeystrokeStep {
  /** Char to press. */
  char: string;
  /** Delay BEFORE pressing this char. */
  delayMs: number;
  /** When true, this step is part of a typo correction sequence. */
  correction?: "wrong" | "backspace" | "right";
}

export function humanizedKeystrokes(text: string, p: Personality): KeystrokeStep[] {
  const steps: KeystrokeStep[] = [];
  for (const char of text) {
    const dwell = Math.round(p.rng.logNormal(MU, LOG_SIGMA) / p.typingSpeedBias);
    if (p.rng.next() < p.typoProbability) {
      // Insert wrong char (random nearby letter), dwell, backspace, dwell, right char.
      const wrong = randomTypo(char, p);
      steps.push({ char: wrong, delayMs: clamp(dwell, 50, 2000), correction: "wrong" });
      steps.push({
        char: "Backspace",
        delayMs: clamp(p.rng.logNormal(MU, LOG_SIGMA) * 0.5, 80, 600),
        correction: "backspace",
      });
      steps.push({
        char,
        delayMs: clamp(p.rng.logNormal(MU, LOG_SIGMA) * 0.7, 80, 800),
        correction: "right",
      });
    } else {
      steps.push({ char, delayMs: clamp(dwell, 50, 2000) });
    }
  }
  return steps;
}

const NEIGHBOR_KEYS: Record<string, string> = {
  a: "s",  b: "v",  c: "x",  d: "f",  e: "r",  f: "g",  g: "h",  h: "j",
  i: "o",  j: "k",  k: "l",  l: "k",  m: "n",  n: "m",  o: "p",  p: "o",
  q: "w",  r: "e",  s: "d",  t: "y",  u: "i",  v: "b",  w: "e",  x: "c",
  y: "u",  z: "x",
};
function randomTypo(target: string, _p: Personality): string {
  const lower = target.toLowerCase();
  const neighbor = NEIGHBOR_KEYS[lower];
  if (!neighbor) return target; // for non-letters, skip typo
  return target === target.toUpperCase() ? neighbor.toUpperCase() : neighbor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Type a string into a playwright-compatible keyboard interface, humanized. */
export async function humanizedType(
  keyboard: { press: (key: string) => Promise<void>; type?: (text: string) => Promise<void> },
  text: string,
  p: Personality,
): Promise<void> {
  const steps = humanizedKeystrokes(text, p);
  for (const step of steps) {
    await sleep(step.delayMs);
    await keyboard.press(step.char);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
