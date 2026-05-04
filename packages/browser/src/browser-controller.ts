import { randomUUID } from "node:crypto";

import { chromium, type Browser, type BrowserContext } from "playwright";

import { ensureChrome, type EnsureResult } from "./ensure-chrome.js";
import { STEALTH_INIT_SCRIPT } from "./stealth.js";
import { Tab } from "./tab.js";
import type { ControllerOptions, TabInfo } from "./types.js";

/**
 * Owns the playwright `Browser` (CDP-attached) plus the lifecycle of
 * the dedicated Chrome process when this library launched it.
 *
 * Use BrowserController.ensure() to obtain a connected instance —
 * idempotent across calls within the same Node process.
 */
export class BrowserController {
  private constructor(
    private readonly browser: Browser,
    private readonly context: BrowserContext,
    private readonly meta: EnsureResult,
  ) {}

  static async ensure(opts: ControllerOptions = {}): Promise<BrowserController> {
    const meta = await ensureChrome(opts);
    const browser = await chromium.connectOverCDP(meta.cdpEndpoint);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    // Apply stealth patches to every NEW page opened in this context.
    // Idempotent — safe to call across reattachments. Existing tabs the
    // user opened manually before attach are not affected.
    await context.addInitScript(STEALTH_INIT_SCRIPT).catch(() => undefined);
    return new BrowserController(browser, context, meta);
  }

  /** Open a new tab on the given URL (or about:blank if URL is empty). */
  async openTab(url: string): Promise<Tab> {
    const page = await this.context.newPage();
    if (url && url !== "about:blank") {
      await page.goto(url, { waitUntil: "load", timeout: 30_000 }).catch(() => undefined);
    }
    const id = randomUUID();
    return new Tab(id, page);
  }

  async listTabs(): Promise<TabInfo[]> {
    const out: TabInfo[] = [];
    for (const ctx of this.browser.contexts()) {
      for (const page of ctx.pages()) {
        out.push({
          id: randomUUID(),
          url: page.url(),
          title: await page.title().catch(() => ""),
        });
      }
    }
    return out;
  }

  /** Disconnect from CDP. Leaves Chrome running so subsequent ensure() calls can reattach. */
  async close(): Promise<void> {
    await this.browser.close().catch(() => undefined);
  }

  /** Disconnect AND terminate the Chrome process if this controller launched it. */
  async shutdown(): Promise<void> {
    await this.close();
    if (this.meta.launched && this.meta.process && !this.meta.process.killed) {
      this.meta.process.kill("SIGTERM");
    }
  }
}
