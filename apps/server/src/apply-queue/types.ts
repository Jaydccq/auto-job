/**
 * Apply-queue types — stable on-disk format.
 *
 * Backed by data/apply-queue.jsonl (gitignored). Append-only, latest-line-wins
 * per `id`. See ./queue.ts for read/write behavior and ./gate.ts for the
 * pre-enqueue decision.
 */

export type ApplyStatus =
  | "ready"        // gate passed, awaiting fire
  | "in_flight"   // engine working on it
  | "succeeded"   // submitted successfully
  | "failed"      // engine threw a non-detection error
  | "detected"    // bot/captcha/auth-block signal — triggers cooldown
  | "skipped";    // operator manually skipped

export interface ApplyQueueEntry {
  id: string;                   // stable per-application id
  jobId: string;                // job/posting id
  ats: string;                  // SiteId from @auto-job/browser/sites
  tenant: string;               // company slug
  jobUrl: string;               // canonical posting URL
  vault_ref: string;            // vault key (auto-job:<ats>-<tenant>) — never the secret
  score: number;                // evaluation score 0-5
  queued_at: string;            // ISO timestamp
  status: ApplyStatus;
  status_at: string;            // ISO timestamp of last status change
  attempts: number;
  /** Optional notes for ops (e.g. "first attempt got captcha"). */
  notes?: string;
}

/** Subset of EvaluationResult used by the gate. */
export interface Evaluation {
  jobId: string;
  ats: string;
  tenant: string;
  jobUrl: string;
  score: number;
}

export interface ApplyPolicy {
  /** null means auto-apply disabled completely. */
  auto_threshold: number | null;
  daily_quota: {
    total: number;
    per_ats: Record<string, number>;
  };
  cooldown: {
    on_captcha_hours: number;
    on_account_locked_hours: number;
    on_verification_required_hours: number;
  };
  inter_apply_delay: {
    min_seconds: number;
    same_ats_min_seconds: number;
  };
  humanizer: {
    reading_speed_wpm: [number, number];
    typing_wpm: [number, number];
    click_dwell_ms: [number, number];
  };
}

export interface GateResult {
  enqueue: boolean;
  reason: string;
}
