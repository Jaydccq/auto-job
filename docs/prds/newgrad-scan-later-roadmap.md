# PRD: Newgrad Scan Later Roadmap

## Background

The immediate orchestration PRD focuses on state, traces, and safer decisions.
This roadmap captures valuable but non-blocking architecture work that should be
sequenced after the system has reliable run artifacts and calibration data.

## Goal

Evolve `newgrad-scan` from a working scanner into a maintainable multi-source
job discovery and evaluation platform without premature infrastructure.

## Later Requirements

### Source Adapter Interface

Introduce a common source adapter interface only after the current source flows
have event coverage.

```text
SourceAdapter
  -> discover rows
  -> enrich detail
  -> normalize source metadata
```

Expected adapters:

- Jobright/newgrad
- LinkedIn
- Built In
- Indeed
- manual URL

### Job Identity Service

Create stable identity keys that survive URL churn and cross-source duplicates.

Candidate fields:

- canonical apply URL
- normalized company
- normalized role
- normalized location
- source job id when available
- JD content hash

### Per-Source Limits

Move from global enrichment concurrency to per-source limits:

```yaml
sources:
  jobright:
    enrich_concurrency: 3
    rpm: 30
  company_career:
    enrich_concurrency: 1
    rpm: 10
```

### Shared Context Artifacts

Snapshot reusable evaluation context per run:

- profile context
- scoring rubric
- output schema
- per-job context JSON/markdown

This should be implemented only after prompt-injection hardening and quick eval
schema changes are stable.

### Evaluation Tiers

Add tiering once run metrics show enough volume:

- quick-only
- standard full
- deep full
- manual review

The trigger policy should be data-backed by actual scan outcomes, not guessed.

### Optional State Store

Consider SQLite only if JSONL and summaries prove insufficient for:

- crash recovery
- scan analytics
- cross-source dedupe
- dashboard queries

Postgres is explicitly out of scope for this personal local workflow unless the
project becomes a multi-user service.

## Non-Goals

- Do not build this roadmap before the immediate PRD.
- Do not introduce a multi-agent full-eval coordinator until the existing full
  eval quality is measured and shown to be the bottleneck.
- Do not make source abstraction block smaller scanner fixes.

## Success Criteria

- Each later item has a motivating metric or pain point from scan-run logs.
- New abstractions reduce duplicated behavior across existing source runners.
- The operator can still run the same CLI commands.

## Validation Snapshot: 2026-04-24

Evidence used:

- Two live `newgrad-scan` JSONL runs under `data/scan-runs/`.
- `data/applications.md`, `data/pipeline.md`, and `data/scan-history.tsv`.
- Scanner runner code in `scripts/newgrad-scan-autonomous.ts`,
  `scripts/linkedin-scan-bb-browser.ts`, and
  `scripts/job-board-scan-bb-browser.ts`.
- Prompt construction in `bridge/src/adapters/claude-pipeline.ts`.

Measured signals:

- Live scan runs produced 121 structured events. The fuller bounded run found
  60 rows, promoted 16, enriched 10, passed 1 detail gate, queued 1 quick eval,
  and completed 1 `manual_review`.
- The three scanner runners total about 5.5k lines and share 31 function names,
  including bridge health, scoring, enrich write, direct evaluation queueing,
  structured signals, and evaluation polling.
- The tracker/pipeline/history corpus has 1,523 parsed items, 245 repeated
  normalized company-role keys, 195 cross-artifact repeated keys, and 14 repeated
  canonical URL keys.
- A representative quick-eval prompt is about 6.2k characters; the candidate
  profile block is about 356 characters, roughly 6% of the prompt. The job input
  is the dominant quick-eval payload.
- Full-eval reusable context files are larger (`batch/batch-prompt.md`, shared
  modes, profile, and CV are about 56k characters together), but the current
  evidence does not show full-eval volume as the bottleneck.

Validated priority:

| Item | Do Now? | Evidence | Next Step |
| --- | --- | --- | --- |
| Source adapter/common runner | Yes, but incremental | Three runners duplicate bridge score/enrich/evaluate flow and shared helpers. | Extract shared runner utilities first; only then introduce a small source adapter interface. |
| Job identity service | Yes, scoped | Repeated company-role keys and cross-artifact state show identity/status is noisy. | Add a small `JobIdentityService` around canonical URL + normalized company/role + source id/content hash; do not start with a database. |
| Shared context artifacts | Not now | Quick prompt duplication is small; job input dominates. Full-eval context is large but not yet measured as the cost bottleneck. | Keep later; revisit after at least 10-20 full evals with token/time metrics. |
| Evaluation tiers | Partially done | `manual_review` is now a useful quick-screen terminal state. Only one live eval completed in this sample. | Keep `quick/manual_review/deep_eval`; defer standard/deep full tiering until more outcomes exist. |
| SQLite state store | Not now | JSONL summaries answered current funnel and debug questions directly; corpus is still small. | Revisit only when JSONL queries become painful, cross-run joins are needed often, or scan-run files exceed simple script ergonomics. |
