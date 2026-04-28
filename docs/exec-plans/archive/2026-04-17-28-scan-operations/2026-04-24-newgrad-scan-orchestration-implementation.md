# Newgrad Scan Orchestration Implementation

## Background

The review assessment identified the highest-value improvements for
`newgrad-scan`: run IDs, JSONL events, batch summaries, decision traces,
`manual_review`, safer quick-eval fallback, prompt hardening, and calibration
artifacts. The immediate PRD is `docs/prds/newgrad-scan-immediate-orchestration.md`.

## Goal

Implement the immediate PRD in small, verifiable slices while preserving the
existing scan/evaluate commands.

## Scope

- Add scanner JSONL event and summary artifacts.
- Add row-level bridge detail skip output.
- Add `manual_review` support to quick eval.
- Add safer quick-eval failure fallback.
- Add prompt boundary hardening for untrusted JD/page text.
- Add targeted tests and documentation.

## Assumptions

- Repo-local JSONL is the right first state layer; SQLite/Postgres is deferred.
- Existing markdown artifacts remain the user-facing outputs.
- The first implementation can preserve existing CLI commands and add only
  optional fields to bridge contracts.
- `manual_review` should behave like a quick-screen terminal outcome, not like a
  full eval.

## Implementation Steps

1. Add scan-run event writer and summary writer to `scripts/newgrad-scan-autonomous.ts`.
   Verify: score-only smoke creates `data/scan-runs/*.jsonl` and summary JSON.
2. Extend enrich result contracts with optional row-level skips.
   Verify: bridge adapter tests assert skip reason details are returned.
3. Add `manual_review` to quick eval JSON handling and prompt.
   Verify: quick-eval parser/tests accept `manual_review` and write tracker row.
4. Replace blanket quick-eval failure fallback with high-local-value fallback.
   Verify: tests cover high-value fallback and ordinary quick failure.
5. Harden JD/page text prompt embedding.
   Verify: tests cover boundary strings in quick and full eval inputs.
6. Update docs and run targeted verification.
   Verify: `bun run newgrad-scan -- --help`, bridge typecheck, targeted tests,
   and `git diff --check`.

## Engineering Review

### Step 0 Scope Challenge

What already exists:

- `scripts/newgrad-scan-autonomous.ts` already orchestrates source resolution,
  scoring, enrichment, pipeline writes, and direct `/v1/evaluate` queueing.
- `bridge/src/adapters/claude-pipeline.ts` already owns score/enrich/evaluate
  decisions.
- `bridge/src/runtime/evaluation-worker-pool.ts` already handles evaluation
  concurrency.
- `batch/run-metrics.jsonl` shows JSONL is already an accepted pattern in this
  repo.

Minimum viable change:

- Add observability and safer decision semantics around the existing flow.
- Avoid a new database, new worker system, or source adapter rewrite.

Complexity check:

- This plan may touch more than eight files because contracts, runner, adapter,
  tests, and docs all need updates. This is acceptable because the behavior
  crosses those boundaries already; the plan avoids adding new infrastructure.

Search check:

- Use repo-local JSONL rather than a new queue/database because this repository
  already uses markdown/JSONL artifacts and local scripts. This is a Layer 1
  choice inside the existing project.

Completeness check:

- The complete version for this phase includes tests for event writing,
  skip traces, manual review, fallback policy, and prompt hardening. Deferring
  these tests would save little time and make the run artifacts untrustworthy.

### Architecture Review

Data flow:

```text
runner
  ├─ creates scan_run_id
  ├─ writes scan event JSONL
  ├─ calls /v1/newgrad-scan/score
  ├─ writes list decision events
  ├─ calls /v1/newgrad-scan/enrich
  ├─ writes detail decision events
  ├─ queues /v1/evaluate jobs
  └─ writes summary JSON

bridge
  ├─ score/enrich adapters
  ├─ optional detail skip rows
  ├─ quick precheck
  ├─ quick model decision: skip | manual_review | deep_eval
  └─ guarded full-eval fallback
```

Failure scenarios:

- Runner crashes after scoring: JSONL still contains rows extracted and list
  decisions.
- Bridge enrich skips a candidate: skip event records row and reason.
- Quick model fails: high-value candidates may full-eval, ordinary candidates
  fail transparently instead of silently consuming full-eval budget.
- JD contains prompt-like instructions: text is neutralized before embedding.

### Code Quality Review

- Keep event writer as a small local module or contained helper; do not create a
  broad event framework.
- Add optional contract fields so extension and existing callers remain
  compatible.
- Keep `manual_review` handling in the existing quick-screen artifact path to
  avoid a parallel reporting system.

### Test Review

CODE PATH COVERAGE
==================

```text
[GAP] scripts/newgrad-scan-autonomous.ts
  ├─ event writer creates JSONL and summary
  ├─ score-only run finalizes summary
  ├─ enrich result writes detail skip events
  └─ evaluation wait writes completed/failed/timedOut events

[GAP] bridge/src/adapters/claude-pipeline.ts
  ├─ enrichNewGradRows returns row-level skip reasons
  ├─ manual_review writes quick-screen report/tracker row
  ├─ quick eval failure + high local score falls back full eval
  ├─ quick eval failure + ordinary local score fails quick eval
  └─ JD/page text boundary strings are neutralized
```

USER FLOW COVERAGE
==================

