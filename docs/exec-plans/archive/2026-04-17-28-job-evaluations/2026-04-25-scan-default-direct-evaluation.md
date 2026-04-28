# Scan Default Direct Evaluation

## Background

Recent Ashby API and legacy Built In scan rows were appended to
`data/pipeline.md` / `data/scan-history.tsv` with `added` status, but they did
not continue into the `newgrad_quick` evaluation path unless the operator passed
`--evaluate`. `newgrad-scan` and `linkedin-scan` already default to the complete
flow: scan, score/enrich when applicable, write candidates, queue
`/v1/evaluate`, wait for completion, and report tracker merge results.

## Goal

Make the Ashby/API path in `scan.mjs`, plus the legacy Built In sweep inside the
same script, default to direct evaluation after new rows are written. Keep an
explicit opt-out for discovery-only runs.

## Scope

- Change `scan.mjs` default behavior from discovery-only to direct evaluation.
- Add/confirm `--no-evaluate` as the opt-out for old pipeline-only behavior.
- Preserve `--dry-run` as no-write and no-evaluation.
- Preserve `--evaluate`, `--evaluate-only`, and Built In pending compatibility.
- Update mode and command documentation for Ashby/API, Built In, and Indeed scan
  behavior.
- Run targeted syntax/help/dry-run verification.

## Assumptions

- The bridge `/v1/evaluate` endpoint remains the canonical path for reports and
  tracker rows.
- Default direct evaluation is now desired for `scan.mjs` sources because the
  user wants parity with `newgrad-scan` and `linkedin-scan`.
- `--no-evaluate` is sufficient as the reversible path for operators who only
  want to collect links.
- The scanner should not require bridge health when a run finds zero current
  offers to evaluate.
- No scanner should submit applications.

## Uncertainties

- Live ATS/API scans may find zero new rows because scan history and tracker
  dedupe are already populated.
- Some generic API rows have less local JD text than JobRight/LinkedIn rows, so
  quick evaluation quality may vary by source.
- Indeed's browser-backed runner already defaults to direct evaluation; the
  likely gap is documentation/routing clarity rather than a code-path change.

## Implementation Steps

1. Update `scan.mjs` default evaluation switch.
   Verify: `node --check scan.mjs`.
2. Avoid bridge-token failure when direct evaluation is enabled but the current
   scan has no candidates.
   Verify: dry-run/no-write checks do not require bridge.
3. Update scan/Built In/Indeed docs and command descriptions.
   Verify: `rg` shows docs no longer describe default saved rows as needing a
   separate pipeline step.
4. Run targeted verification.
   Verify: help/syntax commands pass, `git diff --check` passes, and any blocked
   network/live checks are recorded.

## Verification Approach

- `node --check scan.mjs`
- `npm run scan -- --dry-run --no-builtin --evaluate-limit 1`
- `npm run scan -- --dry-run --no-evaluate --no-builtin`
- `npm run builtin-scan -- --help`
- `npm run indeed-scan -- --help`
- `git diff --check`

## Progress Log

- 2026-04-25: Created plan. Goal: make Ashby/API and legacy Built In scans
  proceed into direct evaluation by default, matching newgrad/linkedin behavior,
  while preserving `--no-evaluate` for the old list-only path.
- 2026-04-25: Updated `scan.mjs` so direct evaluation is enabled unless
  `--no-evaluate` is passed. Kept `--evaluate` as a compatibility flag and
  preserved `--evaluate-only` for Built In pending rows. Moved the current-run
  candidate count before bridge-token loading so a zero-candidate scan does not
  require bridge health.
- 2026-04-25: Updated scan, Built In, Indeed, LinkedIn, Claude skill,
  OpenCode, and Gemini command text so the repository describes direct
  evaluation as the default and `--no-evaluate` as the old list-only path.
- 2026-04-25: Verification passed: `node --check scan.mjs`,
  `npm run builtin-scan -- --help`, `npm run indeed-scan -- --help`,
  `npm run scan -- --no-builtin --company __no_such_company__`, and
  `git diff --check`.
- 2026-04-25: Dry-run verification inside the sandbox could not resolve ATS
  hosts (`ENOTFOUND` for Ashby/Greenhouse). Reran with approved network access:
  `npm run scan -- --dry-run --no-builtin --evaluate-limit 1` found 690 jobs,
  2 dry-run new offers, and printed that direct evaluation is enabled by default
  but dry-run prevents queueing. `npm run scan -- --dry-run --no-evaluate
  --no-builtin` found the same dry-run offers and did not print the direct
  evaluation queueing message.

## Key Decisions

- Use `--no-evaluate` for discovery-only behavior instead of requiring
  `--evaluate` for the desired full flow.
- Keep `--evaluate` accepted as a compatibility no-op so existing automation
  does not break.

## Risks and Blockers

- Running a live non-dry scan can launch real evaluation jobs and mutate
  tracker/report/dashboard data. Use dry-run and help checks for code
  verification unless a live run is explicitly needed.

## Final Outcome

Implemented. `scan.mjs` now defaults to direct evaluation for current-run
Ashby/API and legacy Built In scan results, while `--no-evaluate` preserves the
old list-only behavior. Built In and Indeed browser-backed scan docs now state
that their existing direct evaluation path is the default.
