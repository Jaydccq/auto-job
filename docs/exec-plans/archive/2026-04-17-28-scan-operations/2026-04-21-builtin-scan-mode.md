# BuiltIn Scan Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/career-ops builtin-scan` as a durable, source-specific entry point for Built In job discovery.

**Architecture:** Reuse the existing Built In support already present in `scan.mjs`, `extension/src/content/extract-builtin.ts`, and the newgrad scan bridge contracts. Add only a mode file, router entries, an OpenCode command, and a thin npm alias so Built In scanning has first-class instructions without creating parallel scan logic.

**Tech Stack:** Node.js ESM, Playwright-backed site inspection, Markdown mode files, YAML portal configuration, existing career-ops router.

---

## Background

The repository already includes Built In support:
- `scan.mjs` fetches configured `builtin_searches` and supports `--builtin-only`.
- `extension/src/content/extract-builtin.ts` extracts Built In list and detail pages.
- `bridge/src/adapters/newgrad-source.ts` maps Built In rows to `builtin-scan`.
- `modes/newgrad-scan.md` documents the browser-extension scanner, but there is no dedicated `/career-ops builtin-scan` mode.

The user supplied this live page for research:

`https://builtin.com/jobs/hybrid/office?search=Software+Engineering&city=Durham&state=North+Carolina&country=USA&allLocations=true`

Observed page model on 2026-04-21:
- Result page title: `Top Jobs For Your Search`.
- Result card selector: `[id^="job-card-"]`, with `data-id="job-card"`.
- Job title link selector: `a[data-id="job-card-title"]`, linking to `/job/.../{id}`.
- Company link selector: `a[data-id="company-title"]`, usually after an empty logo link to `/company/...`.
- First result page contained 16 job cards.
- Cards expose company, title, posted age, work model, location or location count, salary when present, seniority, industry, summary, and top skills.
- The page has cookie consent UI and login/signup UI that must be ignored by scanners.
- The URL mixes `city/state/country` with `allLocations=true`; the result set includes Durham, Raleigh, multi-location, and national listings.
- Detail pages expose `h1`, company link, posted/reposted timing, location, work model, seniority, industry, full JD text, top skills, company section, similar jobs, and an external Apply link.
- Detail pages can show `Read Full Description`, login/signup modals, and sticky Apply/Save actions; scanners must capture Apply URLs but never submit.

## Goal

Make `/career-ops builtin-scan` route to source-specific instructions for:
- CLI discovery: `npm run builtin-scan -- --dry-run` and `npm run builtin-scan`.
- Manual page scanning through the extension on Built In result pages.
- Built In-specific warnings around `allLocations=true`, collapsed detail descriptions, auth prompts, sponsored/resume widgets, and apply safety.

## Scope

In scope:
- Add `modes/builtin-scan.md`.
- Add router entries in `.claude/skills/career-ops/SKILL.md`.
- Add an OpenCode command for `/career-ops-builtin-scan`.
- Add an npm script alias to `scan.mjs --builtin-only`.
- Update `CLAUDE.md` and `docs/CODEX.md` routing maps so the command is discoverable.
- Verify parsing and routing with targeted commands.

Out of scope:
- Rewriting Built In extraction logic.
- Crawling every Built In pagination page.
- Replacing `newgrad_scan` scoring.
- Applying to jobs, clicking external Apply, saving jobs, creating job alerts, or logging in.
- Changing user-specific search keywords in local `portals.yml`.

## Assumptions

- Existing uncommitted Built In scanner files are user-owned work and must not be reverted.
- A dedicated `builtin-scan` mode should reuse `scan.mjs --builtin-only` instead of introducing a separate scanner.
- Built In scan results should continue to flow through `builtin-scan` source tags already supported by bridge tests.
- `allLocations=true` is useful for broader discovery, but users must understand it does not enforce Durham-only results.

## Uncertainties

- Built In may change DOM classes; stable selectors are currently `data-id` and `/job/` links.
- Some detail pages may hide part of the description behind `Read Full Description`; extension detail extraction should be preferred when complete JD text matters.
- Some Apply links may be external ATS URLs, while some flows may require Built In auth.

## Simplest Viable Path

Use the existing generic scanner as the execution engine and make `builtin-scan` a documented, routed entry point. This keeps the diff small and avoids duplicated parsing/scoring paths.

## What Already Exists

