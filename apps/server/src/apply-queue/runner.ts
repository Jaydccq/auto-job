/**
 * Apply-queue runner skeleton.
 *
 * processNextApplyEntry(controller):
 *   1. read queue, find first "ready" entry
 *   2. mark "in_flight"
 *   3. call runApplyFlow(...) with allowSubmit:false (ALWAYS in this change)
 *   4. on success: mark "succeeded" with snapshot path in notes
 *   5. on AdapterParseError / FormFillError: mark "failed"
 *   6. on DetectionSignalError: mark "detected" (triggers cooldown)
 */

import type { BrowserController } from "@auto-job/browser";
import { runApplyFlow, DetectionSignalError, FormFillError, type SupportedATS } from "@auto-job/auto-apply";

import { markStatus, readQueue } from "./queue.js";
import type { ApplyQueueEntry } from "./types.js";

export interface ProcessOptions {
  /** Override queue path for tests. */
  queuePath?: string;
  /** Override snapshot root for tests. */
  snapshotRoot?: string;
  /** Override profile path for tests. */
  profilePath?: string;
}

export interface ProcessResult {
  processed: boolean;
  entry?: ApplyQueueEntry;
  outcome?: "succeeded" | "failed" | "detected";
  reason?: string;
}

export async function processNextApplyEntry(
  controller: BrowserController,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const queueArgs = opts.queuePath ? { filePath: opts.queuePath } : {};
  const queue = readQueue(queueArgs);
  const next = queue.find((e) => e.status === "ready");
  if (!next) return { processed: false };

  // Mark in_flight first so concurrent runners don't double-process.
  markStatus(next.id, "in_flight", { attempts: next.attempts + 1 }, queueArgs);

  try {
    const result = await runApplyFlow(
      controller,
      {
        id: next.id,
        ats: next.ats as SupportedATS,
        jobUrl: next.jobUrl,
        ...(next.vault_ref ? { vaultRef: next.vault_ref } : {}),
      },
      {
        // Phase 2B always blocks submit. Phase 2C will introduce the user-
        // facing opt-in surface that flips this for explicitly-confirmed
        // applications.
        allowSubmit: false,
        ...(opts.snapshotRoot ? { snapshotRoot: opts.snapshotRoot } : {}),
        ...(opts.profilePath ? { profilePath: opts.profilePath } : {}),
      },
    );
    markStatus(
      next.id,
      "succeeded",
      {
        notes: `fill-simulation; snapshot at ${result.fill.reviewSnapshotPath}; ${result.fill.fieldsFilled} filled, ${result.fill.fieldsSkipped.length} skipped`,
      },
      queueArgs,
    );
    return { processed: true, entry: next, outcome: "succeeded" };
  } catch (rawErr) {
    const err = rawErr as Error;
    if (rawErr instanceof DetectionSignalError) {
      markStatus(
        next.id,
        "detected",
        { notes: `detection signal "${rawErr.signal}": ${rawErr.message}` },
        queueArgs,
      );
      return { processed: true, entry: next, outcome: "detected", reason: rawErr.message };
    }
    if (rawErr instanceof FormFillError) {
      markStatus(
        next.id,
        "failed",
        { notes: `fill error on field ${rawErr.fieldKey ?? "<unknown>"}: ${rawErr.message}` },
        queueArgs,
      );
      return { processed: true, entry: next, outcome: "failed", reason: rawErr.message };
    }
    const message = err instanceof Error ? err.message : String(rawErr);
    markStatus(next.id, "failed", { notes: `unexpected error: ${message}` }, queueArgs);
    return { processed: true, entry: next, outcome: "failed", reason: message };
  }
}
