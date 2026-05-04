/**
 * @auto-job/humanize
 *
 * Behavior humanization decorator over @auto-job/browser's Tab.
 * Defeats Datadome / Akamai BM / PerimeterX behavior-sequence
 * fingerprints via Bezier mouse paths, log-normal keystroke dwell,
 * reading delays, and per-session personality randomization.
 *
 * Surface:
 *   const humanizedTab = humanize(tab);
 *   await humanizedTab.click("#submit");      // Bezier path + dwell + click
 *   await humanizedTab.fill("#email", "x");   // Log-normal per-char timing
 */

export { humanize, HumanizedTab, type HumanizeOptions } from "./humanized-tab.js";
export { buildPersonality, type Personality } from "./session.js";
export { makeRng, freshSeed, type Rng } from "./random.js";
export { bezierPath, humanizedMove, type Point, type MouseStep } from "./mouse.js";
export { humanizedKeystrokes, humanizedType, type KeystrokeStep } from "./keyboard.js";
export { readingDelay, delayForReading } from "./reading.js";