- `scan.mjs --builtin-only`: Reused.
- `templates/portals.example.yml -> builtin_searches`: Reused.
- `extension/src/content/extract-builtin.ts`: Reused.
- `bridge/src/adapters/newgrad-source.ts`: Reused.
- `bridge/src/adapters/newgrad-pending.test.ts` and `newgrad-scan-history.test.ts`: Already cover `builtin-scan` source mapping.

## NOT In Scope

- Dedicated Built In API client: no public stable API is established in the repository, and HTML parsing already exists.
- Automatic pagination crawling: would increase site-load and anti-bot risk without being required for this command.
- Built In account automation: login, job alerts, save, resume upload, and Apply flows are user actions.
- Durham-only enforcement: the supplied URL includes `allLocations=true`, so the command should warn rather than silently alter semantics.

## Implementation Steps

1. [x] Create `modes/builtin-scan.md`.
   Verify: file documents CLI and extension workflows, Built In selectors, URL semantics, safety rules, and expected output.
2. [x] Add `builtin-scan` routing.
   Verify: `.claude/skills/career-ops/SKILL.md` maps `builtin-scan` / `builtin` and includes the mode in shared-context loading.
3. [x] Add command/script aliases.
   Verify: `package.json` has `builtin-scan`; `.opencode/commands/career-ops-builtin-scan.md` loads the career-ops skill.
4. [x] Update navigation docs.
   Verify: `CLAUDE.md` and `docs/CODEX.md` mention the new mode without large prose expansion.
5. [x] Run targeted verification.
   Verify:
   - `node --check scan.mjs`
   - `npm run builtin-scan -- --dry-run`
   - `npm run verify`

## Test Coverage Diagram

```
USER FLOW COVERAGE
==================
/career-ops builtin-scan
  |
  +-- Router resolves builtin-scan
  |   +-- [TESTED] rg verified router, docs, mode, command, and package references
  |
  +-- CLI path: npm run builtin-scan -- --dry-run
  |   +-- scan.mjs --builtin-only
  |       +-- [TESTED] Built In HTML fetch: 6 searches, 150 jobs found
  |       +-- [TESTED] title filter: 72 removed
  |       +-- [TESTED] dedupe: 16 skipped
  |       +-- [TESTED] dry-run no writes: command completed with dry-run summary
  |
  +-- Extension path on builtin.com/jobs
      +-- Existing Built In page detection
      +-- Existing list extractor
      +-- Existing detail extractor
      +-- Existing builtin-scan source persistence

CODE PATH COVERAGE
==================
package.json script alias
  +-- [TESTED] npm run builtin-scan -- --dry-run invoked scan.mjs --builtin-only

.claude router docs
  +-- [TESTED] rg verified route, menu, and shared-context loading entries

modes/builtin-scan.md
  +-- [TESTED] npm run verify passed with 0 errors and 2 pre-existing duplicate warnings
```

## Verification Approach

- Use live Built In page inspection as current evidence for selectors and caveats.
- Use `npm run builtin-scan -- --dry-run` to avoid changing `data/pipeline.md` or `data/scan-history.tsv`.
- Use `npm run verify` for repository-wide structural checks.

## Key Decisions

- Reuse `scan.mjs --builtin-only` instead of building a second Built In scanner.
- Document both CLI and browser-extension workflows because they solve different cases:
  - CLI: fast configured keyword scan.
  - Extension: user-selected live filters on a visible Built In page.
- Keep `allLocations=true` visible to the user instead of rewriting URLs to city-only.

## Risks And Blockers

- Existing worktree is dirty. Only files directly required for `builtin-scan` mode should be touched.
- `npm run builtin-scan -- --dry-run` uses live Built In HTTP and may fail from network or site blocking.
- `npm run verify` may report pre-existing warnings unrelated to this change.
- The existing `batch/batch-runner.sh` report-number detection can fail when non-report markdown files exist under `reports/`, such as `reports/CLAUDE.md`. This is tracked in `docs/exec-plans/tech-debt-tracker.md`.

## Progress Log

