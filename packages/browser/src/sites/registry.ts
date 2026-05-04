/**
 * Site adapter registry.
 *
 * Lists every site adapter that conforms to the `SearchAdapter` shape.
 * Lets callers iterate over known sites (for `--source` flag validation,
 * doctor commands, dashboard listings, etc.) without hardcoding the
 * full adapter list at every call site.
 *
 * NOT included on purpose:
 *   - LinkedIn: takes a caller-provided extractor function, doesn't fit
 *     the typed `search(tab, opts) → result` shape. See sites/linkedin.
 *
 * Adding a new site: see docs/architecture/own-browser-add-site.md.
 */

import { BUILTIN_ADAPTER } from "./builtin/index.js";
import { GREENHOUSE_ADAPTER } from "./greenhouse/index.js";
import { INDEED_ADAPTER } from "./indeed/index.js";
import { JOBRIGHT_ADAPTER } from "./jobright/index.js";
import type { SearchAdapter, SiteAdapterMeta } from "./types.js";

export const SITE_ADAPTERS = {
  builtin: BUILTIN_ADAPTER,
  indeed: INDEED_ADAPTER,
  jobright: JOBRIGHT_ADAPTER,
  greenhouse: GREENHOUSE_ADAPTER,
} as const;

export type SiteId = keyof typeof SITE_ADAPTERS;

/** All known SiteAdapter ids in stable iteration order. */
export const SITE_IDS: readonly SiteId[] = Object.freeze(
  Object.keys(SITE_ADAPTERS) as SiteId[],
);

/** Public meta for each adapter — safe to ship in CLI help / dashboards. */
export function listSiteMetas(): readonly SiteAdapterMeta[] {
  return SITE_IDS.map((id) => SITE_ADAPTERS[id].meta);
}

/** Throws if `id` is not a known site. */
export function getSiteAdapter<TId extends SiteId>(id: TId): (typeof SITE_ADAPTERS)[TId] {
  const adapter = SITE_ADAPTERS[id];
  if (!adapter) {
    throw new Error(
      `Unknown site id "${id}". Known: ${SITE_IDS.join(", ")}.`,
    );
  }
  return adapter;
}

/** Type guard for runtime-untrusted strings (e.g. from --source CLI flag). */
export function isKnownSiteId(value: string): value is SiteId {
  return value in SITE_ADAPTERS;
}

// Re-export types for convenience
export type { SearchAdapter, SiteAdapterMeta };
