# Newgrad Scan Review Assessment

## Background

The user provided an external architecture review of the current `newgrad-scan`
flow and asked which recommendations are actually applicable to this repository.
The review compares the scanner to Cloudflare's AI code review orchestration
system. The repository remains the system of record; external material is only
used as design inspiration after checking the local implementation.

## Goal

Identify which review suggestions should be applied because they would materially
improve `newgrad-scan`, which ones are already implemented, and which ones are
over-scoped or premature for the current system.

## Scope

- Assess current scanner/evaluation architecture from local files.
- Assess the review's proposed changes for fit, impact, and implementation
  order.
- Do not implement code changes in this task.
- Do not make external Cloudflare architecture claims durable beyond the parts
  checked against the referenced public article.

## Assumptions

- The next valuable work should improve reliability, observability, recovery,
  and calibration before adding more model-heavy evaluation paths.
- `newgrad-scan` should remain compatible with existing `data/pipeline.md`,
  `jds/`, `reports/`, and `data/applications.md` artifacts while any new state
  store is introduced.
- Markdown artifacts should remain human-readable outputs, but they should not
  be the only durable operational state over the long term.

## Implementation Steps

1. Verify the current scanner pipeline shape.
   Verify: inspect `modes/newgrad-scan.md`, `scripts/newgrad-scan-autonomous.ts`,
   `bridge/src/adapters/claude-pipeline.ts`, `newgrad-scorer.ts`,
   `newgrad-value-scorer.ts`, and bridge worker-pool files.
2. Check the external Cloudflare reference only for broad architecture claims.
   Verify: confirm whether orchestration, specialized reviewers, JSONL,
   shared context, prompt boundary sanitization, and risk tiers are actually
   present in the article.
3. Classify review recommendations.
   Verify: produce a prioritized list with "apply now", "apply later",
   "already exists", and "do not apply as written".

## Verification Approach

This is an assessment-only task. Verification is by source inspection:

- Local repository files establish current behavior.
- The referenced Cloudflare article only supports analogy-level claims.
- No runtime scanner execution is required because no code behavior is changed.

## Progress Log

- 2026-04-24: Read local newgrad scan mode, autonomous runner, bridge eval path,
  scorer, value scorer, config, queue, and worker-pool implementation.
- 2026-04-24: Confirmed the review is directionally right that the scanner is a
  layered funnel, not a batch prompt.
- 2026-04-24: Confirmed Cloudflare article contains the broad patterns cited:
  specialized reviewers plus coordinator, JSONL/telemetry, shared context,
  prompt-boundary sanitization, risk tiers, and escape hatch. These are useful
  analogies, not drop-in requirements.

## Key Decisions

- Highest-impact near-term work: add `scan_run_id`, structured per-stage event
  log, batch summary, and richer pass/fail reasons. This directly addresses
  reliability, debugging, threshold tuning, and recovery.
- Next highest-impact work: add `manual_review` and safer quick-eval fallback
  policy. The current `deep_eval | skip` model is too binary for high-fit but
  uncertain roles.
- Keep the existing layered funnel. Do not collapse multiple jobs into one model
  prompt.
- Do not implement a multi-agent full-eval coordinator now. The current
  bottleneck is observability/state/calibration, not lack of specialist model
  roles.
- Do not start with SQLite/Postgres. Start with repo-local JSONL and summaries;
  only add SQLite if markdown/JSONL cannot support recovery and analytics.
- Treat source adapter refactoring as medium priority. The repository already
  has separate runners/adapters for Newgrad, LinkedIn, Built In, and Indeed;
  pulling them behind a common interface is useful but not the first reliability
  win.

## Recommendation Classification

### Apply Soon

- `scan_run_id` and batch summary under `data/scan-runs/`.
- JSONL event log for scan, score, enrich, quick eval, full eval, report write,
  tracker merge, and failure events.
- Structured decision trace for list filter and detail value gate, including
  score, threshold, matched signals, blockers, and uncertainties.
- Safer `newgrad_quick` outcome model: add `manual_review`.
- Safer quick-eval failure policy: only fallback to full eval when local value
  is high enough; otherwise retry or mark quick-model failure.
- Prompt-injection hardening for JD/page text as untrusted data.
- Golden-set and threshold calibration using real outcomes and false-skip
  audits.

### Already Mostly Exists

- Layered funnel from discovery to full eval.
- Local list scoring and hard filters.
- Detail enrichment before direct evaluation.
- Detail value score with explainable component fields in code.
- Per-job `/v1/evaluate` queue rather than one large prompt.
- Worker-pool concurrency for evaluations.
- Quick precheck plus model quick eval.
- JD cache in `jds/` and pipeline/report/tracker artifacts.

### Apply Later

- Common `JobSourceAdapter` interface across sources.
- `JobIdentityService` with content hash and cross-source merge semantics.
- Per-source enrich concurrency and rate limits.
- Shared profile/rubric/job-context artifacts for prompt reuse.
- Full eval tiers such as quick-only, standard-full, and deep-full.
- More granular bridge `JobPhase` values if JSONL evidence shows current phases
  are insufficient.

### Do Not Apply As Written

- Full eval as coordinator plus many specialist model agents. This is expensive
  and premature for the current personal job-search workflow.
- Moving immediately to Postgres. It adds operating burden; repo-local JSONL or
  SQLite is a better first step.
- Forcing all model outputs, including final report markdown, through a large
  full-eval schema before writing. Quick eval should be schema-first now; full
  eval can add a smaller terminal/result schema without blocking report writer
  improvements.
- Treating Cloudflare cost/risk-tier numbers as directly transferable. Their
  numbers are for CI code review, not job evaluation.

## Risks and Blockers

- Adding a second state store can create inconsistencies unless every artifact
  write has a corresponding event and recovery rule.
- More granular states are useful only if operators and tests consume them.
- A shared-context refactor can accidentally make prompts depend on mutable
  files if not snapshot per job.
- `manual_review` needs UI/tracker semantics, otherwise it becomes a silent
  holding state.

## Final Outcome

The review is useful but overreaches in the multi-agent/full-eval direction.
The best system lift comes from making the existing funnel observable,
recoverable, and tunable: scan-run IDs, JSONL events, decision traces, batch
summaries, safer quick-eval fallback, prompt-injection hardening, and calibration
data. Source adapterization and richer full-eval tiers are good follow-up work
after those foundations exist.
