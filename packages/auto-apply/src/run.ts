/**
 * runApplyFlow — orchestrator for one apply attempt.
 *
 * Sequence:
 *   1. resolve flow via applyFlowFor(request.ats)
 *   2. open tab on jobUrl, wait for load
 *   3. identify form
 *   4. wrap tab with humanize() — all subsequent fills go through it
 *   5. fill form via flow.fillForm
 *   6. write review snapshot (form.html + screenshot + data + result)
 *   7. if opts.allowSubmit === true: call flow.submit (NOT exercised by runner)
 *   8. close tab, return FillResult
 */

import type { BrowserController } from "@auto-job/browser";
import { humanize } from "@auto-job/humanize";

import { loadApplicationData } from "./profile.js";
import { applyFlowFor } from "./registry.js";
import { writeReviewSnapshot } from "./snapshot.js";
import type {
  ApplicationData,
  ApplyRequest,
  FillResult,
  SubmitResult,
} from "./types.js";

export interface RunOptions {
  /** Defaults to false; when true, also calls flow.submit afterwards. */
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
  submit?: SubmitResult;
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

    const schema = await flow.identifyForm(tab);
    const ht = humanize(tab);
    const fillCounts = await flow.fillForm(ht, schema, data);

    const filledAt = new Date().toISOString();
    const snapshotRoot = await writeReviewSnapshot(tab, {
      id: request.id,
      ats: request.ats,
      data,
      result: { ...fillCounts, filledAt },
      ...(opts.snapshotRoot ? { rootDir: opts.snapshotRoot } : {}),
    });

    const fill: FillResult = {
      ...fillCounts,
      filledAt,
      reviewSnapshotPath: snapshotRoot,
    };

    if (opts.allowSubmit === true) {
      const submit = await flow.submit(ht, { allowSubmit: true });
      return { fill, submit };
    }

    return { fill };
  } finally {
    await tab.close().catch(() => undefined);
  }
}
