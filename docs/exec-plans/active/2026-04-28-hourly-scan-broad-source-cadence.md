# Hourly Scan Broad Source Cadence

## Background

The 2026-04-28 hourly automation summaries show the `scan` source repeatedly
fetching hundreds of portal and Built In search rows before dedupe. The latest
completed run found 839 jobs, filtered 631 by title, skipped 207 duplicates, and
left one current-run offer. Downstream evaluation is already selective; the
problem is repeated broad-source churn before that selection.

## Goal

Reduce repeated hourly work from the broad `scan` source while preserving the
hourly recent-source flow for `newgrad`, `linkedin`, `builtin`, and `indeed`.

## Scope

- Update the hourly automation runner only.
- Keep direct evaluation semantics unchanged for sources that do run.
- Keep manual/forced broad scan available.
- Do not change scanner scoring thresholds or application submission behavior.

## Assumptions

- `scan.mjs` is the broad portal scan path and has no reliable per-source
  freshness filter for every API provider.
- It is acceptable for hourly automation to run the broad source less often
  than the recent-source adapters.
- A recent successful hourly summary is a sufficient local signal that the broad
  source does not need to rerun immediately.

## Implementation Steps

1. Add a cadence gate for the hourly `scan` source.
   Verify: recent completed hourly summaries cause `scan` to be skipped with a
   clear summary row.
2. Add environment controls for the cadence and force-run behavior.
   Verify: defaults are documented and a zero/ignored interval keeps old
   behavior available.
3. Update docs and this plan with the final behavior.
   Verify: syntax checks pass for touched scripts.

## Verification Approach

- Run `node --check scripts/hourly-job-scan.mjs`.
- Run the runner in dry mode or a syntax-only equivalent if live scanning would
  start browser/network work.
- Inspect generated/eligible summary text paths where practical without
  starting the live scanner from the restricted context.

## Progress Log

- 2026-04-28: Started after observing `scan` repeatedly fetched hundreds of
  already-seen jobs while only one new offer survived.
- 2026-04-28: Added a summary-based cadence gate to `scripts/hourly-job-scan.mjs`.
  By default, `scan` is skipped when the newest non-dry-run hourly summary has a
  successful `scan` row less than 6 hours old.
- 2026-04-28: Updated `docs/codex-hourly-scan-automation.md` with
  `AUTO_JOB_SCAN_BROAD_INTERVAL_HOURS` and `AUTO_JOB_SCAN_FORCE_BROAD`.
- 2026-04-28: Verified `node --check scripts/hourly-job-scan.mjs` and
  `git diff --check` for touched files. A read-only state check found
  `hourly-scan-2026-04-28T15-23-32-912Z.md` as the latest successful broad
  scan, about 35 minutes old, so the next default run would skip `scan`.
- 2026-04-28: Narrowed the hourly summary `Newest high-fit roles worth
  reviewing` section so it no longer reads from `Top promoted rows`. It now
  includes only final completed evaluations at `3.5+/5` or output lines with an
  offer / explicit high-priority marker.
- 2026-04-28: Verified the high-fit extraction with a focused Node sample:
  `3.4/5` was excluded, `3.5/5` and `4.1/5` completed evaluations were
  included, numbered `Top promoted rows` were excluded, and a `priority=high`
  output line was included. Also reran `node --check scripts/hourly-job-scan.mjs`
  and `git diff --check` for touched files.
- 2026-04-29: Reporting-only automation check found the newest completed
  summary still at `data/automation/hourly-scan-2026-04-28T16-19-04-129Z.md`.
  A later 17:00Z launch left a stale-looking lock and failed before summary
  creation because the launchd environment could not spawn `bun`.

## Key Decisions

- Optimize at the hourly runner layer first. This keeps the lower-level scanner
  intact for manual full scans and avoids speculative per-provider freshness
  logic.
- Use completed hourly summaries rather than a new state file. This keeps the
  cadence decision auditable in existing automation artifacts.
- Do not count dry-run summaries as successful broad scans, because dry runs do
  not persist new offers.
- Treat promoted rows as pre-evaluation candidates only. The hourly summary's
  high-fit review list must come from final evaluation or explicit
  offer/high-priority output signals.

## Risks And Blockers

- A less frequent broad scan can delay discovery of non-recent-source portal
  jobs until the next cadence window.
- Existing worktree has many unrelated modified files; changes must stay
  surgical.
- Host launchd must provide `bun` on `PATH`; otherwise the runner can create a
  lock, skip `scan`, fail on the first Bun-backed source, and produce no
  hourly summary.

## Final Outcome

Implemented. Hourly automation now preserves frequent recent-source scanning
while reducing repeated broad portal/Built In churn. The broad `scan` source
runs at most once per 6-hour cadence window by default, can be forced with
`AUTO_JOB_SCAN_FORCE_BROAD=1`, and can be restored to every-run behavior with
`AUTO_JOB_SCAN_BROAD_INTERVAL_HOURS=0`.
