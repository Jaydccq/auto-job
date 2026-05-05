/**
 * applyGate — pre-enqueue decision for an evaluation.
 *
 * Returns {enqueue, reason}. The system NEVER auto-acts unless this returns
 * enqueue: true. Default policy returns enqueue: false for everything.
 *
 * Decision order (first failing reason wins):
 *   1. auto_threshold null → "auto-apply disabled by config"
 *   2. score < auto_threshold → "score X below threshold Y"
 *   3. ats not in supported list → "ATS X not in supported list"
 *   4. daily quota for ATS reached → "daily quota for X reached"
 *   5. global daily quota reached → "global daily quota reached"
 *   6. ATS in active cooldown → "ATS X in cooldown until ..."
 *   7. otherwise → enqueue: true
 */

import type {
  ApplyPolicy,
  ApplyQueueEntry,
  Evaluation,
  GateResult,
} from "./types.js";

const SUPPORTED_ATS_DEFAULT = ["greenhouse", "lever", "ashby", "workday", "icims"] as const;

export interface GateOptions {
  /** Override the supported-ATS allowlist. */
  supportedAts?: readonly string[];
  /** "Now" override for tests. */
  nowMs?: number;
}

export function applyGate(
  evaluation: Evaluation,
  policy: ApplyPolicy,
  queue: readonly ApplyQueueEntry[],
  opts: GateOptions = {},
): GateResult {
  if (policy.auto_threshold === null) {
    return { enqueue: false, reason: "auto-apply disabled by config" };
  }
  if (evaluation.score < policy.auto_threshold) {
    return {
      enqueue: false,
      reason: `score ${evaluation.score} below threshold ${policy.auto_threshold}`,
    };
  }
  const supported = opts.supportedAts ?? SUPPORTED_ATS_DEFAULT;
  if (!supported.includes(evaluation.ats)) {
    return { enqueue: false, reason: `ATS ${evaluation.ats} not in supported list` };
  }
  const now = opts.nowMs ?? Date.now();
  const todayStart = startOfTodayMs(now);

  // Per-ATS daily quota
  const perAtsLimit = policy.daily_quota.per_ats[evaluation.ats] ?? 0;
  if (perAtsLimit === 0) {
    return { enqueue: false, reason: `daily quota for ${evaluation.ats} is 0 (disabled)` };
  }
  const todayForAts = queue.filter(
    (q) =>
      q.ats === evaluation.ats &&
      Date.parse(q.queued_at) >= todayStart &&
      (q.status === "ready" || q.status === "in_flight" || q.status === "succeeded"),
  );
  if (todayForAts.length >= perAtsLimit) {
    return {
      enqueue: false,
      reason: `daily quota for ${evaluation.ats} (${perAtsLimit}) already reached`,
    };
  }

  // Global daily quota
  if (policy.daily_quota.total === 0) {
    return { enqueue: false, reason: "global daily quota is 0 (disabled)" };
  }
  const todayAll = queue.filter(
    (q) =>
      Date.parse(q.queued_at) >= todayStart &&
      (q.status === "ready" || q.status === "in_flight" || q.status === "succeeded"),
  );
  if (todayAll.length >= policy.daily_quota.total) {
    return {
      enqueue: false,
      reason: `global daily quota (${policy.daily_quota.total}) already reached`,
    };
  }

  // Cooldown — ATS has a recent "detected" entry
  const recentDetections = queue.filter(
    (q) =>
      q.ats === evaluation.ats &&
      q.status === "detected" &&
      now - Date.parse(q.status_at) < policy.cooldown.on_captcha_hours * 3600_000,
  );
  if (recentDetections.length > 0) {
    const latest = recentDetections[recentDetections.length - 1]!;
    const cooldownEndsMs = Date.parse(latest.status_at) + policy.cooldown.on_captcha_hours * 3600_000;
    return {
      enqueue: false,
      reason: `ATS ${evaluation.ats} in cooldown until ${new Date(cooldownEndsMs).toISOString()}`,
    };
  }

  return { enqueue: true, reason: "ok" };
}

function startOfTodayMs(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
