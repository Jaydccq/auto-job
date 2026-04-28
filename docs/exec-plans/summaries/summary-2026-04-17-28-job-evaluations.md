# 2026-04-17 to 2026-04-28 Job Evaluation Summary

**Status:** completed
**Scope Covered:** 73 one-off job-evaluation execution plans moved out of `active/`

## Background

The active plan surface contained one execution plan per evaluated job across
several daily batches. Those plans were useful while reports were being
generated, but their durable outputs now live in `reports/`, tracker rows, and
batch artifacts. Keeping the per-job scaffolding under `active/` made current
architecture work harder to navigate.

## Scope Covered

This summary covers the job evaluation and evaluation-batch plans archived under:

- `docs/exec-plans/archive/2026-04-17-28-job-evaluations/`

The archived set includes individual reports for software engineering, ML/AI,
data, platform, applied scientist, backend, frontend/full-stack, and quick/deep
evaluation rerun work.

## Key Decisions

- Treat generated report markdown as the durable evaluation artifact.
- Treat tracker merge state as recoverable from `batch/tracker-additions/` and
  `merge-tracker.mjs`; it should not keep one-off job plans active.
- Keep batch-level contract concerns in architecture docs and tests rather than
  in dozens of stale job-specific plans.
- Preserve original per-job execution detail in archive for audit value instead
  of deleting it.

## Implemented Changes

- Moved 73 evaluation plans from `docs/exec-plans/active/` into the archive.
- Kept this rollup as the canonical summary for the 2026-04-17 to 2026-04-28
  evaluation run history.
- Added evaluation artifact fixture tests in
  `apps/server/src/adapters/evaluation-contract.test.ts` so future prompt or
  parser edits have a stable contract check.

## Verification Completed

- Plan inventory before consolidation showed 129 active plan files and
  evaluation as the largest noisy workstream.
- Archive move preserved full markdown detail rather than replacing content.
- Follow-up verification for this phase is recorded in the active architecture
  plan.

## Open Issues

- Some archived plans have stale status text such as `in_progress` or
  `unknown`; report artifacts remain the stronger completion signal.
- Root metadata and upstream update command cleanup belong to Phase 1 and are
  not completed by this Phase 2-5 pass.

## Next Recommended Steps

- Avoid creating one active execution plan per future single-job evaluation when
  the durable report is already the artifact of record.
- If a future evaluation changes prompt/report/tracker behavior, update
  `docs/architecture/evaluation-contract.md` and the fixture tests first.

## Archived References

- `docs/exec-plans/archive/2026-04-17-28-job-evaluations/`
