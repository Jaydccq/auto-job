/**
 * Reading-time delays.
 *
 * Real users take time to read button labels, instructions, error messages
 * before acting. Our delay scales with element text length at ~60ms/char,
 * clamped to [200ms, 3000ms]. Adjusted by personality.readingSpeedBias.
 *
 * 60ms/char ≈ 250 wpm reading speed (5 chars/word, 60ms/char =
 * 5/(0.06*5) = 200 chars/sec ≈ 240 wpm). Real adults are 200-400 wpm.
 */

import type { Personality } from "./session.js";

const BASE_MS_PER_CHAR = 60;
const MIN_DELAY_MS = 200;
const MAX_DELAY_MS = 3000;

export function readingDelay(text: string | null | undefined, p?: Personality): number {
  const len = (text ?? "").length;
  const bias = p?.readingSpeedBias ?? 1.0;
  const raw = (len * BASE_MS_PER_CHAR) / bias;
  return Math.min(Math.max(raw, MIN_DELAY_MS), MAX_DELAY_MS);
}

export async function delayForReading(
  text: string | null | undefined,
  p?: Personality,
): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, readingDelay(text, p)));
}
