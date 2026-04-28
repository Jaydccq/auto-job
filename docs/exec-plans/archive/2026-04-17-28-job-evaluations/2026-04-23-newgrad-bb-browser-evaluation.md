# Newgrad bb-browser Evaluation

## Background

`newgrad-scan` currently uses `scripts/newgrad-scan-autonomous.ts`, a
Playwright persistent-profile browser runner. LinkedIn and Indeed scan paths use
`bb-browser`. The user reported that browser tabs remain open and asked whether
`newgrad-scan` should be moved to a `bb-browser` path.

## Goal

Determine whether `newgrad-scan` should use the existing `bb-browser` JobRight
path by default, and fix the browser/tab lifecycle problem with the smallest
safe change.

## Scope

In scope:
- Compare the current Playwright JobRight extraction path with the existing
  `bb-browser site jobright/newgrad` adapter.
- Record the decision in this plan.
- If `bb-browser` is better, route `newgrad-scan` through it.
- Regardless of that decision, reduce or eliminate scan-owned browser windows
  and tabs left open during or after `newgrad-scan`.
- Update mode docs and targeted verification.

Out of scope:
- Submitting applications.
- Asking for or storing LinkedIn, JobRight, or other session tokens.
- Rewriting scoring, enrichment, pipeline, or tracker behavior unless required
  by the browser-path change.
- Killing user-owned browser sessions automatically.

## Assumptions

- The repository is the source of truth for scanner behavior and decisions.
- The dirty worktree contains unrelated prior/user changes and must not be
  reverted.
- Login, MFA, and CAPTCHA steps remain manual browser actions.
- The scanner should close only browser contexts or tabs it opened for the
  current run.
- Current `newgrad-scan` coverage matters more than adopting a common browser
  backend for its own sake.

## Uncertainties

- The existing `bb-browser` JobRight adapter may return only the
  server-rendered `initialJobs` payload rather than JobRight's full paginated
  24-hour list API.
- The local `bb-browser` daemon currently may not have a healthy page target.
- JobRight login state may not be required for the public minisite API, but it
  can still affect page availability.
- The local machine clock and task date disagree around midnight; progress logs
  use the task date.

## Implementation Steps

1. Inspect current scanner and `bb-browser` adapter capability.
   Verify: identify whether each path reads the paginated API or only
   `initialJobs`.
2. Smoke test `bb-browser` JobRight extraction and tab behavior.
   Verify: command returns structured rows or a concrete blocker, and any tab
   opened for the smoke test is closed.
3. Smoke test the current `newgrad-scan` path in a low-impact mode.
   Verify: extraction path and row count are visible without queueing direct
   evaluations.
4. Decide whether `bb-browser` is the better default.
   Verify: decision is based on coverage, reliability, session handling, and
   cleanup behavior.
5. Implement the smallest code/docs change required by the decision.
   Verify: browser contexts/tabs opened by `newgrad-scan` are not held open
   while bridge evaluations run.
6. Run targeted verification.
   Verify: help output, focused scanner smoke test, typecheck/tests, and
   pipeline verification as appropriate.

## Verification Approach

- `bb-browser --version`
- `bb-browser site info jobright/newgrad`
- `bb-browser site jobright/newgrad ... --json`
- `npm run newgrad-scan -- --help`
- `npm run newgrad-scan -- --score-only --list-source initial-jobs --limit 5`
- `npm run newgrad-scan -- --score-only --list-source initial-jobs --limit 1`
- Script-level TypeScript check for `scripts/newgrad-scan-autonomous.ts`
- `npm run verify` or the smallest relevant substitute if full verification
  exposes an unrelated known timeout

## Progress Log

- 2026-04-23: Created this plan after the user asked to test whether
  `newgrad-scan` should switch to `bb-browser` and to fix open browser tabs.
- 2026-04-23: Initial code inspection found `newgrad-scan` uses Playwright,
  while LinkedIn and Indeed scans use `bb-browser`.
- 2026-04-23: Initial code inspection found the current Playwright path can use
  JobRight's paginated `/swan/mini-sites/list` API, while the existing
  `bb-browser` adapter reads `__NEXT_DATA__.props.pageProps.initialJobs` and
  clamps results to 100 rows.
- 2026-04-23: `bb-browser site info jobright/newgrad` confirmed the adapter is
  read-only but still limited to `limit` max 100. A live smoke test with
  `bb-browser site jobright/newgrad 100 us/swe 24 --json` returned 50 rows and
  left a JobRight tab open; that test-owned tab was closed immediately.
