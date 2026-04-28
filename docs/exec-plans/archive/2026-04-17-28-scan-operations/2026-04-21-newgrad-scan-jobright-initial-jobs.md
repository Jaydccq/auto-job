# Newgrad Scan JobRight Structured Sources

## Background

The bb-browser JobRight adapter showed that JobRight minisite pages expose a
structured `__NEXT_DATA__.props.pageProps.initialJobs` payload. Follow-up
browser inspection also found the same page's paginated
`/swan/mini-sites/list` endpoint, which returns 50 jobs at a time by offset.
The current `/career-ops newgrad-scan` autonomous runner uses a DOM scroller
for full 24-hour list extraction after resolving the embedded JobRight page.

## Goal

Use structured JobRight sources to make `/career-ops newgrad-scan` faster and
more reliable when it is safe, without reducing default scan coverage. The
default path should cover the same 24-hour freshness range without requiring
DOM scrolling when the paginated JobRight API is available.

## Scope

- Add a list-source option to `scripts/newgrad-scan-autonomous.ts`.
- In auto mode, use JobRight's paginated list API for minisite pages and stop
  when the first listing older than 24 hours is reached.
- Keep `initialJobs` as a first-page smoke path.
- Fall back to the existing DOM scroller when the structured sources are missing
  or fail.
- Document the new option in `modes/newgrad-scan.md`.

## Assumptions

- JobRight's `/swan/mini-sites/list` response is ordered newest-first, matching
  the live table.
- The `newgrad/us/swe` minisite category maps to `newgrad:us:swe` in the list
  API body.
- The DOM scroller remains the fallback extraction path when the API is missing
  or changes shape.
- `--limit` requests are intentionally bounded, so satisfying them from
  structured rows is acceptable.

## Implementation Steps

1. Add list-source parsing and help text.
   Verify: `npm run newgrad-scan -- --help` shows the option.
2. Add a JobRight `initialJobs` extractor and safe auto-selection logic.
   Verify: TypeScript typecheck passes.
3. Add a JobRight paginated API extractor for full 24-hour coverage.
   Verify: read-only browser benchmark returns the same range as the DOM
   scroller without scrolling.
4. Update mode documentation.
   Verify: docs explain `auto`, `api`, `dom`, and `initial-jobs` behavior.
5. Run targeted verification.
   Verify: help, typecheck, and a read-only score-only smoke path pass.

## Verification Approach

- `npm run newgrad-scan -- --help`
- `npm --prefix bridge run typecheck`
- Script-level `tsc --noEmit` for `scripts/newgrad-scan-autonomous.ts`
- Read-only extraction benchmark against JobRight's paginated list API
- `npm run newgrad-scan -- --list-source api --limit 5 --score-only --headless`

## Progress Log

- 2026-04-21: Created plan after the user asked where the bb-browser JobRight
  adapter insight could optimize `/career-ops newgrad-scan`.
- 2026-04-21: Added `--list-source auto|dom|initial-jobs` to
  `scripts/newgrad-scan-autonomous.ts`.
- 2026-04-21: Added a JobRight `initialJobs` extractor and auto-selection logic:
  auto mode uses the structured payload for bounded scans or when it proves
  24-hour coverage, otherwise it falls back to the DOM scroller.
- 2026-04-21: Updated `modes/newgrad-scan.md` with list-source behavior and a
  fast smoke-check example.
- 2026-04-21: Verification passed:
  `npm run newgrad-scan -- --help`,
  `npm --prefix bridge run typecheck`,
  script-level `tsc --noEmit`, and two bounded live score-only smoke checks:
  `--list-source initial-jobs --limit 5 --score-only --headless --chromium`
  and `--list-source auto --limit 5 --score-only --headless --chromium`.
- 2026-04-21: Ran read-only extraction benchmarks against
  `https://jobright.ai/minisites-jobs/newgrad/us/swe?embed=true` without bridge
  scoring or repo data writes. Page load was about 5.3-5.4s. `initialJobs`
  extraction returned 50 rows across 10 runs with median 9ms and average 11ms.
  DOM scroller extraction returned 207-218 rows across 5 runs with median
  3682ms and average 3760ms.
- 2026-04-21: User asked to make the fast path work for the full 24-hour range.
  Browser inspection found JobRight's paginated `POST /swan/mini-sites/list`
  endpoint with `position` and `count` query parameters and category body
  `newgrad:us:swe`.
- 2026-04-21: Added `--list-source api`, changed default `auto` to prefer the
  paginated JobRight API for minisite pages, and kept `dom` and `initial-jobs`
  as explicit compatibility and smoke-test sources.
- 2026-04-21: Current read-only benchmark against
  `https://jobright.ai/minisites-jobs/newgrad/us/swe?embed=true`: API
  extraction used 3 pages and returned 119-121 exact `postedAt` rows within 24
  hours with min 326ms, median 407ms, max 440ms, and avg 400ms. Current DOM
  extractor returned 205-216 displayed rows with min 3584ms, median 3594ms, max
  3843ms, and avg 3644ms.
- 2026-04-21: Verification passed:
  `npm run newgrad-scan -- --help`,
  `npm --prefix bridge run typecheck`,
  script-level `tsc --noEmit`,
  `npm run newgrad-scan -- --list-source api --limit 5 --score-only --headless --chromium`,
  and
  `npm run newgrad-scan -- --list-source auto --limit 5 --score-only --headless --chromium`.

## Key Decisions

- Do not make the bb-browser private adapter a runtime dependency of
  Career-Ops. Encode the same structured extraction insight directly in the
  repo-owned autonomous scanner.
- Preserve coverage by making DOM extraction the fallback whenever JobRight's
  structured API is unavailable.
- Treat `initialJobs` as a first-page smoke path, not a full replacement. On
  the benchmark page it was roughly 342x faster for extraction itself, but
  covered 50 rows while the DOM scroller found 218 rows.
- Use the API timestamp as the authoritative 24-hour cutoff. The DOM path only
  has coarse `postedAgo` strings, so it can include rows displayed as `1 day
  ago` that are older than 24 hours by exact timestamp.

## Risks And Blockers

- If JobRight changes the `initialJobs` payload shape, auto mode should fall
  back to DOM extraction.
- If JobRight changes the paginated list endpoint shape, auto mode should fall
  back to DOM extraction.
- The current JobRight page exposes only the first 50 jobs in `initialJobs`.
  Therefore `initial-jobs` remains a bounded smoke path only.
- A full live scan can queue evaluations and write tracker rows; verification
  should use `--score-only` unless explicitly testing writes.

## Final Outcome

`/career-ops newgrad-scan` now has repo-owned JobRight structured list sources.
Default auto mode uses the paginated JobRight API for the full exact 24-hour
freshness window, falls back to `initialJobs`, then falls back to the DOM
scroller. `--list-source api` forces the 24-hour API path, `--list-source dom`
keeps the previous scrolling behavior, and `--list-source initial-jobs` remains
the fastest first-page smoke path.

Measured effect on 2026-04-21: current API extraction for the exact 24-hour
range took about 0.4s median after page load, compared with about 3.6s median
for DOM scrolling. Including page load, the list phase is about 5.8s via API
instead of about 8.7s via DOM. The API path is also stricter: it stops by exact
`postedAt`, while DOM can over-include rows displayed as `1 day ago`.
