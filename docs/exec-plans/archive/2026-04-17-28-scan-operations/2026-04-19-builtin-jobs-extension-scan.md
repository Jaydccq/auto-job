# BuiltIn Jobs Extension Scan

## Background

The browser extension already supports a newgrad scan flow: extract listing rows, score them with `newgrad_scan` profile rules, enrich detail pages, write JD cache files, add pipeline entries, and queue direct evaluations. The user asked to research `https://builtin.com/jobs` and add support for finding suitable jobs there using the existing extension code.

BuiltIn research from `https://builtin.com/jobs`:
- The jobs page exposes visible job cards with company, job title links under `/job/...`, posted time, work model, location, compensation, seniority, industries, summaries, and `Top Skills`.
- The page supports filters for keyword/title, remote/hybrid, location, skills, new jobs, category, experience, and industry.
- Detail pages such as `https://builtin.com/job/senior-data-scientist-growth-care/8019481` expose title, company, location/work model, salary, posted timing, full job description sections, top skills, and apply instructions.

## Goal

Enable the extension scanner UI on `builtin.com/jobs` so the user can find suitable BuiltIn jobs with the same profile-driven scoring, enrichment, and direct evaluation workflow used by the current scanner.

## Scope

In scope:
- Extract visible BuiltIn listing cards from the active page.
- Normalize BuiltIn fields into the existing `NewGradRow` contract.
- Extract BuiltIn detail pages into the existing `NewGradDetail` contract.
- Preserve source identity through scan history, JD frontmatter, pipeline rows, pending reads, and direct evaluation signals.
- Show the existing scanner UI on BuiltIn pages with source-neutral copy.
- Add BuiltIn all-location keyword searches to `/career-ops scan`.

Out of scope:
- Crawling all BuiltIn pages or pagination automatically.
- Submitting applications or clicking through an apply flow on the user's behalf.
- Creating a new scoring model separate from the existing `newgrad_scan` profile rules.

## Assumptions

- The user will use BuiltIn filters/search first, then scan the visible results page.
- The current `newgrad_scan` rules are the best available repository-owned definition of "suitable" for this user.
- BuiltIn apply links can require login or BuiltIn Easy Apply, so the implementation should preserve a usable detail/apply URL without submitting anything.

## Implementation Steps

1. Add a BuiltIn content extractor.
   Verify: extension typecheck accepts the new self-contained content script functions.
2. Add source metadata to scanner rows and bridge persistence.
   Verify: BuiltIn rows can pass bridge schemas and pending parser can read `builtin-scan` pipeline entries.
3. Wire the background worker to detect BuiltIn pages and use BuiltIn list/detail extractors.
   Verify: extension build succeeds.
4. Update the scanner panel copy and activation logic for BuiltIn.
   Verify: extension typecheck/build succeeds.
5. Run targeted bridge and extension checks.
   Verify: report command results here before final response.

## Verification Approach

- `npm --prefix bridge run typecheck`
- `npm --prefix extension run typecheck`
- `npm --prefix extension run build`
- If targeted tests are available and fast, run the affected bridge tests around scan history/pending/JD writing.

## Progress Log

- 2026-04-19: Researched BuiltIn list/detail pages and recorded the page model above.
- 2026-04-19: Started implementation plan.
- 2026-04-19: Added BuiltIn list/detail extractors for the extension.
- 2026-04-19: Added source-aware scan history, pipeline rows, pending parsing, JD cache frontmatter, and direct evaluation signals.
- 2026-04-19: Updated the panel to activate the scanner on BuiltIn pages and use source-neutral scanner copy.
- 2026-04-19: Ran targeted tests and repository verification.
- 2026-04-19: User requested keyword-based BuiltIn search without fixed city/state constraints because relocation is acceptable.
- 2026-04-19: Added BuiltIn keyword search controls with all-location national engineering URLs and common engineering keyword shortcuts.
- 2026-04-19: User requested adding the BuiltIn keyword search behavior to `/career-ops scan`.
- 2026-04-19: Added `builtin_searches` to local `portals.yml`, versioned `templates/portals.example.yml`, and a BuiltIn HTML scanner branch to `scan.mjs`.

## Key Decisions

- Reuse the existing scanner workflow instead of creating a parallel BuiltIn pipeline.
- Store source as `builtin.com` on extracted rows and render pipeline source as `builtin-scan`.
- Do not automate apply submissions.
- Keep scanning scoped to the visible BuiltIn result page so user-selected BuiltIn filters remain the source of truth.
- BuiltIn keyword search links should use all-location search URLs and omit fixed `city`, `state`, and `country` query parameters.
- `/career-ops scan` should run BuiltIn keyword searches by default; `--no-builtin` skips them and `--builtin-only` supports targeted verification.

## Risks And Blockers

- BuiltIn DOM markup may change; the extractor should prefer visible text/link heuristics over fragile class names.
- Some BuiltIn apply flows may require authentication; in that case, the extension will evaluate the BuiltIn detail URL and cached page text.
- The existing freshness gate ignores listings at or above 24 hours old. BuiltIn posted strings must be normalized accurately for current-page scanning to be useful.

## Final Outcome

Implemented.

Verification:
- `npm --prefix bridge run typecheck`: passed.
- `npm --prefix bridge run test -- src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts`: passed, 23 tests.
- `npm --prefix extension run typecheck`: passed.
- `npm --prefix extension run build`: passed.
- `npm run verify`: passed with 0 errors and 3 pre-existing duplicate warnings in `applications.md`.
- Follow-up keyword update verification:
  - `npm --prefix extension run typecheck`: passed.
  - `npm --prefix extension run build`: passed.
  - `npm run verify`: passed with 0 errors and the same 3 pre-existing duplicate warnings in `applications.md`.
- Follow-up `/career-ops scan` update verification:
  - `node scan.mjs --dry-run --builtin-only`: passed; 6 BuiltIn searches fetched, 150 jobs found, 75 dry-run new offers after title filters and dedupe, no files written.
  - `node --check scan.mjs`: passed.
  - `npm run verify`: passed with 0 errors and the same 3 pre-existing duplicate warnings in `applications.md`.
