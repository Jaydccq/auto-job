# JobRight Bb-Browser Adapter

## Background

The bb-browser site system turns website functionality into CLI commands by
running adapter JavaScript in the user's browser context. Career-Ops already has
a JobRight/newgrad scan path, but `bb-browser site search jobright` did not find
an adapter.

## Goal

Add a read-only JobRight bb-browser site command that returns structured job
listing data from the JobRight newgrad minisite.

## Scope

- Add one `jobright/newgrad` site adapter.
- Parse JobRight's server-rendered `__NEXT_DATA__.props.pageProps.initialJobs`
  payload instead of relying on fragile visual table classes.
- Install the adapter into bb-browser's private adapter directory for local CLI
  use.
- Do not change the existing Career-Ops scan, scoring, pipeline, tracker, or
  application submission behavior.

## Assumptions

- The user's request means "make jobright.ai available through bb-browser's
  `site` CLI adapter system."
- The current newgrad SWE minisite, `newgrad/us/swe`, is the useful default
  because it is the existing Career-Ops JobRight source.
- A read-only list adapter is the simplest viable path; detail enrichment and
  Career-Ops scoring remain owned by the existing scanner.

## Implementation Steps

1. Inspect bb-browser site adapter conventions and JobRight's live page shape.
   Verify: identify adapter metadata requirements and a stable data source.
2. Add a local adapter source file.
   Verify: adapter metadata parses and exposes a `jobright/newgrad` command.
3. Install the adapter into `~/.bb-browser/sites/jobright/newgrad.js`.
   Verify: `bb-browser site search jobright --json` finds it.
4. Smoke test extraction.
   Verify: `bb-browser site jobright/newgrad 5 --json` returns real job rows.

## Verification Approach

- `bb-browser site search jobright --json`
- `bb-browser site info jobright/newgrad`
- `bb-browser site jobright/newgrad 5 --json`
- `node --check bb-browser/sites/jobright/newgrad.js`

## Progress Log

- 2026-04-21: Created plan after the user asked to CLI-ify `jobright.ai` with
  bb-browser.
- 2026-04-21: Confirmed no existing JobRight adapter was installed.
- 2026-04-21: Opened the live JobRight newgrad SWE page with bb-browser and
  confirmed the page exposes jobs in `#__NEXT_DATA__`.
- 2026-04-21: Added `bb-browser/sites/jobright/newgrad.js` and installed it to
  `~/.bb-browser/sites/jobright/newgrad.js`.
- 2026-04-21: Verification passed:
  `node --check bb-browser/sites/jobright/newgrad.js`,
  `bb-browser site search jobright --json`,
  `bb-browser site info jobright/newgrad`, and
  `bb-browser site jobright/newgrad 5 --json`.
- 2026-04-23: User asked how to fix the adapter only returning 50
  `initialJobs` rows. New goal: make the adapter use JobRight's paginated
  `/swan/mini-sites/list` API first, keep `initialJobs` as fallback, and verify
  that `bb-browser site jobright/newgrad 2500 us/swe 24 --json` can cover the
  full 24-hour window.
- 2026-04-23: Updated `bb-browser/sites/jobright/newgrad.js` to call the
  paginated API with `position` and `count`, raise the row cap to 2500, include
  `sourceMode`, `pageSize`, and `offset`, and keep `initialJobs` as fallback
  only when the API cannot be used without an offset.
- 2026-04-23: Installed the updated adapter to
  `~/.bb-browser/sites/jobright/newgrad.js` for local bb-browser use.
- 2026-04-23: Verification passed:
  `node --check bb-browser/sites/jobright/newgrad.js`,
  `node --check ~/.bb-browser/sites/jobright/newgrad.js`,
  `bb-browser site info jobright/newgrad`,
  `bb-browser site jobright/newgrad 2500 us/swe 24 --json --jq
  '{sourceMode:.sourceMode,count:.count,totalAvailable:.totalAvailable,maxAgeHours:.maxAgeHours,pageSize:.pageSize,offset:.offset}'`
  returned `sourceMode=api` and `count=199`, and
  `bb-browser site jobright/newgrad 5 us/swe 24 --json` returned valid job
  rows.
- 2026-04-23: Verified positional offset paging with
  `bb-browser site jobright/newgrad 5 us/swe 24 50 50 --json`; it returned
  positions 51-55. Adapter args should be passed positionally for this
  bb-browser version because adapter-specific `--offset` flags were not
  preserved by the top-level CLI parser in testing.
- 2026-04-23: `npm run verify` passed with 0 errors and 2 existing duplicate
  tracker warnings.

## Key Decisions

- Use `initialJobs` from `__NEXT_DATA__` rather than DOM table scraping. This
  preserves structured fields and avoids depending on generated CSS class names.
- Keep the adapter read-only. It fetches and parses listing data only.
- 2026-04-23 update: prefer the paginated JobRight API over `initialJobs` so
  the adapter can cover more than the server-rendered first page.
- Large full JSON payloads should be consumed with `--jq` summaries or
  positional offset paging. In testing, full non-`--jq` JSON output for 199 rows
  was truncated at 8192 bytes and could not be parsed directly.

## Risks And Blockers

- JobRight may rename or move the `initialJobs` payload.
- JobRight may change the `/swan/mini-sites/list` API contract or category
  format.
- The adapter depends on the browser being able to access JobRight; login or
  network issues should surface as structured errors.
- Full-row bb-browser JSON output can exceed this bb-browser version's practical
  output size. Consumers should page through rows or use `--jq` for summaries.

## Final Outcome

`jobright/newgrad` is available as a local bb-browser site adapter. It now uses
JobRight's paginated `/swan/mini-sites/list` API first and falls back to
`props.pageProps.initialJobs` only when the API cannot be used. The adapter is
read-only and does not mutate Career-Ops tracker, pipeline, scan history, or
application state.
