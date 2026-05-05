/**
 * verifyLink — open a URL, click the obvious confirm button, capture snapshots.
 *
 * Flow:
 *   1. Validate host against allowlist; refuse with EmailBotDisabledError or
 *      LinkHostNotAllowedError.
 *   2. Open tab, wait for load + 1s settle.
 *   3. Capture pre-click HTML + screenshot.
 *   4. Resolve confirm button (per-host selector → generic fallbacks).
 *   5. Wait `max(8000ms, readingDelay(buttonText))` before clicking.
 *   6. Click via HumanizedTab.
 *   7. Capture post-click HTML + screenshot.
 *   8. Return result.
 */

import type { BrowserController, Tab } from "@auto-job/browser";
import { humanize, readingDelay } from "@auto-job/humanize";

import type { Allowlist, AllowlistEntry } from "./allowlist.js";
import {
  ConfirmButtonNotFoundError,
  EmailBotDisabledError,
  LinkHostNotAllowedError,
} from "./errors.js";
import { capturePng, captureHtml, makeSnapshotDir, writeMeta, type SnapshotMeta } from "./snapshot.js";

const GENERIC_FALLBACK_SELECTORS = [
  // Most specific first.
  'button[data-action="confirm"]',
  'button[data-test*="confirm"]',
  'button:has-text("Confirm")',
  'button:has-text("Activate")',
  'button:has-text("Verify")',
  'a:has-text("Confirm")',
  'a:has-text("Activate")',
  '[role="button"]:has-text("Confirm")',
];

export const MIN_READING_DELAY_MS = 8000;

export interface VerifyLinkOptions {
  /** Override snapshot root for tests. */
  snapshotRoot?: string;
  /** Override reading-delay calculator (used by tests to remove sleeps). */
  delayMs?: (buttonText: string) => number;
  /** Override message id used in the snapshot directory name. */
  messageId?: string;
  /** Sender + subject metadata copied through to meta.json. */
  fromHeader?: string;
  subject?: string;
}

export interface VerifyLinkResult {
  url: string;
  finalUrl: string;
  buttonSelector: string;
  buttonText: string;
  clickTimingMs: number;
  snapshotDir: string;
}

function pickHostEntry(url: string, allowlist: Allowlist): AllowlistEntry {
  if (allowlist.entries.length === 0) {
    throw new EmailBotDisabledError();
  }
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    throw new LinkHostNotAllowedError("<unparseable>", url);
  }
  // Exact or subdomain suffix match; pick the longest matching host.
  let best: AllowlistEntry | undefined;
  for (const entry of allowlist.entries) {
    if (host === entry.host || host.endsWith(`.${entry.host}`)) {
      if (!best || entry.host.length > best.host.length) best = entry;
    }
  }
  if (!best || !best.autoClick) {
    throw new LinkHostNotAllowedError(host, url);
  }
  return best;
}

/** Try selectors in order; return the first that finds a non-zero element. */
async function resolveConfirmButton(
  tab: Tab,
  selectors: readonly string[],
): Promise<{ selector: string; text: string }> {
  for (const sel of selectors) {
    const text = await tab
      .evaluate<string | null>(
        // Playwright's :has-text pseudo isn't valid CSS; we re-implement
        // a small subset (button:has-text("X") / a:has-text("X")) and
        // delegate plain selectors to querySelector.
        `((sel) => {
          const hasTextMatch = sel.match(/^(.+?):has-text\\("(.+?)"\\)$/);
          if (hasTextMatch) {
            const tag = hasTextMatch[1];
            const phrase = hasTextMatch[2].toLowerCase();
            const candidates = Array.from(document.querySelectorAll(tag));
            const found = candidates.find((el) => (el.textContent || "").toLowerCase().includes(phrase));
            return found ? (found.textContent || "").trim() : null;
          }
          const el = document.querySelector(sel);
          return el ? (el.textContent || el.getAttribute("aria-label") || "").trim() : null;
        })(${JSON.stringify(sel)})`,
      )
      .catch(() => null);
    if (text !== null) return { selector: sel, text };
  }
  return { selector: "", text: "" };
}

export async function verifyLink(
  controller: BrowserController,
  url: string,
  allowlist: Allowlist,
  opts: VerifyLinkOptions = {},
): Promise<VerifyLinkResult> {
  const entry = pickHostEntry(url, allowlist);
  const tab = await controller.openTab(url);
  try {
    await new Promise((r) => setTimeout(r, 1000)); // settle

    const messageId = opts.messageId ?? "manual";
    const paths = makeSnapshotDir(messageId, opts.snapshotRoot);

    await captureHtml(tab, paths.preHtml);
    await capturePng(tab, paths.prePng);
    const preClickAt = new Date().toISOString();

    const trySelectors = entry.confirmButtonSelector
      ? [entry.confirmButtonSelector, ...GENERIC_FALLBACK_SELECTORS]
      : GENERIC_FALLBACK_SELECTORS;
    const resolved = await resolveConfirmButton(tab, trySelectors);
    if (!resolved.selector) {
      throw new ConfirmButtonNotFoundError(entry.host, trySelectors);
    }

    const delay = opts.delayMs
      ? opts.delayMs(resolved.text)
      : Math.max(MIN_READING_DELAY_MS, readingDelay(resolved.text));
    const clickStart = Date.now();
    await new Promise((r) => setTimeout(r, delay));

    const ht = humanize(tab);
    // HumanizedTab proxies click → Bezier mouse path + dwell.
    await ht.click(resolved.selector);

    // Brief settle so the post-click navigation/animation completes.
    await new Promise((r) => setTimeout(r, 1200));

    await captureHtml(tab, paths.postHtml);
    await capturePng(tab, paths.postPng);
    const postClickAt = new Date().toISOString();

    const meta: SnapshotMeta = {
      messageId,
      fromHeader: opts.fromHeader ?? "",
      subject: opts.subject ?? "",
      url,
      buttonSelector: resolved.selector,
      clickTimingMs: Date.now() - clickStart,
      preClickAt,
      postClickAt,
      finalUrl: tab.url,
    };
    writeMeta(paths.meta, meta);

    return {
      url,
      finalUrl: tab.url,
      buttonSelector: resolved.selector,
      buttonText: resolved.text,
      clickTimingMs: meta.clickTimingMs,
      snapshotDir: paths.dir,
    };
  } finally {
    await tab.close().catch(() => undefined);
  }
}
