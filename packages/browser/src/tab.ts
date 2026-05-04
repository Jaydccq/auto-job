import type { Page, Response as PwResponse } from "playwright";

import { TabClosedError } from "./errors.js";
import type {
  AccessibilitySnapshot,
  FetchInit,
  FetchResult,
  NavigateOptions,
  NetworkRecord,
  RequestMatcher,
  ScreenshotOptions,
  WaitOptions,
} from "./types.js";

const DEFAULT_NAV_TIMEOUT_MS = 30_000;
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;

export class Tab {
  private closed = false;

  constructor(
    public readonly id: string,
    private readonly page: Page,
  ) {
    page.on("close", () => {
      this.closed = true;
    });
  }

  get url(): string {
    return this.page.url();
  }

  async navigate(url: string, opts: NavigateOptions = {}): Promise<void> {
    this.assertOpen();
    await this.page.goto(url, {
      waitUntil: opts.waitUntil ?? "load",
      timeout: opts.timeoutMs ?? DEFAULT_NAV_TIMEOUT_MS,
    });
  }

  async evaluate<T>(fn: string | ((...args: unknown[]) => T | Promise<T>), ...args: unknown[]): Promise<T> {
    this.assertOpen();
    if (typeof fn === "string") {
      return this.page.evaluate(fn) as Promise<T>;
    }
    return this.page.evaluate(fn as (a: unknown[]) => T | Promise<T>, args);
  }

  async snapshot(): Promise<AccessibilitySnapshot> {
    this.assertOpen();
    // Playwright dropped page.accessibility in v1.50+; ariaSnapshot is the
    // current ARIA-tree primitive but it returns YAML-like text. We expose
    // a structural wrapper: the YAML body is captured under `value`, with
    // page metadata as siblings. None of the Phase 1 site adapters exercise
    // this path — it exists for future apply-flow form-discovery work.
    const aria = await this.page.locator(":root").ariaSnapshot().catch(() => "");
    return {
      role: "WebArea",
      name: await this.page.title().catch(() => ""),
      value: aria,
    };
  }

  async click(selector: string): Promise<void> {
    this.assertOpen();
    await this.page.click(selector);
  }

  async fill(selector: string, value: string): Promise<void> {
    this.assertOpen();
    await this.page.fill(selector, value);
  }

  async fetch(url: string, init: FetchInit = {}): Promise<FetchResult> {
    this.assertOpen();
    const result = await this.page.evaluate(
      async ({ url, init }: { url: string; init: FetchInit }) => {
        const requestInit: RequestInit = {
          method: init.method ?? "GET",
          credentials: "include",
        };
        if (init.headers) requestInit.headers = init.headers;
        if (init.body !== undefined) requestInit.body = init.body;
        const r = await fetch(url, requestInit);
        const headers: Record<string, string> = {};
        r.headers.forEach((v, k) => {
          headers[k] = v;
        });
        const text = await r.text();
        return {
          ok: r.ok,
          status: r.status,
          statusText: r.statusText,
          headers,
          body: text,
          url: r.url,
        };
      },
      { url, init: { ...init } },
    );

    let json: unknown | undefined;
    if (init.json) {
      try {
        json = JSON.parse(result.body);
      } catch {
        json = undefined;
      }
    }
    return { ...result, ...(json !== undefined ? { json } : {}) };
  }

  async screenshot(opts: ScreenshotOptions = {}): Promise<Buffer> {
    this.assertOpen();
    return this.page.screenshot({
      fullPage: opts.fullPage ?? false,
      type: opts.type ?? "png",
    });
  }

  async waitForNetwork(matcher: RequestMatcher, opts: WaitOptions = {}): Promise<NetworkRecord> {
    this.assertOpen();
    const response = await this.page.waitForResponse(
      (r: PwResponse) => matchesRequest(r, matcher),
      { timeout: opts.timeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS },
    );
    let body: string | undefined;
    try {
      body = await response.text();
    } catch {
      body = undefined;
    }
    return {
      url: response.url(),
      method: response.request().method(),
      status: response.status(),
      resourceType: response.request().resourceType(),
      ...(body !== undefined ? { body } : {}),
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.page.close().catch(() => undefined);
  }

  private assertOpen(): void {
    if (this.closed || this.page.isClosed()) {
      throw new TabClosedError();
    }
  }
}

function matchesRequest(response: PwResponse, matcher: RequestMatcher): boolean {
  const req = response.request();
  if (matcher.method && req.method().toUpperCase() !== matcher.method.toUpperCase()) return false;
  if (matcher.resourceType && req.resourceType() !== matcher.resourceType) return false;
  if (matcher.url) {
    const url = response.url();
    if (typeof matcher.url === "string") {
      if (!url.includes(matcher.url)) return false;
    } else if (!matcher.url.test(url)) {
      return false;
    }
  }
  return true;
}
