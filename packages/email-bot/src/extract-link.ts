/**
 * Single-link extractor.
 *
 * Pulls every http(s) URL from an email body (HTML or text), keeps only those
 * whose host (or any parent of `.example.com`-style domain) appears in the
 * allowlist, dedupes by canonical URL, and refuses to return anything but
 * exactly ONE.
 *
 * Defense: real verification CTAs are unique. Multiple matches → likely
 * shenanigans (forwarded thread, phishing addition, footer reuse).
 */

import { MultiLinkAmbiguousError } from "./errors.js";
import type { Allowlist } from "./allowlist.js";

const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/gi;

function parseHostSafely(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function hostMatchesAllowlist(host: string, allowlist: Allowlist): boolean {
  // Exact match or suffix on . boundaries.
  for (const entry of allowlist.entries) {
    if (host === entry.host) return true;
    if (host.endsWith(`.${entry.host}`)) return true;
  }
  return false;
}

export function extractVerificationLink(emailBody: string, allowlist: Allowlist): string {
  const matches = emailBody.matchAll(URL_REGEX);
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const m of matches) {
    let raw = m[0];
    // Strip trailing punctuation that often clings to URLs in plain text.
    raw = raw.replace(/[.,;:!?]+$/, "");
    if (seen.has(raw)) continue;
    seen.add(raw);
    const host = parseHostSafely(raw);
    if (!host) continue;
    if (!hostMatchesAllowlist(host, allowlist)) continue;
    candidates.push(raw);
  }
  if (candidates.length === 1) return candidates[0]!;
  throw new MultiLinkAmbiguousError(candidates);
}
