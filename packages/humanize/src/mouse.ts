/**
 * Bezier mouse paths.
 *
 * Real users don't move the mouse in straight lines. They overshoot, undershoot,
 * curve, and adjust. Our path:
 *   - 3 cubic Bezier segments stitched together, with control points jittered
 *     ±15px (scaled by mouseJitterIntensity) from the linear midpoints
 *   - 30-60 micro-steps depending on distance
 *   - 8-16ms between each micro-step (feels "alive" not "robotic")
 */

import type { Personality } from "./session.js";

export interface Point {
  x: number;
  y: number;
}

export interface MouseStep {
  x: number;
  y: number;
  delayMs: number;
}

const BASE_JITTER_PX = 15;
const MIN_STEPS = 30;
const MAX_STEPS = 60;
const PX_PER_STEP_TARGET = 12;
const MIN_STEP_DELAY = 8;
const MAX_STEP_DELAY = 16;

function cubicBezier(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

/** Generate a humanized waypoint path from `from` to `to`. */
export function bezierPath(from: Point, to: Point, p: Personality): MouseStep[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const stepCount = clamp(
    Math.round(distance / PX_PER_STEP_TARGET) + p.rng.int(0, 12),
    MIN_STEPS,
    MAX_STEPS,
  );
  const jitter = BASE_JITTER_PX * p.mouseJitterIntensity;
  // Three control points at 1/3 and 2/3 of the path, jittered.
  const c1: Point = {
    x: from.x + dx / 3 + p.rng.range(-jitter, jitter),
    y: from.y + dy / 3 + p.rng.range(-jitter, jitter),
  };
  const c2: Point = {
    x: from.x + (2 * dx) / 3 + p.rng.range(-jitter, jitter),
    y: from.y + (2 * dy) / 3 + p.rng.range(-jitter, jitter),
  };
  const steps: MouseStep[] = [];
  for (let i = 1; i <= stepCount; i++) {
    const t = i / stepCount;
    const pt = cubicBezier(t, from, c1, c2, to);
    steps.push({
      x: pt.x,
      y: pt.y,
      delayMs: p.rng.int(MIN_STEP_DELAY, MAX_STEP_DELAY),
    });
  }
  // Always end exactly at target.
  steps[steps.length - 1] = {
    ...(steps[steps.length - 1] as MouseStep),
    x: to.x,
    y: to.y,
  };
  return steps;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Walk a Bezier path on a playwright-compatible mouse interface. */
export async function humanizedMove(
  mouse: { move: (x: number, y: number) => Promise<void> },
  from: Point,
  to: Point,
  p: Personality,
): Promise<void> {
  const path = bezierPath(from, to, p);
  for (const step of path) {
    await mouse.move(step.x, step.y);
    await sleep(step.delayMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