- 2026-04-21: Read project instructions, existing Built In plan, scanner code, router, and mode files.
- 2026-04-21: Inspected the supplied Built In result page with browser tooling and captured selectors/caveats above.
- 2026-04-21: Created this execution plan before code edits.
- 2026-04-21: Added `modes/builtin-scan.md`, router entries, OpenCode command, npm alias, and concise routing docs.
- 2026-04-21: Ran `node --check scan.mjs`: passed.
- 2026-04-21: Ran `npm run builtin-scan -- --dry-run`: passed; 6 Built In searches, 150 jobs found, 72 title-filtered, 16 duplicates, 62 dry-run candidates, no files written.
- 2026-04-21: Ran `npm run verify`: passed with 0 errors and 2 pre-existing duplicate warnings in `applications.md`.
- 2026-04-21: Tested Built In city URLs for Seattle, San Francisco, Denver, and New York with Playwright. Each returned 25 visible job cards. `allLocations=true` and city-params-only URLs produced comparable first-page results, with exact-city, nearby-city, and multi-location rows mixed together.
- 2026-04-21: Tested the same city URLs through HTTP fetch and scan-style HTML parsing. Each returned HTTP 200 and parsed 25 job cards. Recorded the behavior in `modes/builtin-scan.md`.
- 2026-04-21: Estimated city-page effectiveness with current `portals.yml -> title_filter` and existing dedupe state. Seattle produced 3 would-enter-pipeline candidates, San Francisco 9, Denver 8, and New York 2 from first-page results. The CLI path would auto-enter 0 into evaluate because `builtin-scan` only discovers/writes pipeline; evaluation requires `/career-ops pipeline` or the extension enrich/evaluate flow.
- 2026-04-21: Ran the real `/career-ops builtin-scan` path via `npm run builtin-scan` at user request. It fetched 6 Built In keyword searches, found 150 jobs, removed 72 by title filter, skipped 16 duplicates, and wrote 62 new Built In URLs to `data/pipeline.md` plus 62 `builtin-scan` rows to `data/scan-history.tsv`. No Built In rows entered formal evaluate yet; that requires `/career-ops pipeline`.
- 2026-04-21: Began `/v1/builtin-scan/pending` bridge endpoint work at user request. Goal: expose the generic Built In pipeline rows written by `scan.mjs` through the same pending-read path shape as `/v1/newgrad-scan/pending`. Success criteria: parser reads unchecked `https://builtin.com/job/... | Company | Role` rows, skips tracker/report duplicates, honors `limit`, route returns a protocol envelope, and targeted bridge tests/typecheck pass. Assumption: this endpoint is read-only and should not submit applications or mutate `data/pipeline.md`. Uncertainty: whether the extension UI will consume this exact endpoint immediately; simplest viable path is to expose a stable bridge method first and leave UI wiring out of scope unless requested.
- 2026-04-21: Added `readBuiltInPendingEntries`, `POST /v1/builtin-scan/pending`, adapter contract wiring for real/sdk/fake bridge adapters, API descriptor metadata, focused adapter tests, and server injection coverage.
- 2026-04-21: Verified `npm --prefix bridge run test -- src/adapters/builtin-pending.test.ts src/server.test.ts`: passed, 2 files / 6 tests.
- 2026-04-21: Verified `npm --prefix bridge run typecheck`: passed.
- 2026-04-21: Ran the Built In pending parser against the live repo data. It returned 60 pending Built In rows; 2 of the 62 scan rows are skipped because interrupted batch workers produced local reports for Flourish and General Medicine before being stopped.
- 2026-04-21: Verified `npm run verify`: passed with 0 errors and 3 warnings. Two duplicate tracker warnings were pre-existing; one warning is from the two unmerged tracker-addition TSVs produced by the interrupted batch attempt.
- 2026-04-21: Ran a real HTTP bridge case for `POST /v1/builtin-scan/pending` in real/codex mode against the current repository. `/v1/health` confirmed mode `real` and executor `codex`. `limit: 3` returned 3 rows with `total: 60`; `limit: 200` returned all 60 pending Built In rows. Hashes for `data/pipeline.md`, `data/applications.md`, and `data/scan-history.tsv` were unchanged after the calls, confirming the endpoint is read-only. The temporary bridge process was stopped after testing.
- 2026-04-22: User requested reworking `/career-ops builtin-scan` using the
  same approach proven on `linkedin-scan`. New goal: make the Built In CLI path
  support larger paginated result sets, visible duplicate accounting, and an
  optional direct-evaluation path so Built In candidates can enter
  report/tracker/Apply Next without a separate manual `/career-ops pipeline`
  step. Success criteria: `npm run builtin-scan -- --dry-run --pages N`
  fetches multiple Built In pages per configured keyword; scan output reports
  raw Built In jobs and unique-added candidates; duplicate filtering uses URL
  and company/role; `--evaluate` reads `/v1/builtin-scan/pending`, captures
  Built In detail text, queues `newgrad_quick` evaluations, waits for tracker
  merge by default, and never clicks Apply or submits applications.
