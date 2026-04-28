# Newgrad Scan Direct Evaluation

## Background

`newgrad-scan` already extracts Jobright rows, scores them, enriches detail pages,
and writes survivors to `data/pipeline.md`. The dashboard Priority Queue only
reads fully evaluated tracker rows from `data/applications.md`, so enrich-only
or rerun-audit candidates do not appear there.

## Goal

Make the autonomous `/career-ops newgrad-scan` path turn enrich survivors into
formal evaluation jobs so completed results can merge into the tracker and appear
in the dashboard Priority Queue.

## Scope

- Reuse existing `/v1/evaluate` bridge jobs instead of creating a parallel
  evaluation path.
- Reuse `newgrad_quick` structured evaluation mode by default.
- Keep pipeline writing behavior intact.
- Add operator controls to disable evaluation or cap the number of queued jobs.
- Update mode documentation and run targeted verification.

## Assumptions

- Formal evaluation means bridge evaluation jobs that produce reports and tracker
  rows, not merely enrich-score audit output.
- `newgrad_quick` is the correct default for newgrad scan candidates because it
  is the existing repo path for structured newgrad screening and report/tracker
  writing.
- Scan candidates that fail enrich or pre-enrich filters should not be evaluated
  automatically.

## Implementation Steps

1. Inspect current scan, enrich, and evaluation APIs.
   Verify: identify the existing bridge endpoint and structured signal contract.
2. Add direct evaluation queueing to `scripts/newgrad-scan-autonomous.ts`.
   Verify: typecheck and a small no-op/limited run path.
3. Update `modes/newgrad-scan.md` so the command behavior is durable repo
   knowledge.
   Verify: docs mention evaluation controls and tracker output.
4. Run targeted tests/typechecks.
   Verify: relevant TypeScript checks pass.

## Verification Approach

- `npm --prefix bridge run typecheck`
- `npm run newgrad-scan -- --help`
- Targeted script smoke with `--score-only` or `--evaluate-limit` if bridge is
  available.

## Progress Log

- 2026-04-21: Created plan after user asked for `newgrad-scan` to convert enrich
  survivors into pipeline/evaluation candidates and run formal evaluation.
- 2026-04-21: Confirmed the dashboard Priority Queue reads `data/applications.md`
  tracker rows, not enrich audit output or `data/pipeline.md`.
- 2026-04-21: Updated `scripts/newgrad-scan-autonomous.ts` to queue
  `/v1/evaluate` jobs for enrich survivors after pipeline writing.
- 2026-04-21: Added evaluation controls: `--no-evaluate`, `--evaluate-limit`,
  `--evaluation-mode`, `--no-wait-evaluations`,
  `--evaluation-queue-delay-ms`, and `--evaluation-wait-timeout-ms`.
- 2026-04-21: Updated `modes/newgrad-scan.md` to document the tracker-evaluation
  behavior.
- 2026-04-21: Verification passed:
  `npm run newgrad-scan -- --help`,
  `npm --prefix bridge run typecheck`, and script-level `tsc --noEmit`.
- 2026-04-21: Re-verified the current working tree for the Priority Queue flow:
  `npm run newgrad-scan -- --help`, `npm --prefix bridge run typecheck`,
  `npm --prefix bridge run test -- src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts src/adapters/newgrad-links.test.ts`,
  `npm --prefix bridge run test -- src/adapters/claude-pipeline.test.ts src/adapters/newgrad-value-scorer.test.ts`,
  and script-level `tsc --noEmit` with ESNext/Bundler plus DOM libs all passed.
  Did not run a live scan/evaluation because that would launch real evaluation
  jobs and write tracker rows.
- 2026-04-21: Ran a capped live evaluation test against pending line 381,
  Goldman Sachs — Asset & Wealth Management-Generative AI Software
  Engineer-Associate-Albany.
- 2026-04-21: `real-codex` + `newgrad_quick` confirmed quick-screen behavior:
  quick eval completed with score `4.3/5` and `decision: deep_eval`, then the
  formal report job 262 failed because Codex CLI could not reconnect to
  `chatgpt.com/backend-api/codex/responses`. No report or tracker row was
  written for that failed job.
- 2026-04-21: `real-claude` + `newgrad_quick` exposed a bridge state-machine
  bug: a thrown quick-eval parser error left the job snapshot stuck in
  `evaluating` instead of marking it `failed`.
- 2026-04-21: Fixed the bridge job runner so adapter exceptions are converted
  into terminal `EVAL_FAILED` snapshots, and added
  `bridge/src/server.test.ts` to mechanically check that background adapter
  crashes mark jobs failed.
- 2026-04-21: `real-claude` + default evaluation completed the same Goldman
  candidate end to end: report
  `reports/263-goldman-sachs-2026-04-21.md`, score `4.35/5`, tracker row
  updated in `data/applications.md`, and merge summary `updated=1`.
- 2026-04-21: Rebuilt the dashboard with `npm run dashboard`; the generated
  `web/index.html` includes report 263 and the tracker now has the Goldman row
  as `Evaluated` at `4.35/5`, satisfying Apply Now / Priority Queue criteria.
- 2026-04-21: Retried the Codex formal report failure with `real-codex` +
  default evaluation on pending line 382, Twitch — Software Engineer I,
  Twitch Chat. The retry reached `codex exec report 264` and completed without
  the previous `chatgpt.com/backend-api/codex/responses` connectivity failure.
  Report `reports/264-twitch-2026-04-21.md` was generated with score `3.85/5`.
  Tracker merge returned `skipped=1` because `merge-tracker.mjs` treated the
  existing Twitch Commerce Engineering row at `4.05/5` as a fuzzy duplicate
  with a higher score, so no new tracker row was added.
- 2026-04-21: Rebuilt the dashboard after report 264; `web/index.html` now
  includes 231 reports. Re-ran `npm --prefix bridge run test --
  src/server.test.ts`; passed.

## Key Decisions

- Default to formal `newgrad_quick` evaluation for enrich survivors. This uses
  the existing newgrad-specific bridge path that writes reports and tracker rows,
  while still allowing quick hard-blocker skips.
- Keep `data/pipeline.md` writes intact. Pipeline rows remain useful for manual
  recovery, but dashboard Priority Queue visibility comes from tracker rows.
- Add queue throttling by default to avoid the bridge evaluation rate limit.

## Risks and Blockers

- Automatic evaluation can be expensive and slow; add caps and an opt-out.
- Evaluation workers require the bridge to be running in a real-capable mode.
- Full live verification with real evaluations was not run in this edit pass to
  avoid launching expensive tracker-writing jobs without a fresh scan target.

## Final Outcome

- `newgrad-scan` now promotes enrich survivors into bridge evaluation jobs by
  default. Completed jobs merge into `data/applications.md`; dashboard Apply Now
  and Selective Apply will then pick them up according to tracker score/status.
- Live test confirmed the report/tracker/dashboard side of the flow with report
  263. The default `newgrad_quick` path is behaviorally queued, but live success
  depends on the selected executor: `real-codex` passed quick-screen and failed
  on external Codex connectivity; `real-claude` currently fails quick-screen JSON
  parsing, now correctly as a terminal failed job.
- A later Codex retry confirmed the formal report stage can succeed when
  connectivity is healthy: report 264 was generated. The remaining blocker in
  that retry was tracker merge deduplication, not Codex connectivity.
