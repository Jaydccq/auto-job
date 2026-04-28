# Newgrad Roadmap Validation

## Background

The immediate newgrad scan orchestration work is complete. The later roadmap
lists source adapters, job identity, shared context, evaluation tiers, and an
optional SQLite state store. The user asked to test whether those deferred items
are actually worth doing now.

## Goal

Use repository evidence to classify each later roadmap item as worth doing now,
worth keeping later, or not justified yet.

## Scope

- Analyze existing scan-run logs, pipeline/tracker artifacts, and scanner code.
- Produce durable evidence in the repository.
- Do not implement the deferred architecture unless the evidence clearly shows
  it is needed now.

## Assumptions

- Existing repo artifacts are the system of record.
- A roadmap item is worth doing now only if it solves a measured current pain:
  repeated code, duplicate job identity churn, prompt cost/reliability risk,
  missing queryability, or full-eval waste.
- One or two live scan runs are enough to validate instrumentation, but not
  enough by themselves to justify a new database or broad refactor.

## Implementation Steps

1. Inspect scan-run logs.
   Verify: count discovered/promoted/enriched/skipped/queued/completed events and
   skip reasons.
2. Inspect cross-runner duplication.
   Verify: compare newgrad, LinkedIn, Built In, and Indeed runner code paths.
3. Inspect identity duplication signals.
   Verify: find repeated company/role/url patterns across tracker, pipeline, and
   scan history.
4. Inspect prompt/shared-context pressure.
   Verify: measure quick/full prompt construction or relevant prompt inputs from
   code and artifacts.
5. Inspect state-store pressure.
   Verify: determine whether JSONL summaries answer the current operational
   questions without a database.
6. Update roadmap classification.
   Verify: record a recommendation table with evidence and next trigger.

## Verification Approach

Use shell/node analysis against repo-local files and save the conclusion in this
plan and/or the later roadmap PRD.

## Progress Log

- 2026-04-24: Created validation plan.
- 2026-04-24: Parsed two live scan-run JSONL files. Result: 121 events, 26
  list-pass events, 64 list-skip events, 11 detail skips, 1 detail pass, 1
  queued evaluation, and 1 completed evaluation.
- 2026-04-24: Measured live funnel conversion. First run: 30 discovered, 10
  promoted, 2 enriched, 0 detail passes. Second run: 60 discovered, 16 promoted,
  10 enriched, 1 detail pass, 1 queued, 1 completed.
- 2026-04-24: Compared scanner runners. `scripts/newgrad-scan-autonomous.ts`,
  `scripts/linkedin-scan-bb-browser.ts`, and
  `scripts/job-board-scan-bb-browser.ts` total about 5.5k lines and share 31
  function names, including score/enrich/evaluate/wait logic.
- 2026-04-24: Parsed tracker, pipeline, and scan history. Result: 1,523 parsed
  items, 245 repeated normalized company-role keys, 195 cross-artifact repeated
  keys, and 14 repeated canonical URL keys under the repository canonicalization
  rules.
- 2026-04-24: Measured representative quick-eval prompt size. Result: about
  6.2k characters total, 356 characters of candidate profile, about 3.2k
  characters of job input. Quick eval is dominated by per-job context, not
  repeated shared profile context.
- 2026-04-24: Measured reusable full-eval context files. `batch/batch-prompt.md`,
  `modes/_shared.md`, `modes/_profile.md`, `config/profile.yml`, and `cv.md`
  total about 56k characters, but current live evidence does not yet show
  full-eval volume as the bottleneck.
- 2026-04-24: Updated `docs/prds/newgrad-scan-later-roadmap.md` with a
  validation snapshot and priority table.

## Key Decisions

- Do source adapter work next only as an incremental shared-runner extraction.
  Do not start with a large interface rewrite.
- Do job identity work next in a small service. The evidence supports better
  identity/status semantics across tracker, pipeline, and scan history.
- Do not implement shared context artifacts now for quick eval. The repeated
  candidate profile payload is too small to justify the refactor.
- Do not implement SQLite now. JSONL answered the current funnel/debug questions
  with simple scripts.
- Keep richer full-eval tiers later. The current evidence only supports the
  already-added `manual_review` state.

## Risks and Blockers

- Two live scan-run logs are useful but a small sample. Recommendations should
  distinguish "evidence now" from "needs more scan volume."

## Final Outcome

Validation complete.

Worth doing next:

- Shared scanner runner utilities leading toward source adapters.
- A scoped job identity service.

Not worth doing yet:

- Shared context artifacts for quick eval.
- SQLite/Postgres state store.
- Multi-level full-eval tiers beyond the current quick/manual/deep gate.

The later roadmap PRD now records the evidence and next trigger for each item.
