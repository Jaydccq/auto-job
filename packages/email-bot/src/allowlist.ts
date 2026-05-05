/**
 * Allowlist loader.
 *
 * The live file `config/email-verification-allowlist.yml` is gitignored.
 * The example file ships in repo with disabled defaults.
 *
 * Schema:
 *
 *   hosts:
 *     - host: "myworkdayjobs.com"
 *       auto_click: true
 *       confirm_button_selector: "button[data-action='confirm']"  # optional
 *     - host: "talent.icims.com"
 *       auto_click: false  # listed but not yet trusted
 *
 * `auto_click: false` means "I want to see this in `email-bot list` but
 * the bot must not click yet". `verifyLink` refuses such hosts at runtime.
 */

import { existsSync, readFileSync } from "node:fs";

import { parse as parseYaml } from "yaml";

const DEFAULT_PATH = "config/email-verification-allowlist.yml";

export interface AllowlistEntry {
  host: string;
  /** When false, listed-but-not-trusted; verifyLink refuses. */
  autoClick: boolean;
  /** Optional per-host confirm-button CSS selector. */
  confirmButtonSelector?: string;
}

export interface Allowlist {
  entries: readonly AllowlistEntry[];
  /** Convenience map; lower-cased host → entry. */
  byHost: ReadonlyMap<string, AllowlistEntry>;
}

export interface LoadOptions {
  filePath?: string;
}

const EMPTY: Allowlist = { entries: [], byHost: new Map() };

export function loadAllowlist(opts: LoadOptions = {}): Allowlist {
  const filePath = opts.filePath ?? DEFAULT_PATH;
  if (!existsSync(filePath)) return EMPTY;
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parseYaml(raw) as { hosts?: unknown } | null;
  if (!parsed || typeof parsed !== "object") return EMPTY;
  const hosts = Array.isArray(parsed.hosts) ? parsed.hosts : [];
  const entries: AllowlistEntry[] = [];
  for (const item of hosts) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const host = typeof raw.host === "string" ? raw.host.trim().toLowerCase() : "";
    if (!host) continue;
    const entry: AllowlistEntry = {
      host,
      autoClick: raw.auto_click === true,
    };
    if (typeof raw.confirm_button_selector === "string" && raw.confirm_button_selector.trim().length > 0) {
      entry.confirmButtonSelector = raw.confirm_button_selector.trim();
    }
    entries.push(entry);
  }
  const byHost = new Map<string, AllowlistEntry>();
  for (const e of entries) byHost.set(e.host, e);
  return { entries, byHost };
}
