# Newgrad History Rerun

## Background

The enrich scorer now treats Jobright's own match panel as a key signal. The
user asked to re-run the prior ~200 historical newgrad candidates against the
updated logic.

## Goal

Re-run 200 historical newgrad candidates against the current Jobright-aware
enrich scorer and summarize how many still pass.

## Scope

- Identify a durable, repository-backed historical candidate set.
- Reuse the current browser extractor and value scorer.
- Use the most recent 200 `newgrad-scan` Jobright detail URLs from
  `data/scan-history.tsv`.
- Reuse exact historical pipeline-backed list scores only when the Jobright
  detail URL or company-role key can be mapped back to `data/pipeline.md`.
- Record the rerun results in the repository.

## Assumptions

- The scanner profile at `data/browser-profiles/newgrad-scan` still contains a
  working Jobright login session.
- `data/scan-history.tsv` is the best durable source for historical Jobright
  detail URLs because many newer `data/pipeline.md` rows store the external
  apply URL instead of the Jobright detail URL.
- `data/pipeline.md` remains useful for exact stored list scores when a row can
  be mapped back to a scan-history detail URL.

## Implementation Steps

1. Inspect historical candidate sources.
   Verify: confirm counts in `data/pipeline.md` and `data/scan-history.tsv`.
2. Add a durable rerun script.
   Verify: script can build a 200-row target set and emit a structured summary.
3. Run the historical rerun with the current enrich logic.
   Verify: a 200-row rerun completes and returns pass/fail counts.
4. Record results and verification.
   Verify: this plan captures assumptions, results, and remaining caveats.

## Verification Approach

- Count checks against `data/pipeline.md` and `data/scan-history.tsv`
- Script smoke output for target-set composition
- Real rerun against 200 historical candidates
- Targeted TypeScript/typecheck validation for any new script

## Progress Log

- 2026-04-20: Created plan after user requested rerunning the prior 200
  historical candidates with the updated Jobright-aware enrich scorer.
- 2026-04-20: Confirmed the repository currently contains 162 total
  `via newgrad-scan` pipeline rows and at least 200 recent Jobright detail URLs
  in `data/scan-history.tsv`.
- 2026-04-20: Added `scripts/rerun-newgrad-history.ts` and
  `npm run newgrad-rerun-history`.
- 2026-04-20: Initial smoke exposed that many pipeline rows point at external
  ATS/apply URLs, which cannot expose Jobright match-panel scores. Changed the
  rerun target set to the most recent 200 Jobright detail URLs from
  `data/scan-history.tsv`.
- 2026-04-20: Fixed the script entrypoint for the current `tsx` CJS transform by
  replacing top-level `await` with `main().catch(...)`.
- 2026-04-20: Ran a 5-row smoke against live Jobright detail pages. Result:
  target-set built successfully, 5 rerun results completed, 0 page errors.
- 2026-04-20: Ran the 200-row historical rerun against live Jobright detail
  pages. Result: 200 total, 10 passed, 190 failed, 0 page errors.
- 2026-04-20: Ran `npm --prefix bridge run typecheck`; passed.
- 2026-04-21: Investigated why the dashboard Priority Queue did not show the
  10 rerun passes. Confirmed Priority Queue reads `data/applications.md`, not
  scan-history rerun audit output, and the current browser has locally marked
  all 20 tracker-ready rows as applied.

## Key Decisions

- Use scan-history detail URLs as the source of truth for this rerun. The
  purpose of this task is to re-score against Jobright's live match panel, and
  that panel is unavailable from most external apply URLs.
- Treat this rerun as an audit, not as a pipeline mutation. Many historical rows
  failed pre-enrich filters such as `negative_title`, `active_clearance_required`,
  or `company_blacklist`; a raw enrich pass alone is not enough to safely append
  them to `data/pipeline.md`.
- Keep dashboard Priority Queue semantics tied to fully evaluated tracker rows:
  `Status = Evaluated`, score `>= 4.0/5` for Apply Now, score `3.5-3.95/5` for
  Selective Apply, and not locally marked applied in browser localStorage.

## Risks and Blockers

- Historical scan-history rows do not always preserve the original list-stage
  score, so most rows use a current synthetic list-score reconstruction.
- Rewriting or deleting old pipeline rows would be destructive; this rerun
  should audit first and only mutate historical data with explicit follow-up
  intent.
- Only 2 of the 200 recent scan-history rows mapped back to a stored pipeline
  score. The other 198 rows used current list scoring plus current Jobright
  detail extraction.

## Final Outcome

- Completed the 200-row historical rerun.
- Target composition:
  - `below_threshold`: 95
  - `promoted`: 33
  - `negative_title`: 29
  - `active_clearance_required`: 19
  - `experience_too_high`: 19
  - `no_sponsorship`: 4
  - `company_blacklist`: 1
- New enrich outcome:
  - Passed: 10
  - Failed: 190
  - Page/extraction errors: 0
- Historical `promoted` rows under the new scorer:
  - Total: 33
  - Still passed: 2
  - Now failed: 31
- Dominant rejection reasons after adding Jobright match-panel weighting:
  - `site_match_below_bar`: 160
  - `no_sponsorship`: 96
  - `site_signal_mixed`: 22
  - `seniority_too_high`: 19
- Previously filtered rows that now passed are audit-only candidates, not
  automatic pipeline additions, because their original pre-enrich filters still
  need manual review. Examples include IMC Trading Data Engineer, Abbott Junior
  Data Engineer, Northwestern Research Analyst 1, and Liberty Resources Business
  Intelligence Data Analyst.
- Dashboard check: `data/applications.md` currently has 7 Apply Now tracker rows
  and 13 Selective Apply tracker rows before local browser marks. The dashboard
  shows `Marked applied = 20` because those same 20 tracker rows are marked in
  the browser under localStorage key `career_ops_apply_done_v1`, so they are
  hidden from Apply Now and Selective Apply.
