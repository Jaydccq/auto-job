# 2026-04-29 Newgrad Scan Run

## Background

The user requested `/new grad scan`, which maps to the repository-native
`newgrad-scan` workflow.

## Goal

Run the autonomous newgrad scan from the local checkout and let the default
`newgrad_quick` evaluation path process enrich survivors.

## Scope

- Use the checked-in `npm run newgrad-scan` command.
- Preserve unrelated worktree changes.
- Record scan artifacts and blockers in this plan.

## Assumptions

- The existing bridge on `127.0.0.1:47319` is the intended local bridge.
- Default scan behavior should include evaluation unless explicitly disabled.
- User-owned files remain the source of personalization and scan policy.

## Implementation Steps

1. Confirm required user-layer files exist.
   Verify: `cv.md`, `config/profile.yml`, `modes/_profile.md`, and `portals.yml`
   are non-empty.
2. Confirm bridge health with the scanner's token path.
   Verify: `/v1/health` accepts `apps/server/.bridge-token`.
3. Run the autonomous scanner.
   Verify: command exits cleanly or emits a concrete blocker.
4. If the scanner hangs, make the smallest runner fix needed to turn the hang
   into a bounded failure.
   Verify: rerun reaches a summary artifact.
5. Inspect scan summary artifacts.
   Verify: latest `data/scan-runs/*-summary.json` explains counts, queued
   evaluations, and failures.

## Verification Approach

Use the scanner exit status and its generated summary JSON. If evaluations run,
also inspect the summary for queue and completion counts.

## Progress Log

- 2026-04-29: Required user-layer files exist.
- 2026-04-29: Unauthenticated bridge health returned `UNAUTHORIZED`, confirming
  the bridge is listening and token-protected.
- 2026-04-29: First sandboxed `npm run newgrad-scan` failed before scanning
  with `listen EPERM` on the `tsx` IPC pipe.
- 2026-04-29: Approved rerun outside the sandbox reached bridge health, scanned
  156 rows, promoted 88, then stopped advancing during detail enrichment. The
  JSONL artifact was `data/scan-runs/newgrad-20260429T043533Z-d818aa53.jsonl`;
  no summary JSON was written before termination.
- 2026-04-29: Added explicit timeouts around page-side detail extraction and
  apply-flow probing in `scripts/newgrad-scan-autonomous.ts`.
- 2026-04-29: Bounded verification run completed with summary
  `data/scan-runs/newgrad-20260429T044902Z-c5c8d497-summary.json`.
  It discovered 155 rows, promoted 88, enriched 10, skipped 10 at the bridge
  detail gate, and queued 0 evaluations.
- 2026-04-29: Full rerun completed with summary
  `data/scan-runs/newgrad-20260429T045051Z-5cda0ac4-summary.json`.
  It discovered 154 rows, promoted 88, filtered 66, enriched 88, failed 0
  enrichments, skipped 88 at the bridge detail gate, and queued 0 evaluations.
- 2026-04-29: Confirmed no `newgrad-scan` or scan-browser process remained
  after completion.
- 2026-04-29: Performance pass on `scripts/newgrad-scan-autonomous.ts`. Full
  scan now completes in 6:49 (vs 15:43 previously) — ~2.3× faster. Changes:
  detail-page navigation no longer waits the unconditional 1s after
  `domcontentloaded`; per-page goto/network-idle ceilings tightened to 30s/5s;
  default concurrency 3→6; inter-batch delay 2000–5000ms→250–750ms; apply-flow
  click wait 2500ms→800ms and probe timeout 20s→8s; image/media/font requests
  blocked at the context level. Verification:
  `data/scan-runs/newgrad-20260429T060048Z-17cbc1cf-summary.json`
  (discovered 154, promoted 89, enriched 89, failed 0).
