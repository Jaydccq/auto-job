/**
 * LinkedIn site adapter.
 *
 * Unlike builtin/indeed/jobright, LinkedIn does not have a bb-browser
 * site adapter — the existing scripts/linkedin-scan-bb-browser.ts uses
 * generic bb-browser commands (open/eval) with extractors imported from
 * apps/extension/src/content/extract-linkedin.ts.
 *
 * To avoid duplicating those extractors here (they also ship as the
 * Chrome extension's content script), this module exposes thin wrappers
 * that take the extractor function as a parameter. The caller imports
 * the extractor from its current location and passes it in. When the
 * extension is later restructured we can move ownership of the
 * extractors into this package without breaking the wrapper API.
 */

import type { Tab } from "../../tab.js";

/**
 * Auth-state shape captured from a LinkedIn tab. Matches the input shape
 * of `detectLinkedInAuthBlock` in apps/server/src/adapters/linkedin-scan-normalizer.ts
 * so callers can pipe one into the other.
 */
export interface LinkedInAuthState {
  url: string;
  title: string;
  text: string;
}

const AUTH_STATE_SCRIPT = `({
  url: window.location.href,
  title: document.title,
  text: (document.body?.innerText ?? "").slice(0, 3000),
})`;

export async function captureLinkedInAuthState(tab: Tab): Promise<LinkedInAuthState> {
  return tab.evaluate<LinkedInAuthState>(AUTH_STATE_SCRIPT);
}

/**
 * Convenience: capture page state and pipe through a caller-provided
 * detector. Returns whatever the detector returns (typically a block
 * type string or null).
 */
export async function detectLinkedInAuthBlock<TBlock>(
  tab: Tab,
  detector: (state: LinkedInAuthState) => TBlock,
): Promise<TBlock> {
  const state = await captureLinkedInAuthState(tab);
  return detector(state);
}

/**
 * Run a LinkedIn list extractor in the tab. Caller is responsible for
 * navigating to the right search URL beforehand (or pass searchUrl).
 */
export async function searchLinkedIn<TRow>(
  tab: Tab,
  options: { searchUrl?: string; extractor: () => TRow[] | Promise<TRow[]> },
): Promise<TRow[]> {
  if (options.searchUrl) {
    await tab.navigate(options.searchUrl, { waitUntil: "domcontentloaded" });
  }
  return tab.evaluate<TRow[]>(options.extractor);
}

/**
 * Run a LinkedIn detail extractor in the tab.
 */
export async function linkedInJobDetail<TDetail>(
  tab: Tab,
  options: { jobUrl?: string; extractor: () => TDetail | Promise<TDetail> },
): Promise<TDetail> {
  if (options.jobUrl) {
    await tab.navigate(options.jobUrl, { waitUntil: "domcontentloaded" });
  }
  return tab.evaluate<TDetail>(options.extractor);
}
