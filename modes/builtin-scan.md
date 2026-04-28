# Mode: builtin-scan -- Built In Scanner

Scans Built In job searches through the read-only `bb-browser site builtin/jobs`
adapter, scores them with the existing newgrad scanner, enriches promoted rows,
and queues direct tracker evaluations by default.

## When To Use

Use this mode when the user asks for Built In discovery, BuiltIn discovery, or
`/career-ops builtin-scan`.

Use the broader `scan` mode when the user wants every configured portal and
company source.

## What Already Exists

- `bun run builtin-scan` calls `scripts/job-board-scan-bb-browser.ts --source builtin`.
- `bb-browser site builtin/jobs` reads Built In search pages without clicking
  Apply, Save, alerts, login, or resume upload controls.
- `bun run builtin-scan:legacy` preserves the old `scan.mjs --builtin-only`
  configured-keyword scanner.
- `templates/portals.example.yml -> builtin_searches` defines versioned default
  keywords for the legacy scanner.
- `portals.yml -> builtin_searches` can override the local keyword set.
- The browser extension detects `builtin.com` pages and reuses the existing
  scan, score, enrich, pipeline, and evaluation flow.
- Built In rows are persisted with the `builtin-scan` source tag.
- `POST /v1/builtin-scan/pending` exposes unchecked Built In pipeline rows for
  direct evaluation.

Do not create a separate Built In pipeline. Reuse the existing newgrad score,
enrich, pipeline, history, and evaluation flow.

## Recommended CLI Flow

### Step 1: Preview Built In results

Run:

```bash
bun run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --score-only --limit 20
bun run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --dry-run --pages 2 --limit 50
bun run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=new+grad+software+engineer&city=&state=&country=USA&allLocations=true" --score-only --include-older --pages 2 --limit 50
```

Expected behavior:
- Reads only Built In search/list pages through `bb-browser site builtin/jobs`.
- Use `--pages N` to scan multiple Built In result pages from the supplied URL.
- Deduplicates against `data/scan-history.tsv`, `data/pipeline.md`, and
  `data/applications.md`.
- Prints raw row count, promoted/filtered counts, and top matching roles.
- Does not write files.
- `--include-older` is only for bounded live E2E validation when current
  same-day Built In rows do not contain a good early-career match. Daily scans
  should omit it so the normal 24h freshness gate remains active.

### Step 2: Save new results if the preview looks useful

Run:

```bash
bun run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --no-evaluate --enrich-limit 5
bun run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --pages 2 --no-evaluate
```

Expected behavior:
- Scores rows, captures detail text when available, and appends qualifying rows
  to `data/pipeline.md`.
- Appends added Built In rows to `data/scan-history.tsv` with the
  `builtin-scan` source tag.
- Does not queue formal evaluations when `--no-evaluate` is set.

### Step 3: Scan and evaluate directly

Default behavior without `--no-evaluate` queues `newgrad_quick` evaluations for
enrich survivors and waits for tracker merge:

```bash
bun run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --evaluate-limit 5
```

To evaluate already-saved legacy Built In rows directly:

```bash
bun run builtin-scan -- --evaluate-only --evaluate-limit 5
```

`--evaluate-only` delegates to `bun run builtin-scan:legacy` behavior: it reads
`/v1/builtin-scan/pending`, captures Built In detail page text, queues
`/v1/evaluate` using `newgrad_quick`, and waits for tracker merge by default.
Completed rows enter Apply Next only when the tracker status is `Evaluated` and
the score is at least `3.5/5`.

`--score-only`, `--dry-run`, and `--dry-run --evaluate` never queue jobs; they only report the scan
summary. Do not submit applications automatically.

Bridge consumers can read the saved Built In inbox with:

```text
POST /v1/builtin-scan/pending
```

This is a read-only endpoint. It parses unchecked Built In rows in
`data/pipeline.md`, skips tracker/report duplicates, and returns entries with
`url`, `company`, `role`, `source`, and `lineNumber`.

## Manual Browser Extension Flow

Use this when the user wants a specific Built In page or manually selected
filters to be the source of truth.

1. Open the Built In result URL in Chrome.
2. Start the local bridge if needed:

```bash
bun run server
```

3. Open the Career-Ops extension panel.
4. Confirm the panel shows the Built In scanner.
5. Click the scan button to extract visible cards.
6. Enrich promoted rows before evaluation so detail page text, external Apply
   URLs, and full job metadata are cached.

