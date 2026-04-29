# Built In and Indeed Scan Design

## Background

The repository already has a proven LinkedIn scanner shape:

```text
bb-browser collection
  -> source-specific normalization
  -> existing newgrad scanner scoring
  -> detail enrichment
  -> pipeline/history writes
  -> optional newgrad_quick direct evaluation
  -> reports, tracker, dashboard Apply Next
```

Built In has partial support today:

- `scan.mjs --builtin-only` fetches Built In search pages directly.
- `POST /v1/builtin-scan/pending` reads saved Built In pipeline rows.
- `modes/builtin-scan.md` documents multi-page discovery and direct evaluation.
- A new read-only `bb-browser site builtin/jobs` adapter returns structured Built
  In list rows.

Indeed has no Auto-Job scan mode yet, but a new read-only
`bb-browser site indeed/jobs` adapter returns structured Indeed rows.

The user approved a complete LinkedIn-style loop for both `/auto-job
builtin-scan` and `/auto-job indeed-scan`, not a preview-only path.

## Goal

Make Built In and Indeed scans use the new read-only `bb-browser site` adapters
as browser-backed collection sources, normalize rows into existing Auto-Job
scanner contracts, and reuse bridge scoring, enrichment, direct evaluation,
reports, tracker, and Apply Next.

## Non-goals

- Do not submit applications.
- Do not click Apply, Easy Apply, Save, job alert, login, resume upload, or
  employer-contact controls.
- Do not bypass Indeed verification, CAPTCHA, or login walls.
- Do not rewrite the entire scanner system.
- Do not change user-specific scoring rules unless a failing test proves the
  new source cannot work with the current rules.
- Do not treat `bb-browser` private adapter files as the only system of record.
  Durable scanner behavior stays in this repository.

## Architecture

Use one shared runner for browser-backed job-board scans and keep each site
specific part small:

```text
/auto-job builtin-scan
/auto-job indeed-scan
        |
        v
package script and mode docs
        |
        v
scripts/job-board-scan-bb-browser.ts
        |
        +-- bb-browser site builtin/jobs ...
        +-- bb-browser site indeed/jobs ...
        |
        v
site normalizer
        |
        v
NewGradRow[]
        |
        v
/v1/newgrad-scan/score
        |
        v
detail page text capture
        |
        v
/v1/newgrad-scan/enrich where useful
        |
        v
/v1/evaluate newgrad_quick
        |
        v
reports + data/applications.md + web/index.html Apply Next
```

This keeps `bb-browser` as the browser/session transport and the repository as
the durable scanner implementation.

## Data Model

Both adapters return list rows. The shared runner should normalize them into
`NewGradRow`:

- `source`: `builtin.com` or `indeed.com`
- `title`: adapter title
- `company`: adapter company, with empty values rejected before scoring
- `location`: adapter location
- `workModel`: adapter work model or inferred from location/attributes
- `postedAgo`: adapter posted age when available
- `salary`: adapter salary when available
- `detailUrl`: canonical job detail URL
- `applyUrl`: same as detail URL unless the adapter exposes a safe non-mutating
  external URL
- `qualifications`: adapter summary/snippet/attributes joined as text
- `isNewGrad`: true only when title or visible text indicates early-career,
  graduate, entry-level, intern, junior, IC1, or similar signals

Built In rows keep the existing `builtin-scan` pipeline tag.

Indeed rows use a new `indeed-scan` pipeline tag. The parser and source mapping
must accept this tag anywhere `newgrad-scan`, `builtin-scan`, and
`linkedin-scan` are already accepted.

## User Flow

Built In:

```bash
npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --score-only
npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --pages 2 --no-evaluate
npm run builtin-scan -- --url "https://builtin.com/jobs/hybrid/office?search=Software+Engineering&" --pages 2 --evaluate-limit 3
```

Indeed:

```bash
npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --score-only
npm run indeed-scan -- --url "https://www.indeed.com/jobs?q=software%20engineer%2C%20AI%20engineer&l=&fromage=7&sc=0kf%3Aattr%28CF3CP%29explvl%28ENTRY_LEVEL%29%3B&from=searchOnDesktopSerp" --evaluate-limit 3
```

