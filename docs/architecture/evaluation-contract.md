# Evaluation, Report, And Tracker Contract

## Purpose

This is the owned contract for the local evaluation pipeline. It stabilizes the
boundary between captured job inputs, prompt execution, terminal JSON, report
markdown, tracker TSV drops, and merge behavior.

## Evaluation Input

The cross-app input type is `EvaluationInput` in
`packages/shared/src/contracts/jobs.ts`.

Required:

- `url`: canonical job URL or best available source URL.

Optional:

- `title`: display hint only.
- `pageText`: local JD text. If too short, the bridge may re-extract.
- `evaluationMode`: `default` or `newgrad_quick`.
- `structuredSignals`: locally extracted source/company/role/location/value
  hints for fast screening.
- `detection`: extension page-detection explanation for logging/UI.

The HTTP create endpoint is `EVALUATE_CREATE` in
`packages/shared/src/contracts/api.ts`. The bridge owns queuing and job
snapshots through `JobSnapshot` and `JobEvent`.

## Prompt Contract

Current full evaluation prompt source:

- `batch/batch-prompt.md`

Current quick evaluation prompt source:

- `apps/server/src/adapters/claude-pipeline.ts`

Prompt edits must preserve the terminal JSON contract below or update fixtures
in the same change.

## Terminal JSON

Full evaluation terminal JSON must include:

- `status`: `completed` or `failed`
- `id`: bridge job id
- `report_num`: reserved report number
- `company`
- `role`
- `score`
- `tldr`
- `archetype`
- `legitimacy`
- `pdf`
- `report`
- `error`

Quick evaluation terminal JSON must include:

- `status`: `completed` or `failed`
- `id`
- `company`
- `role`
- `score`
- `tldr`
- `legitimacy`
- `decision`: `deep_eval`, `skip`, or `manual_review`
- `reasons`
- `blockers`
- `error`

Parser fixtures live in `apps/server/src/adapters/evaluation-contract.test.ts`.

## Report Markdown

The report parser accepts English or Spanish evaluation headings:

```md
# Evaluation: Company - Role
# Evaluacion: Company - Role
# Evaluacion: Company - Role
```

Required header fields:

- `Date` or `Fecha`
- `Archetype` or `Arquetipo`
- `Score`

Optional header fields:

- `URL`
- `PDF`

The report score must be numeric in `/5` form. The TL;DR is read first from a
`TL;DR` summary-table row, then from the summary paragraph, then falls back to
`Evaluation completed`.

## Tracker TSV Drop

The bridge writes one TSV file per evaluated job under
`batch/tracker-additions/`.

Canonical TSV column order:

```text
num	date	company	role	status	score	pdf	report	notes
```

`merge-tracker.mjs` also tolerates older score/status-swapped TSVs and pipe
delimited rows, but new bridge output should use the canonical TSV order above.

Tracker markdown rows in `data/applications.md` use this display order:

```text
# | Date | Company | Role | Score | Status | PDF | Report | Notes
```

## Merge Behavior

`merge-tracker.mjs` owns tracker mutation.

- New company/role entries are appended.
- Duplicate company/role entries may update in place when the new evaluation is
  higher signal, including replacing older quick skips with full evaluations.
- Pipe characters are sanitized before writing markdown cells.
- Completed merges move TSV drops to the merged subdirectory.
- Merge summary output reports `added`, `updated`, and `skipped` counts.

The bridge reports `trackerMerged` plus `trackerMergeSummary` when the merge
attempt succeeds.

## Verification

Contract checks:

- `apps/server/src/adapters/evaluation-contract.test.ts`
- `apps/server/src/batch/merge-tracker.test.ts`
- `apps/server/src/batch/batch-runner.e2e.test.ts`
- `packages/shared/src/contracts/jobs.ts`
- `packages/shared/src/contracts/api.ts`

Prompt or parser changes are not complete until the fixture tests pass.
