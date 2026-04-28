# Built In Scan End-to-End Debug

## Background

The user asked to fully debug and test the Career-Ops Built In scan flow,
especially whether information extraction is correct. Built In scanning should
reuse the existing browser-backed scanner, bridge scoring/enrich flow, pipeline
history, and optional direct evaluation. It must remain read-only with respect
to the job board and must never submit applications.

## Goal

Verify the Built In scan path from collection through scoring and detail
extraction, identify extraction or orchestration defects, and fix only defects
that are directly required for this flow.

## Scope

- Built In scanner mode and npm command.
- `bb-browser site builtin/jobs` collection.
- Built In row normalization.
- Built In detail text sanitization and extraction.
- Targeted bridge adapter tests relevant to scanner persistence.
- Controlled CLI runs using `--score-only` or tightly bounded write paths.

Out of scope:

- Indeed scan behavior.
- Applying to jobs or clicking mutating Built In controls.
- Broad refactors of scanner architecture.

## Assumptions

- Built In live pages may change or block reads; live failures are treated as
  findings, not bypass targets.
- Score-only preview is enough to validate collection and first-pass scoring
  without modifying user data.
- If a write-path check is needed, it must be bounded with small limits and
  reported clearly.

## Implementation Steps

1. Inspect Built In mode, runner, adapter, normalizer, detail sanitizer, and
   existing tests.
   Verify: relevant files and current contracts are understood.
2. Run targeted unit tests for Built In scanner contracts.
   Verify: tests pass or failures identify concrete defects.
3. Run a live score-only Built In scan.
   Verify: CLI extracts rows, normalizes company/title/location/summary/url,
   and reports promoted/filtered counts without writes.
4. Inspect detail extraction on sampled Built In detail pages.
   Verify: description text is useful job content, not board shell or promo
   text; fallback behavior is understood.
5. Fix directly related defects, if found.
   Verify: targeted tests and live command are rerun.
6. Record outcome, risks, and remaining follow-up.

## Verification Approach

- Targeted bridge tests:
  `npm --prefix bridge run test -- src/adapters/job-board-detail-text.test.ts src/adapters/job-board-scan-normalizer.test.ts src/adapters/newgrad-pending.test.ts src/adapters/newgrad-scan-history.test.ts`
- Live preview:
  `npm run builtin-scan -- --url "<Built In search URL>" --score-only --limit 10`
- Detail sampling through `bb-browser fetch` for promoted sample URLs.

## Progress Log

- 2026-04-25: Created plan after reading repository instructions. Confirmed
  onboarding files exist and update check is offline at local version 1.3.0.
  Started inspecting Built In scanner code with a dirty pre-existing worktree.
- 2026-04-25: Ran targeted adapter tests; baseline passed. Live score-only
  Built In scan extracted rows but promoted none.
- 2026-04-25: Found live extraction defects: the active Built In adapter
  rewrote city-filtered URLs to `allLocations=true`, removed
  `city/state/country`, and classified `In-Office` labels as locations.
- 2026-04-25: Fixed the repository `bb-browser` Built In adapter and synced it
  to the active `~/.bb-browser/sites/builtin/jobs.js` runtime path for live
  verification. Added downstream normalizer tests and guards.
- 2026-04-25: Verified live adapter output preserves Durham URL filters and
  reports `In-Office` / `In-Office or Remote` as `workModel` instead of
  `location`.
- 2026-04-25: Fetched a live Built In detail page and ran the detail sanitizer
  against the captured HTML. Sanitized detail length was 6,280 characters,
  contained useful Galatea/Financial Software Engineer job content, and did
  not contain search/post/similar/apply/save shell text.
- 2026-04-25: Verified bridge health and ran `npm run builtin-scan -- --no-evaluate`
  against a live Built In query. The run reached bridge scoring and stopped at
  zero promoted rows without pipeline or tracker writes.
- 2026-04-25: Re-ran per user request with
  `https://builtin.com/jobs/hybrid/office?search=software+engineer+ai+engineer&city=&state=&country=USA&allLocations=true`.
  Direct live adapter returned 25 jobs with expected URL filters and work model
  fields.