## Built In Page Model

Observed on 2026-04-21 from:

`https://builtin.com/jobs/hybrid/office?search=Software+Engineering&city=Durham&state=North+Carolina&country=USA&allLocations=true`

Result page:
- Page title: `Top Jobs For Your Search`.
- Job cards: `[id^="job-card-"]` with `data-id="job-card"`.
- Job title links: `a[data-id="job-card-title"]`, usually `/job/.../{id}`.
- Company links: `a[data-id="company-title"]`; cards may also contain an
  empty logo link to `/company/...` before the textual company link.
- Cards expose company, title, posted age, work model, location or location
  count, salary when present, seniority, industry, summary, and top skills.
- Non-job blocks can appear between cards, such as resume upload prompts and
  application tracker ads.

Detail page:
- Main title is the `h1`.
- Company is linked near the top and again near company/profile actions.
- Metadata includes posted/reposted timing, location, work model, seniority,
  industry, top skills, and company information.
- Full descriptions can be visually collapsed behind `Read Full Description`.
- Apply can be an external ATS link, such as Workday, or can require Built In
  account context.

## Important Caveats

- `allLocations=true` broadens results. A URL can contain `city`, `state`, and
  `country` while still returning Raleigh, multi-location, national, remote, or
  hybrid roles. Report this clearly when using a user-supplied city URL.
- City URLs should be treated as regional result pages, not strict city-only
  filters. On 2026-04-21, Seattle, San Francisco, Denver, and New York searches
  each returned 25 visible cards and included a mix of exact-city rows,
  nearby-city rows, and `N Locations` rows.
- Built In search pages include auth, cookie consent, resume upload, job alert,
  tracker, similar job, and footer links. Scanners must anchor on job-card
  selectors and `/job/` links rather than generic links.
- Posted strings include forms like `Reposted Yesterday`, `Reposted 4 Days Ago`,
  `7 Days Ago`, and `24 Days Ago`.
- Salary and seniority can appear twice in text output. Normalization should
  deduplicate semantically rather than treating duplicate text as separate
  fields.
- Some cards show location counts such as `25 Locations` instead of a concrete
  city.
- Some role titles are leadership or manager roles even when the search keyword
  is `Software Engineering`; trust title filters and scoring, not the Built In
  keyword alone.
- External Apply URLs are useful metadata, but the assistant must never click
  through to submit an application.

## Location Test Notes

Use this URL shape for manual city testing:

```text
https://builtin.com/jobs/hybrid/office?search=Software+Engineering&city={City}&state={State}&country=USA
```

Add `allLocations=true` only when the user explicitly wants broader discovery.
In live tests on 2026-04-21, the first page behaved as follows:

| Location | `allLocations=true` cards | City params only cards | Notes |
|----------|---------------------------|------------------------|-------|
| Seattle, WA | 25 | 25 | Mixed exact Seattle, multi-location, and regional rows |
| San Francisco, CA | 25 | 25 | Multiple exact San Francisco rows in the first page |
| Denver, CO | 25 | 25 | Included Denver, Broomfield, and multi-location rows |
| New York, NY | 25 | 25 | Included New York, Brooklyn, and multi-location rows |

The CLI `bun run builtin-scan` now treats the supplied `--url` or `--path` as
the source of truth. Use `bun run builtin-scan:legacy` when you need the older
configured `portals.yml -> builtin_searches` keyword sweep.

## Customizing Built In Searches

Edit local `portals.yml`:

```yaml
builtin_searches:
  - name: Built In - Software Engineering
    keyword: Software Engineering
    enabled: true
  - name: Built In - AI Engineer
    keyword: AI Engineer
    enabled: true
```

Use `enabled: false` to temporarily disable a keyword. Keep user-specific
keywords in local `portals.yml`; update `templates/portals.example.yml` only
when changing shared defaults.

## Output Summary

When reporting results, include:
- Number of Built In searches fetched.
- Total jobs found.
- Title-filter removals.
- Deduplicated rows.
- New rows added or dry-run candidates.
- Evaluation jobs queued/completed unless `--no-evaluate` was used.
- Any network or parsing errors.
- Reminder to run `/career-ops pipeline` only for remaining pending roles after
  a direct-evaluation run.
