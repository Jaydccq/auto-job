/**
 * external-apply-settle.ts — pure URL-settle logic for the LinkedIn Apply
 * external-redirect probe.
 *
 * The driver (scripts/linkedin-scan-bb-browser.ts) clicks LinkedIn's
 * non-Easy-Apply "Apply" button. LinkedIn either:
 *   • opens a new tab with `target=_blank` whose URL initially is a
 *     LinkedIn intermediate (`/jobs/view/<id>/apply/external?...`) and only
 *     302-redirects to the ATS posting after a short delay, or
 *   • navigates the current tab through the same redirect.
 *
 * The previous implementation polled `bb-browser tab list --json` every 750ms
 * and accepted the first non-LinkedIn URL it saw. If `tab.url` was reported
 * as the LinkedIn intermediate during the entire poll window, the script
 * returned `null` and the pipeline kept the LinkedIn job-view URL — exactly
 * the bug the user reported on 2026-05-02.
 *
 * This module provides a side-effect-free state machine that the driver
 * uses to keep polling the tab's `window.location.href` (via
 * `evaluateBrowserJson`) until the URL leaves LinkedIn AND remains stable
 * across two polls. The driver injects `pollFn`; tests inject a fake
 * sequence so the algorithm is unit-testable without bb-browser.
 */

export interface TabUrlState {
  /** Live `window.location.href`. */
  href: string;
  /** `<link rel="canonical">` href if present (preferred over `href`). */
  canonical?: string | null;
  /** `<meta property="og:url">` content if present. */
  ogUrl?: string | null;
  /** `document.readyState` at the time of poll. */
  readyState?: "loading" | "interactive" | "complete" | string;
}

export interface SettleOptions {
  /** Hard upper bound on the whole settle attempt. Default: 12_000ms. */
  maxMs?: number;
  /** URL must be unchanged for at least this many ms to count as stable. Default: 1_500ms. */
  stableMs?: number;
  /** Min interval between polls. Default: 400ms. */
  intervalMs?: number;
  /** Inject for tests. Returns ms since epoch. */
  now?: () => number;
}

export interface SettleResult {
  /** The URL we believe is final, or null if we never saw a non-LinkedIn URL. */
  finalUrl: string | null;
  /** The full sequence of URLs observed, in order. */
  observed: readonly string[];
  /** Why the loop stopped. */
  reason: "stable" | "timeout" | "host-stable";
  /** Total ms elapsed. */
  elapsedMs: number;
}

/**
 * True if a hostname is `linkedin.com` or any subdomain (e.g. `www.linkedin.com`).
 */
export function isLinkedInHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === "linkedin.com" || lower.endsWith(".linkedin.com");
}

/**
 * Pick the best canonical URL from a single poll. Prefers
 * `<link rel="canonical">` then `<meta og:url>` then `window.location.href`.
 * Returns null if none parse.
 */
export function preferredUrlFromTabState(state: TabUrlState): string | null {
  for (const candidate of [state.canonical, state.ogUrl, state.href]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (!/^https?:$/.test(parsed.protocol)) continue;
      parsed.hash = "";
      return parsed.toString();
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * True if a URL parses, uses http(s), and the host is NOT linkedin.com.
 * Mirrors `isUsefulExternalApplyUrl` in scripts/linkedin-scan-bb-browser.ts.
 */
export function isOffsiteHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    return !isLinkedInHost(parsed.hostname);
  } catch {
    return false;
  }
}

export type SettlePollFn = () => Promise<TabUrlState | null>;

/**
 * Drive a settle loop using the supplied `pollFn`. The poll function should
 * return the current tab's URL state, or `null` if the tab is gone.
 *
 * Stop conditions, in order:
 *   1. **stable**:        the picked URL is offsite (not LinkedIn) AND unchanged
 *                         for >= stableMs AND `readyState === "complete"`.
 *   2. **host-stable**:   the picked URL host has been offsite (and stable
 *                         per host, ignoring query/path tail churn) for the
 *                         full `stableMs` window — useful for ATS pages that
 *                         keep mutating tracking params after page load.
 *   3. **timeout**:       elapsed >= maxMs.
 *
 * If we never observe an offsite URL, we return finalUrl = null even if the
 * tab eventually goes idle on a LinkedIn intermediate. The driver then keeps
 * the LinkedIn job-view URL (current behavior).
 */
export async function settleFinalUrl(
  pollFn: SettlePollFn,
  options: SettleOptions = {},
): Promise<SettleResult> {
  const maxMs = options.maxMs ?? 12_000;
  const stableMs = options.stableMs ?? 1_500;
  const intervalMs = options.intervalMs ?? 400;
  const now = options.now ?? (() => Date.now());

  const start = now();
  const observed: string[] = [];

  // "Confirmed" = a URL that has been observed offsite for >= stableMs.
  // The settle loop will only return a finalUrl that has been confirmed
  // (or, on close, only if it had been confirmed before the tab vanished).
  let confirmedUrl: string | null = null;

  // The currently-tracked offsite URL we're trying to confirm.
  let trackedUrl: string | null = null;
  let trackedHost: string | null = null;
  let trackedSince: number | null = null;

  // If we bounce back to LinkedIn after seeing offsite, drop the tracking
  // window so a flap doesn't accidentally pass the stable threshold.
  function resetTracking(): void {
    trackedUrl = null;
    trackedHost = null;
    trackedSince = null;
  }

  while (now() - start < maxMs) {
    const state = await pollFn();
    if (state === null) {
      // Tab gone (closed). Return only confirmed URL — never a transient
      // single-poll sighting.
      return {
        finalUrl: confirmedUrl,
        observed,
        reason: "timeout",
        elapsedMs: now() - start,
      };
    }

    const picked = preferredUrlFromTabState(state);
    if (picked) observed.push(picked);

    if (!picked || !isOffsiteHttpUrl(picked)) {
      // Either a non-http poll (e.g. about:blank) or back on LinkedIn.
      // Drop tracking so a flap can't be summed up into a false stable.
      resetTracking();
    } else {
      const host = safeParse(picked)?.hostname.toLowerCase() ?? "";
      if (trackedUrl === null) {
        // First offsite sighting — start tracking.
        trackedUrl = picked;
        trackedHost = host;
        trackedSince = now();
      } else if (trackedUrl === picked) {
        // Same URL again — check stability.
        if (trackedSince !== null && now() - trackedSince >= stableMs) {
          confirmedUrl = picked;
          if (state.readyState === "complete" || state.readyState === undefined) {
            return {
              finalUrl: picked,
              observed,
              reason: "stable",
              elapsedMs: now() - start,
            };
          }
        }
      } else if (trackedHost === host) {
        // Same host, different URL (tracking-param churn). Update the
        // tracked URL but keep the timer — host stability is the goal.
        trackedUrl = picked;
        if (trackedSince !== null && now() - trackedSince >= stableMs) {
          confirmedUrl = picked;
          return {
            finalUrl: picked,
            observed,
            reason: "host-stable",
            elapsedMs: now() - start,
          };
        }
      } else {
        // New offsite host — restart tracking on the new host.
        trackedUrl = picked;
        trackedHost = host;
        trackedSince = now();
      }
    }

    await sleep(intervalMs, now);
  }

  return {
    finalUrl: confirmedUrl,
    observed,
    reason: "timeout",
    elapsedMs: now() - start,
  };
}

function safeParse(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

async function sleep(ms: number, now: () => number): Promise<void> {
  if (ms <= 0) return;
  // Defer through setTimeout. Do NOT call `unref()` — that lets the process
  // exit before the settle loop finishes if it's the only pending work.
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
  void now;
}