Mode docs should route `/auto-job builtin-scan` and `/auto-job indeed-scan`
to the same pattern:

1. Start bridge if needed.
2. Run `--score-only` first for a read-only preview.
3. Run `--no-evaluate` to write scanner-managed pipeline/history rows.
4. Run the default path or `--evaluate-limit N` to queue capped direct
   evaluations.

## URL Handling

Built In must support either:

- `--url` with a full Built In search URL
- `--query` and optional `--path`

The runner should preserve the user-provided path and query intent. It may add
`page=N` for pagination.

Indeed must support full search URLs so the user-provided filters survive:

- `q=software engineer, AI engineer`
- empty `l=`
- `fromage=7`
- `sc=0kf:attr(CF3CP)explvl(ENTRY_LEVEL);`
- `from=searchOnDesktopSerp`

The current `indeed/jobs` adapter supports query/location/fromage arguments but
does not preserve arbitrary full-URL parameters. The implementation should add
a `url` adapter argument or equivalent runner support before relying on the
adapter for the approved Indeed URL.

## Error Handling

- Missing `bb-browser`: stop with setup guidance.
- Bridge offline: stop and tell the operator to run `npm run server`.
- Adapter error or verification wall: stop with adapter `error`, `hint`, and
  `action`; do not retry with bypass behavior.
- Zero rows: report source, URL, page count, raw parsed count, and whether the
  adapter found no cards or no parseable job links.
- Detail capture blocked or short: fall back to row metadata only when title,
  company, URL, and a non-empty snippet or attribute set exist; otherwise skip
  with a counted reason.
- Evaluation failure: continue remaining candidates, count failures, and print
  company, role, and error.
- Duplicate rows: dedupe by canonical URL and normalized company/role before
  scoring and again before evaluation.

## Safety

The scanners are read-only. They can open or fetch job list and job detail pages
through the user's browser session. They must never submit applications or
mutate job-board state.

## Testing Strategy

Unit and structural tests:

- `indeed-scan` source mapping and pipeline tag mapping.
- `newgrad-pending` accepts `indeed-scan` rich rows.
- Indeed URL canonicalization keeps the `jk` identity while dropping tracking
  noise.
- Adapter JSON normalization maps Built In and Indeed rows into `NewGradRow`
  with correct source, URLs, title, company, location, work model, salary, and
  summary text.
- Full Indeed URL support preserves `sc`, `fromage`, and empty `l`.

Script checks:

- `npm run builtin-scan -- --help`
- `npm run indeed-scan -- --help`
- `npm run builtin-scan -- --url "<Built In URL>" --score-only --limit 20`
- `npm run indeed-scan -- --url "<Indeed URL>" --score-only --limit 20`

Live capped checks:

- Built In `--no-evaluate --enrich-limit 2`
- Indeed `--no-evaluate --enrich-limit 2`
- Built In `--evaluate-limit 1`
- Indeed `--evaluate-limit 1`

Repository verification:

- Focused bridge tests.
- Bridge typecheck if touched TypeScript is in `bridge`.
- `npm run verify`.

## Risks

- Indeed verification can make live checks intermittent. The scanner should
  report the block clearly instead of treating it as a parser failure.
- Built In and Indeed DOMs can change. The repo-level runner should rely on the
  adapter JSON contract; adapter parser drift remains isolated to
  `bb-browser/sites/...`.
- `scan.mjs` already has Built In behavior. The transition should preserve user
  commands and avoid deleting the legacy path until the adapter-backed path is
  verified.
- The worktree currently has user-owned uncommitted scanner changes. The
  implementation must be surgical and must not revert unrelated edits.

## Spec Self-review

- The spec has no unfinished sections.
- The design uses the approved shared-runner approach.
- The design preserves read-only job-board behavior.
- The design names the exact Indeed URL-filter preservation requirement.
- The design keeps existing bridge scoring/evaluation as the downstream system
  instead of creating a parallel pipeline.
