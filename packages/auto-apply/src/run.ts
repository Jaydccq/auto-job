/**
 * runApplyFlow — fill-only orchestrator for one apply attempt.
 *
 * Sequence:
 *   1. resolve flow via applyFlowFor(request.ats)
 *   2. open tab on jobUrl, wait for load
 *   3. identify form
 *   4. wrap tab with humanize() — all subsequent fills go through it
 *   5. fill form via flow.fillForm
 *   6. write review snapshot (form.html + screenshot + data + result + MANIFEST)
 *   7. record telemetry (Phase 5)
 *   8. close tab, return FillResult
 *
 * Phase 2C contract: runApplyFlow NEVER calls flow.submit. The single
 * production call site that lifts the submit gate lives in
 * apps/server/src/apply-queue/runner.ts → processApprovedEntry.
 *
 * The legacy `opts.allowSubmit` parameter is preserved for API stability but
 * is now intentionally ignored — passing `true` is a no-op rather than a
 * footgun.
 */

import type { BrowserController } from "@auto-job/browser";
import { humanize } from "@auto-job/humanize";
import {
  recordFillOutcome,
  recordDetectionSignal,
} from "@auto-job/risk-telemetry";

import { DetectionSignalError, FormFillError } from "./errors.js";
import { loadApplicationData } from "./profile.js";
import { applyFlowFor } from "./registry.js";
import { writeReviewSnapshot } from "./snapshot.js";
import type {
  ApplicationData,
  ApplyRequest,
  FillResult,
} from "./types.js";

export interface RunOptions {
  /**
   * Phase 2C: this option is intentionally ignored. runApplyFlow is fill-only.
   * Real submission happens in apps/server/src/apply-queue/runner.ts →
   * processApprovedEntry, which is the single audited call site that lifts
   * the submit gate.
   *
   * Kept on the type for backwards-compat with Phase 2B callers.
   */
  allowSubmit?: boolean;
  /** Override profile path for tests. */
  profilePath?: string;
  /** Override snapshot root for tests. */
  snapshotRoot?: string;
  /** Pre-loaded ApplicationData (skips disk profile load). */
  applicationData?: ApplicationData;
}

export interface RunResult {
  fill: FillResult;
}

export async function runApplyFlow(
  controller: BrowserController,
  request: ApplyRequest,
  opts: RunOptions = {},
): Promise<RunResult> {
  const flow = applyFlowFor(request.ats);
  const data = opts.applicationData ?? loadApplicationData({ ...(opts.profilePath ? { profilePath: opts.profilePath } : {}) });

  const tab = await controller.openTab(request.jobUrl);
  try {
    // Brief settle so SPA forms hydrate.
    await new Promise((r) => setTimeout(r, 1500));

    let fillCounts;
    let filledAt: string;
    let snapshotRoot: string;
    try {
      const schema = await flow.identifyForm(tab);
      const ht = humanize(tab);
      fillCounts = await flow.fillForm(ht, schema, data);
      filledAt = new Date().toISOString();
      snapshotRoot = await writeReviewSnapshot(tab, {
        id: request.id,
        ats: request.ats,
        data,
        result: { ...fillCounts, filledAt },
        manifest: { jobUrl: request.jobUrl },
        ...(opts.snapshotRoot ? { rootDir: opts.snapshotRoot } : {}),
      });
    } catch (rawErr) {
      // Phase 5 — record outcome telemetry on fill failure path.
      if (rawErr instanceof DetectionSignalError) {
        recordDetectionSignal({
          ats: request.ats,
          signal: mapAdapterSignal(rawErr.signal),
          source: "fill",
          note: rawErr.message,
        });
        recordFillOutcome({
          ats: request.ats,
          outcome: "detected",
          signal: mapAdapterSignal(rawErr.signal),
          note: rawErr.message,
        });
      } else if (rawErr instanceof FormFillError) {
        recordFillOutcome({ ats: request.ats, outcome: "fill_error", note: rawErr.message });
      } else {
        recordFillOutcome({
          ats: request.ats,
          outcome: "fill_error",
          note: rawErr instanceof Error ? rawErr.message : String(rawErr),
        });
      }
      throw rawErr;
    }

    recordFillOutcome({
      ats: request.ats,
      outcome: "filled",
      note: `fields filled=${fillCounts.fieldsFilled} skipped=${fillCounts.fieldsSkipped.length}`,
      snapshotDir: snapshotRoot,
    });

    const fill: FillResult = {
      ...fillCounts,
      filledAt,
      reviewSnapshotPath: snapshotRoot,
    };

    return { fill };
  } finally {
    await tab.close().catch(() => undefined);
  }
}

/**
 * Map auto-apply's per-adapter detection-signal label to the canonical
 * risk-telemetry signal kind. Adapters use a smaller vocabulary; everything
 * we don't recognize folds into `silent_degradation`.
 */
function mapAdapterSignal(s: string): import("@auto-job/risk-telemetry").DetectionSignal {
  if (s === "captcha") return "captcha";
  if (s === "http_403") return "http_403";
  if (s === "http_429") return "http_429";
  if (s === "login_redirect") return "login_redirect";
  return "silent_degradation";
}
