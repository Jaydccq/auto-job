# PRD: Newgrad Scan Immediate Orchestration

## Background

`newgrad-scan` already works as a layered funnel:

```text
Source discovery
  -> list extraction
  -> local list score
  -> detail enrichment
  -> detail value gate
  -> /v1/evaluate newgrad_quick
  -> full eval only when justified
```

The next reliability gain is not more model work. The system needs durable run
state, decision traces, safer quick-eval outcomes, and calibration data so scan
quality can be improved from evidence.

## Goal

Make every `newgrad-scan` run observable, recoverable, and tunable without
changing the core funnel.

## Users

- The operator running `bun run newgrad-scan`.
- Future agents debugging scan failures or threshold behavior.
- The candidate reviewing why a role was evaluated, skipped, or held for review.

## Requirements

### Run Identity and Events

- Every scan run must create a `scan_run_id`.
- Every run must write a JSONL event log under `data/scan-runs/`.
- Event logs must include enough data to reconstruct the funnel counts after a
  crash.
- Each event must include at least `scanRunId`, timestamp, event name, and
  source.

### Batch Summary

- Each run must write a machine-readable summary with counts for:
  discovered, list promoted, list filtered, enriched, enrichment failed,
  detail added, detail skipped, queued, completed, failed, timed out.
- The CLI must print the summary path at the end of the run.

### Decision Trace

- List score decisions must be logged per row with score or skip reason.
- Detail gate decisions must expose row-level skip reasons where the bridge has
  enough information.
- Local value scores and reasons must be captured for rows that pass detail gate.

### Quick Eval Safety

- `newgrad_quick` must support `manual_review` in addition to `deep_eval` and
  `skip`.
- `manual_review` must write a quick-screen report/tracker row, not full eval.
- If model quick eval fails, fallback full eval must happen only for strong local
  candidates; ordinary candidates should fail quick eval or retry later.

### Prompt Safety

- JD/page text must be treated as untrusted external content in quick eval and
  full eval prompts.
- Boundary strings from untrusted text must be neutralized before being embedded
  in prompt sections.

### Calibration

- The run artifacts must preserve enough data to build a golden set later:
  job identity, source, decisions, reasons, scores, and final outcome.

## Non-Goals

- Do not replace markdown artifacts with a database in this phase.
- Do not introduce Postgres.
- Do not rewrite all scan sources behind a new adapter interface.
- Do not introduce multi-agent full eval.
- Do not change application submission behavior.

## Acceptance Criteria

- Running `bun run newgrad-scan -- --score-only --limit 1` creates a scan-run
  JSONL and summary without queueing evaluations.
- Unit tests cover event writer behavior and summary aggregation.
- Bridge tests cover row-level detail skip output.
- Quick eval tests cover `manual_review` and non-high-confidence failure
  fallback.
- Prompt safety tests prove injected boundary strings are neutralized.

## Data Flow

```text
newgrad-scan runner
  |
  | scan_started / rows_extracted / list_decision events
  v
data/scan-runs/{scan_run_id}.jsonl
  |
  | bridge enrich returns entries + skips
  v
detail_decision events
  |
  | /v1/evaluate job ids
  v
evaluation events + summary
```

## Rollout Plan

1. Add event writer and summary writer to the scanner runner.
2. Add optional row-level detail skips to the bridge enrich result.
3. Add `manual_review` to quick eval contracts and prompt.
4. Add safe fallback policy for quick eval failures.
5. Add prompt-text boundary neutralization.
6. Add targeted tests and update mode documentation.

