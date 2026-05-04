/**
 * HumanizedTab — drop-in decorator over @auto-job/browser's Tab.
 *
 * Same public surface as Tab. Interactive methods (click, fill, press)
 * inject Bezier mouse paths, log-normal keystroke dwell, and reading
 * delays. Non-interactive methods (fetch, evaluate, snapshot) pass
 * through unchanged.
 */

import type {
  AccessibilitySnapshot,
  FetchInit,
  FetchResult,
  NavigateOptions,
  NetworkRecord,
  RequestMatcher,
  ScreenshotOptions,
  Tab,
  WaitOptions,
} from "@auto-job/browser";

import { humanizedMove, type Point } from "./mouse.js";
import { humanizedType } from "./keyboard.js";
import { delayForReading } from "./reading.js";
import { buildPersonality, type Personality } from "./session.js";
import { freshSeed } from "./random.js";

export interface HumanizeOptions {
  /** Explicit seed for reproducibility (tests). Default: fresh per-session seed. */
  seed?: number;
  /** Override personality directly (skips seed-derived construction). */
  personality?: Personality;
}

interface PlaywrightLikePage {
  mouse: {
    move(x: number, y: number): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
  };
  keyboard: {
    press(key: string): Promise<void>;
  };
  evaluate<T>(fn: string): Promise<T>;
  locator(sel: string): { boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null>; innerText(): Promise<string>; click(): Promise<void>; focus(): Promise<void> };
}

/** Subset of Tab's internals we need. We use a structural-typing escape hatch
 *  rather than coupling tightly to playwright internals. */
interface TabInternals {
  // `page` is a private field on Tab in @auto-job/browser; we access it via
  // a minimal interface for humanization. If Tab evolves, update here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page?: PlaywrightLikePage;
}

/**
 * NOTE: We do NOT use `implements Tab` because Tab has private members
 * (page, closed, assertOpen) that we don't and shouldn't replicate.
 * TypeScript structural typing means HumanizedTab is assignable to Tab
 * variables as long as all PUBLIC methods are present and shape-compatible.
 */
export class HumanizedTab {
  /** Last known mouse cursor position; persists across calls in one session. */
  private cursor: Point = { x: 0, y: 0 };

  constructor(
    private readonly tab: Tab,
    public readonly personality: Personality,
  ) {}

  get id(): string {
    return this.tab.id;
  }

  get url(): string {
    return this.tab.url;
  }

  // ---------- interactive methods (humanized) ----------

  async navigate(url: string, opts?: NavigateOptions): Promise<void> {
    // No mouse/keyboard for navigation, but a small "user typed URL" delay.
    await delayForReading(url, this.personality);
    return this.tab.navigate(url, opts ?? {});
  }

  async click(selector: string): Promise<void> {
    const page = this.getPage();
    if (!page) {
      // Cannot humanize without page access — fall back to underlying Tab.click.
      return this.tab.click(selector);
    }
    const loc = page.locator(selector);
    const text = await loc.innerText().catch(() => "");
    await delayForReading(text, this.personality);
    const box = await loc.boundingBox();
    if (box) {
      const target: Point = {
        x: box.x + box.width / 2 + this.personality.rng.range(-3, 3),
        y: box.y + box.height / 2 + this.personality.rng.range(-3, 3),
      };
      await humanizedMove(page.mouse, this.cursor, target, this.personality);
      this.cursor = target;
      await sleep(this.personality.rng.int(120, 380)); // dwell before click
      await page.mouse.down();
      await sleep(this.personality.rng.int(40, 110));
      await page.mouse.up();
      return;
    }
    // No bounding box (off-screen?). Fall back to underlying click with a
    // pre-action reading delay still applied.
    return this.tab.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    const page = this.getPage();
    if (!page) return this.tab.fill(selector, value);
    const loc = page.locator(selector);
    await delayForReading(value, this.personality);
    await loc.focus();
    await sleep(this.personality.rng.int(80, 220));
    await humanizedType(page.keyboard, value, this.personality);
  }

  // ---------- pass-through methods ----------

  async evaluate<T>(fn: string | ((...args: unknown[]) => T | Promise<T>), ...args: unknown[]): Promise<T> {
    return this.tab.evaluate(fn as never, ...args);
  }

  async snapshot(): Promise<AccessibilitySnapshot> {
    return this.tab.snapshot();
  }

  async fetch(url: string, init?: FetchInit): Promise<FetchResult> {
    return this.tab.fetch(url, init ?? {});
  }

  async screenshot(opts?: ScreenshotOptions): Promise<Buffer> {
    return this.tab.screenshot(opts ?? {});
  }

  async waitForNetwork(matcher: RequestMatcher, opts?: WaitOptions): Promise<NetworkRecord> {
    return this.tab.waitForNetwork(matcher, opts ?? {});
  }

  async close(): Promise<void> {
    return this.tab.close();
  }

  // ---------- internals ----------

  private getPage(): PlaywrightLikePage | null {
    // Access the page via a structural type — Tab implementation in
    // @auto-job/browser holds a private `page: Page` field. We document this
    // coupling in design.md and revisit if Tab's internals change.
    const internals = this.tab as unknown as TabInternals;
    return internals.page ?? null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decorate a Tab with humanized timings. The returned object is structurally
 * compatible with Tab and can be used anywhere a Tab is expected.
 */
export function humanize(tab: Tab, opts: HumanizeOptions = {}): HumanizedTab {
  const personality = opts.personality ?? buildPersonality(opts.seed ?? freshSeed());
  return new HumanizedTab(tab, personality);
}
