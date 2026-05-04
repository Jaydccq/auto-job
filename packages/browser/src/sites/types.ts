/**
 * Common types for site adapters.
 *
 * Most adapters fit the "search by typed options, return typed list of
 * jobs" shape and implement `SearchAdapter`. They are listed in the
 * registry (`registry.ts`) so callers can iterate over all known sites
 * (e.g. for a `--source` flag or a doctor command).
 *
 * LinkedIn is intentionally NOT in this shape — it takes a caller-
 * provided extractor function because the in-page DOM extractors live
 * in `apps/extension/src/content/extract-linkedin.ts` and are reused
 * by the Chrome extension. See `sites/linkedin/index.ts`.
 */

import type { Tab } from "../tab.js";

export interface SiteAdapterMeta {
  /** Stable id, used as the `--source` flag value and registry key (kebab-case). */
  id: string;
  /** Display name. */
  name: string;
  /** Primary hostname this adapter targets (no protocol). */
  domain: string;
  /** Whether successful queries require an authenticated session in the dedicated profile. */
  requiresAuth: boolean;
  /** One-sentence description shown in docs / help output. */
  description: string;
}

/**
 * Adapter that runs a search against a site and returns typed results.
 * Each adapter is expected to:
 *   - navigate the tab to its domain if needed (for cookies/origin),
 *   - throw `AdapterParseError` on HTTP/schema failure,
 *   - throw `NotAuthenticatedError` when `requiresAuth` and the session is missing.
 */
export interface SearchAdapter<TOptions, TResult> {
  readonly meta: SiteAdapterMeta;
  search(tab: Tab, opts: TOptions): Promise<TResult>;
}
