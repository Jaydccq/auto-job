/**
 * Heuristic detection-signal recognition.
 *
 * Five rules, in priority order:
 *   1. CAPTCHA element present in the captured HTML
 *   2. HTTP 403 / 429 status from the main resource
 *   3. Body text matches verification / "are you human" patterns
 *   4. Final URL after navigation matches a login pattern when an apply
 *      page was expected
 *   5. Silent degradation — form fill found < N standard fields when the
 *      ATS normally exposes >= N (caller supplies the threshold)
 *
 * Each rule is independent; the first one that fires wins. We return null
 * when nothing fires.
 */

import type { DetectionSignal } from "./types.js";

export interface AnalyzeSnapshot {
  /** Captured HTML, lowercased before regex/substring checks. */
  html: string;
  /** HTTP status of the main resource. 0 means "unknown". */
  statusCode?: number;
  /** Final URL after navigation. */
  finalUrl?: string;
  /**
   * Origin we expected (e.g. `boards.greenhouse.io`). When set and the
   * final URL's host doesn't match, we trigger login_redirect (rule 4).
   */
  expectedHostSuffix?: string;
  /**
   * Number of standard fields the form filler found AT or below
   * a degradation threshold. Caller decides the threshold; we just check
   * presence of this signal.
   */
  formStandardFieldsBelowThreshold?: boolean;
}

export interface DetectionResult {
  signal: DetectionSignal;
  evidence: string;
}

const CAPTCHA_PATTERNS = [
  /iframe[^>]*src="[^"]*recaptcha/i,
  /class="[^"]*h-captcha/i,
  /id="[^"]*hcaptcha/i,
  /data-sitekey=/i,
  /turnstile-widget/i,
];

const VERIFICATION_PATTERNS = [
  /access denied/i,
  /verification required/i,
  /are you (?:a )?human/i,
  /please verify you are human/i,
  /security check/i,
];

const LOGIN_URL_PATTERNS = [/\/login(?:\W|$)/i, /\/signin(?:\W|$)/i, /\/auth(?:\W|$)/i, /\/account\/login/i];

export function analyzeForDetection(snapshot: AnalyzeSnapshot): DetectionResult | null {
  // Rule 1 — CAPTCHA element.
  for (const pat of CAPTCHA_PATTERNS) {
    if (pat.test(snapshot.html)) {
      return { signal: "captcha", evidence: `captcha pattern matched: ${pat.source}` };
    }
  }

  // Rule 2 — HTTP 403 / 429.
  if (snapshot.statusCode === 403) {
    return { signal: "http_403", evidence: `HTTP 403 on main resource` };
  }
  if (snapshot.statusCode === 429) {
    return { signal: "http_429", evidence: `HTTP 429 on main resource` };
  }

  // Rule 3 — verification text.
  for (const pat of VERIFICATION_PATTERNS) {
    if (pat.test(snapshot.html)) {
      return { signal: "verification_required", evidence: `verification text matched: ${pat.source}` };
    }
  }

  // Rule 4 — login redirect.
  if (snapshot.finalUrl && snapshot.expectedHostSuffix) {
    let host = "";
    try {
      host = new URL(snapshot.finalUrl).hostname.toLowerCase();
    } catch {
      // unparseable URL is itself suspicious; treat as login redirect.
      return { signal: "login_redirect", evidence: `unparseable finalUrl ${snapshot.finalUrl}` };
    }
    const suffix = snapshot.expectedHostSuffix.toLowerCase();
    const onExpectedHost = host === suffix || host.endsWith(`.${suffix}`);
    const looksLikeLogin = LOGIN_URL_PATTERNS.some((p) => p.test(snapshot.finalUrl!));
    if (looksLikeLogin || !onExpectedHost) {
      return {
        signal: "login_redirect",
        evidence: `redirected to ${snapshot.finalUrl} (expected ${suffix})`,
      };
    }
  }

  // Rule 5 — silent degradation.
  if (snapshot.formStandardFieldsBelowThreshold === true) {
    return {
      signal: "silent_degradation",
      evidence: "fill found fewer standard fields than expected; possible page tampering",
    };
  }

  return null;
}
