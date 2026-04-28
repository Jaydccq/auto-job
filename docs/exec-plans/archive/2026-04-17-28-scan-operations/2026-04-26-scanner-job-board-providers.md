# Scanner Job Board Providers

## Background

GitHub issue #230 tracks expanding `scan.mjs` beyond Greenhouse, Ashby, Lever,
and Built In discovery. The open provider work called out there is A16Z
portfolio jobs, Amazon Jobs, and TheirStack API. The issue also references
scanner resilience around 404/410 fallback search and branded `careers_url`
usage.

## Goal

Add provider-backed discovery paths to the existing zero-token scanner without
creating a parallel scanner architecture.

## Scope

- Confirm existing built-in ATS support for Greenhouse, Ashby, and Lever.
- Add A16Z job board provider support.
- Add Amazon Jobs API detection and parsing.
- Update scanner configuration examples and mode docs.
- Add targeted regression coverage for provider payloads, normalization, and
  branded careers URL warnings.

Out of scope:
- Submitting applications.
- Replacing `scan.mjs` with the larger pluggable discovery design.
- Running broad live scans that write user data.
- Adding a generic local WebSearch backend to `scan.mjs`; `search_queries`
  remain the agent/browser workflow because this repo has no durable local
  search API contract or credentials.
- TheirStack for this workspace. The user explicitly decided not to use
  TheirStack, so docs/templates should not prompt for a TheirStack token.

## Assumptions

- `scan.mjs` remains the primary zero-token scanner entrypoint.
- A16Z and Amazon public APIs may change, so provider parsing should tolerate
  missing optional fields.

## Implementation Steps

1. Add provider modules under `providers/`.
   Verify: provider modules pass `node --check`.
2. Integrate providers into `scan.mjs` via `api_provider` detection and Amazon
   URL detection.
   Verify: `node --check scan.mjs`.
3. Update `templates/portals.example.yml` and `modes/scan.md`.
   Verify: examples stay concise and align with scanner behavior.
4. Add regression checks to `test-all.mjs`.
   Verify: `node test-all.mjs --quick`.

## Verification Approach

- Syntax checks for touched JavaScript modules.
- Unit-style regression checks inside `test-all.mjs` for:
  - Amazon API URL construction and parser normalization.
  - A16Z payload construction and offer normalization.
  - raw ATS `careers_url` warning detection.
- Dry-run scanner check when feasible without writing user data.

## Progress Log

- 2026-04-26: Reviewed issue #230 and linked issues/PRs. Existing repo already
  contains branded `careers_url` guidance in `templates/portals.example.yml`
  and `modes/scan.md`; code-level warning still needs implementation.
- 2026-04-26: Added provider modules for A16Z and TheirStack, a provider
  registry, Amazon Jobs API detection/parsing, and provider execution inside
  `scan.mjs`.
- 2026-04-26: Updated scanner templates/docs with A16Z, Amazon, and
  tracked-company 404/410 fallback search guidance.
- 2026-04-26: Added scanner provider regression coverage to `test-all.mjs`.
- 2026-04-26: Confirmed Greenhouse, Ashby, and Lever were already implemented
  in `scan.mjs` before this change. Confirmed `search_queries`/WebSearch are
  documented for the agent flow in `modes/scan.md` but are not executable by
  `scan.mjs` without adding a separate search provider/API contract.
- 2026-04-26: Verification passed for `node --check scan.mjs`, provider module
  syntax checks, focused provider import/payload checks, and `git diff --check`
  for touched files. `node test-all.mjs --quick` reached 76 passed checks and
  the new scanner provider test passed, but the suite still exits nonzero on 48
  pre-existing absolute path findings in tracked historical data/docs files.
- 2026-04-26: Live dry-run smoke tests:
  - Local `portals.yml`: Greenhouse via Hume AI found 8 jobs; Ashby via
    Perplexity found 72 jobs.
  - `/tmp` smoke `portals.yml`: combined Greenhouse, Ashby, Lever, A16Z,
    Amazon, and TheirStack dry run found 246 jobs total; Greenhouse/Ashby/Lever
    and Amazon returned live jobs; TheirStack failed clearly because no
    `THEIRSTACK_API_KEY` or `THEIRSTACK_TOKEN` is configured.
  - A16Z-only smoke with broad filters found 5 jobs and 4 title-filter-passing
    offers. The original sample filters returned 0, so the template was changed
    to start broad and ask users to add provider facets after confirmation.
  - Amazon-only smoke initially showed Amazon's API could return non-US rows
    despite `country[]` query params. Added local `country_code` filtering for
    Amazon results; rerun found 6 US jobs and 2 new dry-run offers, both in San
    Francisco.
- 2026-04-26: Full current-config dry run with
  `node scan.mjs --dry-run --no-evaluate` completed without writes or
  evaluations. It scanned 13 API companies and 6 Built In searches, found 840
  raw jobs, filtered 643 by title, skipped 176 duplicates, and identified 21
  dry-run new offers. The only provider error was `Pallet: HTTP 404`.
- 2026-04-26: User decided not to use TheirStack. Removed TheirStack from
  scanner-facing docs/templates so the current workflow does not require or
  suggest a TheirStack token.
- 2026-04-26: User requested a real non-dry-run scan with evaluation testing.
  Ran `node scan.mjs --evaluate-limit 1`. Discovery wrote 21 new offers to
  `data/pipeline.md` and `data/scan-history.tsv`, with the same single
  `Pallet: HTTP 404` provider error. The built-in direct evaluation step then
  failed at bridge fetch because the bridge was not running.
- 2026-04-26: Started `npm run ext:bridge`, manually queued the newly scanned
  Sierra `Software Engineer, Agent` Ashby offer through `/v1/evaluate`, and
  confirmed evaluation completion. It generated
  `reports/387-sierra-2026-04-25.md` with score `2.7/5`; tracker merge was
  skipped because a matching Sierra row already existed. Stopped the bridge
  after the test.

## Key Decisions

- Keep provider support in small modules and import them from `scan.mjs`.
- Do not use TheirStack in this workspace unless the user explicitly reverses
  this decision.
- Warn on raw Workday careers URLs in configured companies unless
  `allow_raw_ats_careers_url: true` is set; do not warn on every Greenhouse,
  Ashby, or Lever URL because many configured companies intentionally use those
  as fallback career pages.
- Treat WebSearch as a separate future provider decision, not as part of the
  zero-token HTTP API scanner work in this change.

## Risks and Blockers

- Live provider APIs can drift; tests should cover our normalization and payload
  behavior without requiring network access.
- Full-suite completion is blocked by existing absolute-path hygiene failures
  unrelated to this scanner provider change.
- `templates/portals.example.yml` still contains `search_queries` and many
  `scan_method: websearch` entries. Those are useful for agent-guided discovery,
  but can mislead users into thinking `scan.mjs` runs WebSearch automatically.
  A future cleanup should either add an explicit local search provider or split
  agent-only discovery config from script-executed scanner config.

## Final Outcome

Implemented scanner provider expansion for A16Z and Amazon Jobs, while leaving
TheirStack out of the active workflow per user decision. Added configuration
examples, docs, branded URL warnings, and regression coverage. Targeted
verification passed; full-suite status remains blocked by existing repository
hygiene failures outside this scope.
