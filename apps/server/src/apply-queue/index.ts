/**
 * apply-queue module — score-gated auto-apply queue.
 *
 * Public surface:
 *   loadPolicy() → ApplyPolicy (defaults disabled)
 *   applyGate(evaluation, policy, queue) → {enqueue, reason}
 *   enqueue(entry) → ApplyQueueEntry (status: "ready")
 *   readQueue() → ApplyQueueEntry[] (latest-line-wins projection)
 *   markStatus(id, status, patch?) → void
 *
 * Architecture: defaults disable everything. Auto-apply only runs when
 * the user explicitly opts in by editing config/auto-apply-policy.yml.
 */

export { enqueue, markStatus, readQueue, type QueueOptions } from "./queue.js";
export { loadPolicy, DISABLED_POLICY, type LoadOptions } from "./policy.js";
export { applyGate, type GateOptions } from "./gate.js";
export {
  processNextApplyEntry,
  processApprovedEntry,
  type ProcessOptions,
  type ProcessResult,
  type ApproveResult,
} from "./runner.js";
export { runExpirySweep, type SweepOptions, type SweepResult } from "./expiry.js";
export { EntryNotApprovableError } from "./errors.js";
export type {
  ApplyPolicy,
  ApplyQueueEntry,
  ApplyStatus,
  Evaluation,
  GateResult,
} from "./types.js";