```text
[GAP] Operator runs score-only scan
  └─ sees summary path and can inspect JSONL events

[GAP] Operator runs full scan
  ├─ can see how many candidates were queued/completed/failed
  └─ can diagnose skips from event log

[GAP] Candidate receives manual_review result
  └─ tracker/report records review-needed decision rather than full eval
```

Required tests:

- Unit tests for event writer and summary aggregation.
- Adapter tests for enrich skip rows.
- Quick eval tests for `manual_review` parsing/artifact behavior.
- Quick eval fallback tests for high vs ordinary local value.
- Prompt safety tests for embedded boundary strings.

### Performance Review

- JSONL writes are append-only and small relative to browser/evaluation costs.
- Event logging must avoid writing full JD text to scan-run logs.
- Row-level events should cap long strings to keep artifacts inspectable.

## NOT In Scope

- SQLite/Postgres state store: defer until JSONL proves insufficient.
- Source adapter registry: valuable later, not needed for current reliability.
- Multi-agent full eval: too expensive and not the current bottleneck.
- UI/dashboard rendering for scan-run logs: defer until artifacts stabilize.

## What Already Exists

- Layered scan funnel: reused.
- Bridge queue and worker pool: reused.
- `newgrad_quick`: extended, not replaced.
- `jds/`, pipeline, reports, tracker: preserved.
- Vitest bridge test suite: extended.

## Risks and Blockers

- Optional contract fields must not break extension callers.
- Summary artifacts can drift from actual writes if events are not emitted at
  every state transition.
- `manual_review` semantics must be visible enough that it is not mistaken for a
  completed apply recommendation.

## Progress Log

- 2026-04-24: Created immediate and later PRDs.
- 2026-04-24: Created this implementation plan with eng-review scope, diagrams,
  test coverage targets, and explicit deferrals.
- 2026-04-24: Added repo-local scan-run JSONL and summary writer under
  `bridge/src/adapters/newgrad-scan-run-log.ts`, then wired the autonomous
  newgrad runner to record source, list, detail, queue, completion, failure, and
  timeout events.
- 2026-04-24: Extended bridge enrich contracts with optional row-level skips and
  propagated those skips through the bridge SSE endpoint, SDK adapter, extension
  background merger, and autonomous runner.
- 2026-04-24: Added `manual_review` to quick eval schema/prompt/parsing and kept
  it on the existing quick-screen report/tracker artifact path.
- 2026-04-24: Replaced blanket quick-eval failure fallback with a high local
  value fallback threshold and added prompt hardening for untrusted JD/page text.
- 2026-04-24: Updated `modes/newgrad-scan.md` with scan-run artifacts,
  `manual_review`, and quick-fallback behavior.
- 2026-04-24: Verification passed:
  `npm --prefix bridge run test -- src/adapters/newgrad-scan-run-log.test.ts src/adapters/claude-pipeline.test.ts src/adapters/newgrad-value-scorer.test.ts`,
  `npm --prefix bridge run typecheck`,
  `npm --prefix extension run typecheck`,
  `./bridge/node_modules/.bin/tsc --noEmit --allowImportingTsExtensions --module ESNext --moduleResolution Bundler --target ES2022 --skipLibCheck scripts/newgrad-scan-autonomous.ts`,
  `npm --prefix extension run build`, and
  `npm run newgrad-scan -- --help`.
- 2026-04-24: Ran live bounded scan:
  `npm run newgrad-scan -- --list-source api --limit 30 --enrich-limit 2 --evaluate-limit 1 --evaluation-wait-timeout-ms 900000`.
  Result: discovered 30, promoted 10, enriched 2, detail skipped 2, queued 0,
  completed 0. Verified summary
  `data/scan-runs/newgrad-20260424T063041Z-146d8560-summary.json` and JSONL
  include list and detail skip events.
- 2026-04-24: Ran fuller live bounded scan:
  `npm run newgrad-scan -- --list-source api --limit 60 --enrich-limit 10 --evaluate-limit 1 --evaluation-wait-timeout-ms 900000`.
  Result: discovered 60, promoted 16, enriched 10, detail added 1, detail
  skipped 9, queued 1, completed 1, failed 0, timed out 0. Julius AI completed
  as a `manual_review` quick-screen at 4.1/5 with report
  `reports/340-julius-ai-2026-04-24.md`, and tracker merge succeeded. Verified
  summary `data/scan-runs/newgrad-20260424T063136Z-8a75d000-summary.json` and
  JSONL include detail pass/skip, queue, wait, evaluation completion, and final
  scan completion events.
- 2026-04-24: Ran `npm run verify` after the live scan. Result: 0 errors and 2
  pre-existing duplicate warnings in `data/applications.md`.

## Key Decisions

- Start with repo-local JSONL and summary JSON.
- Keep scanner command compatibility.
- Add new fields as optional contracts.
- Treat prompt hardening as part of the first implementation, not a later
  security cleanup.

## Final Outcome

Implemented the immediate PRD without adding a database, worker rewrite, or
source adapter refactor. The scanner now emits per-run JSONL and summary
artifacts, bridge enrich returns row-level skip traces, quick eval supports
`manual_review`, ordinary quick-eval failures no longer automatically spend full
eval budget, and untrusted JD/page text is neutralized before prompt embedding.

Live Jobright/newgrad validation completed. The immediate PRD is complete.
The later roadmap remains intentionally deferred until scan-run metrics show a
real need for source adapter refactors, identity-service semantics, shared
context snapshots, or a SQLite state store.
