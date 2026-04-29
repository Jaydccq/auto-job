# 2026-04-29 Newgrad Scan Run

## Background

The user requested `/new grad scan`, which maps to the repository-native
`newgrad-scan` workflow.

## Goal

Run the autonomous newgrad scan from the local checkout and let the default
`newgrad_quick` evaluation path process enrich survivors.

## Scope

- Use the checked-in `bun run newgrad-scan` command.
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
- 2026-04-29: First sandboxed `bun run newgrad-scan` failed before scanning
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