- 2026-04-22: Assumptions for this improvement: preserve the existing default
  discovery behavior unless `--evaluate` is passed; keep `scan.mjs` as the
  source of truth instead of creating a separate Built In scanner; keep
  `newgrad_scan` title filters and pending hard-filter gates; Apply Next remains
  governed only by tracker status `Evaluated` and score >= 3.5.
- 2026-04-22: Verified live Built In pagination shape before implementation.
  `page=2` and `page=3` on
  `https://builtin.com/jobs/hybrid/national/dev-engineering?search=Software%20Engineering&allLocations=true`
  each returned HTTP 200 and 25 parsed `job-card` elements; page HTML exposes
  `page=` pagination links. The simplest viable path is adding a `--pages`
  option that sets the `page` query param for page 2+.
- 2026-04-22: Implemented Built In pagination and direct-evaluation options in
  `scan.mjs`: `--pages`, `--evaluate`, `--evaluate-only`,
  `--evaluate-limit`, `--pending-limit`, `--evaluation-mode`,
  `--no-wait-evaluations`, bridge host/port, queue delay, and wait timeout.
  Built In fetches now run through a lower Built In-specific concurrency limit
  because live testing showed `builtin.com` DNS/fetch failures under the normal
  portal scan concurrency while single and low-concurrency fetches succeeded.
- 2026-04-22: Implemented direct Built In evaluation without creating a second
  pipeline. The evaluator reads `/v1/builtin-scan/pending`, dedupes by canonical
  URL and normalized company/role, fetches Built In detail page text, sends
  `/v1/evaluate` with `evaluationMode: newgrad_quick`, and waits for tracker
  merge unless `--no-wait-evaluations` is set.
- 2026-04-22: Updated `modes/builtin-scan.md` to make the new path discoverable:
  preview with `--dry-run --pages N`, save with `--pages N`, evaluate existing
  pending rows with `--evaluate-only --evaluate-limit N`, or scan+evaluate in
  one command with `--evaluate`.
- 2026-04-22: Verification: `node --check scan.mjs` passed. First sandboxed
  Built In dry-runs failed with `getaddrinfo ENOTFOUND builtin.com`; rerunning
  `npm run builtin-scan -- --dry-run --pages 2` with approved network access
  passed. Result: 6 Built In searches, 2 pages/search, 300 raw Built In jobs,
  161 title-filtered, 67 duplicate-skipped, and 72 dry-run candidates; no files
  were written.
- 2026-04-22: Verified dry-run safety with
  `npm run builtin-scan -- --dry-run --evaluate --evaluate-limit 1`. Result:
  150 raw jobs from one page/search, 29 dry-run candidates, and no evaluation
  jobs queued because `--dry-run` was active.
- 2026-04-22: Verified real direct evaluation with the bridge running:
  `npm run builtin-scan -- --evaluate-only --evaluate-limit 1`. Result:
  `/v1/builtin-scan/pending` returned 60 total Built In pending rows, the command
  evaluated one candidate (`Capco | Full Stack Developer (Scala, Kafka, NiFi)`),
  captured 9448 chars of Built In detail text, completed evaluation, wrote
  `reports/297-capco-2026-04-21.md`, and merged tracker successfully. The model
  scored it 1.2/5 with SKIP, so it did not enter Apply Next.
- 2026-04-22: Dashboard rebuild after the real Built In evaluation succeeded
  with 265 reports, 188 applications, 381 pipeline rows, and 865 scan-history
  rows. Apply Next still has 31 eligible rows; the new Built In row is present
  in tracker/report but does not qualify because its model score is below 3.5
  and status is SKIP.
- 2026-04-22: Final verification after the Built In CLI changes:
  `node --check scan.mjs` passed and `npm run verify` passed with 0 errors and
  2 existing duplicate warnings.

## Plan Eng Review