- 2026-04-29: Same performance pattern fixed in
  `scripts/linkedin-scan-bb-browser.ts` and
  `scripts/job-board-scan-bb-browser.ts`. LinkedIn scan: `openBbTab` post-open
  sleep 2000ms→1000ms; `readExternalAtsDetail` 3500ms→1500ms with a single
  retry only when extracted description is too short; both `probeExternalApply`
  hard 2500ms click waits cut to 800ms. Job-board scan: `enrichRows` no longer
  fetches detail pages sequentially — it now uses a fixed worker pool of 5
  concurrent `bb-browser fetch` calls, preserving result order, expecting a
  ~5× speedup on the detail-fetch phase. Live verification of these two
  requires an authenticated bb-browser session and is deferred to the next
  natural run; both files parse cleanly via `tsx --help`.
- 2026-04-29: User requested `new grad scan`. The bridge was not initially
  reachable, and sandboxed `npm run server` reproduced the known `tsx` IPC
  `listen EPERM` failure. Reran the bridge outside the sandbox, confirmed
  `/v1/health` in real Codex mode, then ran `npm run newgrad-scan`. The scan
  completed with summary
  `data/scan-runs/newgrad-20260429T205855Z-361b72f2-summary.json`.
  It discovered 143 rows, promoted 60, filtered 83, enriched 54, failed 6
  detail pages at the bounded navigation timeout, skipped 54 at the bridge
  detail gate, and queued 0 evaluations. Detail-gate breakdown:
  `already_evaluated_report=16`, `site_match_below_bar=17`,
  `site_signal_mixed=9`, `no_sponsorship=7`,
  `active_clearance_required=1`, `seniority_too_high=2`,
  `pipeline_threshold=2`.
- 2026-04-30: User requested `new grad scan`. Initial bridge health could not
  connect, and sandboxed `npm run server` again reproduced the known `tsx` IPC
  `listen EPERM` failure. Reran the bridge outside the sandbox, confirmed
  `/v1/health` in real Codex mode, then ran `npm run newgrad-scan`. The scan
  completed with summary
  `data/scan-runs/newgrad-20260430T012205Z-e9846128-summary.json`.
  It discovered 182 rows, promoted 81, filtered 101, enriched 81, failed 0
  enrichments, skipped 81 at the bridge detail gate, and queued 0 evaluations.
  Detail-gate breakdown: `site_match_below_bar=30`,
  `already_evaluated_report=24`, `site_signal_mixed=17`,
  `no_sponsorship=6`, `experience_too_high=1`, `seniority_too_high=1`,
  `active_clearance_required=1`, `pipeline_threshold=1`.
- 2026-05-01: User requested `newgrad scan`. Initial sandboxed health check
  could not connect to the local bridge because localhost access returned
  `Operation not permitted`. Sandboxed `npm run server` again reproduced the
  known `tsx` IPC `listen EPERM` failure. Reran the bridge outside the sandbox,
  confirmed `/v1/health` in real Codex mode, then ran `npm run newgrad-scan`.
  The scan completed with summary
  `data/scan-runs/newgrad-20260501T030144Z-a5582d69-summary.json`.
  It discovered 158 rows, promoted 58, filtered 100, enriched 33, failed 25
  detail pages at the bounded `domcontentloaded` navigation timeout, skipped 33
  at the bridge detail gate, and queued 0 evaluations. Detail-gate breakdown:
  `already_evaluated_report=5`, `no_sponsorship=12`,
  `detail_value_threshold=4`, `site_match_below_bar=9`,
  `site_signal_mixed=2`, `pipeline_threshold=1`.
- 2026-05-02: User requested `run auto job newgrad scan`. Confirmed the
  required user-layer files exist (`cv.md`, `config/profile.yml`,
  `modes/_profile.md`, `portals.yml`), verified unauthenticated `/v1/health`
  returns `401`, then verified authenticated bridge health with
  `apps/server/.bridge-token`. The bridge is already live on `127.0.0.1:47319`
  in `execution.mode=real` / `execution.realExecutor=codex`, so this run can
  use the existing local bridge instead of restarting it.
