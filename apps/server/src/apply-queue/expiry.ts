/**
 * runExpirySweep — flip stale `awaiting_approval` entries to `expired`.
 *
 * TTL comes from `policy.approval_ttl_hours` (default 24). 0 disables sweep.
 *
 * Sweep is intentionally NOT triggered automatically on read — it's an
 * explicit operation invoked by the runner before the next fill or by the
 * `auto-apply-approve sweep` CLI subcommand. This avoids surprise expirations
 * during a `list` query.
 */

import { loadPolicy, type LoadOptions as PolicyLoadOptions } from "./policy.js";
import { markStatus, readQueue, type QueueOptions } from "./queue.js";
import type { ApplyPolicy } from "./types.js";

export interface SweepOptions extends QueueOptions {
  /** Override policy load path. */
  policyPath?: string;
  /** Override policy directly (skips disk read; useful for tests). */
  policy?: ApplyPolicy;
  /** "Now" override for tests, in ms since epoch. */
  nowMs?: number;
}

export interface SweepResult {
  expired: number;
  scanned: number;
}

export function runExpirySweep(opts: SweepOptions = {}): SweepResult {
  const policyOpts: PolicyLoadOptions = opts.policyPath ? { filePath: opts.policyPath } : {};
  const policy = opts.policy ?? loadPolicy(policyOpts);
  const ttlHours = policy.approval_ttl_hours;
  const queueArgs: QueueOptions = opts.filePath ? { filePath: opts.filePath } : {};
  const queue = readQueue(queueArgs);
  if (ttlHours <= 0) {
    return { expired: 0, scanned: queue.length };
  }
  const ttlMs = ttlHours * 3600_000;
  const now = opts.nowMs ?? Date.now();
  let expired = 0;
  for (const entry of queue) {
    if (entry.status !== "awaiting_approval") continue;
    const ageMs = now - Date.parse(entry.status_at);
    if (ageMs >= ttlMs) {
      markStatus(
        entry.id,
        "expired",
        { notes: `expired after ${ttlHours}h waiting for approval` },
        queueArgs,
      );
      expired += 1;
    }
  }
  return { expired, scanned: queue.length };
}
