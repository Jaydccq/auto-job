/**
 * @auto-job/browser — public type contracts.
 *
 * Imported by the BrowserController + Tab implementation and re-exported
 * from the package root. Site adapters import these to type their inputs
 * and outputs against the Tab surface.
 */

export interface ControllerOptions {
  /** User-data-dir for the dedicated profile. Default: ~/.auto-job/chrome-profile */
  profileDir?: string;
  /** CDP debug port. Default: 47320 */
  port?: number;
  /** Explicit Chrome binary path. Default: auto-detect (Chrome for Testing > Chrome > Chromium). */
  chromeBinary?: string;
  /** When true, suppress the visible window via --headless=new. Default: false. */
  headless?: boolean;
  /** Extra args appended to the Chrome launch command. Default: []. */
  extraArgs?: readonly string[];
  /** Maximum ms to wait for Chrome to expose CDP after launch. Default: 30000. */
  launchTimeoutMs?: number;
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
}

export interface NavigateOptions {
  /** Default: "load". */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Per-call timeout in ms. Default: 30000. */
  timeoutMs?: number;
}

export interface FetchInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** When true, parse response body as JSON before returning. Default: false. */
  json?: boolean;
}

export interface FetchResult {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  /** Raw response body as string. */
  body: string;
  /** Parsed JSON body when init.json was true and parse succeeded. */
  json?: unknown;
  /** Final URL after redirects. */
  url: string;
}

export interface ScreenshotOptions {
  fullPage?: boolean;
  /** Default: "png". */
  type?: "png" | "jpeg";
}

export interface RequestMatcher {
  /** Substring or RegExp to match against the request URL. */
  url?: string | RegExp;
  /** HTTP method filter (e.g. "GET", "POST"). */
  method?: string;
  /** Resource type filter (e.g. "xhr", "fetch", "document"). */
  resourceType?: string;
}

export interface WaitOptions {
  /** Per-call timeout in ms. Default: 30000. */
  timeoutMs?: number;
}

export interface NetworkRecord {
  url: string;
  method: string;
  status: number;
  resourceType: string;
  /** Response body when capturable. */
  body?: string;
}

/**
 * Subset of the playwright accessibility snapshot we actually use.
 * Kept loose so we can swap implementations without breaking consumers.
 */
export interface AccessibilitySnapshot {
  role: string;
  name?: string;
  value?: string | number;
  description?: string;
  children?: AccessibilitySnapshot[];
  [extra: string]: unknown;
}