Step 0 scope challenge:
- Existing code already solves scanning, Built In HTML parsing, extension list/detail extraction, source tagging, scan history, and pending parsing.
- Minimum viable change is docs/routing plus an npm alias; no scanner rewrite is needed.
- Complexity is below the smell threshold: one new mode file, one command file, one npm alias, and small routing doc edits.
- Search/site check used the live Built In page and detail page instead of relying on stale memory.
- No `TODOS.md` update is needed; no deferred work is blocking this command.

Architecture review:
- Clean because `builtin-scan` is a thin entry point over existing scan infrastructure.
- Failure scenario: Built In DOM changes. Existing mitigation is selector guidance around `data-id` and `/job/` links, plus dry-run verification.

Code quality review:
- Clean. The change avoids duplicate scanner logic and keeps Built In-specific instructions in `modes/builtin-scan.md`.

Test review:
- Coverage diagram above was produced and all planned gaps were verified.
- No LLM prompt/eval files were changed.

Performance review:
- Clean. The CLI path reuses the existing concurrent Built In keyword fetches and does not add pagination crawling.

Failure modes:
- Network or Built In blocking: dry-run fails visibly with scanner errors; no silent writes.
- `allLocations=true` returning non-Durham jobs: documented as a user-visible caveat.
- External Apply link requiring auth: documented; application submission remains out of scope.
- DOM selector drift: documented stable anchors and verified current selectors.

NOT in scope and What already exists are recorded above.

## Final Outcome

Implemented.

Verification:
- `node --check scan.mjs`: passed.
- `rg -n "builtin-scan|Built In scan|career-ops-builtin-scan|modes/builtin-scan" ...`: passed, all expected references present.
- `npm run builtin-scan -- --dry-run`: passed; no files written.
- `npm run verify`: passed with 0 errors and 2 pre-existing duplicate warnings.
- Multi-city Built In testing:
  - Seattle, WA: 25 Playwright cards; 25 HTML-parser jobs.
  - San Francisco, CA: 25 Playwright cards; 25 HTML-parser jobs.
  - Denver, CO: 25 Playwright cards; 25 HTML-parser jobs.
  - New York, NY: 25 Playwright cards; 25 HTML-parser jobs.
- City-page effectiveness estimate after title filter and dedupe:
  - Seattle, WA: 3 would enter pipeline, 0 would auto-enter evaluate.
  - San Francisco, CA: 9 would enter pipeline, 0 would auto-enter evaluate.
  - Denver, CO: 8 would enter pipeline, 0 would auto-enter evaluate.
  - New York, NY: 2 would enter pipeline, 0 would auto-enter evaluate.
- Real scan run:
  - `npm run builtin-scan`: passed and wrote 62 new Built In pipeline entries.
  - `data/pipeline.md`: 62 Built In job URLs present after run.
  - `data/scan-history.tsv`: 62 `builtin-scan` rows present after run.
  - Built In formal evaluations/reports: 0 so far.
  - `npm run verify`: passed with 0 errors and 2 pre-existing duplicate warnings.
- Built In pending bridge endpoint:
  - `POST /v1/builtin-scan/pending`: implemented.
  - `readBuiltInPendingEntries`: reads legacy Built In pipe rows and rich `builtin-scan` rows.
  - Current repo data: 60 pending Built In rows returned after skipping 2 already-reported URLs.
  - `npm --prefix bridge run test -- src/adapters/builtin-pending.test.ts src/server.test.ts`: passed.
  - `npm --prefix bridge run typecheck`: passed.
  - `npm run verify`: passed with 0 errors and 3 warnings.
  - Real HTTP case: `POST /v1/builtin-scan/pending` in real/codex mode returned 60 real Built In pending entries, honored `limit`, and left `data/pipeline.md`, `data/applications.md`, and `data/scan-history.tsv` unchanged.
- 2026-04-22 follow-up:
  - `scan.mjs --builtin-only --pages N`: implemented.
  - `scan.mjs --builtin-only --evaluate`: implemented.
  - `scan.mjs --builtin-only --evaluate-only`: implemented.
  - `npm run builtin-scan -- --dry-run --pages 2`: passed with 300 raw Built In
    jobs and 72 dry-run candidates.
  - `npm run builtin-scan -- --evaluate-only --evaluate-limit 1`: passed and
    merged one Built In tracker/report row.
  - `node --check scan.mjs`: passed.
  - `npm run verify`: passed with 0 errors and 2 existing duplicate warnings.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | - |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | - | - |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 0 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | - |

**VERDICT:** ENG CLEARED - ready to use `/career-ops builtin-scan`.