- 2026-04-25: Found runner-only JSON truncation: direct shell output for 25
  adapter rows was 13,680 bytes, but Node `execFile` captured only 8,192 bytes,
  causing `Unterminated string in JSON`. Updated the job-board runner to capture
  adapter stdout through a temporary file.
- 2026-04-25: Re-ran the requested URL through `npm run builtin-scan
  -- --score-only --limit 25`. Result: parsed 25, unique 25, promoted 3,
  filtered 22.
- 2026-04-25: Re-ran the requested URL through bridge enrich with
  `--no-evaluate --limit 25 --enrich-limit 3`. Detail extraction captured
  10,230 / 9,678 / 8,130 characters for the promoted rows. Bridge skipped all
  3 as `experience_too_high`, so no pipeline/tracker rows were added.
- 2026-04-25: Investigated why live Built In samples still did not naturally
  reach pipeline/evaluation. Found a real parser bug: `0–5 years` with an en
  dash was interpreted as `5 years`, incorrectly triggering
  `experience_too_high`. Fixed experience-range parsing for hyphen, en dash,
  and em dash and added scorer coverage.
- 2026-04-25: Added explicit `--include-older` runner flag for bounded live E2E
  validation. Daily scans keep the normal 24h gate; E2E validation can use real
  older Built In new-grad rows without weakening quality gates.
- 2026-04-25: Ran full live Built In branch with
  `new grad software engineer`, `--include-older --pages 2 --enrich-limit 8
  --evaluate-limit 1`. Result: parsed 46, promoted 39, enriched 8, added 1
  pipeline candidate, queued 1 direct evaluation, completed 1 evaluation.
  Replit `Software Engineer - New Grad (Summer 2026)` scored 4.2/5, report
  `reports/386-replit-2026-04-25.md`, tracker merged.

## Key Decisions

- Keep this plan scoped to Built In only, despite adjacent Built In/Indeed
  implementation history.
- Prefer score-only live scans first to avoid accidental pipeline/tracker churn.
- Treat zero promoted rows from current live Built In samples as a valid flow
  outcome, not a reason to force writes with synthetic data.
- Use file-backed stdout capture for `bb-browser site` adapter calls in the
  runner because the large Built In JSON payload was truncated through Node
  pipe capture in this environment.
- Do not lower compensation or experience quality gates to make E2E pass.
  Instead, add a bounded `--include-older` validation path and fix genuine
  parsing defects.

## Risks and Blockers

- Built In may block automated fetches or change page markup.
- Current working tree contains many unrelated existing changes; do not revert
  or normalize them.
- The active `bb-browser` runtime loads private adapters from `~/.bb-browser/sites`
  before repository adapters. The fixed adapter was synced there for this
  session, but keeping runtime adapters aligned with repository adapters remains
  an environment concern.
- The live Built In samples available during this run had zero promoted rows,
  so the natural write/enrich/direct-evaluation branch was not exercised with a
  promoted live row.
- The user-requested AI search produced promoted rows and detail text, but all
  were senior/principal/staff roles and were correctly skipped by the bridge
  value/experience gate.
- Current same-day Built In samples can still be sparse for true new-grad roles.
  The verified full-branch command uses live older rows explicitly via
  `--include-older`.

## Final Outcome

Built In scan collection, scoring, and detail extraction were debugged. Two
data extraction defects were fixed:

- user-provided Built In URL filters are no longer widened to
  `allLocations=true` or stripped of `city/state/country`
- Built In work model labels such as `In-Office` and `In-Office or Remote` no
  longer pollute the location field

Targeted tests passed, live score-only and bridge no-evaluate scans ran, and
sample live detail pages sanitized to useful job-description text without board
shell pollution. A runner truncation defect for large adapter JSON payloads was
fixed. The full enrich -> pipeline -> direct evaluation branch was verified
with a live Built In new-grad query using `--include-older`, producing a Replit
evaluation report and tracker row. No application submission or mutating
job-board action was performed.