- 2026-05-02: Ran `npm run newgrad-scan` against the live bridge. The run
  completed with summary
  `data/scan-runs/newgrad-20260502T044220Z-1bdf7dc9-summary.json`.
  It discovered 158 rows, promoted 60, filtered 98, enriched 60, failed 0
  detail enrichments, added 8 pipeline entries, skipped 52 at the bridge
  detail gate, queued 7 direct evaluations, had 1 direct-evaluation queue
  failure, and completed all 7 queued evaluations without timeout. Detail-gate
  breakdown: `detail_value_threshold=24`, `no_sponsorship=17`,
  `active_clearance_required=3`, `already_in_pipeline=3`,
  `pipeline_threshold=2`, `experience_too_high=1`,
  `seniority_too_high=1`, `site_signal_mixed=1`.
- 2026-05-02: Direct evaluation queue failure affected Cisco
  (`Software Engineer Backend/Platform Systems I (Full Time) – United States`);
  `/v1/evaluate` returned `BAD_REQUEST invalid envelope`. Other queued
  evaluations completed and wrote reports `584` through `590`.
- 2026-05-02: Follow-up diagnosis confirmed the Cisco queue miss happened at
  bridge request validation time, before any evaluation job was created. The
  runner posts `{ input }` to `/v1/evaluate`, and the bridge rejects malformed
  envelopes with Zod-backed `BAD_REQUEST invalid envelope`. This run did not
  preserve the returned `issues` array, so the exact offending field is still
  unknown from artifacts alone. Based on the current code path, the most likely
  failure surface is a Cisco-specific `EvaluationInput.structuredSignals` field
  that is passed through without truncation (for example `workModel`,
  `employmentType`, `seniority`, or `companySize`), not queue pressure or
  background evaluation execution.

## Key Decisions

- Use the repo-native autonomous workflow instead of manual browsing.
- Do not alter unrelated dirty files already present in the worktree.
- Bound page-side extractor calls so one hostile or stuck detail page cannot
  stall the entire scan run indefinitely.

## Risks and Blockers

- Browser automation, Jobright login state, network access, bridge execution
  mode, or employer detail pages may block individual rows.

## Final Outcome

Completed. The full newgrad scan ran from the local checkout and produced:

- Event log:
  `data/scan-runs/newgrad-20260429T045051Z-5cda0ac4.jsonl`
- Summary:
  `data/scan-runs/newgrad-20260429T045051Z-5cda0ac4-summary.json`

No direct evaluations were queued because all 88 enriched rows were rejected by
the detail gate. Skip breakdown: `already_evaluated_report=15`,
`site_signal_mixed=22`, `site_match_below_bar=37`, `no_sponsorship=5`,
`active_clearance_required=2`, `detail_value_threshold=1`,
`seniority_too_high=3`, `pipeline_threshold=3`.

Latest run, 2026-04-29 20:58:55Z:

- Event log: `data/scan-runs/newgrad-20260429T205855Z-361b72f2.jsonl`
- Summary:
  `data/scan-runs/newgrad-20260429T205855Z-361b72f2-summary.json`
- Outcome: completed, with 143 discovered, 60 promoted, 54 enriched, 6
  enrichment failures, 54 detail-gate skips, and 0 queued evaluations.

Latest run, 2026-04-30 01:22:05Z:

- Event log: `data/scan-runs/newgrad-20260430T012205Z-e9846128.jsonl`
- Summary:
  `data/scan-runs/newgrad-20260430T012205Z-e9846128-summary.json`
- Outcome: completed, with 182 discovered, 81 promoted, 81 enriched, 0
  enrichment failures, 81 detail-gate skips, and 0 queued evaluations.

Latest run, 2026-05-01 03:01:44Z:

- Event log: `data/scan-runs/newgrad-20260501T030144Z-a5582d69.jsonl`
- Summary:
  `data/scan-runs/newgrad-20260501T030144Z-a5582d69-summary.json`
- Outcome: completed, with 158 discovered, 58 promoted, 33 enriched, 25
  enrichment failures, 33 detail-gate skips, and 0 queued evaluations.
- Residual blocker: JobRight detail navigation hit the bounded 30 s
  `domcontentloaded` timeout on 25 promoted rows. The run still reached a
  summary artifact, but enrichment coverage regressed compared with the
  previous 0-failure run.

Latest run, 2026-05-02 04:42:20Z:

