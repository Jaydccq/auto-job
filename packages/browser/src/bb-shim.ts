/**
 * Drop-in replacement for the bb-browser CLI helpers that the legacy
 * scan scripts (scripts/linkedin-scan-bb-browser.ts,
 * scripts/job-board-scan-bb-browser.ts) defined locally.
 *
 * Each helper preserves the original signature so the new scan scripts
 * (scripts/linkedin-scan.ts, scripts/job-board-scan.ts) only need to
 * swap the helper definitions block for an import from this module —
 * the rest of the script stays identical.
 *
 * Backed by a single in-process BrowserController instance held in
 * module scope. Tabs are tracked by the same opaque string id the old
 * code used.
 */

import { BrowserController } from "./browser-controller.js";
import type { Tab } from "./tab.js";
import type { ControllerOptions } from "./types.js";

let controllerPromise: Promise<BrowserController> | null = null;
const tabsById = new Map<string, Tab>();

export interface BbShimOptions extends ControllerOptions {}

/** Force the controller to use a specific options bundle. Idempotent. */
export async function configureController(opts: BbShimOptions = {}): Promise<BrowserController> {
  if (!controllerPromise) controllerPromise = BrowserController.ensure(opts);
  return controllerPromise;
}

async function getController(): Promise<BrowserController> {
  if (!controllerPromise) controllerPromise = BrowserController.ensure();
  return controllerPromise;
}

export interface BbTabInfo {
  tabId: string;
  url: string;
  title: string;
}

/**
 * Replaces the original `assertBbBrowserAvailable` PATH-binary check.
 * In the new world the browser is in-process; this just ensures the
 * controller can attach.
 */
export async function assertBbBrowserAvailable(): Promise<void> {
  await getController();
}

export async function openBbTab(url: string): Promise<string> {
  const controller = await getController();
  const tab = await controller.openTab(url);
  tabsById.set(tab.id, tab);
  return tab.id;
}

export async function closeBbTab(tabId: string): Promise<void> {
  const tab = tabsById.get(tabId);
  if (!tab) return;
  await tab.close().catch(() => undefined);
  tabsById.delete(tabId);
}

export async function listBbTabs(): Promise<BbTabInfo[]> {
  const controller = await getController();
  const infos = await controller.listTabs();
  return infos.map((i) => ({ tabId: i.id, url: i.url, title: i.title }));
}

/**
 * Run a function inside the given tab. Mirrors the original
 * `evaluateBrowserJson<T>(tabId, fn, args?)` signature. Args are passed
 * positionally to the function inside the page.
 */
export async function evaluateBrowserJson<T>(
  tabId: string,
  func: (...args: unknown[]) => unknown | Promise<unknown>,
  args: readonly unknown[] = [],
): Promise<T> {
  const tab = tabsById.get(tabId);
  if (!tab) throw new Error(`No tab tracked with id ${tabId}`);
  return tab.evaluate<T>(func as (...a: unknown[]) => T | Promise<T>, ...args);
}

export interface BbProcessResult {
  stdout: string;
  stderr: string;
}

/**
 * Replaces `runBb(["fetch", url])`. Opens a temporary tab on the URL's
 * origin, runs the fetch in tab context (carries cookies), then closes
 * the tab. Returns the response body in `stdout` to mirror the original
 * shim's shape.
 */
export async function bbFetch(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): Promise<BbProcessResult> {
  const controller = await getController();
  const u = new URL(url);
  const origin = `${u.protocol}//${u.host}`;
  const tab = await controller.openTab(origin);
  try {
    const r = await tab.fetch(url, init ?? {});
    return { stdout: r.body, stderr: "" };
  } finally {
    await tab.close().catch(() => undefined);
  }
}

/**
 * Optional cleanup hook for tests / shutdown. Disconnects from CDP but
 * leaves Chrome running so the next run can re-attach.
 */
export async function shutdownShim(): Promise<void> {
  if (!controllerPromise) return;
  const controller = await controllerPromise;
  for (const tab of tabsById.values()) {
    await tab.close().catch(() => undefined);
  }
  tabsById.clear();
  await controller.close().catch(() => undefined);
  controllerPromise = null;
}
