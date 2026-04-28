# LinkedIn Visible List Scan Design

## Background

LinkedIn's current `jobs/search-results` route can render visible result rows as
plain clickable list buttons. In that shape, the visible list entries do not
expose `data-job-id`, and only the selected row exposes a `/jobs/view/{id}/`
link in the detail pane. The existing scanner expected stable job IDs in every
card, so it usually extracted only the currently selected job.

## Goal

Make `/career-ops linkedin-scan` identify every visible LinkedIn Jobs result on
the page, obtain a stable LinkedIn job-view URL for each one, and continue using
the existing score, enrich, pipeline, and evaluation flow.

## Scope

- Keep the existing static LinkedIn extractor for older page shapes.
- Add a fallback for visible result buttons on the new `search-results` page.
- Parse visible row text into title, company, location, posted age, and work
  model.
- Select each visible row in the browser to let LinkedIn populate
  `currentJobId` and the detail pane job link.
- Use canonical `https://www.linkedin.com/jobs/view/{id}/` URLs for dedupe,
  enrich, pipeline, and evaluation.
- Add targeted unit tests for visible row text parsing.

## Non-Goals

- Do not click Apply, Easy Apply, Save, Dismiss, message, or recruiter controls.
- Do not replace the downstream scanner scoring or pipeline rules.
- Do not add a private LinkedIn API dependency.

## Design

The scanner first runs the existing `extractLinkedInList()` path. It then reads
visible result buttons matching LinkedIn's new accessible row shape:
`role="button"` plus `tabindex="0"` with job-like text and a posted-age signal.

For each visible row, the scanner clicks the row button, waits for the detail
pane to reflect the selected title and expose `currentJobId` or a job-view
link, builds a canonical job-view URL, and emits a `NewGradRow`. Rows from the
static extractor and visible-button fallback are deduped by canonical detail
URL before scoring.

Row text parsing lives in `bridge/src/adapters/linkedin-scan-normalizer.ts` so
it can be tested without a browser. Browser-only code is limited to finding
visible buttons, selecting them, and reading the selected detail state.

## Verification

- Unit test visible-row parsing with current LinkedIn row text samples.
- Typecheck the bridge and scanner script.
- Run `bun run linkedin-scan -- --url "<LinkedIn URL>" --score-only --limit 20`
  and verify it extracts all currently visible results instead of only one.
- Run the write path with `--no-evaluate` after the preview succeeds.