- Event log: `data/scan-runs/newgrad-20260502T044220Z-1bdf7dc9.jsonl`
- Summary:
  `data/scan-runs/newgrad-20260502T044220Z-1bdf7dc9-summary.json`
- Outcome: completed, with 158 discovered, 60 promoted, 60 enriched, 0
  enrichment failures, 8 pipeline additions, 52 detail-gate skips, 7 queued
  evaluations, 1 queue failure, and 7 completed evaluations.
- Reports written:
  `reports/584-uber-2026-05-02.md`,
  `reports/585-remotehunter-2026-05-02.md`,
  `reports/586-maximus-2026-05-02.md`,
  `reports/587-applied-materials-2026-05-02.md`,
  `reports/588-qualcomm-2026-05-02.md`,
  `reports/589-man-group-2026-05-02.md`,
  `reports/590-nasdaq-2026-05-02.md`
- Residual blocker: Cisco failed at direct-evaluation queue time with
  `BAD_REQUEST invalid envelope`, so it did not produce a report in this run.

## Follow-up: detail-goto JobRight anti-bot rescue

Targeted fix for the 6 enrichment failures whose root cause was a JobRight
detail page stalling DOMContentLoaded under an anti-bot challenge while the
helper script — `script#jobright-helper-job-detail-info` — had already arrived
in the served HTML. `gotoDetail` in `scripts/newgrad-scan-autonomous.ts` now
catches the `domcontentloaded` timeout, checks for the helper script, and
treats the navigation as successful when present (extraction reads exactly
that node). If the helper is missing, the original timeout still surfaces.

- Scope: only the timeout *handling* in `gotoDetail`. Timeout value (30s),
  `networkidle` follow-up wait, and all gating thresholds are unchanged.
- Verification: `tsx --eval import('./scripts/newgrad-scan-autonomous.ts')`
  parses cleanly; runtime impact will be observable on the next live scan via
  the existing event log (`detail_enrichment_completed.failed` count).
- Out of scope (explicitly deferred): JobRight redirect decode/follow to ATS
  endpoint, `site_match` / `site_signal_mixed` threshold tuning, logging the
  final URL when timeouts genuinely fail.
- Same patch applied to `scripts/rerun-newgrad-history.ts` (`rerunTarget` —
  `page.goto(target.url, …)` was the only other JobRight-detail navigation
  with the same hard `domcontentloaded` wait). LinkedIn (`linkedin-scan-bb-browser.ts`)
  and the generic board scan (`job-board-scan-bb-browser.ts`) do not navigate
  JobRight detail pages, so they were not changed.

### Timeout calibration probe (2026-04-30)

Throwaway probe (`scripts/_probe-jobright-timeout.ts`, since deleted) navigated
12 recent JobRight detail URLs from
`data/scan-runs/newgrad-20260430T012205Z-e9846128.jsonl` against the persistent
`data/browser-profiles/newgrad-scan` profile, recording ms-to-DCL,
ms-to-helper-script, and ms-to-networkidle under three concurrency levels.

| Concurrency | DCL p50 | DCL p90 | DCL max | HelperReady max | Ceiling hits |
|-------------|---------|---------|---------|-----------------|--------------|
| 1 (sequential) | 1306 ms | 1953 ms | 2769 ms | 2462 ms | 0/12 |
| 3 (rerun default) | 1444 ms | 2844 ms | 2870 ms | 3083 ms | 0/12 |
| 6 (autonomous default) | 4990 ms | 5531 ms | 5547 ms | 7257 ms | 0/12 |

Findings:

- 60 s in `rerun-newgrad-history.ts` is ~11× the worst observed DCL — keeping
  it as-is. No reason to lower it either; the cost of a generous ceiling is
  zero on healthy pages.
- 30 s in `newgrad-scan-autonomous.ts` is still ~5× p90 at the actual default
  concurrency (6). The 6 enrichment failures in the 2026-04-29 20:58 run were
  therefore not "page load needed >30 s" — JobRight's anti-bot path simply
  never sent the close-of-response signal for those specific detail IDs.
  Raising the timeout would not rescue them; the helper-script presence check
  is the correct shape of fix.
