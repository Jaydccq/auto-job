# Scan Direct Evaluation

## Background

`/career-ops scan` currently writes ordinary Greenhouse/Ashby/Lever API results
to `data/pipeline.md` and tells the user to run `/career-ops pipeline` later.
`/career-ops newgrad-scan` already performs the more useful flow: scan, enrich,
write survivors, queue `newgrad_quick` evaluations, wait for reports/tracker
rows, and record run artifacts.

## Goal

Let `/career-ops scan --evaluate` queue direct `newgrad_quick` evaluations for
the offers discovered in the current scan run, not only Built In pending rows.

## Scope

- Extend `scan.mjs` behavior for current-run non-Built-In offers.
- Preserve existing `--builtin-only --evaluate` and `--evaluate-only` behavior.
- Update mode documentation so the command behavior is durable.
- Run focused verification.

## Assumptions

- Direct evaluation should remain opt-in for `/career-ops scan` via
  `--evaluate`, unlike `newgrad-scan` where evaluation is the default.
- The bridge `/v1/evaluate` endpoint is the canonical evaluation path.
- For ordinary API scan results, the bridge can fetch JD text from URL when no
  local page text is available.
- No application should be submitted.
- Existing unrelated worktree changes must be preserved.

## Implementation Steps

1. Add current-run scan evaluation helpers to `scan.mjs`.
   Verify: `node --check scan.mjs`.
2. Keep Built In pending evaluation compatible.
   Verify: `npm run scan -- --dry-run --evaluate --evaluate-limit 1` does not
   queue jobs.
3. Update `modes/scan.md` and CLI usage comments.
   Verify: docs mention direct evaluation accurately.
4. Run targeted project verification.
   Verify: relevant tests/checks pass or blockers are recorded.

## Verification Approach

- `node --check scan.mjs`
- `npm run scan -- --dry-run --evaluate --evaluate-limit 1`
- `npm run verify`
- `git diff --check`

## Progress Log

- 2026-04-24: User requested that pages extracted by `/career-ops scan` go
  through a flow like `/career-ops newgrad-scan`.
- 2026-04-24: Found that `scan.mjs --evaluate` only evaluates Built In pending
  rows via `/v1/builtin-scan/pending`; ordinary API scan results are only
  appended to `data/pipeline.md`.
- 2026-04-24: Updated `scan.mjs` so non-Built-In `--evaluate` queues the
  current scan's newly discovered offers directly to `/v1/evaluate` with
  `evaluationMode: newgrad_quick` and structured `source/company/role/location`
  signals. Preserved `--builtin-only --evaluate` and `--evaluate-only` on the
  existing Built In pending path.
- 2026-04-24: Updated `modes/scan.md` with the new direct-evaluation command
  behavior and compatibility notes.
- 2026-04-24: Verification before live run passed: `node --check scan.mjs`,
  `git diff --check`, and `npm run scan -- --dry-run --evaluate
  --evaluate-limit 1 --no-builtin` after rerunning outside the sandbox for
  network access. Dry-run found 27 possible new API offers and confirmed no
  evaluation jobs were queued.
- 2026-04-24: Started `npm run ext:bridge`; authenticated health passed in real
  Codex mode. Ran `npm run scan -- --no-builtin --evaluate` outside the sandbox
  for ATS API/network access. The live scan checked 13 API companies, found
  444 jobs, filtered 390 by title, skipped 43 duplicates, and added 11 new
  offers. Three API targets had errors: Pallet returned HTTP 404; ElevenLabs
  and Sierra aborted before completion.
- 2026-04-24: Direct evaluation queued 11/11 current-run offers and completed
  11/11 with 0 failures and 0 timeouts. Generated reports 366-376:
  Zapier backend `0.4/5`, Bland AI multimodal ML researcher `1.3/5`, Zapier
  applied AI `0.5/5`, Vapi agent engineer `1.5/5`, Vapi strategist `1/5`,
  LangChain LangSmith fullstack `2.6/5`, LangChain Deployed Engineer Las Vegas
  `1.6/5`, LangChain Product Marketing `0.6/5`, LangChain Deployed Engineer
  Denver `1.2/5`, LangChain Deployed Engineer Phoenix `1.4/5`, and LangChain
  Deployed Engineer Salt Lake City `1.5/5`.
- 2026-04-24: Rebuilt `web/index.html` with `npm run dashboard:build`.
  Dashboard output reported 342 parsed reports, 245 applications, 447 pipeline
  rows, and 1201 scan-history rows. Raw counts after the run: 343 markdown
  files under `reports/`, 120 JD cache files, 601 lines in `data/pipeline.md`,
  254 lines in `data/applications.md`, and 1202 lines in
  `data/scan-history.tsv`.
- 2026-04-24: Final verification: `node --check scan.mjs` passed,
  `git diff --check` passed, `npm run verify` passed tracker/report/status
  checks and bridge typecheck/extension checks but failed the full bridge test
  command because two known batch e2e tests exceeded Vitest's default 5-second
  timeout. Reran `npm --prefix bridge run test -- --testTimeout=20000
  src/batch/batch-runner.e2e.test.ts`; both timed-out tests passed.

## Key Decisions

- Keep direct evaluation opt-in for generic `/career-ops scan` because this
  scanner can discover broader, less enriched API postings than JobRight.
- Reuse `/v1/evaluate` with `evaluationMode: newgrad_quick` and structured
  source/company/role/location signals instead of adding a new bridge endpoint.

## Risks and Blockers

- Generic ATS pages may require the bridge to fetch details itself, so quick
  evaluation quality can vary by provider.
- Live scans may find zero new offers because `data/scan-history.tsv`,
  `data/pipeline.md`, and `data/applications.md` dedupe aggressively.
- The tracker merge collapsed some generated LangChain reports under existing
  company/role identity behavior, so the run generated 11 reports but the
  tracker application count increased by 7 rows.

## Final Outcome

Implemented and exercised. `/career-ops scan --evaluate` now supports the
newgrad-style direct evaluation flow for current-run generic scan results while
preserving Built In compatibility behavior.