- 2026-04-23: Started a fake bridge to avoid scan-history writes and ran
  `npm run newgrad-scan -- --score-only --list-source api --headless
  --chromium`. The current Playwright path used the JobRight paginated API and
  extracted 183 rows within 24 hours.
- 2026-04-23: Updated `newgrad-scan` to default to headless bundled Chromium,
  add an explicit `--chrome` override, check bridge health before launching a
  browser, close the list page after extraction, and close the scan browser
  immediately after detail enrichment before any direct evaluation wait.
- 2026-04-23: Updated `modes/newgrad-scan.md` to document headless bundled
  Chromium default behavior, `--headed`, `--chrome`, and the post-enrichment
  browser close.
- 2026-04-23: Removed an old orphaned Playwright `Chrome for Testing` process
  from 2026-04-20. Left the two pre-existing `bb-browser` Built In/Indeed login
  tabs open because they predated this task.
- 2026-04-23: Verification passed:
  `npm run newgrad-scan -- --help`, script-level `tsc --noEmit` for
  `scripts/newgrad-scan-autonomous.ts`, `npm run newgrad-scan --
  --score-only --list-source initial-jobs --limit 5 --chromium` against a fake
  bridge, `npm run newgrad-scan -- --score-only --list-source initial-jobs
  --limit 1` against a fake bridge to verify the new default browser path, and
  `npm run verify` with 0 errors and 2 existing duplicate warnings.
- 2026-04-23: Follow-up adapter work removed the 50-row `initialJobs` coverage
  blocker by changing `bb-browser site jobright/newgrad` to use JobRight's
  paginated API. Live verification returned `sourceMode=api` and 199 rows for
  the 24-hour window. Routing `newgrad-scan` to bb-browser remains a separate
  integration step because full-row non-`--jq` bb-browser JSON output was
  truncated at 8192 bytes in testing; a scanner consumer should page by offset.
- 2026-04-23: Final same-window comparison after the adapter fix:
  `bb-browser site jobright/newgrad 2500 us/swe 24 --json --jq ...` returned
  199 rows in about 4 seconds, while `npm run newgrad-scan -- --score-only
  --list-source api` returned 199 rows in about 10 seconds against a fake
  bridge. The bb-browser adapter is faster for list extraction only, but it
  still leaves a managed JobRight tab unless the caller closes it, requires
  chunked/`--jq` consumption for large outputs, and is not yet wired to the
  existing detail enrichment/evaluation flow. The Playwright path is therefore
  still the better default end-to-end scanner path.

## Key Decisions

- Do not switch `newgrad-scan` to the existing `bb-browser` JobRight adapter as
  the default. It is faster but currently covers only 50 server-rendered rows in
  the live test, while the Playwright path covers the full 24-hour API window
  with 183 rows.
- After the 2026-04-23 adapter follow-up, the coverage reason above no longer
  applies to the updated adapter. The remaining blocker to a default route
  switch is scanner integration around chunked bb-browser consumption, scoring,
  enrichment, and lifecycle handling.
- Final routing decision after same-window testing: keep `newgrad-scan` on the
  Playwright JobRight API path by default. Use the updated bb-browser JobRight
  adapter for fast list probes or future chunked integration work, but do not
  make it the default scanner path until it handles large output, tab cleanup,
  row normalization, and detail enrichment as well as the current scanner.
- Fix the browser clutter issue in the Playwright scanner instead: use bundled
  Chromium headless by default and close the scan browser as soon as detail
  enrichment finishes, before waiting for bridge evaluations.

## Risks and Blockers

- Switching to the existing `bb-browser` adapter without adding paginated API
  support may reduce scan coverage.
- Automatically closing all browser tabs would risk destroying user-owned state;
  cleanup must be scoped to tabs or contexts opened by the scanner.
- The existing `bb-browser` Built In and Indeed login tabs are still open; they
  were not opened by this task and may represent pending manual login work.
- The updated bb-browser adapter now matches list coverage, but full scanner
  parity still needs a wrapper that pages by offset, closes the JobRight tab it
  opens, normalizes rows into the bridge contract, and preserves detail
  enrichment semantics.

## Final Outcome

Implemented and verified.

`newgrad-scan` remains on the Playwright JobRight API path. After fixing the
bb-browser adapter, both paths returned 199 rows for the same 24-hour window,
but the Playwright scanner remains better end-to-end because it already feeds
the bridge contract, runs detail enrichment, closes its scan browser, and waits
for direct evaluations without extra bb-browser output and tab-management
wrapping. The scanner now defaults to headless bundled Chromium, avoids opening
a browser when bridge health fails, closes its list tab after extraction, and
closes the scan browser immediately after detail enrichment so direct evaluation
waits no longer keep browser tabs open.
