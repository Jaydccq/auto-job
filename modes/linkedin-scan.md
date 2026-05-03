# Mode: linkedin-scan -- LinkedIn Jobs Scanner

Scans a LinkedIn Jobs search page through the authenticated `bb-browser`
profile, scores visible jobs with the existing newgrad scanner, enriches
promoted detail pages, and queues `newgrad_quick` evaluations by default.

## Prerequisites

- Bridge server running in real Codex mode (`npm run server`)
- `bb-browser` installed and on `PATH`
- LinkedIn logged in inside the `bb-browser` managed browser

If LinkedIn requires login or checkpoint recovery, run:

```bash
bb-browser open https://www.linkedin.com/login
```

Log in manually in that browser, then rerun the scan.

## Execution

### Step 1: Verify bridge

Check `/v1/health`. If it is not reachable, tell the user:

> "Start the bridge first: `npm run server`"

The health response should show `execution.mode=real` and
`execution.realExecutor=codex` before queueing evaluations.

### Step 2: Run a no-write preview

Use the supplied 24-hour LinkedIn Jobs search URL shape:

```text
https://www.linkedin.com/jobs/search-results/?currentJobId=4347121472&keywords=software%20ai%20engineer%20new%20graduate%20job%20posted%20in%20the%20past%2024%20hours&origin=JOB_SEARCH_PAGE_JOB_FILTER&f_TPR=r86400
```

Preview:

```bash
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --score-only
```

By default, the scanner reads up to 100 unique rows across 6 LinkedIn result
pages. `--score-only` extracts and scores rows without calling bridge write
endpoints.

### Step 3: Enrich and write candidates

Run:

```bash
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --no-evaluate --enrich-limit 20
```

This opens promoted LinkedIn job-view pages, extracts detail text, clicks
non-Easy-Apply `Apply` controls to inspect the external ATS/job-board posting,
writes qualifying rows to `data/pipeline.md` as `linkedin-scan`, and does not
queue formal evaluations. When an external posting URL is found, that URL is
used for pipeline/evaluation output instead of the LinkedIn job-view URL.

The external-URL probe waits for LinkedIn's redirect chain to settle by
polling `window.location.href`, `<link rel="canonical">`, and `og:url`
inside the popup tab(s) until the URL is offsite (not `linkedin.com`) AND
stable across two consecutive polls (or host-stable for tracking-param
churn). Hard ceiling: 12s per tab; popup discovery has its own 6s window
with a 1.2s quiet-period bailout. If LinkedIn never leaves itself, the
pipeline keeps the LinkedIn job-view URL.

Default behavior without `--no-evaluate` queues `newgrad_quick` evaluations for
enrich survivors and waits for completion.

Useful options:

```bash
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --score-only --limit 5
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --score-only --pages 4 --limit 100
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --open-external-apply --enrich-limit 20
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --no-open-external-apply --enrich-limit 20
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --no-evaluate --enrich-limit 2
npm run linkedin-scan -- --url "<LinkedIn Jobs URL>" --evaluate-limit 3
npm run linkedin-scan -- --bridge-host 127.0.0.1 --bridge-port 47319
```

Use `--pages` and `--limit` for larger LinkedIn result-set testing. The scanner
opens successive search-result URLs with `start` offsets and defaults to
`--pages 6 --limit 100`. The current LinkedIn `search-results` route uses a
25-row start offset convention; override `--page-size` if LinkedIn changes the
result shape. Rows are deduped by canonical LinkedIn job URL before scoring, so
overlapping result pages do not create duplicate candidates. Use `--scroll-steps`
to probe virtualized lists within each result page; each probe is a short
read-only scroll plus re-extract.

If no `--url` is passed, the script reads
`config/profile.yml -> linkedin_scan.search_url`.

## Safety Boundaries

- Never submit applications.
- Never click Easy Apply, Save, Dismiss, message, recruiter controls, or any
  external application form controls.
- During enrichment, the scanner clicks LinkedIn's non-Easy-Apply `Apply`
  control by default, opens the external ATS/job-board page, reads
  job-description text, and closes the page. It must not submit, fill, or
  advance any application form. Use `--no-open-external-apply` only for
  controlled fallback/debug runs.
- Keep LinkedIn job-view URLs as pipeline URLs when the external ATS URL is not
  available or the visible control is Easy Apply.
- Treat login, checkpoint, and account-verification pages as manual recovery
  states.

## Output Summary

When reporting results, include:

- Search URL used.
- Rows extracted.
- Promoted and filtered counts.
- Detail enrichment successes and failures.
- External Apply URL discoveries/skips and external ATS detail character counts
  when `--open-external-apply` was used.
- Pipeline entries added or skipped.
- Evaluation jobs queued/completed unless `--no-evaluate` was used.
