/**
 * Apply-queue runner.
 *
 * Two entry points:
 *
 *   processNextApplyEntry(controller)
 *     1. read queue, find first "ready" entry
 *     2. mark "in_flight"
 *     3. call runApplyFlow(...) with allowSubmit:false (ALWAYS)
 *     4. on success: mark "awaiting_approval" with snapshot path in notes
 *     5. on FormFillError: mark "failed"
 *     6. on DetectionSignalError: mark "detected" (triggers cooldown)
 *
 *   processApprovedEntry(controller, id)
 *     1. read queue, look up entry
 *     2. require status === "awaiting_approval" (else throw EntryNotApprovableError)
 *     3. re-run runApplyFlow(allowSubmit:false) defensively to refresh form state
 *     4. invoke flow.submit(humanizedTab, { allowSubmit: true }) — THE ONLY
 *        call site in production code that lifts the submit gate
 *     5. on submit success: mark "submitted" with submittedAt + finalUrl
 *     6. on submit failure: mark "submit_failed" with error notes
 *     7. on DetectionSignalError: mark "detected"
 */

import type { BrowserController } from "@auto-job/browser";
import {
  runApplyFlow,
  applyFlowFor,
  loadApplicationData,
  DetectionSignalError,
  FormFillError,
  type SupportedATS,
} from "@auto-job/auto-apply";
import { humanize } from "@auto-job/humanize";

import { EntryNotApprovableError } from "./errors.js";
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
  outcome?: "awaiting_approval" | "failed" | "detected";
  reason?: string;
}

export interface ApproveResult {
  outcome: "submitted" | "submit_failed" | "detected";
  entry: ApplyQueueEntry;
  /** Final URL the submit landed on, if outcome === "submitted". */
  finalUrl?: string;
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
        // Phase 2C: queue runner ALWAYS fills only. Real submit happens in
        // processApprovedEntry, gated on explicit user approval.
        allowSubmit: false,
        ...(opts.snapshotRoot ? { snapshotRoot: opts.snapshotRoot } : {}),
        ...(opts.profilePath ? { profilePath: opts.profilePath } : {}),
      },
    );
    markStatus(
      next.id,
      "awaiting_approval",
      {
        notes:
          `fill complete; snapshot at ${result.fill.reviewSnapshotPath}; ` +
          `${result.fill.fieldsFilled} filled, ${result.fill.fieldsSkipped.length} skipped; ` +
          `review + approve via \`auto-apply-approve ${next.id}\``,
      },
      queueArgs,
    );
    return { processed: true, entry: next, outcome: "awaiting_approval" };
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

/**
 * The ONE AND ONLY production code path that lifts the submit gate.
 *
 * Defense in depth — even if other code (or future bugs) tried to call
 * `runApplyFlow(allowSubmit:true)` directly, the queue runner refuses to do
 * it. Only this function, invoked through the explicit approval CLI, ever
 * reaches the adapter's `submit` with `allowSubmit:true`.
 */
export async function processApprovedEntry(
  controller: BrowserController,
  id: string,
  opts: ProcessOptions = {},
): Promise<ApproveResult> {
  const queueArgs = opts.queuePath ? { filePath: opts.queuePath } : {};
  const queue = readQueue(queueArgs);
  const entry = queue.find((e) => e.id === id);
  if (!entry) {
    throw new EntryNotApprovableError(id, "<missing>");
  }
  if (entry.status !== "awaiting_approval") {
    throw new EntryNotApprovableError(id, entry.status);
  }

  // Defensive re-fill against the live page first. If the saved form state
  // expired (cookie timeout, posting closed) we want to fail BEFORE clicking
  // Submit, not while clicking it.
  try {
    await runApplyFlow(
      controller,
      {
        id: entry.id,
        ats: entry.ats as SupportedATS,
        jobUrl: entry.jobUrl,
        ...(entry.vault_ref ? { vaultRef: entry.vault_ref } : {}),
      },
      {
        allowSubmit: false,
        ...(opts.snapshotRoot ? { snapshotRoot: opts.snapshotRoot } : {}),
        ...(opts.profilePath ? { profilePath: opts.profilePath } : {}),
      },
    );
  } catch (rawErr) {
    if (rawErr instanceof DetectionSignalError) {
      markStatus(
        id,
        "detected",
        { notes: `re-fill detection "${rawErr.signal}": ${rawErr.message}` },
        queueArgs,
      );
      return { outcome: "detected", entry, reason: rawErr.message };
    }
    const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
    markStatus(id, "submit_failed", { notes: `re-fill failed before submit: ${message}` }, queueArgs);
    return { outcome: "submit_failed", entry, reason: message };
  }

  // Re-fill ok. Open a fresh tab on the same URL and run the submit through
  // the per-ATS adapter.
  const flow = applyFlowFor(entry.ats);
  const data = loadApplicationData(opts.profilePath ? { profilePath: opts.profilePath } : {});
  const tab = await controller.openTab(entry.jobUrl);
  try {
    await new Promise((r) => setTimeout(r, 1500));
    const schema = await flow.identifyForm(tab);
    const ht = humanize(tab);
    await flow.fillForm(ht, schema, data);
    // The single, audited allowSubmit:true call site.
    const submitResult = await flow.submit(ht, { allowSubmit: true });
    if (!submitResult.appearsSuccessful) {
      markStatus(
        id,
        "submit_failed",
        {
          notes:
            `submit returned but appearsSuccessful=false; finalUrl=${submitResult.finalUrl}`,
        },
        queueArgs,
      );
      return {
        outcome: "submit_failed",
        entry,
        finalUrl: submitResult.finalUrl,
        reason: "appearsSuccessful=false",
      };
    }
    markStatus(
      id,
      "submitted",
      {
        notes:
          `submitted at ${submitResult.submittedAt}; ` +
          `finalUrl=${submitResult.finalUrl}`,
      },
      queueArgs,
    );
    return { outcome: "submitted", entry, finalUrl: submitResult.finalUrl };
  } catch (rawErr) {
    if (rawErr instanceof DetectionSignalError) {
      markStatus(
        id,
        "detected",
        { notes: `submit detection "${rawErr.signal}": ${rawErr.message}` },
        queueArgs,
      );
      return { outcome: "detected", entry, reason: rawErr.message };
    }
    const message = rawErr instanceof Error ? rawErr.message : String(rawErr);
    markStatus(id, "submit_failed", { notes: `submit threw: ${message}` }, queueArgs);
    return { outcome: "submit_failed", entry, reason: message };
  } finally {
    await tab.close().catch(() => undefined);
  }
}
