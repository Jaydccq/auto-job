/**
 * Risk-telemetry types — stable on-disk format for `data/risk-events.jsonl`
 * and `data/risk-cooldowns.jsonl`. Both files are append-only.
 *
 * Events are immutable facts; queries project across them.
 * Cooldowns are append-only; `loadCooldowns` projects to active set by
 * filtering `ends_at >= now`.
 */

/** Detection signal kinds. Strings in JSONL; enums avoided to keep the file
 *  human-readable in `tail -f data/risk-events.jsonl`. */
export type DetectionSignal =
  | "captcha"
  | "http_403"
  | "http_429"
  | "verification_required"
  | "login_redirect"
  | "silent_degradation";

export type RiskSeverity = "info" | "warning" | "alert";

export type EventSource =
  | "scan"
  | "fill"
  | "submit"
  | "verify-link"
  | "signup"
  | "manual";

export type EventKind =
  | "scan_result"
  | "fill_outcome"
  | "submit_outcome"
  | "verify_link_outcome"
  | "signup_outcome"
  | "detection_signal"
  | "force_cooldown";

export interface RiskEvent {
  /** ISO timestamp. */
  timestamp: string;
  kind: EventKind;
  source: EventSource;
  ats: string;
  tenant?: string;
  signal?: DetectionSignal;
  severity: RiskSeverity;
  /** Free-form note for the operator. */
  note?: string;
  /** Optional pointer to a snapshot dir for forensic review. */
  snapshotDir?: string;
}

export interface CooldownEntry {
  ats: string;
  /** ISO when the cooldown started. */
  started_at: string;
  /** ISO when the cooldown ends. Cooldown is active when now < ends_at. */
  ends_at: string;
  reason: string;
  signal?: DetectionSignal;
  /** "auto" when triggered by evaluateCooldowns; "manual" for force-cooldown. */
  origin: "auto" | "manual";
}

export interface SignalCooldownConfig {
  /** Hours; 0 disables. */
  captcha: number;
  http_403: number;
  http_429: number;
  verification_required: number;
  login_redirect: number;
  silent_degradation: number;
}

export const DEFAULT_SIGNAL_COOLDOWNS: SignalCooldownConfig = {
  captcha: 168,
  http_403: 168,
  http_429: 168,
  verification_required: 72,
  login_redirect: 168,
  silent_degradation: 24,
};
